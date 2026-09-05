"""Exploder acceptance: crash mid-batch never double-counts or wedges,
three failures quarantine, batches are bounded by bytes, staging is
invisible until the rename, versions don't mix, and the data shapes the
solver needs come out right (skip has no winner, eternal is presented but
not selectable, paid vs forced removals, one lineage row per instance)."""

import gzip
import json
import os
import pathlib
import sys
from datetime import datetime, timedelta, timezone

import pyarrow.parquet as pq
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "lab"))
import replays_explode as ex  # noqa: E402

SAMPLE = pathlib.Path(__file__).parent / "fixtures" / "sample-replay.jsonl"
NOW = datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc)


def _lines():
    return [ln for ln in SAMPLE.read_text(encoding="utf-8").splitlines() if ln.strip()]


def _gz(lines=None):
    return gzip.compress(("\n".join(lines or _lines()) + "\n").encode("utf-8"))


def _meta(run_hash, gz, **extra):
    import hashlib

    return {
        "_id": run_hash,
        "sha256": hashlib.sha256(gz).hexdigest(),
        "gz_bytes": len(gz),
        "raw_bytes": len(gzip.decompress(gz)),
        "build_id": "v0.103.3",
        "character": "IRONCLAD",
        "ascension": 10,
        "win": False,
        "start_time": 1781152879,
        "user_id": "6" * 24,
        "steam_id": "76561198000000002",
        "player_idx": 0,
        "submitted_at": NOW,
        "ingest_state": None,
        "attempts": 0,
        "lease_expires_at": None,
        "batch_id": None,
        **extra,
    }


class FakeStore:
    """The Mongo claim/ack surface with the same fencing semantics."""

    def __init__(self, docs, blobs):
        self.docs = {d["_id"]: dict(d) for d in docs}
        self.blobs = blobs
        self.owner = "test-owner"
        self.acks = []

    def claim(self, now):
        for d in sorted(self.docs.values(), key=lambda d: d["submitted_at"]):
            if d.get("deleted_at"):
                continue
            state = d.get("ingest_state")
            expired = (
                d.get("lease_expires_at") is not None and d["lease_expires_at"] < now
            )
            if state in (None, "retry") or (state == "claimed" and expired):
                d["ingest_state"] = "claimed"
                d["owner"] = self.owner
                d["lease_expires_at"] = now + timedelta(seconds=ex.LEASE_SECONDS)
                d["attempts"] = d.get("attempts", 0) + 1
                return {k: v for k, v in d.items() if k != "blob"}
        return None

    def _mine(self, h, batch_id):
        d = self.docs.get(h)
        return (
            d is not None
            and d.get("batch_id") == batch_id
            and d.get("owner") == self.owner
        )

    def blob(self, run_hash, sha256=None):
        d = self.docs.get(run_hash)
        if d is None or (sha256 and d.get("sha256") != sha256):
            return b""
        return self.blobs[run_hash]

    def assign_batch(self, hashes, batch_id):
        for h in hashes:
            if self.docs[h].get("owner") == self.owner:
                self.docs[h]["batch_id"] = batch_id

    def renew(self, hashes, batch_id, now):
        for h in hashes:
            if self._mine(h, batch_id):
                self.docs[h]["lease_expires_at"] = now + timedelta(
                    seconds=ex.LEASE_SECONDS
                )

    def still_mine(self, hashes, batch_id, now):
        return all(
            self._mine(h, batch_id) and self.docs[h]["lease_expires_at"] > now
            for h in hashes
        )

    def ack(self, done, batch_id, now):
        for item in done:
            h = item["run_hash"]
            d = self.docs.get(h)
            if d is None or d.get("sha256") != item.get("sha256"):
                continue
            if not self._mine(h, batch_id):
                continue
            d.update(ingest_state="done", ingested_at=now, lease_expires_at=None)
            d.setdefault("published", {})[str(ex.EXPLODER_VERSION)] = batch_id
            self.acks.append((h, batch_id))

    def release(self, run_hash, error, quarantine):
        d = self.docs[run_hash]
        if d.get("owner") != self.owner:
            return
        d.update(
            ingest_state="quarantined" if quarantine else "retry",
            error=error,
            lease_expires_at=None,
        )

    def release_all(self, hashes, batch_id, error):
        for h in hashes:
            if self._mine(h, batch_id):
                self.docs[h].update(
                    ingest_state="retry", error=error, lease_expires_at=None
                )


def _batches(out_dir):
    return [d for d in (out_dir / "committed").iterdir() if not d.name.startswith("_")]


def _rows(out_dir, table):
    files = sorted((out_dir / "committed").glob(f"*/{table}.parquet"))
    if not files:
        return []
    return [r for f in files for r in pq.read_table(f).to_pylist()]


