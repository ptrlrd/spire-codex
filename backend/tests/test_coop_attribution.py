"""A co-op upload must credit the uploader with THEIR slot, not the host's.
The mod uploads the shared .run file; every slot used to be tagged with the
uploader's identity and the response carried player 0's hash, so a Regent
in slot 1 got the host's Ironclad run on their profile (Workshop report,
2026-09-04). Every run's JSON is public and player ids aren't in the hash,
so the duplicate and claim paths must never hand a tagged slot to someone
else."""

import hashlib
import sys

import pytest
from bson import ObjectId
from pymongo import UpdateOne
from pymongo.errors import DuplicateKeyError

from app.routers import auth as auth_router
from app.services import cheat_detect, runs_db_mongo, user_insights, users_db
from app.services.runs_db_mongo import claim_runs, submit_run, uploader_player_index
from scripts import repair_coop_attribution as repair

REAL_SAVE_RUN_BLOB = runs_db_mongo.save_run_blob

HOST_SID = "76561198000000001"
ME_SID = "76561198000000002"
GUEST_SID = "76561198000000003"
STRANGER_SID = "76561198000000009"
ME_ID = "6" * 24
GUEST_ID = "7" * 24
HOST_ID = "8" * 24
STRANGER_ID = "9" * 24


def _blob(with_ids=True, damage=True):
    def player(sid, char):
        p = {"character": char, "deck": [], "relics": []}
        if with_ids:
            p["id"] = int(sid)
        return p

    blob = {
        "seed": "ABC",
        "start_time": 1756684800,
        "run_time": 1000,
        "win": True,
        "acts": [1, 2, 3],
        "map_point_history": [[{"room_type": "MONSTER", "player_stats": []}]],
        "players": [
            player(HOST_SID, "CHARACTER.IRONCLAD"),
            player(ME_SID, "CHARACTER.REGENT"),
            player(GUEST_SID, "CHARACTER.DEFECT"),
        ],
    }
    if damage:
        blob["_spirecodex_damage"] = {"damage_dealt": 10, "damage_taken": 2}
    return blob


def _hash(blob, idx):
    p = blob["players"][idx]
    key = (
        f"{blob['seed']}:{p['character']}:{blob['start_time']}:"
        f"{blob['run_time']}:{len(p['deck'])}:{idx}"
    )
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _match(doc, cond):
    for key, want in cond.items():
        if key == "$or":
            if not any(_match(doc, c) for c in want):
                return False
            continue
        if key == "$and":
            if not all(_match(doc, c) for c in want):
                return False
            continue
        have = doc.get(key)
        if isinstance(want, dict):
            if "$in" in want and have not in want["$in"]:
                return False
            if "$ne" in want and have == want["$ne"]:
                return False
            if "$gt" in want and not (have is not None and have > want["$gt"]):
                return False
            if "$exists" in want and (key in doc) != want["$exists"]:
                return False
        elif have != want:
            return False
    return True


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def limit(self, n):
        self.docs = self.docs[:n] if n else self.docs
        return self

    def __iter__(self):
        return iter(self.docs)


class FakeColl:
    def __init__(self):
        self.docs = {}

    def insert_one(self, doc):
        if doc["_id"] in self.docs:
            raise DuplicateKeyError("dup")
        self.docs[doc["_id"]] = dict(doc)

    def _project(self, doc, proj):
        if not proj:
            return dict(doc)
        return {k: v for k, v in doc.items() if k == "_id" or proj.get(k)}

    def find_one(self, flt, proj=None):
        for d in self.docs.values():
            if _match(d, flt):
                return self._project(d, proj)
        return None

    def find(self, flt, proj=None, sort=None):
        return FakeCursor(
            [self._project(d, proj) for d in self.docs.values() if _match(d, flt)]
        )

    def _apply(self, doc, update):
        for k, v in update.get("$set", {}).items():
            doc[k] = v
        for k in update.get("$unset", {}):
            doc.pop(k, None)

    def update_one(self, flt, update):
        for d in self.docs.values():
            if _match(d, flt):
                self._apply(d, update)
                return

    def replace_one(self, flt, doc):
        for key, d in list(self.docs.items()):
            if _match(d, flt):
                self.docs[key] = dict(doc)
                return

    def update_many(self, flt, update):
        n = 0
        for d in self.docs.values():
            if _match(d, flt):
                self._apply(d, update)
                n += 1
        return type("R", (), {"modified_count": n})()

    def bulk_write(self, writes, ordered=False):
        for w in writes:
            assert isinstance(w, UpdateOne)
            self.update_one(w._filter, w._doc)

    def by_char(self):
        return {d["character"]: d for d in self.docs.values()}


