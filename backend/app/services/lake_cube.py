"""Columnar entity cube. The published cube is nested JSON that expands to
over a gigabyte of Python objects per worker; this flattens every section
into numpy arrays (one row per leaf, in the JSON's own order) stored as
.npy files that workers memory-map, so the pages are shared across
workers and a bracket fold is a masked bincount instead of a dict walk.
Every fold returns exactly what the dict walk returned, key order
included."""

from __future__ import annotations

import fcntl
import gzip
import hashlib
import json
import os
import shutil
from array import array
from pathlib import Path

import numpy as np

FORMAT = 2
ETYPES = ("cards", "relics", "potions")
_KEEP_BUILDS = 2


class _Table:
    __slots__ = ("cell", "keys", "vals", "floats", "fmask")

    def __init__(self, cell, keys, vals, floats, fmask=None):
        self.cell = cell
        self.keys = keys
        self.vals = vals
        self.floats = floats
        self.fmask = fmask


class _Builder:
    def __init__(self, cells: dict, depth: int, names: list[dict] | None = None):
        self.cells = cells
        self.cell = array("i")
        self.keys = [array("i") for _ in range(depth)]
        self.names = names if names is not None else [{} for _ in range(depth)]
        self.vals: list = []

    def index(self, level: int, name: str) -> int:
        names = self.names[level]
        i = names.get(name)
        if i is None:
            i = len(names)
            names[name] = i
        return i

    def cell_index(self, cell: str) -> int:
        i = self.cells.get(cell)
        if i is None:
            i = len(self.cells)
            self.cells[cell] = i
        return i

    def add(self, cell: int, keys: tuple, vals) -> None:
        self.cell.append(cell)
        for level, k in enumerate(keys):
            self.keys[level].append(k)
        self.vals.append(vals)

    def table(self) -> tuple[_Table, list[list[str]]]:
        width = max((len(v) for v in self.vals), default=0)
        floats = tuple(
            any(isinstance(v[j], float) for v in self.vals if len(v) > j)
            for j in range(width)
        )
        rows = [
            v if len(v) == width else list(v) + [0] * (width - len(v))
            for v in self.vals
        ]
        vals = np.array(rows, dtype=np.float64).reshape(len(rows), width).T.copy()
        fmask = None
        if any(floats):
            fmask = np.zeros((width, len(rows)), dtype=np.uint8)
            for j in range(width):
                if floats[j]:
                    fmask[j] = [
                        len(v) > j and isinstance(v[j], float) for v in self.vals
                    ]
        table = _Table(
            np.frombuffer(self.cell, dtype=np.int32).copy(),
            [np.frombuffer(k, dtype=np.int32).copy() for k in self.keys],
            vals,
            floats,
            fmask,
        )
        return table, [list(n) for n in self.names]


def _flat(cells: dict, section: dict) -> tuple[_Table, list[list[str]]]:
    b = _Builder(cells, 1)
    for cell, ids in section.items():
        ci = b.cell_index(cell)
        for eid, counts in ids.items():
            vals = counts if isinstance(counts, list) else [counts]
            b.add(ci, (b.index(0, eid),), vals)
    return b.table()


def _nested(cells: dict, section: dict):
    b = _Builder(cells, 2)
    seen = _Builder(cells, 1, names=[b.names[0]])
    for cell, groups in section.items():
        ci = b.cell_index(cell)
        for g, ids in groups.items():
            gi = b.index(0, g)
            seen.add(ci, (gi,), [])
            for eid, counts in (ids or {}).items():
                b.add(ci, (gi, b.index(1, eid)), counts)
    table, names = b.table()
    presence, _ = seen.table()
    return table, names, presence


def _by_character(cells: dict, section: dict) -> tuple[_Table, list[list[str]]]:
    b = _Builder(cells, 2)
    for cell, ids in section.items():
        ci = b.cell_index(cell)
        for eid, chars in ids.items():
            ei = b.index(0, eid)
            if not chars:
                b.add(ci, (ei, -1), [])
                continue
            for ch, pw in chars.items():
                b.add(ci, (ei, b.index(1, ch)), pw[:5])
    return b.table()