def test_parse_sample_matches_the_solver_contract():
    gz = _gz()
    rows = ex.parse_replay(gz, _meta("r1", gz), "b1")
    idx = rows["replay_index"][0]
    assert idx["lines"] == len(_lines()) and idx["capture_status"] == "complete"
    assert idx["terminal_reason"] == "death" and idx["seq_gaps"] == 0
    assert idx["played_month"] == "2026-06"

    decisions = {d["decision_id"]: d for d in rows["decisions"]}
    taken = decisions[2]
    assert taken["outcome"] == "chosen" and taken["outcome_option_index"] == 0
    assert taken["n_presented"] == 3 and taken["resolved"] is True
    skipped = decisions[3]
    assert skipped["outcome"] == "skip" and skipped["outcome_option_index"] is None
    assert skipped["n_presented"] == 3 and skipped["resolved"] is False
    removal = decisions[4]
    assert removal["paid"] is True and removal["cost_current"] == 75
    assert removal["cost_resource"] == "gold" and removal["gold_on_hand"] == 180
    assert removal["outcome"] == "chosen" and removal["outcome_option_index"] == 0

    opts = [o for o in rows["frame_options"] if o["decision_id"] == 4]
    eternal = next(o for o in opts if o["option_id"] == "ASCENDERS_BANE")
    assert eternal["presented"] is True and eternal["selectable"] is False
    assert eternal["selectable_reason"] == "eternal" and eternal["chosen"] is False
    chosen = [o for o in opts if o["chosen"]]
    assert [o["instance_id"] for o in chosen] == [1]
    assert all(o["applied"] for o in chosen)
    skip_opts = [o for o in rows["frame_options"] if o["decision_id"] == 3]
    assert len(skip_opts) == 3 and not any(o["chosen"] for o in skip_opts)

    inst = {i["instance_id"]: i for i in rows["card_instances"]}
    assert inst[1]["removed_via"] == "remove" and inst[1]["in_final_deck"] is False
    assert inst[2]["upgraded_s"] == 31 and inst[2]["in_final_deck"] is None
    assert 11 not in inst and 12 not in inst
    assert (
        inst[6]["removed_via"] == "transform"
        and inst[6]["transformed_to_instance"] == 61
    )
    assert (
        inst[61]["acquired_via"] == "transform" and inst[61]["card_id"] == "WHIRLWIND"
    )
    assert (
        inst[31]["acquired_via"] == "acquire" and inst[31]["acquired_decision_id"] == 2
    )
    assert (
        len([i for i in rows["card_instances"] if i["card_id"] == "STRIKE_IRONCLAD"])
        == 2
    )

    assert len(rows["plays"]) == 1 and rows["plays"][0]["cost_paid"] == 1
    assert len(rows["hits"]) == 2 and len(rows["rooms"]) == 4
    assert (
        rows["combats"][0]["encounter"] == "SHRINKER_BEETLE_WEAK"
        and rows["combats"][0]["s_end"] == 20
    )
    kinds = {e["kind"] for e in rows["events"]}
    assert {
        "draw",
        "hp",
        "gold",
        "buy",
        "remove",
        "upgrade",
        "transform",
        "rest",
        "outcome",
    } <= kinds
    assert all(r["exploder_version"] == ex.EXPLODER_VERSION for r in rows["decisions"])


def test_upgraded_then_removed_starter_is_one_lineage_row():
    lines = _lines()
    lines.append(
        json.dumps(
            {
                "t": "remove",
                "s": 36,
                "ms": 26000,
                "floor": 13,
                "act": 1,
                "decision_id": 7,
                "c": 2,
                "id": "STRIKE_IRONCLAD",
            }
        )
    )
    end = lines.pop(-2)
    lines.append(end)
    gz = _gz(lines)
    rows = ex.parse_replay(gz, _meta("r1", gz), "b1")
    two = [i for i in rows["card_instances"] if i["instance_id"] == 2]
    assert len(two) == 1
    assert (
        two[0]["upgraded_s"] == 31
        and two[0]["removed_s"] == 36
        and two[0]["in_final_deck"] is False
    )


def test_truncated_replay_is_marked_and_gaps_counted():
    lines = _lines()[:-1]
    lines = lines[:10] + lines[12:]
    gz = _gz(lines)
    rows = ex.parse_replay(gz, _meta("r1", gz), "b1")
    idx = rows["replay_index"][0]
    assert idx["has_end"] is False and idx["capture_status"] == "gapped"
    assert idx["seq_gaps"] == 1 and idx["reported_status"] is None


def _store(n=3, bad=()):
    docs, blobs = [], {}
    for i in range(n):
        h = f"run{i}"
        gz = (
            _gz()
            if h not in bad
            else gzip.compress(b'{"t":"header","replay_version":1}\n{broken\n')
        )
        docs.append(_meta(h, gz, submitted_at=NOW + timedelta(seconds=i)))
        blobs[h] = gz
    return FakeStore(docs, blobs)


def test_batch_commits_once_and_acks_after(tmp_path):
    store = _store(3)
    summary = ex.explode_batch(store, tmp_path, NOW)
    assert summary["done"] == 3 and summary["failed"] == 0
    assert not (tmp_path / "staging").exists() or not any(
        (tmp_path / "staging").iterdir()
    )
    committed = _batches(tmp_path)
    assert len(committed) == 1
    manifest = json.loads((committed[0] / "manifest.json").read_text())
    assert {r["run_hash"] for r in manifest["replays"]} == {"run0", "run1", "run2"}
    assert all(d["ingest_state"] == "done" for d in store.docs.values())
    idx = _rows(tmp_path, "replay_index")
    assert sorted(r["run_hash"] for r in idx) == ["run0", "run1", "run2"]
    again = ex.explode_batch(store, tmp_path, NOW + timedelta(minutes=1))
    assert again["claimed"] == 0 and len(_rows(tmp_path, "replay_index")) == 3


def test_crash_before_commit_republishes_nothing_twice(tmp_path, monkeypatch):
    store = _store(2)
    real_replace = os.replace

    def crash(src, dst):
        raise RuntimeError("power cut")

    monkeypatch.setattr(ex.os, "replace", crash)
    with pytest.raises(RuntimeError):
        ex.explode_batch(store, tmp_path, NOW)
    assert not (tmp_path / "committed").exists() or not any(
        (tmp_path / "committed").glob("*/manifest.json")
    )
    assert all(d["ingest_state"] == "retry" for d in store.docs.values())
    monkeypatch.setattr(ex.os, "replace", real_replace)

    summary = ex.explode_batch(store, tmp_path, NOW + timedelta(seconds=1))
    assert summary["done"] == 2
    idx = _rows(tmp_path, "replay_index")
    assert sorted(r["run_hash"] for r in idx) == ["run0", "run1"]
    assert len(_rows(tmp_path, "decisions")) == 2 * 3