USERS = {
    ME_SID: {"_id": ME_ID, "username": "PC-Reviver", "steam_id": ME_SID},
    GUEST_SID: {"_id": GUEST_ID, "username": "Guest", "steam_id": GUEST_SID},
    HOST_SID: {"_id": HOST_ID, "username": "Host", "steam_id": HOST_SID},
}


@pytest.fixture
def coll(monkeypatch, tmp_path):
    coll = FakeColl()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    monkeypatch.setattr(runs_db_mongo, "_data_dir", tmp_path)
    monkeypatch.setattr(runs_db_mongo, "save_run_blob", lambda *a, **k: None)
    monkeypatch.setattr(runs_db_mongo, "bump_stats_counters", lambda doc: None)
    monkeypatch.setattr(cheat_detect, "detect_cheats", lambda data: [])
    monkeypatch.setattr(users_db, "get_user_by_steam_id", lambda sid: USERS.get(sid))
    monkeypatch.setattr(
        users_db,
        "get_user_by_username",
        lambda name: next(
            (u for u in USERS.values() if u["username"].lower() == name.lower()), None
        ),
    )
    monkeypatch.setattr(
        users_db,
        "get_user",
        lambda uid: next((u for u in USERS.values() if u["_id"] == str(uid)), None),
    )
    monkeypatch.setattr(user_insights, "invalidate_user_insights", lambda uid: None)
    monkeypatch.setattr(user_insights, "note_profile_activity", lambda *a: None)
    return coll


def test_uploader_slot_is_matched_by_steam_id():
    players = _blob()["players"]
    assert uploader_player_index(players, ME_SID) == 1
    assert uploader_player_index(players, GUEST_SID) == 2
    assert uploader_player_index(players, None) is None
    assert uploader_player_index(players, STRANGER_SID) is None
    assert uploader_player_index(_blob(with_ids=False)["players"], ME_SID) == 0
    assert uploader_player_index(_blob(with_ids=False)["players"], None) == 0
    assert uploader_player_index(players[:1], STRANGER_SID) == 0
    assert uploader_player_index(players[:1], None) == 0


def test_coop_upload_credits_only_the_uploaders_slot(coll):
    result = submit_run(_blob(), username="PC-Reviver", steam_id=ME_SID)
    by = coll.by_char()

    me = by["REGENT"]
    assert result["player_idx"] == 1
    assert result["run_hash"] == me["_id"]
    assert me["steam_id"] == ME_SID
    assert me["user_id"] == ObjectId(ME_ID)
    assert me["username"] == "PC-Reviver"
    assert "damage" in me

    host = by["IRONCLAD"]
    assert host["steam_id"] is None and host["steam_id_hint"] == HOST_SID
    assert host["user_id"] is None
    assert host["username"] is None
    assert "attribution_unverified" not in host
    assert "damage" not in host

    guest = by["DEFECT"]
    assert guest["steam_id"] is None and guest["steam_id_hint"] == GUEST_SID
    assert guest["user_id"] is None


def test_teammate_without_account_is_tagged_but_unlinked(coll, monkeypatch):
    monkeypatch.setattr(users_db, "get_user_by_steam_id", lambda sid: None)
    submit_run(_blob(), username="PC-Reviver", steam_id=ME_SID)
    host = coll.by_char()["IRONCLAD"]
    assert host["steam_id"] is None and host["steam_id_hint"] == HOST_SID
    assert host["user_id"] is None
    assert host["username"] is None
    assert host["username_lower"] is None


def test_stranger_upload_of_a_coop_file_credits_nobody(coll):
    result = submit_run(_blob(), username="Stranger", steam_id=STRANGER_SID)
    assert result["player_idx"] == 0
    for d in coll.docs.values():
        assert d["username"] != "Stranger"
        assert d["steam_id"] != STRANGER_SID
        assert "damage" not in d


def test_anonymous_coop_upload_with_ids_tags_every_slot_and_credits_nobody(coll):
    result = submit_run(_blob(), username="Nobody")
    assert result["player_idx"] == 0
    by = coll.by_char()
    assert by["IRONCLAD"]["steam_id_hint"] == HOST_SID
    assert by["IRONCLAD"]["user_id"] is None
    assert by["REGENT"]["steam_id_hint"] == ME_SID
    for d in coll.docs.values():
        assert d["username"] != "Nobody"
        assert d["steam_id"] is None
        assert "damage" not in d