def _acts(buckets: dict) -> list:
    acts = [0, 0, 0, 0, 0, 0]
    for bk, op in buckets.items():
        try:
            i = int(bk)
        except (TypeError, ValueError):
            continue
        if 0 <= i <= 2:
            acts[i] += op[0]
            acts[3 + i] += op[1]
    return acts


def _offers(cells: dict, section: dict) -> tuple[_Table, list[list[str]]]:
    b = _Builder(cells, 1)
    for cell, ids in section.items():
        ci = b.cell_index(cell)
        for eid, buckets in ids.items():
            b.add(ci, (b.index(0, eid),), _acts(buckets or {}))
    return b.table()


def _offers_by_character(cells: dict, section: dict) -> tuple[_Table, list[list[str]]]:
    b = _Builder(cells, 2)
    for cell, chars in section.items():
        ci = b.cell_index(cell)
        for ch, ids in chars.items():
            chi = b.index(0, ch)
            for eid, buckets in (ids or {}).items():
                b.add(ci, (chi, b.index(1, eid)), _acts(buckets or {}))
    return b.table()


def _offer_sections(cube: dict) -> dict:
    offers = cube.get("offers") or {}
    if offers and set(offers) <= set(ETYPES):
        return {t: offers.get(t) or {} for t in ETYPES}
    return {"cards": offers, "relics": {}, "potions": {}}


def from_cube(cube: dict) -> dict:
    """Arrays and metadata for one parsed cube dict, ready to save."""
    cells: dict[str, int] = {}
    tables: dict[str, _Table] = {}
    names: dict[str, list[list[str]]] = {}
    present: dict[str, bool] = {}

    def put(name, built):
        tables[name], names[name] = built[0], built[1]

    run_cells, run_vals = [], []
    for cell, tw in (cube.get("runs") or {}).items():
        run_cells.append(cells.setdefault(cell, len(cells)))
        run_vals.append([tw[0], tw[1], tw[2] if len(tw) > 2 else tw[0]])
    tables["runs"] = _Table(
        np.array(run_cells, dtype=np.int32),
        [],
        np.array(run_vals, dtype=np.float64).reshape(len(run_vals), 3).T.copy(),
        (False, False, False),
    )
    names["runs"] = []

    entities = cube.get("entities") or {}
    by_char = cube.get("by_character") or {}
    offers = _offer_sections(cube)
    offers_by_char = cube.get("offers_by_character") or {}
    for t in ETYPES:
        present[f"entities:{t}"] = entities.get(t) is not None
        if entities.get(t) is not None:
            put(f"entities:{t}", _flat(cells, entities[t]))
        present[f"by_character:{t}"] = bool(by_char.get(t))
        if by_char.get(t):
            put(f"by_character:{t}", _by_character(cells, by_char[t]))
        put(f"offers:{t}", _offers(cells, offers[t]))
        present[f"offers_by_character:{t}"] = bool(offers_by_char.get(t))
        if offers_by_char.get(t):
            put(
                f"offers_by_character:{t}",
                _offers_by_character(cells, offers_by_char[t]),
            )
    for name in ("wax", "potion_used", "relic_removed", "rest"):
        present[name] = cube.get(name) is not None
        if cube.get(name) is not None:
            put(name, _flat(cells, cube[name]))
    for name in ("shops", "events"):
        present[name] = cube.get(name) is not None
        if cube.get(name) is not None:
            table, nm, presence = _nested(cells, cube[name])
            tables[name], names[name] = table, nm
            tables[f"{name}:groups"], names[f"{name}:groups"] = presence, []
    meta = {
        "format": FORMAT,
        "cells": list(cells),
        "names": names,
        "floats": {k: list(t.floats) for k, t in tables.items()},
        "present": present,
        "has_character_offers": bool(cube.get("offers_by_character")),
        "data_through": cube.get("data_through"),
    }
    return {"meta": meta, "tables": tables}