def test_crash_after_commit_only_acks_on_retry(tmp_path, monkeypatch):
    store = _store(2)
    calls = []

    def ack_crash(done, batch_id, now):
        calls.append([d["run_hash"] for d in done])
        raise RuntimeError("mongo away")

    monkeypatch.setattr(store, "ack", ack_crash)
    with pytest.raises(RuntimeError):
        ex.explode_batch(store, tmp_path, NOW)
    monkeypatch.undo()
    assert len(list((tmp_path / "committed").glob("*/manifest.json"))) == 1
    assert all(d["ingest_state"] == "claimed" for d in store.docs.values())

    later = datetime.now(timezone.utc) + timedelta(seconds=ex.LEASE_SECONDS + 1)
    summary = ex.explode_batch(store, tmp_path, later)
    assert summary["acked_early"] == 2 and summary["done"] == 0
    assert len(list((tmp_path / "committed").glob("*/manifest.json"))) == 1
    assert all(d["ingest_state"] == "done" for d in store.docs.values())
    assert len(_rows(tmp_path, "replay_index")) == 2


def test_three_failures_quarantine_without_blocking_the_queue(tmp_path):
    store = _store(3, bad=("run1",))
    for i in range(ex.MAX_ATTEMPTS):
        ex.explode_batch(store, tmp_path, NOW + timedelta(minutes=i))
    bad = store.docs["run1"]
    assert bad["ingest_state"] == "quarantined" and "ReplayError" in bad["error"]
    assert store.docs["run0"]["ingest_state"] == "done"
    assert store.docs["run2"]["ingest_state"] == "done"
    assert sorted(r["run_hash"] for r in _rows(tmp_path, "replay_index")) == [
        "run0",
        "run2",
    ]
    summary = ex.explode_batch(store, tmp_path, NOW + timedelta(hours=1))
    assert summary["claimed"] == 0


def test_batches_are_bounded_by_bytes_not_documents(tmp_path, monkeypatch):
    store = _store(4)
    gz_each = store.docs["run0"]["gz_bytes"]
    monkeypatch.setattr(ex, "GZ_BUDGET", gz_each * 2)
    first = ex.explode_batch(store, tmp_path, NOW)
    assert first["claimed"] == 2 and first["done"] == 2
    second = ex.explode_batch(store, tmp_path, NOW + timedelta(minutes=1))
    assert second["done"] == 2
    assert len(_batches(tmp_path)) == 2
    monkeypatch.setattr(ex, "GZ_BUDGET", 10**9)
    monkeypatch.setattr(ex, "RAW_BUDGET", store.docs["run0"]["raw_bytes"] * 3)
    store2 = _store(5)
    third = ex.explode_batch(store2, tmp_path, NOW + timedelta(minutes=2))
    assert third["claimed"] == 3


def test_staging_is_invisible_to_readers_until_rename(tmp_path, monkeypatch):
    import duckdb

    store = _store(1)
    seen = {}

    real_replace = os.replace

    def spy_replace(src, dst):
        con = duckdb.connect()
        ex.attach_views(con, tmp_path)
        seen["before"] = con.execute(
            "SELECT count(*) FROM replay_replay_index"
        ).fetchone()[0]
        real_replace(src, dst)

    monkeypatch.setattr(ex.os, "replace", spy_replace)
    ex.explode_batch(store, tmp_path, NOW)
    assert seen["before"] == 0
    con = duckdb.connect()
    ex.attach_views(con, tmp_path)
    assert con.execute("SELECT count(*) FROM replay_replay_index").fetchone()[0] == 1
    assert (
        con.execute(
            "SELECT count(*) FROM replay_frame_options WHERE selectable = false"
        ).fetchone()[0]
        == 1
    )


def test_reprocessing_under_a_new_version_does_not_mix(tmp_path, monkeypatch):
    import duckdb

    store = _store(1)
    ex.explode_batch(store, tmp_path, NOW)
    monkeypatch.setattr(ex, "EXPLODER_VERSION", 2)
    store.docs["run0"]["ingest_state"] = None
    ex.explode_batch(store, tmp_path, NOW + timedelta(minutes=1))
    con = duckdb.connect()
    ex.attach_views(con, tmp_path, version=1)
    assert con.execute("SELECT count(*) FROM replay_decisions").fetchone()[0] == 3
    ex.attach_views(con, tmp_path, version=2)
    assert con.execute("SELECT count(*) FROM replay_decisions").fetchone()[0] == 3
    assert (
        con.execute(
            "SELECT count(DISTINCT exploder_version) FROM read_parquet(?)",
            [str(tmp_path / "committed" / "*" / "decisions.parquet")],
        ).fetchone()[0]
        == 2
    )


