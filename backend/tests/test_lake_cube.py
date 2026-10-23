"""The columnar cube folds exactly like the dict walk it replaced (values,
key order and number types), builds once per cube file, and falls back
to a writable cache when the lake is read-only."""

import gzip
import itertools
import json
import os

import pytest

from app.services import lake_cube
from app.services import lake_stats as ls
from app.services.lake_stats import _cell_matches, _parse_lake_bracket


def _ref_matching_cells(cube, parsed):
    total = wins = seats = 0
    for cell, tw in (cube.get("runs") or {}).items():
        if _cell_matches(cell, *parsed):
            total += tw[0]
            wins += tw[1]
            seats += tw[2] if len(tw) > 2 else tw[0]
    return total, wins, seats


def _ref_fold_counts(section, parsed, width):
    out = {}
    for cell, ids in (section or {}).items():
        if not _cell_matches(cell, *parsed):
            continue
        for eid, counts in ids.items():
            cur = out.get(eid)
            if cur is None:
                cur = [0] * width
                out[eid] = cur
            for i, v in enumerate(counts[:width]):
                cur[i] += v
    for cur in out.values():
        if width > 4:
            cur[4] = round(cur[4], 3)
    return out


def _ref_offers(cells_map, parsed, pick):
    offers = {}
    for cell, ids in cells_map.items():
        if not _cell_matches(cell, *parsed):
            continue
        for eid, buckets in pick(ids).items():
            agg = offers.setdefault(
                eid,
                {
                    "offered": 0,
                    "picked": 0,
                    "off_act": [0, 0, 0],
                    "pick_act": [0, 0, 0],
                },
            )
            for b, op in buckets.items():
                i = int(b)
                if 0 <= i <= 2:
                    agg["offered"] += op[0]
                    agg["picked"] += op[1]
                    agg["off_act"][i] += op[0]
                    agg["pick_act"][i] += op[1]
    return offers


def _ref_cube_offers(cube, entity_type):
    offers = cube.get("offers") or {}
    if offers and set(offers) <= {"cards", "relics", "potions"}:
        return offers.get(entity_type) or {}
    return offers if entity_type == "cards" else {}


def _ref_bracket_fold(cube, entity_type, parsed):
    per = (cube.get("entities") or {}).get(entity_type)
    if per is None:
        return None
    total, wins, seats = _ref_matching_cells(cube, parsed)
    if total == 0:
        return None
    entries = _ref_fold_counts(per, parsed, 5)
    offers = _ref_offers(_ref_cube_offers(cube, entity_type), parsed, lambda ids: ids)
    wax = (
        _ref_fold_counts(cube.get("wax"), parsed, 2) if entity_type == "relics" else {}
    )
    used = {}
    if entity_type == "potions":
        for cell, ids in (cube.get("potion_used") or {}).items():
            if _cell_matches(cell, *parsed):
                for eid, n in ids.items():
                    used[eid] = used.get(eid, 0) + n
    removed = None
    if entity_type == "relics" and cube.get("relic_removed") is not None:
        removed = {}
        for cell, ids in cube["relic_removed"].items():
            if _cell_matches(cell, *parsed):
                for eid, n in ids.items():
                    removed[eid] = removed.get(eid, 0) + int(n)
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
        "data_through": cube.get("data_through"),
    }


def _ref_character_fold(cube, entity_type, parsed):
    per = ((cube.get("by_character") or {}).get(entity_type)) or None
    if per is None:
        return None
    fold = {}
    for cell, ids in per.items():
        if not _cell_matches(cell, *parsed):
            continue
        for eid, chars in ids.items():
            slot = fold.setdefault(eid, {})
            for ch, pw in chars.items():
                cur = slot.get(ch)
                if cur is None:
                    cur = [0, 0, 0, 0, 0.0]
                    slot[ch] = cur
                for i, v in enumerate(pw[:5]):
                    cur[i] += v
                cur[4] = round(cur[4], 3)
    return fold or None