def save(built: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for name, t in built["tables"].items():
        stem = name.replace(":", "__")
        np.save(out / f"{stem}.cell.npy", t.cell)
        np.save(out / f"{stem}.vals.npy", t.vals)
        if t.fmask is not None:
            np.save(out / f"{stem}.fmask.npy", t.fmask)
        for i, k in enumerate(t.keys):
            np.save(out / f"{stem}.key{i}.npy", k)
    meta = dict(built["meta"])
    meta["tables"] = {name: len(t.keys) for name, t in built["tables"].items()}
    (out / "meta.json").write_text(json.dumps(meta, separators=(",", ":")))


def from_dict(cube: dict, out: Path) -> "CompactCube":
    save(from_cube(cube), out)
    return CompactCube(out)


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_dir(src: Path, root: Path, sha: str | None = None) -> Path:
    """Convert one entity_cube.json.gz into root/<sha256>/, once: the
    first process to take root/.lock builds, everyone else finds the
    finished directory. Builds beyond the newest two are pruned."""
    import orjson

    sha = sha or file_sha256(src)
    final = root / sha
    if (final / "meta.json").exists():
        return final
    root.mkdir(parents=True, exist_ok=True)
    with open(root / ".lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            if (final / "meta.json").exists():
                return final
            with gzip.open(src, "rb") as f:
                cube = orjson.loads(f.read())
            built = from_cube(cube)
            del cube
            tmp = root / f".{sha}.{os.getpid()}.tmp"
            shutil.rmtree(tmp, ignore_errors=True)
            save(built, tmp)
            tmp.rename(final)
            _prune(root, keep=final)
            return final
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def _prune(root: Path, keep: Path) -> None:
    builds = sorted(
        (p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for p in builds[_KEEP_BUILDS:]:
        if p != keep:
            shutil.rmtree(p, ignore_errors=True)


def _load(path: Path) -> np.ndarray:
    try:
        return np.load(path, mmap_mode="r")
    except ValueError:
        return np.load(path)


class CompactCube:
    def __init__(self, path: Path):
        meta = json.loads((path / "meta.json").read_text())
        if meta.get("format") != FORMAT:
            raise ValueError(f"unknown compact cube format {meta.get('format')}")
        self.path = path
        self.cells: list[str] = meta["cells"]
        self.names: dict = meta["names"]
        self.present: dict = meta["present"]
        self.has_character_offers: bool = meta["has_character_offers"]
        self.data_through = meta["data_through"]
        self.tables: dict[str, _Table] = {}
        for name, depth in meta["tables"].items():
            stem = name.replace(":", "__")
            fmask = path / f"{stem}.fmask.npy"
            self.tables[name] = _Table(
                _load(path / f"{stem}.cell.npy"),
                [_load(path / f"{stem}.key{i}.npy") for i in range(depth)],
                _load(path / f"{stem}.vals.npy"),
                tuple(meta["floats"][name]),
                _load(fmask) if fmask.exists() else None,
            )
        self._masks: dict = {}

    def mask(self, parsed) -> np.ndarray:
        hit = self._masks.get(parsed)
        if hit is None:
            from .lake_stats import _cell_matches

            hit = np.fromiter(
                (_cell_matches(c, *parsed) for c in self.cells),
                dtype=bool,
                count=len(self.cells),
            )
            self._masks[parsed] = hit
        return hit

    def rows(self, name: str, parsed) -> np.ndarray:
        t = self.tables[name]
        if not len(t.cell):
            return np.zeros(0, dtype=np.int64)
        return np.flatnonzero(self.mask(parsed)[t.cell])

    def matching_cells(self, parsed) -> tuple[int, int, int]:
        t = self.tables["runs"]
        sel = self.rows("runs", parsed)
        if not len(sel):
            return 0, 0, 0
        sums = np.asarray(t.vals)[:, sel].sum(axis=1)
        return int(sums[0]), int(sums[1]), int(sums[2])

    def versions(self) -> dict[str, int]:
        t = self.tables["runs"]
        counts: dict[str, int] = {}
        for ci, n in zip(t.cell.tolist(), np.asarray(t.vals)[0].tolist()):
            parts = self.cells[ci].split("|")
            ver = parts[4] if len(parts) > 4 else ""
            if ver.startswith("v"):
                counts[ver] = counts.get(ver, 0) + int(n)
        return counts


def _first_seen(keys: np.ndarray, n: int) -> np.ndarray:
    if not len(keys):
        return np.zeros(0, dtype=np.int64)
    first = np.full(n, len(keys), dtype=np.int64)
    np.minimum.at(first, keys, np.arange(len(keys)))
    present = np.flatnonzero(first < len(keys))
    return present[np.argsort(first[present], kind="stable")]


def _sums(keys: np.ndarray, t: _Table, sel: np.ndarray, n: int, width: int) -> list:
    have = t.vals.shape[0]
    return [
        np.bincount(keys, weights=t.vals[j][sel], minlength=n)
        if j < have
        else np.zeros(n)
        for j in range(width)
    ]


def _column(
    t: _Table,
    j: int,
    keys: np.ndarray,
    sel: np.ndarray,
    n: int,
    values: np.ndarray,
    order: np.ndarray,
) -> list:
    """One summed column as Python numbers: a key stays int unless one of
    its rows carried a float there, the way += on an int 0 behaves."""
    if j >= len(t.floats) or not t.floats[j]:
        return values.astype(np.int64).tolist()
    has = np.bincount(keys, weights=t.fmask[j][sel], minlength=n)[order] > 0
    if has.all():
        return values.tolist()
    return [v if f else int(v) for v, f in zip(values.tolist(), has.tolist())]


def _counts(
    t: _Table, sel: np.ndarray, ids: np.ndarray, id_names: list[str], width: int
) -> dict:
    if not len(sel):
        return {}
    n = len(id_names)
    sums = _sums(ids, t, sel, n, width)
    order = _first_seen(ids, n)
    cols = [_column(t, j, ids, sel, n, s[order], order) for j, s in enumerate(sums)]
    if width > 4:
        cols[4] = [round(v, 3) for v in cols[4]]
    keys = [id_names[i] for i in order.tolist()]
    return dict(zip(keys, map(list, zip(*cols))))


def fold_counts(cube: CompactCube, name: str, parsed, width: int) -> dict:
    """_fold_counts over one flat table: {id: [counts...]} in first-seen
    order, index 4 rounded when the width reaches it."""
    t = cube.tables.get(name)
    if t is None:
        return {}
    sel = cube.rows(name, parsed)
    return _counts(t, sel, t.keys[0][sel], cube.names[name][0], width)


def _offer_fold(
    t: _Table, sel: np.ndarray, eids: np.ndarray, id_names: list[str]
) -> dict:
    if not len(sel):
        return {}
    n = len(id_names)
    order = _first_seen(eids, n)
    acts = [
        _column(
            t,
            j,
            eids,
            sel,
            n,
            np.bincount(eids, weights=t.vals[j][sel], minlength=n)[order],
            order,
        )
        for j in range(6)
    ]
    keys = [id_names[i] for i in order.tolist()]
    out = {}
    for k, eid in enumerate(keys):
        off = [acts[0][k], acts[1][k], acts[2][k]]
        pick = [acts[3][k], acts[4][k], acts[5][k]]
        out[eid] = {
            "offered": off[0] + off[1] + off[2],
            "picked": pick[0] + pick[1] + pick[2],
            "off_act": off,
            "pick_act": pick,
        }
    return out


def bracket_fold(cube: CompactCube, entity_type: str, parsed) -> dict | None:
    if not cube.present.get(f"entities:{entity_type}"):
        return None
    total, wins, seats = cube.matching_cells(parsed)
    if total == 0:
        return None
    entries = fold_counts(cube, f"entities:{entity_type}", parsed, 5)
    oname = f"offers:{entity_type}"
    ot = cube.tables[oname]
    osel = cube.rows(oname, parsed)
    offers = _offer_fold(ot, osel, ot.keys[0][osel], cube.names[oname][0])
    wax = fold_counts(cube, "wax", parsed, 2) if entity_type == "relics" else {}
    used: dict[str, int] = {}
    if entity_type == "potions":
        used = {k: v[0] for k, v in fold_counts(cube, "potion_used", parsed, 1).items()}
    removed: dict[str, int] | None = None
    if entity_type == "relics" and cube.present.get("relic_removed"):
        removed = {
            k: int(v[0])
            for k, v in fold_counts(cube, "relic_removed", parsed, 1).items()
        }
    return {
        "entries": entries,
        "offers": offers,
        "wax": wax,
        "removed": removed,
        "used": used,
        "total_runs": total,
        "total_wins": wins,
        "total_seats": seats,
        "parsed": parsed,
        "data_through": cube.data_through,
    }


def character_fold(cube: CompactCube, entity_type: str, parsed) -> dict | None:
    name = f"by_character:{entity_type}"
    if not cube.present.get(name):
        return None
    t = cube.tables[name]
    sel = cube.rows(name, parsed)
    if not len(sel):
        return None
    eid_names, ch_names = cube.names[name][0], cube.names[name][1]
    n_ch = len(ch_names) + 1
    combo = t.keys[0][sel].astype(np.int64) * n_ch + (t.keys[1][sel] + 1)
    n = len(eid_names) * n_ch
    sums = _sums(combo, t, sel, n, 5)
    order = _first_seen(combo, n)
    cols = [
        _column(t, j, combo, sel, n, s[order], order) for j, s in enumerate(sums[:4])
    ]
    cols.append([round(float(v), 3) for v in sums[4][order].tolist()])
    fold: dict[str, dict] = {}
    for k, c in enumerate(order.tolist()):
        slot = fold.setdefault(eid_names[c // n_ch], {})
        ch = c % n_ch - 1
        if ch >= 0:
            slot[ch_names[ch]] = [
                cols[0][k],
                cols[1][k],
                cols[2][k],
                cols[3][k],
                cols[4][k],
            ]
    return fold or None


def character_offers_fold(
    cube: CompactCube, entity_type: str, parsed, character: str
) -> dict | None:
    name = f"offers_by_character:{entity_type}"
    if not cube.present.get(name):
        return None
    t = cube.tables[name]
    ch_names, eid_names = cube.names[name][0], cube.names[name][1]
    try:
        ch = ch_names.index(character)
    except ValueError:
        return {}
    sel = cube.rows(name, parsed)
    sel = sel[t.keys[0][sel] == ch]
    return _offer_fold(t, sel, t.keys[1][sel], eid_names)


def section_fold(
    cube: CompactCube, name: str, parsed, width: int, nested: bool
) -> dict | None:
    total, wins, seats = cube.matching_cells(parsed)
    if not total or not cube.present.get(name):
        return None
    if nested:
        t = cube.tables[name]
        pt = cube.tables[f"{name}:groups"]
        group_names, id_names = cube.names[name][0], cube.names[name][1]
        gsel = cube.rows(f"{name}:groups", parsed)
        order = _first_seen(pt.keys[0][gsel], len(group_names)).tolist()
        sel = cube.rows(name, parsed)
        groups = t.keys[0][sel]
        rows = {}
        for g in order:
            gs = sel[groups == g]
            rows[group_names[g]] = _counts(t, gs, t.keys[1][gs], id_names, width)
    else:
        rows = fold_counts(cube, name, parsed, width)
    return {
        "rows": rows,
        "total_runs": total,
        "total_wins": wins,
        "total_seats": seats,
        "data_through": cube.data_through,
    }


def cache_roots(lake_dir: Path) -> list[Path]:
    """Where compact builds live: next to the cube when the pull built
    one there, else a writable per-container cache."""
    return [
        lake_dir / "entity_cube.compact",
        Path(os.environ.get("LAKE_CACHE_DIR", "/tmp/spire-lake-cache")) / "entity_cube",
    ]


def open_for(src: Path, lake_dir: Path, sha: str | None = None) -> CompactCube:
    """The compact cube for one entity_cube.json.gz: an existing build
    when any root has it, else a fresh build in the first writable root."""
    sha = sha or file_sha256(src)
    roots = cache_roots(lake_dir)
    for root in roots:
        if (root / sha / "meta.json").exists():
            return CompactCube(root / sha)
    last: Exception | None = None
    for root in roots:
        try:
            return CompactCube(build_dir(src, root, sha))
        except OSError as e:
            last = e
    raise last or RuntimeError("no writable compact cube root")