def _new_journal():
    """The recorder's post-sample shapes: starting_deck with real instance
    ids, acquire carrying source and option_index (decision_id null for
    granted cards), cards generated mid-combat, hits with killed, plays with
    stars_paid, hp_loss out of combat, an outcome with option_index but no
    resolution (a failed pick), and final_deck as instances."""
    j = [
        {
            "t": "header",
            "s": 0,
            "ms": 0,
            "floor": 0,
            "act": 1,
            "replay_version": 1,
            "seed": "S",
            "build_id": "v0.103.4",
            "character": "IRONCLAD",
            "ascension": 10,
            "game_mode": "standard",
            "start_time": 1781152879,
            "player_count": 1,
            "starting_deck": [
                {"c": 1, "id": "STRIKE_IRONCLAD"},
                {"c": 2, "id": "STRIKE_IRONCLAD"},
                {"c": 6, "id": "DEFEND_IRONCLAD"},
            ],
        },
        {
            "t": "room",
            "s": 1,
            "ms": 10,
            "floor": 1,
            "act": 1,
            "kind": "monster",
            "id": "JAW_WORM",
        },
        {
            "t": "combat_start",
            "s": 2,
            "ms": 20,
            "floor": 1,
            "act": 1,
            "encounter": "JAW_WORM",
            "enemies": [{"i": 0, "id": "JAW_WORM", "hp": 40, "max_hp": 40}],
        },
        {"t": "turn", "s": 3, "ms": 30, "floor": 1, "act": 1, "n": 1, "side": "player"},
        {
            "t": "draw",
            "s": 4,
            "ms": 40,
            "floor": 1,
            "act": 1,
            "c": 15,
            "id": "ASCENDERS_BANE",
        },
        {"t": "draw", "s": 5, "ms": 50, "floor": 1, "act": 1, "c": 16, "id": "SLIMED"},
        {
            "t": "play",
            "s": 6,
            "ms": 60,
            "floor": 1,
            "act": 1,
            "c": 1,
            "id": "STRIKE_IRONCLAD",
            "up": 0,
            "target": "JAW_WORM",
            "cost_paid": 1,
            "stars_paid": 0,
            "turn": 1,
        },
        {
            "t": "hit",
            "s": 7,
            "ms": 70,
            "floor": 1,
            "act": 1,
            "src": "player",
            "dst": "JAW_WORM",
            "dmg": 40,
            "blocked": 0,
            "killed": True,
            "card": "STRIKE_IRONCLAD",
        },
        {"t": "combat_end", "s": 8, "ms": 80, "floor": 1, "act": 1, "turns": 1},
        {
            "t": "decision",
            "s": 9,
            "ms": 90,
            "floor": 1,
            "act": 1,
            "decision_id": 1,
            "decision_type": "card_reward",
            "source": "reward",
            "offer_generation": 0,
            "n_presented": 3,
            "n_selectable": 3,
            "decline_available": True,
            "can_reroll": False,
            "options": [
                {
                    "option_index": 0,
                    "option_kind": "card",
                    "option_id": "GUILTY",
                    "instance_id": 900,
                    "up": 0,
                    "presented": True,
                    "selectable": True,
                },
                {
                    "option_index": 1,
                    "option_kind": "card",
                    "option_id": "CLEAVE",
                    "instance_id": 901,
                    "up": 0,
                    "presented": True,
                    "selectable": True,
                },
                {
                    "option_index": 2,
                    "option_kind": "card",
                    "option_id": "ANGER",
                    "instance_id": 902,
                    "up": 0,
                    "presented": True,
                    "selectable": True,
                },
            ],
        },
        {
            "t": "outcome",
            "s": 10,
            "ms": 100,
            "floor": 1,
            "act": 1,
            "decision_id": 1,
            "decision_type": "card_reward",
            "outcome": "chosen",
            "option_index": 0,
        },
        {
            "t": "acquire",
            "s": 11,
            "ms": 110,
            "floor": 1,
            "act": 1,
            "decision_id": 1,
            "option_index": 0,
            "source": "reward",
            "c": 14,
            "id": "GUILTY",
        },
        {"t": "hp_loss", "s": 12, "ms": 120, "floor": 2, "act": 1, "d": -7, "hp": 60},
        {
            "t": "acquire",
            "s": 13,
            "ms": 130,
            "floor": 2,
            "act": 1,
            "decision_id": None,
            "source": "granted",
            "c": 17,
            "id": "REGRET",
        },
        {
            "t": "decision",
            "s": 14,
            "ms": 140,
            "floor": 2,
            "act": 1,
            "decision_id": 2,
            "decision_type": "card_reward",
            "source": "reward",
            "offer_generation": 0,
            "n_presented": 2,
            "n_selectable": 2,
            "decline_available": True,
            "can_reroll": False,
            "options": [
                {
                    "option_index": 0,
                    "option_kind": "card",
                    "option_id": "BASH",
                    "instance_id": 903,
                    "up": 0,
                    "presented": True,
                    "selectable": True,
                },
                {
                    "option_index": 1,
                    "option_kind": "card",
                    "option_id": "STRIKE_IRONCLAD",
                    "instance_id": 904,
                    "up": 0,
                    "presented": True,
                    "selectable": True,
                },
            ],
        },
        {
            "t": "outcome",
            "s": 15,
            "ms": 150,
            "floor": 2,
            "act": 1,
            "decision_id": 2,
            "decision_type": "card_reward",
            "outcome": "chosen",
            "option_index": 1,
        },
        {
            "t": "end",
            "s": 16,
            "ms": 160,
            "floor": 2,
            "act": 1,
            "terminal_reason": "death",
            "capture_status": "complete",
            "run_time": 100,
            "floors": 2,
            "hp": 0,
            "max_hp": 80,
            "final_deck": [
                {"c": 1, "id": "STRIKE_IRONCLAD"},
                {"c": 2, "id": "STRIKE_IRONCLAD"},
                {"c": 6, "id": "DEFEND_IRONCLAD"},
                {"c": 14, "id": "GUILTY"},
                {"c": 15, "id": "ASCENDERS_BANE"},
                {"c": 17, "id": "REGRET"},
            ],
        },
    ]
    return [json.dumps(x) for x in j]