def _ref_character_offers_fold(cube, entity_type, parsed, character):
    per = ((cube.get("offers_by_character") or {}).get(entity_type)) or None
    if per is None:
        return None
    return _ref_offers(per, parsed, lambda chars: chars.get(character) or {})


def _ref_section_fold(cube, name, parsed, width, nested):
    total, wins, seats = _ref_matching_cells(cube, parsed)
    section = cube.get(name)
    if not total or section is None:
        return None
    if nested:
        groups = {}
        for cell, per_group in section.items():
            if _cell_matches(cell, *parsed):
                for g in per_group:
                    groups.setdefault(g, {})
        rows = {
            g: _ref_fold_counts(
                {c: v.get(g) or {} for c, v in section.items()}, parsed, width
            )
            for g in groups
        }
    else:
        rows = _ref_fold_counts(section, parsed, width)
    return {
        "rows": rows,
        "total_runs": total,
        "total_wins": wins,
        "total_seats": seats,
        "data_through": cube.get("data_through"),
    }


A = "standard|1|1|2|v0.111.0"
B = "standard|2|0|0|v0.111.0"
C = "daily|1|1|3|v0.110.1"
D = "custom|4|1|1|v0.110.1"
E = "standard|1|1|0|"
BAD = "standard|1|1"

CUBE = {
    "runs": {
        A: [100, 40, 120],
        B: [50, 10],
        C: [30, 20, 30],
        D: [9, 1, 36],
        E: [5, 1, 5],
        BAD: [7, 7, 7],
    },
    "entities": {
        "cards": {
            A: {"BASH": [10, 6, 9, 5, 4.125], "ZAP": [3, 1, 3, 1, 1.5]},
            B: {"ZAP": [2, 1], "ANGER": [1, 0, 1, 0, 0.333]},
            C: {"ANGER": [], "BASH": [4, 4, 4, 4, 3.875]},
            D: {"NEW": [1, 1, 1, 1, 0.25]},
            BAD: {"BASH": [99, 99, 99, 99, 99.0]},
        },
        "relics": {A: {"ANCHOR": [5, 3, 5, 3, 2.75]}, C: {"JUZU": [2, 1, 2, 1, 1.0]}},
    },
    "by_character": {
        "cards": {
            A: {"BASH": {"IRONCLAD": [6, 4, 5, 3, 2.5], "SILENT": [4, 2, 4, 2, 1.625]}},
            B: {"BASH": {"SILENT": [1, 1]}, "ZAP": {}},
            C: {
                "ZAP": {"DEFECT": [2, 1, 2, 1, 0.875]},
                "BASH": {"IRONCLAD": [4, 4, 4, 4, 3.875]},
            },
        },
        "relics": {},
    },
    "offers": {
        "cards": {
            A: {"BASH": {"0": [5, 2], "2": [3, 1], "3": [9, 9]}, "ZAP": {}},
            C: {"ZAP": {"1": [4, 0]}, "BASH": {"1": [2, 2]}},
        },
        "relics": {A: {"ANCHOR": {"0": [2, 1]}}},
    },
    "offers_by_character": {
        "cards": {
            A: {
                "IRONCLAD": {"BASH": {"0": [3, 1], "5": [1, 1]}},
                "SILENT": {"ZAP": {}},
            },
            C: {"IRONCLAD": {"ZAP": {"2": [1, 0]}}},
        }
    },
    "wax": {A: {"ANCHOR": [1, 1]}, C: {"JUZU": [2, 0], "ANCHOR": [1, 0]}},
    "potion_used": {A: {"FIRE": 3}, C: {"FIRE": 1, "BLOCK": 2}},
    "relic_removed": {A: {"ANCHOR": 1}, B: {"JUZU": 2}},
    "shops": {
        A: {"cards": {"BASH": [5, 2, 1, 2, 1, 0.75]}, "relics": {}},
        C: {
            "potions": {"FIRE": [3, 1, 1, 1, 1, 0.5]},
            "cards": {"ZAP": [1, 1, 0, 1, 0, 0.125]},
        },
    },
    "events": {
        A: {"NEOW": {"opt_a": [4, 2, 4, 2, 1.25], "opt_b": [1, 0, 1, 0, 0.5]}},
        B: {"NEOW": {"opt_b": [2, 1, 2, 1, 0.75]}, "SHRINE": {}},
    },
    "rest": {A: {"REST": [6, 3, 2, 6, 3, 2.375]}, D: {"SMITH": [1, 1, 0, 1, 1, 0.5]}},
    "data_through": "2026-10-06 05:18:33",
}

