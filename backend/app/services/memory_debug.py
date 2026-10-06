"""What is actually in this worker's heap: RSS, a gc census by type, and
exact sizes of the module-level caches. Sizes are json-serialized MB (a
close proxy for dict/list heap cost); the census walk touches every
tracked object so a call costs a few seconds of one worker's CPU."""

import gc
import json
import os
import sys


def _json_mb(obj) -> float:
    try:
        return round(len(json.dumps(obj, default=str)) / 1048576, 2)
    except Exception:
        return -1.0


def _census(top: int) -> list[dict]:
    counts: dict[str, list[int]] = {}
    for o in gc.get_objects():
        c = counts.setdefault(type(o).__name__, [0, 0])
        c[0] += 1
        try:
            c[1] += sys.getsizeof(o)
        except Exception:
            pass
    rows = [
        {"type": t, "count": n, "shallow_mb": round(b / 1048576, 1)}
        for t, (n, b) in counts.items()
    ]
    rows.sort(key=lambda r: -r["shallow_mb"])
    return rows[:top]


def snapshot(top: int = 25) -> dict:
    out: dict = {"pid": os.getpid()}
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith(("VmRSS", "VmHWM")):
                    k, v = line.split(":", 1)
                    out[k.lower()] = v.strip()
    except Exception:
        pass

    probes: dict[str, dict] = {}

    def probe(name: str, fn) -> None:
        try:
            probes[name] = fn()
        except Exception as e:
            probes[name] = {"error": f"{type(e).__name__}: {e}"}

    def _charts():
        from . import charts_stats as cs

        frame = getattr(cs, "_FRAME", None)
        out = {"rows": getattr(cs, "_FRAME_ROWS", None)}
        if isinstance(frame, list):
            out["rows"] = len(frame)
            out["python_list"] = True
        return out

    probe("charts_frame", _charts)

    def _insights():
        from . import user_insights as ui

        with ui._cache_lock:
            vals = [v for _, v in ui._cache.values()]
        return {"entries": len(vals), "json_mb": _json_mb(vals)}

    probe("insights_cache", _insights)

    def _lake():
        from . import lake_stats as ls

        folds = dict(ls._fold_cache)
        return {
            "fold_entries": len(folds),
            "fold_json_mb": _json_mb([v for _, v in folds.values()]),
            "payload_json_mb": _json_mb(ls._payload_cache),
            "cube_json_mb": _json_mb(ls._cube_cache),
            "entity_store_json_mb": _json_mb(ls._entity_store_cache),
            "entity_cube_path": str(ls._compact_cube_cache[1].path)
            if ls._compact_cube_cache
            else None,
            "encounter_json_mb": _json_mb(ls._encounter_store_cache),
        }

    probe("lake_caches", _lake)

    def _charts_blob():
        from . import charts_blob_lake as cbl

        return {"json_mb": _json_mb(cbl._blob_cache)}

    probe("charts_blob_cache", _charts_blob)

    def _fossil():
        from . import run_entity_stats as res

        return {
            "entries": len(res._cache),
            "json_mb": _json_mb(list(res._cache.values())),
        }

    probe("fossil_snapshot_cache", _fossil)

    out["probes"] = probes
    out["census_top"] = _census(top)

    try:
        import tracemalloc

        if tracemalloc.is_tracing():
            stats = tracemalloc.take_snapshot().statistics("lineno")[:top]
            out["tracemalloc_top"] = [
                {"site": str(s.traceback), "mb": round(s.size / 1048576, 1)}
                for s in stats
            ]
        else:
            out["tracemalloc"] = "off (set PYTHONTRACEMALLOC=1 for one boot)"
    except Exception:
        pass
    return out