def test_new_journal_shapes_link_by_option_index_not_instance_id():
    gz = _gz(_new_journal())
    rows = ex.parse_replay(gz, _meta("r2", gz), "b1")

    inst = {i["instance_id"]: i for i in rows["card_instances"]}
    assert inst[1]["acquired_via"] == "start" and inst[1]["acquired_s"] == 0
    assert inst[6]["acquired_via"] == "start" and inst[6]["in_final_deck"] is True
    assert inst[14]["acquired_via"] == "reward" and inst[14]["card_id"] == "GUILTY"
    assert inst[14]["acquired_decision_id"] == 1 and inst[14]["in_final_deck"] is True
    assert ()
    assert 15 not in inst and 16 not in inst
    assert inst[17]["acquired_via"] == "granted"
    assert (
        inst[17]["acquired_decision_id"] is None and inst[17]["in_final_deck"] is True
    )
    assert 900 not in inst and 904 not in inst

    opts = {(o["decision_id"], o["option_index"]): o for o in rows["frame_options"]}
    assert opts[(1, 0)]["chosen"] is True and opts[(1, 0)]["applied"] is True
    assert opts[(1, 1)]["chosen"] is False and opts[(1, 2)]["chosen"] is False
    assert opts[(2, 1)]["chosen"] is True and opts[(2, 1)]["applied"] is False
    assert opts[(2, 0)]["chosen"] is False
    assert not any(o["decision_id"] is None for o in rows["frame_options"])
    decisions = {d["decision_id"]: d for d in rows["decisions"]}
    assert decisions[1]["outcome"] == "chosen"
    assert decisions[1]["outcome_option_index"] == 0 and decisions[1]["resolved"]
    assert decisions[2]["outcome"] == "chosen" and decisions[2]["resolved"] is False
    assert decisions[2]["outcome_option_index"] == 1

    assert rows["hits"][0]["killed"] is True and rows["hits"][0]["dmg"] == 40
    assert rows["plays"][0]["stars_paid"] == 0 and rows["plays"][0]["target_c"] is None
    loss = next(e for e in rows["events"] if e["kind"] == "hp_loss")
    assert loss["d"] == -7 and loss["value"] == 60
    granted = next(e for e in rows["events"] if e["kind"] == "acquire" and e["c"] == 17)
    assert granted["decision_id"] is None and "granted" in (granted["extra"] or "")


def _journal(*extra, header_extra=None):
    h = {
        "t": "header",
        "s": 0,
        "ms": 0,
        "floor": 0,
        "act": 1,
        "replay_version": 1,
        "seed": "S",
        "build_id": "v1",
        "character": "IRONCLAD",
        "ascension": 0,
        "game_mode": "standard",
        "start_time": 1781152879,
        "player_count": 1,
        **(header_extra or {}),
    }
    return [json.dumps(h)] + [json.dumps(x) for x in extra]


def test_rerolls_keep_every_generation_and_resolve_the_last():
    gz = _gz(
        _journal(
            {
                "t": "decision",
                "s": 1,
                "ms": 1,
                "floor": 1,
                "act": 1,
                "decision_id": 5,
                "decision_type": "card_reward",
                "source": "reward",
                "offer_generation": 0,
                "n_presented": 1,
                "n_selectable": 1,
                "can_reroll": True,
                "options": [
                    {
                        "option_index": 0,
                        "option_kind": "card",
                        "option_id": "BAD",
                        "instance_id": 100,
                        "presented": True,
                        "selectable": True,
                    }
                ],
            },
            {
                "t": "outcome",
                "s": 2,
                "ms": 2,
                "floor": 1,
                "act": 1,
                "decision_id": 5,
                "outcome": "reroll",
            },
            {
                "t": "decision",
                "s": 3,
                "ms": 3,
                "floor": 1,
                "act": 1,
                "decision_id": 5,
                "decision_type": "card_reward",
                "source": "reward",
                "offer_generation": 1,
                "n_presented": 1,
                "n_selectable": 1,
                "can_reroll": False,
                "options": [
                    {
                        "option_index": 0,
                        "option_kind": "card",
                        "option_id": "GOOD",
                        "instance_id": 101,
                        "presented": True,
                        "selectable": True,
                    }
                ],
            },
            {
                "t": "outcome",
                "s": 4,
                "ms": 4,
                "floor": 1,
                "act": 1,
                "decision_id": 5,
                "outcome": "chosen",
                "option_index": 0,
            },
            {
                "t": "acquire",
                "s": 5,
                "ms": 5,
                "floor": 1,
                "act": 1,
                "decision_id": 5,
                "option_index": 0,
                "source": "reward",
                "c": 40,
                "id": "GOOD",
            },
        )
    )
    rows = ex.parse_replay(gz, _meta("r", gz), "b")
    opts = [o for o in rows["frame_options"] if o["decision_id"] == 5]
    assert [(o["offer_generation"], o["option_id"], o["chosen"]) for o in opts] == [
        (0, "BAD", False),
        (1, "GOOD", True),
    ]
    dec = rows["decisions"][0]
    assert dec["rerolls"] == 1 and dec["offer_generation"] == 1
    assert dec["outcome"] == "chosen" and dec["outcome_option_index"] == 0


def test_duplicate_option_ids_resolve_by_id_to_the_first():
    gz = _gz(
        _journal(
            {
                "t": "decision",
                "s": 1,
                "ms": 1,
                "floor": 1,
                "act": 1,
                "decision_id": 8,
                "decision_type": "event",
                "source": "event",
                "n_presented": 2,
                "n_selectable": 2,
                "options": [
                    {
                        "option_index": 0,
                        "option_kind": "relic",
                        "option_id": "REST",
                        "presented": True,
                        "selectable": True,
                    },
                    {
                        "option_index": 1,
                        "option_kind": "relic",
                        "option_id": "REST",
                        "presented": True,
                        "selectable": True,
                    },
                ],
            },
            {
                "t": "resolve",
                "s": 2,
                "ms": 2,
                "floor": 1,
                "act": 1,
                "decision_id": 8,
                "id": "REST",
            },
        )
    )
    rows = ex.parse_replay(gz, _meta("r", gz), "b")
    dec = rows["decisions"][0]
    assert dec["outcome"] == "chosen" and dec["resolved"] is True
    assert dec["outcome_option_index"] == 0