BRACKETS = [
    ":".join(p for p in combo if p) or "all"
    for combo in itertools.product(
        (None, "standard", "daily", "custom"),
        (None, "solo", "2p", "4p"),
        (None, "a10", "wr30", "wr50", "wr75"),
        (None, "v0.111.0", "v0.110.1"),
    )
]


def _same(a, b, where):
    assert a == b, where

    def walk(x, y, path):
        if isinstance(x, dict):
            assert list(x) == list(y), f"{where} key order at {path}"
            for k in x:
                walk(x[k], y[k], path + [k])
        elif isinstance(x, (list, tuple)):
            for i, (u, v) in enumerate(zip(x, y)):
                walk(u, v, path + [i])
        else:
            assert type(x) is type(y), f"{where} type at {path}: {x!r} vs {y!r}"

    walk(a, b, [])


@pytest.mark.parametrize(
    "cube_dict", [CUBE, {**CUBE, "offers": CUBE["offers"]["cards"]}]
)
def test_every_fold_matches_the_dict_walk(cube_dict, tmp_path):
    cube = lake_cube.from_dict(cube_dict, tmp_path / "c")
    for b in BRACKETS:
        parsed = _parse_lake_bracket(b)
        _same(cube.matching_cells(parsed), _ref_matching_cells(cube_dict, parsed), b)
        for et in ("cards", "relics", "potions"):
            _same(
                lake_cube.bracket_fold(cube, et, parsed),
                _ref_bracket_fold(cube_dict, et, parsed),
                f"bracket {et} {b}",
            )
            _same(
                lake_cube.character_fold(cube, et, parsed),
                _ref_character_fold(cube_dict, et, parsed),
                f"char {et} {b}",
            )
            for ch in ("IRONCLAD", "SILENT", "DEFECT", "NOBODY"):
                _same(
                    lake_cube.character_offers_fold(cube, et, parsed, ch),
                    _ref_character_offers_fold(cube_dict, et, parsed, ch),
                    f"offers {et} {ch} {b}",
                )
        for name, width, nested in (
            ("shops", 6, True),
            ("events", 5, True),
            ("rest", 6, False),
        ):
            _same(
                lake_cube.section_fold(cube, name, parsed, width, nested),
                _ref_section_fold(cube_dict, name, parsed, width, nested),
                f"section {name} {b}",
            )


def test_sections_missing_from_older_cubes(tmp_path):
    old = {
        "runs": {A: [10, 5]},
        "entities": {"cards": {A: {"BASH": [3, 1]}}},
        "offers": {},
    }
    cube = lake_cube.from_dict(old, tmp_path / "c")
    parsed = _parse_lake_bracket("all")
    for et in ("cards", "relics", "potions"):
        _same(
            lake_cube.bracket_fold(cube, et, parsed),
            _ref_bracket_fold(old, et, parsed),
            et,
        )
        assert lake_cube.character_fold(cube, et, parsed) is None
        assert lake_cube.character_offers_fold(cube, et, parsed, "IRONCLAD") is None
    for name in ("shops", "events", "rest"):
        assert lake_cube.section_fold(cube, name, parsed, 6, name != "rest") is None
    assert cube.has_character_offers is False
    assert cube.versions() == {"v0.111.0": 10}


def _write(path, cube):
    with gzip.open(path, "wt") as f:
        json.dump(cube, f)