def test_username_only_upload_uses_the_accounts_steam_id_for_the_slot(coll):
    result = submit_run(_blob(), username="PC-Reviver")
    assert result["player_idx"] == 1
    by = coll.by_char()
    assert by["REGENT"]["user_id"] == ObjectId(ME_ID)
    assert by["REGENT"]["steam_id"] == ME_SID
    assert by["IRONCLAD"]["user_id"] is None
    assert by["IRONCLAD"]["steam_id_hint"] == HOST_SID


def test_anonymous_coop_upload_names_only_slot_zero(coll):
    result = submit_run(_blob(with_ids=False), username="Nobody")
    assert result["player_idx"] == 0
    docs = list(coll.docs.values())
    assert docs[0]["username"] == "Nobody"
    assert [d["username"] for d in docs[1:]] == [None, None]
    assert [d["steam_id"] for d in docs] == [None, None, None]


def test_solo_upload_is_unchanged(coll):
    blob = _blob()
    blob["players"] = blob["players"][1:2]
    result = submit_run(blob, username="PC-Reviver", steam_id=ME_SID)
    doc = list(coll.docs.values())[0]
    assert result["player_idx"] == 0
    assert result["run_hash"] == doc["_id"]
    assert doc["user_id"] == ObjectId(ME_ID)
    assert "damage" in doc


def test_second_participant_gets_their_damage_and_link_on_duplicate(coll, monkeypatch):
    monkeypatch.setattr(users_db, "get_user_by_steam_id", lambda sid: None)
    submit_run(_blob(), username="Host", steam_id=HOST_SID)
    assert "damage" not in coll.by_char()["REGENT"]

    monkeypatch.setattr(users_db, "get_user_by_steam_id", lambda sid: USERS.get(sid))
    mine = _blob()
    mine["_spirecodex_damage"] = {"damage_dealt": 99, "damage_taken": 1}
    result = submit_run(mine, username="PC-Reviver", steam_id=ME_SID)
    me = coll.by_char()["REGENT"]
    assert result["duplicate"] is True
    assert result["player_idx"] == 1
    assert result["run_hash"] == me["_id"]
    assert me["damage"]["damage_dealt"] == 99
    assert me["user_id"] == ObjectId(ME_ID)
    assert "damage" not in coll.by_char()["IRONCLAD"] or (
        coll.by_char()["IRONCLAD"]["damage"]["damage_dealt"] == 10
    )


def test_edited_player_id_cannot_take_a_tagged_slot_on_duplicate(coll, monkeypatch):
    monkeypatch.setattr(users_db, "get_user_by_steam_id", lambda sid: None)
    submit_run(_blob(), username="Host", steam_id=HOST_SID)
    me_before = coll.by_char()["REGENT"]
    assert me_before["user_id"] is None

    forged = _blob()
    forged["players"][1]["id"] = int(STRANGER_SID)
    USERS_WITH_STRANGER = dict(USERS)
    USERS_WITH_STRANGER[STRANGER_SID] = {
        "_id": STRANGER_ID,
        "username": "Thief",
        "steam_id": STRANGER_SID,
    }
    monkeypatch.setattr(
        users_db, "get_user_by_steam_id", lambda sid: USERS_WITH_STRANGER.get(sid)
    )
    result = submit_run(forged, username="Thief", steam_id=STRANGER_SID)
    me = coll.by_char()["REGENT"]
    assert result["duplicate"] is True
    assert me["steam_id"] is None and me["steam_id_hint"] == ME_SID
    assert me["user_id"] is None
    assert me["username"] is None
    assert "damage" not in me


def _owned_solo(coll, blob, user_id, **extra):
    h = _hash(blob, 0)
    coll.docs[h] = {
        "_id": h,
        "character": "IRONCLAD",
        "player_count": 1,
        "user_id": ObjectId(user_id) if user_id else None,
        "username": "Victim" if user_id else None,
        "deleted_at": "2026-09-01",
        **extra,
    }
    return h