def test_combat_damage_and_result_are_derived_when_absent():
    gz = _gz(
        _journal(
            {
                "t": "combat_start",
                "s": 1,
                "ms": 1,
                "floor": 1,
                "act": 1,
                "encounter": "CRAWLER",
                "enemies": [{"i": 0, "id": "CRAWLER", "hp": 20, "max_hp": 20}],
            },
            {"t": "hp", "s": 2, "ms": 2, "floor": 1, "act": 1, "d": -6, "hp": 74},
            {"t": "hp", "s": 3, "ms": 3, "floor": 1, "act": 1, "d": -4, "hp": 70},
            {"t": "combat_end", "s": 4, "ms": 4, "floor": 1, "act": 1, "turns": 2},
            {
                "t": "combat_start",
                "s": 5,
                "ms": 5,
                "floor": 2,
                "act": 1,
                "encounter": "BOSS",
                "enemies": [],
            },
            {"t": "hp", "s": 6, "ms": 6, "floor": 2, "act": 1, "d": -70, "hp": 0},
            {
                "t": "end",
                "s": 7,
                "ms": 7,
                "floor": 2,
                "act": 1,
                "terminal_reason": "death",
                "capture_status": "complete",
                "hp": 0,
            },
        )
    )
    rows = ex.parse_replay(gz, _meta("r", gz), "b")
    first, last = rows["combats"]
    assert first["damage_taken"] == 10 and first["hp_end"] == 70
    assert first["result"] == "victory" and first["s_end"] == 4
    assert last["result"] == "death" and last["hp_end"] == 0 and last["s_end"] == 7


def test_lost_lease_abandons_the_batch_and_releases_the_claims(tmp_path):
    store = _store(2)
    original_still_mine = store.still_mine
    store.still_mine = lambda hashes, batch_id, now: False
    summary = ex.explode_batch(store, tmp_path, NOW)
    assert summary["done"] == 0 and summary.get("abandoned") == 2
    assert not list((tmp_path / "committed").glob("*/manifest.json"))
    assert not (tmp_path / "staging").exists() or not any(
        (tmp_path / "staging").iterdir()
    )
    assert all(d["ingest_state"] == "retry" for d in store.docs.values())
    store.still_mine = original_still_mine
    summary = ex.explode_batch(store, tmp_path, NOW + timedelta(seconds=1))
    assert summary["done"] == 2


def test_lease_is_verified_at_commit_time_not_batch_start(tmp_path):
    store = _store(1)
    seen = {}
    real = store.still_mine

    def spy(hashes, batch_id, now):
        seen["at"] = now
        return real(hashes, batch_id, now)

    store.still_mine = spy
    summary = ex.explode_batch(store, tmp_path, NOW)
    assert summary["done"] == 1
    assert seen["at"] > NOW
    assert store.docs["run0"]["ingest_state"] == "done"


def test_rename_failure_releases_claims_and_cleans_staging(tmp_path, monkeypatch):
    store = _store(2)

    def fail(src, dst):
        raise OSError("rename failed")

    monkeypatch.setattr(ex.os, "replace", fail)
    with pytest.raises(OSError):
        ex.explode_batch(store, tmp_path, NOW)
    assert all(d["ingest_state"] == "retry" for d in store.docs.values())
    assert not any((tmp_path / "staging").iterdir())
    assert not list((tmp_path / "committed").glob("*/manifest.json"))


def test_version_rollback_only_acks_the_old_publication(tmp_path, monkeypatch):
    store = _store(1)
    ex.explode_batch(store, tmp_path, NOW)
    monkeypatch.setattr(ex, "EXPLODER_VERSION", 2)
    store.docs["run0"]["ingest_state"] = None
    ex.explode_batch(store, tmp_path, NOW + timedelta(minutes=1))
    monkeypatch.setattr(ex, "EXPLODER_VERSION", 1)
    store.docs["run0"]["ingest_state"] = None
    summary = ex.explode_batch(store, tmp_path, NOW + timedelta(minutes=2))
    assert summary["acked_early"] == 1 and summary["done"] == 0
    assert len([b for b in _batches(tmp_path)]) == 2
    import duckdb

    con = duckdb.connect()
    ex.attach_views(con, tmp_path, version=1)
    assert con.execute("SELECT count(*) FROM replay_replay_index").fetchone()[0] == 1


def test_replaced_blob_is_not_published_under_the_old_claim(tmp_path):
    store = _store(2)
    real_blob = store.blob
    store.blob = lambda h, sha=None: b"" if h == "run1" else real_blob(h, sha)
    summary = ex.explode_batch(store, tmp_path, NOW)
    assert summary["done"] == 1 and summary["failed"] == 1
    assert store.docs["run1"]["ingest_state"] == "retry"
    assert "replaced" in store.docs["run1"]["error"]


def test_bad_type_quarantines_only_that_replay(tmp_path):
    bad = _lines()
    bad.insert(
        3, json.dumps({"t": "room", "s": 3, "ms": 1, "floor": 1, "act": 1, "kind": 7})
    )
    store = _store(3)
    store.blobs["run1"] = _gz(bad)
    store.docs["run1"]["sha256"] = (
        __import__("hashlib").sha256(store.blobs["run1"]).hexdigest()
    )
    for i in range(ex.MAX_ATTEMPTS):
        ex.explode_batch(store, tmp_path, NOW + timedelta(minutes=i))
    assert store.docs["run1"]["ingest_state"] == "quarantined"
    assert (
        "ArrowInvalid" in store.docs["run1"]["error"]
        or "ArrowTypeError" in store.docs["run1"]["error"]
    )
    assert (
        store.docs["run0"]["ingest_state"] == "done"
        and store.docs["run2"]["ingest_state"] == "done"
    )
    assert sorted(r["run_hash"] for r in _rows(tmp_path, "replay_index")) == [
        "run0",
        "run2",
    ]


