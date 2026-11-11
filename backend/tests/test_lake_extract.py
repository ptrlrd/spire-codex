"""The extractor tags every staged run with the seat its document is, so
the lake build keeps one seat per document."""

import gzip
import hashlib
import importlib.util
import json
import pathlib
from datetime import datetime, timezone

_LAB = pathlib.Path(__file__).resolve().parents[2] / "lab"


def _load():
    spec = importlib.util.spec_from_file_location("lake_extract", _LAB / "extract.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Cursor(list):
    def sort(self, _spec):
        return self

    def close(self):
        pass


class _Coll:
    def __init__(self, docs):
        self.docs = docs

    def find(self, *_args, **_kwargs):
        return _Cursor(self.docs)


def _hash(blob: dict, idx: int) -> str:
    p = blob["players"][idx]
    key = (
        f"{blob['seed']}:{p['character']}:{blob['start_time']}:"
        f"{blob['run_time']}:{len(p['deck'])}:{idx}"
    )
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def test_staged_runs_carry_their_own_seat(tmp_path, monkeypatch):
    mod = _load()
    blob = {
        "seed": "S",
        "start_time": 5,
        "run_time": 9,
        "players": [
            {"character": "CHARACTER.IRONCLAD", "deck": [{"id": "CARD.BASH"}]},
            {"character": "CHARACTER.SILENT", "deck": []},
        ],
    }
    host, guest = _hash(blob, 0), _hash(blob, 1)
    now = datetime(2026, 10, 6, tzinfo=timezone.utc)
    docs = [
        {"_id": host, "character": "IRONCLAD", "submitted_at": now, "player_count": 2},
        {"_id": guest, "character": "SILENT", "submitted_at": now, "player_count": 2},
        {"_id": "legacy", "character": "SILENT", "submitted_at": now},
    ]
    monkeypatch.setattr(mod, "STAGING", tmp_path)
    monkeypatch.setattr(mod, "STATE", tmp_path / "state.json")
    monkeypatch.setattr(mod, "_get_collection", lambda: _Coll(docs))
    monkeypatch.setattr(mod, "_refresh_excluded", lambda coll: None)
    monkeypatch.setattr(mod, "_refresh_scalars", lambda coll: None)
    monkeypatch.setattr(
        mod, "get_run_blobs", lambda ids: {h: json.loads(json.dumps(blob)) for h in ids}
    )
    monkeypatch.setattr(mod.sys, "argv", ["extract.py"])
    assert mod.main() == (3, 0)
    with gzip.open(tmp_path / "00000.jsonl.gz", "rt") as f:
        seats = {
            row["run_hash"]: row["_meta"]["player_index"] for row in map(json.loads, f)
        }
    assert seats == {host: 0, guest: 1, "legacy": None}