def test_anonymous_duplicate_cannot_touch_an_owned_run_missing_steam_id(coll):
    blob = _blob()
    blob["players"] = blob["players"][:1]
    h = _owned_solo(coll, blob, HOST_ID)
    before = dict(coll.docs[h])
    result = submit_run(blob)
    assert result["duplicate"] is True
    assert coll.docs[h] == before


def test_authenticated_duplicate_cannot_tag_someone_elses_owned_run(coll):
    blob = _blob()
    blob["players"] = blob["players"][:1]
    h = _owned_solo(coll, blob, HOST_ID)
    before = dict(coll.docs[h])
    submit_run(blob, username="PC-Reviver", steam_id=ME_SID)
    assert coll.docs[h] == before


def test_owner_reupload_fills_steam_id_and_restores_their_own_run(coll):
    blob = _blob()
    blob["players"] = blob["players"][:1]
    h = _owned_solo(coll, blob, HOST_ID)
    submit_run(blob, username="Host", steam_id=HOST_SID)
    doc = coll.docs[h]
    assert doc["steam_id"] == HOST_SID
    assert "deleted_at" not in doc
    assert doc["damage"]["damage_dealt"] == 10


def test_anonymous_legacy_run_is_claimed_by_a_signed_in_reupload(coll):
    blob = _blob()
    blob["players"] = blob["players"][:1]
    h = _owned_solo(coll, blob, None)
    coll.docs[h].pop("deleted_at")
    submit_run(blob, username="Host", steam_id=HOST_SID)
    doc = coll.docs[h]
    assert doc["steam_id"] == HOST_SID
    assert doc["user_id"] == ObjectId(HOST_ID)
    assert doc["username"] == "Host"


def test_reupload_only_undeletes_the_uploaders_own_slot(coll):
    submit_run(_blob(), username="Host", steam_id=HOST_SID)
    for d in coll.docs.values():
        d["deleted_at"] = "2026-09-01"
    submit_run(_blob(), username="PC-Reviver", steam_id=ME_SID)
    by = coll.by_char()
    assert "deleted_at" not in by["REGENT"]
    assert by["IRONCLAD"]["deleted_at"] == "2026-09-01"
    assert by["DEFECT"]["deleted_at"] == "2026-09-01"


def test_claim_runs_cannot_take_a_teammates_tagged_slot(coll, monkeypatch):
    monkeypatch.setattr(users_db, "get_user_by_steam_id", lambda sid: None)
    submit_run(_blob(), username="Host", steam_id=HOST_SID)
    guest = coll.by_char()["DEFECT"]
    assert guest["steam_id_hint"] == GUEST_SID and guest["user_id"] is None

    out = claim_runs("PC-Reviver", [guest["_id"]])
    assert out == {"claimed": 0, "already_claimed": 1, "unknown": 0}
    assert coll.by_char()["DEFECT"]["username"] is None

    out = claim_runs("Guest", [guest["_id"]])
    assert out["claimed"] == 1
    guest = coll.by_char()["DEFECT"]
    assert guest["username"] == "Guest"
    assert guest["user_id"] == ObjectId(GUEST_ID)
    assert guest["steam_id"] == GUEST_SID
    assert "steam_id_hint" not in guest


def test_claim_runs_still_claims_untagged_anonymous_runs(coll):
    submit_run(_blob(with_ids=False))
    hashes = list(coll.docs)
    out = claim_runs("PC-Reviver", hashes)
    assert out["claimed"] == 3
    assert all(d["steam_id"] == ME_SID for d in coll.docs.values())
    assert all(d["user_id"] == ObjectId(ME_ID) for d in coll.docs.values())