def test_writer_failure_aborts_the_batch_and_returns_claims(tmp_path, monkeypatch):
    store = _store(2)
    ex.ensure_schema_templates(tmp_path)

    def boom(self, table, row_group_size=None):
        raise OSError("disk full")

    monkeypatch.setattr(ex.pq.ParquetWriter, "write_table", boom)
    with pytest.raises(OSError):
        ex.explode_batch(store, tmp_path, NOW)
    assert all(d["ingest_state"] == "retry" for d in store.docs.values())
    assert all("batch aborted" in d["error"] for d in store.docs.values())
    assert not list((tmp_path / "committed").glob("*/manifest.json"))
    assert not (tmp_path / "staging").exists() or not any(
        (tmp_path / "staging").iterdir()
    )
    monkeypatch.undo()
    summary = ex.explode_batch(store, tmp_path, NOW + timedelta(minutes=1))
    assert summary["done"] == 2


def test_fanout_caps_reject_before_materialising():
    huge = {
        "t": "decision",
        "s": 1,
        "ms": 1,
        "floor": 1,
        "act": 1,
        "decision_id": 1,
        "decision_type": "card_reward",
        "options": [
            {"option_index": i, "option_kind": "card", "option_id": "X"}
            for i in range(ex.MAX_OPTIONS + 1)
        ],
    }
    gz = _gz(_journal(huge))
    with pytest.raises(ex.ReplayError):
        ex.parse_replay(gz, _meta("r", gz), "b")


def test_paid_removal_without_remove_is_unresolved_but_paid():
    gz = _gz(
        _journal(
            {
                "t": "decision",
                "s": 1,
                "ms": 1,
                "floor": 7,
                "act": 1,
                "decision_id": 4,
                "decision_type": "deck_select",
                "source": "deck_select",
                "n_presented": 1,
                "n_selectable": 1,
                "gold_on_hand": 180,
                "options": [
                    {
                        "option_index": 0,
                        "option_kind": "remove",
                        "option_id": "STRIKE_IRONCLAD",
                        "instance_id": 1,
                        "presented": True,
                        "selectable": True,
                    }
                ],
            },
            {
                "t": "buy",
                "s": 2,
                "ms": 2,
                "floor": 7,
                "act": 1,
                "decision_id": 4,
                "kind": "removal_service",
                "cost_current": 75,
                "cost_resource": "gold",
                "gold_on_hand": 180,
            },
        )
    )
    rows = ex.parse_replay(gz, _meta("r", gz), "b")
    dec = rows["decisions"][0]
    assert dec["paid"] is True and dec["cost_current"] == 75
    assert dec["resolved"] is False and dec["outcome"] == "unresolved"
    assert not rows["frame_options"][0]["applied"]


def test_sequence_gap_overrides_reported_complete():
    gz = _gz(
        _journal(
            {
                "t": "room",
                "s": 2,
                "ms": 1,
                "floor": 1,
                "act": 1,
                "kind": "monster",
                "id": "X",
            },
            {
                "t": "end",
                "s": 3,
                "ms": 2,
                "floor": 1,
                "act": 1,
                "terminal_reason": "victory",
                "capture_status": "complete",
            },
        )
    )
    rows = ex.parse_replay(gz, _meta("r", gz), "b")
    idx = rows["replay_index"][0]
    assert idx["seq_gaps"] == 1 and idx["capture_status"] == "gapped"
    assert idx["reported_status"] == "complete" and idx["has_end"] is True


REAL = pathlib.Path(__file__).parent / "fixtures" / "real-replay.jsonl"


def _real_lines():
    return [ln for ln in REAL.read_text(encoding="utf-8").splitlines() if ln.strip()]


def _real_meta(gz):
    return _meta(
        "real", gz, character="SILENT", ascension=10, build_id="v0.111", win=False
    )


def test_real_journal_parses_to_the_reported_shapes():
    lines = _real_lines()
    gz = _gz(lines)
    rows = ex.parse_replay(gz, _real_meta(gz), "b")
    idx = rows["replay_index"][0]
    assert idx["lines"] == 994 and idx["capture_status"] == "complete"
    assert idx["terminal_reason"] == "death" and idx["floors"] == 17
    assert idx["seq_gaps"] == 0 and idx["has_end"] is True
    assert len(rows["plays"]) == 150 and len(rows["hits"]) == 127
    assert len(rows["turns"]) == 76 and len(rows["rooms"]) == 17
    assert len(rows["decisions"]) == 16 and len(rows["maps"]) == 1
    assert len(rows["combats"]) == 6
    assert [c["result"] for c in rows["combats"]].count("victory") == 5
    assert (
        rows["combats"][-1]["result"] == "death" and rows["combats"][-1]["hp_end"] == 0
    )
    assert sum(1 for h in rows["hits"] if h["src"] == "effect") == 25
    assert all(
        p["cost_paid"] is not None and p["cost_paid"] >= 0 for p in rows["plays"]
    )
    kinds = {e["kind"] for e in rows["events"]}
    assert {"generate", "buy", "power", "block", "rest", "potion_used"} <= kinds