@pytest.fixture
def lake(tmp_path, monkeypatch):
    _write(tmp_path / "entity_cube.json.gz", CUBE)
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(ls, "_compact_cube_cache", None)
    monkeypatch.setattr(ls, "_compact_cube_failed", None)
    monkeypatch.setattr(ls, "_fold_cache", {})
    return tmp_path


def test_folds_build_once_and_cache(lake, monkeypatch):
    first = ls.entity_bracket_fold("cards", "all")
    assert first["entries"]["BASH"][:2] == [14, 10]
    assert ls.entity_bracket_fold("cards", "all") is first
    builds = list((lake / "entity_cube.compact").iterdir())
    assert len([p for p in builds if not p.name.startswith(".")]) == 1

    monkeypatch.setattr(ls, "_compact_cube_cache", None)
    monkeypatch.setattr(ls, "_fold_cache", {})

    def boom(*a, **k):
        raise AssertionError("rebuilt a cube another worker already built")

    monkeypatch.setattr(lake_cube, "from_cube", boom)
    assert ls.entity_bracket_fold("cards", "all")["entries"]["BASH"][:2] == [14, 10]
    assert ls.cube_versions(min_runs=1) == ["v0.111.0", "v0.110.1"]
    assert ls.cube_has_character_offers() is True
    assert ls.entity_cube_data_through() == "2026-10-06 05:18:33"


def test_new_generation_refolds(lake):
    assert ls.entity_bracket_fold("cards", "solo")["entries"]["BASH"][0] == 14
    cube = json.loads(json.dumps(CUBE))
    cube["entities"]["cards"][A]["BASH"] = [50, 1, 50, 1, 1.0]
    _write(lake / "entity_cube.json.gz", cube)
    st = os.stat(lake / "entity_cube.json.gz")
    os.utime(lake / "entity_cube.json.gz", (st.st_atime, st.st_mtime + 10))
    assert ls.entity_bracket_fold("cards", "solo")["entries"]["BASH"][0] == 54


def test_read_only_lake_builds_in_the_cache_dir(lake, tmp_path, monkeypatch):
    cache_dir = tmp_path / "writable"
    monkeypatch.setenv("LAKE_CACHE_DIR", str(cache_dir))
    real = lake_cube.build_dir

    def ro_lake(src, root, sha=None):
        if root == lake / "entity_cube.compact":
            raise PermissionError("read-only file system")
        return real(src, root, sha)

    monkeypatch.setattr(lake_cube, "build_dir", ro_lake)
    assert ls.entity_bracket_fold("relics", "all")["entries"]["ANCHOR"][:2] == [5, 3]
    assert any((cache_dir / "entity_cube").iterdir())


def test_unreadable_cube_backs_off(lake, monkeypatch):
    (lake / "entity_cube.json.gz").write_bytes(b"not gzip")
    calls = []
    real = lake_cube.open_for

    def counted(*a, **k):
        calls.append(1)
        return real(*a, **k)

    monkeypatch.setattr(lake_cube, "open_for", counted)
    assert ls.entity_bracket_fold("cards", "all") is None
    ls._fold_cache.clear()
    assert ls.entity_bracket_fold("cards", "a10") is None
    assert len(calls) == 1


def test_missing_cube_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(ls, "_compact_cube_cache", None)
    monkeypatch.setattr(ls, "_fold_cache", {})
    assert ls.entity_bracket_fold("cards", "all") is None
    assert ls.cube_versions() == []


def test_concurrent_requests_fold_once(lake, monkeypatch):
    import threading
    import time

    calls = []
    real = lake_cube.bracket_fold

    def slow(*a, **k):
        calls.append(1)
        time.sleep(0.2)
        return real(*a, **k)

    monkeypatch.setattr(lake_cube, "bracket_fold", slow)
    ls._compact_entity_cube()
    out = []
    threads = [
        threading.Thread(
            target=lambda: out.append(ls.entity_bracket_fold("cards", "all"))
        )
        for _ in range(8)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(calls) == 1
    assert len(out) == 8 and all(o is out[0] for o in out)