def test_website_claim_respects_the_slots_steam_id(coll, monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://x")
    monkeypatch.setattr(users_db, "get_user_by_steam_id", lambda sid: None)
    submit_run(_blob(), username="Host", steam_id=HOST_SID)
    guest_hash = coll.by_char()["DEFECT"]["_id"]

    auth_router._try_claim_run(guest_hash, USERS[ME_SID])
    assert coll.by_char()["DEFECT"]["user_id"] is None

    auth_router._try_claim_run(guest_hash, {"_id": STRANGER_ID, "username": "Legacy"})
    assert coll.by_char()["DEFECT"]["user_id"] is None

    auth_router._try_claim_run(guest_hash, USERS[GUEST_SID])
    guest = coll.by_char()["DEFECT"]
    assert guest["user_id"] == ObjectId(GUEST_ID)
    assert guest["steam_id"] == GUEST_SID


class FakeBlobs:
    def __init__(self, blobs=None):
        self.docs = {h: {"_id": h, "blob": b} for h, b in (blobs or {}).items()}

    @property
    def blobs(self):
        return {h: d["blob"] for h, d in self.docs.items()}

    def count_documents(self, flt, limit=0):
        return int(flt["_id"] in self.docs)

    def replace_one(self, flt, doc, upsert=False):
        self.docs[flt["_id"]] = dict(doc)

    def update_one(self, flt, update, upsert=False):
        assert "$setOnInsert" in update and upsert
        self.docs.setdefault(flt["_id"], {"_id": flt["_id"], **update["$setOnInsert"]})

    def find(self, flt, proj=None):
        return [dict(d) for h, d in self.docs.items() if h in flt["_id"]["$in"]]


def test_duplicate_blob_save_never_overwrites_evidence(monkeypatch, tmp_path):
    import json

    blobs = FakeBlobs()
    monkeypatch.setattr(runs_db_mongo, "_blob_collection", lambda: blobs)
    on_disk = tmp_path / "h.json"
    on_disk.write_text(json.dumps({"source": "disk"}))

    REAL_SAVE_RUN_BLOB("h", {"source": "edited"}, replace=False, seed_path=on_disk)
    assert blobs.blobs["h"] == {"source": "disk"}
    assert "untrusted" not in blobs.docs["h"]
    REAL_SAVE_RUN_BLOB("h", {"source": "edited"}, replace=False)
    assert blobs.blobs["h"] == {"source": "disk"}
    REAL_SAVE_RUN_BLOB("h", {"source": "fresh"})
    assert blobs.blobs["h"] == {"source": "fresh"}
    assert "untrusted" not in blobs.docs["h"]
    REAL_SAVE_RUN_BLOB(
        "g", {"source": "only-copy"}, replace=False, seed_path=tmp_path / "missing.json"
    )
    assert blobs.blobs["g"] == {"source": "only-copy"}
    assert blobs.docs["g"]["untrusted"] is True


def test_forged_duplicate_cannot_become_ownership_evidence(coll, monkeypatch, tmp_path):
    blobs = FakeBlobs()
    monkeypatch.setattr(runs_db_mongo, "_blob_collection", lambda: blobs)
    monkeypatch.setattr(runs_db_mongo, "save_run_blob", REAL_SAVE_RUN_BLOB)
    original = _blob()
    host_hash = _hash(original, 0)
    coll.docs[host_hash] = {
        "_id": host_hash,
        "character": "IRONCLAD",
        "player_count": 3,
        "steam_id": HOST_SID,
        "user_id": ObjectId(HOST_ID),
        "username": "Host",
    }

    forged = _blob()
    forged["players"][0]["id"] = int(ME_SID)
    forged["players"][1]["id"] = int(HOST_SID)
    result = submit_run(forged, username="PC-Reviver", steam_id=ME_SID)
    assert result["duplicate"] is True
    assert blobs.docs[host_hash]["untrusted"] is True
    assert not (tmp_path / "runs" / f"{host_hash}.json").exists()

    _run_repair(monkeypatch, coll, blobs)
    assert coll.docs[host_hash]["steam_id"] == HOST_SID
    assert coll.docs[host_hash]["user_id"] == ObjectId(HOST_ID)


def _legacy_docs(coll, blob, uploader_sid, uploader_id, uploader_name):
    for idx, p in enumerate(blob["players"]):
        doc = {
            "_id": _hash(blob, idx),
            "character": p["character"].split(".")[-1],
            "player_count": len(blob["players"]),
            "steam_id": uploader_sid,
            "discord_id": "1234",
            "user_id": ObjectId(uploader_id) if uploader_id else None,
            "username": uploader_name,
            "username_lower": uploader_name.lower() if uploader_name else None,
        }
        if idx == 0:
            doc["damage"] = {"damage_dealt": 42}
        coll.docs[doc["_id"]] = doc


def _run_repair(monkeypatch, coll, blobs, apply=True):
    monkeypatch.setenv("MONGO_URL", "mongodb://x")
    monkeypatch.setattr(sys, "argv", ["repair"] + (["--apply"] if apply else []))
    store = blobs if isinstance(blobs, FakeBlobs) else FakeBlobs(blobs)
    monkeypatch.setattr(runs_db_mongo, "_blob_collection", lambda: store)
    assert repair.main() == 0


def test_repair_reowns_legacy_slots_and_moves_damage(coll, monkeypatch):
    blob = _blob()
    _legacy_docs(coll, blob, ME_SID, ME_ID, "PC-Reviver")
    blobs = {_hash(blob, i): blob for i in range(3)}

    _run_repair(monkeypatch, coll, blobs, apply=False)
    assert coll.by_char()["IRONCLAD"]["username"] == "PC-Reviver"

    _run_repair(monkeypatch, coll, blobs)
    by = coll.by_char()
    host = by["IRONCLAD"]
    assert host["steam_id"] == HOST_SID
    assert host["user_id"] == ObjectId(HOST_ID)
    assert host["username"] == "Host"
    assert host["discord_id"] is None
    assert "damage" not in host

    me = by["REGENT"]
    assert me["steam_id"] == ME_SID
    assert me["user_id"] == ObjectId(ME_ID)
    assert me["damage"] == {"damage_dealt": 42}
    assert me["discord_id"] == "1234"

    guest = by["DEFECT"]
    assert guest["steam_id"] == GUEST_SID
    assert guest["user_id"] == ObjectId(GUEST_ID)


def test_repair_moves_damage_when_the_legacy_doc_only_has_a_user_id(coll, monkeypatch):
    blob = _blob()
    _legacy_docs(coll, blob, None, ME_ID, "PC-Reviver")
    _run_repair(monkeypatch, coll, {_hash(blob, i): blob for i in range(3)})
    by = coll.by_char()
    assert "damage" not in by["IRONCLAD"]
    assert by["REGENT"]["damage"] == {"damage_dealt": 42}
    assert by["REGENT"]["steam_id"] == ME_SID
    assert by["IRONCLAD"]["user_id"] == ObjectId(HOST_ID)


def test_repair_keeps_damage_when_the_uploaders_slot_doc_is_missing(coll, monkeypatch):
    blob = _blob()
    _legacy_docs(coll, blob, ME_SID, ME_ID, "PC-Reviver")
    del coll.docs[_hash(blob, 1)]
    _run_repair(monkeypatch, coll, {_hash(blob, i): blob for i in (0, 2)})
    host = coll.by_char()["IRONCLAD"]
    assert host["damage"] == {"damage_dealt": 42}
    assert host["user_id"] == ObjectId(HOST_ID)


def test_repair_unlinks_when_the_owner_has_no_account(coll, monkeypatch):
    blob = _blob()
    _legacy_docs(coll, blob, ME_SID, ME_ID, "PC-Reviver")
    monkeypatch.setattr(users_db, "get_user_by_steam_id", lambda sid: None)
    _run_repair(monkeypatch, coll, {_hash(blob, i): blob for i in range(3)})
    host = coll.by_char()["IRONCLAD"]
    assert host["steam_id"] == HOST_SID
    assert host["user_id"] is None
    assert host["username"] is None


def test_repair_fills_null_steam_id_and_links_unlinked_owner(coll, monkeypatch):
    blob = _blob()
    h1 = _hash(blob, 1)
    coll.docs[h1] = {
        "_id": h1,
        "character": "REGENT",
        "player_count": 3,
        "steam_id": None,
        "user_id": ObjectId(ME_ID),
        "username": "PC-Reviver",
    }
    h2 = _hash(blob, 2)
    coll.docs[h2] = {
        "_id": h2,
        "character": "DEFECT",
        "player_count": 3,
        "steam_id": GUEST_SID,
        "user_id": None,
        "username": None,
    }
    _run_repair(monkeypatch, coll, {h1: blob, h2: blob})
    assert coll.docs[h1]["steam_id"] == ME_SID
    assert coll.docs[h1]["user_id"] == ObjectId(ME_ID)
    assert coll.docs[h2]["user_id"] == ObjectId(GUEST_ID)
    assert coll.docs[h2]["username"] == "Guest"


def test_repair_reassigns_user_id_of_the_wrong_account(coll, monkeypatch):
    blob = _blob()
    h1 = _hash(blob, 1)
    coll.docs[h1] = {
        "_id": h1,
        "character": "REGENT",
        "player_count": 3,
        "steam_id": ME_SID,
        "user_id": ObjectId(HOST_ID),
        "username": "Host",
    }
    _run_repair(monkeypatch, coll, {h1: blob})
    assert coll.docs[h1]["user_id"] == ObjectId(ME_ID)
    assert coll.docs[h1]["username"] == "PC-Reviver"


def test_repair_leaves_unverifiable_and_blobless_docs_alone(coll, monkeypatch):
    blob = _blob()
    h0, h1 = _hash(blob, 0), _hash(blob, 1)
    coll.docs[h0] = {
        "_id": h0,
        "character": "IRONCLAD",
        "player_count": 3,
        "steam_id": None,
        "user_id": None,
        "username": "Someone",
    }
    coll.docs[h1] = {
        "_id": h1,
        "character": "REGENT",
        "player_count": 3,
        "steam_id": HOST_SID,
        "user_id": None,
        "username": None,
    }
    _run_repair(monkeypatch, coll, {h0: blob})
    assert coll.docs[h0]["username"] == "Someone"
    assert coll.docs[h1]["steam_id"] == HOST_SID


def test_repair_reads_blob_files_when_mongo_has_none(coll, monkeypatch, tmp_path):
    import json

    blob = _blob()
    h1 = _hash(blob, 1)
    coll.docs[h1] = {
        "_id": h1,
        "character": "REGENT",
        "player_count": 3,
        "steam_id": HOST_SID,
        "user_id": ObjectId(HOST_ID),
        "username": "Host",
    }
    (tmp_path / "runs").mkdir()
    (tmp_path / "runs" / f"{h1}.json").write_text(json.dumps(blob))
    _run_repair(monkeypatch, coll, {})
    assert coll.docs[h1]["steam_id"] == ME_SID
    assert coll.docs[h1]["user_id"] == ObjectId(ME_ID)


def test_bare_steam_id_upload_is_a_hint_not_an_owner(coll):
    result = submit_run(
        _blob(), username="PC-Reviver", steam_id_hint=ME_SID, verified=False
    )
    by = coll.by_char()
    me = by["REGENT"]
    assert result["player_idx"] == 1
    assert me["user_id"] is None and me["steam_id"] is None
    assert me["steam_id_hint"] == ME_SID and me["attribution_unverified"] is True
    assert me["username"] is None and me["username_hint"] == "PC-Reviver"
    host = by["IRONCLAD"]
    assert host["user_id"] is None and host["steam_id"] is None
    assert host["steam_id_hint"] == HOST_SID and host["attribution_unverified"] is True


def test_unverified_username_never_links_an_account(coll):
    submit_run(_blob(with_ids=False), username="PC-Reviver", verified=False)
    doc = next(iter(coll.docs.values()))
    assert doc["user_id"] is None and doc["attribution_unverified"] is True
    linked = runs_db_mongo.backfill_user_runs(
        ME_ID, steam_id=ME_SID, username="PC-Reviver"
    )
    assert linked == 0
    assert next(iter(coll.docs.values()))["user_id"] is None


def test_authenticated_repost_attributes_a_hinted_run(coll):
    submit_run(_blob(), username="PC-Reviver", steam_id_hint=ME_SID, verified=False)
    result = submit_run(_blob(), username="PC-Reviver", steam_id=ME_SID)
    assert result["duplicate"] is True
    me = coll.by_char()["REGENT"]
    assert me["user_id"] == ObjectId(ME_ID) and me["steam_id"] == ME_SID
    assert "steam_id_hint" not in me and "attribution_unverified" not in me
    assert me["username"] == "PC-Reviver" and "username_hint" not in me
    host = coll.by_char()["IRONCLAD"]
    assert host["user_id"] is None and host["steam_id_hint"] == HOST_SID


def test_authenticated_repost_cannot_take_a_run_hinted_to_someone_else(coll):
    submit_run(
        _blob(with_ids=False),
        username="PC-Reviver",
        steam_id_hint=ME_SID,
        verified=False,
    )
    result = submit_run(_blob(with_ids=False), username="Guest", steam_id=GUEST_SID)
    assert result["duplicate"] is True
    doc = next(iter(coll.docs.values()))
    assert doc["user_id"] is None and doc["steam_id"] is None
    assert doc["steam_id_hint"] == ME_SID


def test_unverified_repost_changes_nothing(coll):
    submit_run(_blob(), username="PC-Reviver", steam_id=ME_SID)
    result = submit_run(
        _blob(), username="Evil", steam_id_hint=STRANGER_SID, verified=False
    )
    assert result["duplicate"] is True
    me = coll.by_char()["REGENT"]
    assert me["user_id"] == ObjectId(ME_ID) and me["username"] == "PC-Reviver"


def test_attribute_run_to_requires_a_matching_hint(coll):
    submit_run(_blob(), username="PC-Reviver", steam_id_hint=ME_SID, verified=False)
    me_hash = coll.by_char()["REGENT"]["_id"]
    stranger = {"_id": "8" * 24, "username": "Stranger", "steam_id": STRANGER_SID}
    assert runs_db_mongo.attribute_run_to(me_hash, stranger) is False
    assert coll.by_char()["REGENT"]["user_id"] is None
    assert runs_db_mongo.attribute_run_to(me_hash, USERS[ME_SID]) is True
    me = coll.by_char()["REGENT"]
    assert me["user_id"] == ObjectId(ME_ID) and me["steam_id"] == ME_SID
    assert "attribution_unverified" not in me


def test_attribution_forgets_the_cached_shared_run(coll, monkeypatch):
    from app.services import cache as app_cache

    dropped: list[str] = []
    monkeypatch.setattr(app_cache, "delete", lambda key: dropped.append(key))
    submit_run(_blob(), username="PC-Reviver", steam_id_hint=ME_SID, verified=False)
    me_hash = coll.by_char()["REGENT"]["_id"]
    submit_run(_blob(), username="PC-Reviver", steam_id=ME_SID)
    assert f"run:{me_hash}" in dropped
    dropped.clear()
    by = coll.by_char()
    claim_runs("Guest", [by["IRONCLAD"]["_id"], by["DEFECT"]["_id"]])
    assert set(dropped) == {f"run:{by['DEFECT']['_id']}"}


def test_claim_by_hash_cannot_take_a_run_hinted_to_someone_else(coll):
    submit_run(
        _blob(with_ids=False),
        username="PC-Reviver",
        steam_id_hint=ME_SID,
        verified=False,
    )
    h = next(iter(coll.docs))
    assert claim_runs("Guest", [h]) == {
        "claimed": 0,
        "already_claimed": 1,
        "unknown": 0,
    }
    assert coll.docs[h]["user_id"] is None
    assert claim_runs("PC-Reviver", [h])["claimed"] == 1
    doc = coll.docs[h]
    assert doc["user_id"] == ObjectId(ME_ID) and doc["steam_id"] == ME_SID
    assert "steam_id_hint" not in doc and "attribution_unverified" not in doc


def test_claim_by_hash_refuses_unverified_rows_without_a_hint(coll):
    submit_run(_blob(with_ids=False), username="Planted", verified=False)
    hashes = list(coll.docs)
    assert claim_runs("PC-Reviver", hashes)["claimed"] == 0
    assert all(d["user_id"] is None for d in coll.docs.values())


def test_website_claim_honours_the_hint_and_unverified_flag(coll, monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://x")
    submit_run(
        _blob(with_ids=False),
        username="PC-Reviver",
        steam_id_hint=ME_SID,
        verified=False,
    )
    h = next(iter(coll.docs))
    auth_router._try_claim_run(h, USERS[GUEST_SID])
    assert coll.docs[h]["user_id"] is None
    auth_router._try_claim_run(h, USERS[ME_SID])
    assert coll.docs[h]["user_id"] == ObjectId(ME_ID)
    assert "attribution_unverified" not in coll.docs[h]

    submit_run(_blob(with_ids=False, damage=False), username="Planted", verified=False)
    planted = [k for k in coll.docs if k != h][0]
    auth_router._try_claim_run(planted, USERS[GUEST_SID])
    assert coll.docs[planted]["user_id"] is None


def test_verified_reupload_replaces_a_planted_rows_content(coll):
    forged = _blob(with_ids=False)
    forged["win"] = False
    forged["ascension"] = 0
    submit_run(forged, username="PC-Reviver", steam_id_hint=ME_SID, verified=False)
    h = next(iter(coll.docs))
    assert coll.docs[h]["win"] is False

    genuine = _blob(with_ids=False)
    genuine["win"] = True
    genuine["ascension"] = 10
    result = submit_run(genuine, username="PC-Reviver", steam_id=ME_SID)
    assert result["duplicate"] is True and result["reconciled"] is True
    doc = coll.docs[h]
    assert doc["win"] is True and doc["ascension"] == 10
    assert doc["user_id"] == ObjectId(ME_ID) and doc["username"] == "PC-Reviver"
    assert "attribution_unverified" not in doc and "steam_id_hint" not in doc