def test_real_journal_transform_offer_and_lineage():
    gz = _gz(_real_lines())
    rows = ex.parse_replay(gz, _real_meta(gz), "b")
    dec = next(d for d in rows["decisions"] if d["decision_id"] == 15)
    assert dec["decision_type"] == "deck_select_transform"
    assert dec["select_kind"] == "transform" and dec["source"] == "deck_select"
    assert dec["n_presented"] == 21 and dec["n_selectable"] == 12
    assert dec["decline_available"] is False and dec["forced"] is True
    assert dec["outcome"] == "chosen" and dec["outcome_option_index"] == 4
    assert dec["resolved"] is True and dec["paid"] is False

    opts = [o for o in rows["frame_options"] if o["decision_id"] == 15]
    assert len(opts) == 21
    assert all(o["option_kind"] == "transform" and o["presented"] for o in opts)
    unselectable = [o for o in opts if not o["selectable"]]
    assert len(unselectable) == 9
    assert {o["selectable_reason"] for o in unselectable} == {"eternal", "filtered"}
    assert [
        o["option_id"] for o in unselectable if o["selectable_reason"] == "eternal"
    ] == ["ASCENDERS_BANE"]
    chosen = [o for o in opts if o["chosen"]]
    assert len(chosen) == 1 and chosen[0]["instance_id"] == 5 and chosen[0]["applied"]

    inst = {i["instance_id"]: i for i in rows["card_instances"]}
    assert (
        inst[5]["removed_via"] == "transform"
        and inst[5]["transformed_to_instance"] == 128
    )
    assert inst[5]["in_final_deck"] is False and inst[5]["acquired_via"] == "start"
    assert (
        inst[128]["card_id"] == "TORIC_TOUGHNESS"
        and inst[128]["acquired_via"] == "transform"
    )
    assert inst[128]["in_final_deck"] is True
    assert 40 not in inst
    assert not any(i["acquired_via"] == "generated" for i in inst.values())
    assert sum(1 for e in rows["events"] if e["kind"] == "generate") == 17
    assert set(inst) == {
        c["c"] for c in json.loads(_real_lines()[-1])["final_deck"]
    } | {5}
    assert sum(1 for i in inst.values() if i["acquired_via"] == "start") == len(
        json.loads(_real_lines()[0])["starting_deck"]
    )
    shop = [i for i in inst.values() if i["card_id"] == "EXPERTISE"]
    assert shop and shop[0]["acquired_via"] == "shop"
    upgraded = [i for i in inst.values() if i["upgraded_s"] is not None]
    assert len(upgraded) == 1 and upgraded[0]["card_id"] == "HAZE"
    assert upgraded[0]["acquired_decision_id"] != 0


def test_real_journal_rewards_and_events_pair_offers_with_picks():
    gz = _gz(_real_lines())
    rows = ex.parse_replay(gz, _real_meta(gz), "b")
    decisions = {d["decision_id"]: d for d in rows["decisions"]}
    rewards = [d for d in decisions.values() if d["source"] == "reward"]
    assert len(rewards) == 5
    for d in rewards:
        opts = [
            o for o in rows["frame_options"] if o["decision_id"] == d["decision_id"]
        ]
        picked = [o for o in opts if o["chosen"]]
        if d["outcome"] == "skip":
            assert not picked and d["resolved"] is False
        else:
            assert d["outcome"] == "chosen" and len(picked) == 1
            assert (
                picked[0]["applied"]
                and picked[0]["option_index"] == d["outcome_option_index"]
            )
    events = [d for d in decisions.values() if d["source"] == "event"]
    assert len(events) == 10 and all(d["event_id"] for d in events)
    neow = decisions[1]
    assert neow["event_id"] == "NEOW" and neow["outcome"] == "chosen"
    neow_opts = [o for o in rows["frame_options"] if o["decision_id"] == 1]
    picked = [o for o in neow_opts if o["chosen"]]
    assert len(picked) == 1 and picked[0]["grants_relic"] == "SMALL_CAPSULE"
    assert picked[0]["applied"] is True and picked[0]["label"] == "Small Capsule"
    assert neow["outcome_option_index"] == picked[0]["option_index"]
    assert all(o["decision_id"] for o in rows["frame_options"])
    assert not any(e["decision_id"] == 0 for e in rows["events"])


def test_real_journal_explodes_end_to_end_into_duckdb(tmp_path):
    import duckdb

    gz = _gz(_real_lines())
    store = FakeStore([_real_meta(gz)], {"real": gz})
    summary = ex.explode_batch(store, tmp_path, NOW)
    assert summary["done"] == 1 and summary["failed"] == 0
    con = duckdb.connect()
    ex.attach_views(con, tmp_path)
    counts = {
        name: con.execute(f"SELECT count(*) FROM replay_{name}").fetchone()[0]
        for name in (
            "replay_index",
            "decisions",
            "frame_options",
            "plays",
            "hits",
            "turns",
            "rooms",
            "combats",
            "card_instances",
            "maps",
        )
    }
    assert counts["replay_index"] == 1 and counts["decisions"] == 16
    assert counts["plays"] == 150 and counts["hits"] == 127 and counts["turns"] == 76
    assert counts["rooms"] == 17 and counts["combats"] == 6 and counts["maps"] == 1
    assert counts["frame_options"] >= 21 + 5 * 3
    assert (
        con.execute(
            "SELECT count(*) FROM replay_frame_options WHERE selectable = false AND selectable_reason = 'filtered'"
        ).fetchone()[0]
        == 8
    )
    assert (
        con.execute(
            "SELECT select_kind FROM replay_decisions WHERE decision_id = 15"
        ).fetchone()[0]
        == "transform"
    )
    assert (
        con.execute(
            "SELECT count(*) FROM replay_card_instances WHERE acquired_via = 'generated'"
        ).fetchone()[0]
        == 0
    )
    assert (
        con.execute(
            "SELECT count(*) FROM replay_events WHERE kind = 'generate'"
        ).fetchone()[0]
        == 17
    )
    nodes = con.execute("SELECT len(nodes) FROM replay_maps").fetchone()[0]
    assert nodes == 56
