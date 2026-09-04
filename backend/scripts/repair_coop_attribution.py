"""Re-own co-op run docs that were credited to whoever uploaded them.

Every slot of a multiplayer run used to be tagged with the uploader's
identity, so teammates' runs sat on the uploader's profile and the
uploader's damage summary sat on the host's slot. Each slot's owner is
recoverable from the stored blob (players[i].id is that player's
SteamID64): walk the multiplayer docs, compare, and re-tag.

Per doc: the slot owner's SteamID64 must agree with the doc's steam_id (or,
when that is null, with the steam_id of the account in user_id). A
disagreement re-tags the doc to the owner (linked to their account when one
exists, null otherwise, stale discord_id cleared) and moves any damage
summary to the uploader's own slot. An agreeing doc still gets a null
steam_id filled and an unlinked owner linked. Docs with no blob, a blob
seeded by a duplicate re-upload (flagged untrusted), no slot ids, or
nothing to compare against are left alone. Dry run by default.

    python -m scripts.repair_coop_attribution
    python -m scripts.repair_coop_attribution --apply
"""

import argparse
import hashlib
import json
import logging
import os
from collections import Counter

STEAMID64_LEN = 17


def _sid(value) -> str | None:
    sid = str(value or "")
    return sid if len(sid) == STEAMID64_LEN and sid.isdigit() else None


def _slot_hash(blob: dict, idx: int) -> str:
    player = blob["players"][idx]
    key = (
        f"{blob.get('seed', '')}:{player['character']}:{blob.get('start_time', '')}:"
        f"{blob.get('run_time', 0)}:{len(player.get('deck', []))}:{idx}"
    )
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _slot_of_sid(blob: dict, sid: str) -> int | None:
    for idx, player in enumerate(blob.get("players") or []):
        if _sid((player or {}).get("id")) == sid:
            return idx
    return None


def _slot_owner(
    blob: dict, run_hash: str, player_index_for_hash
) -> tuple[int | None, str | None]:
    idx = player_index_for_hash(blob, run_hash)
    if idx is None:
        return None, None
    try:
        return idx, _sid((blob["players"][idx] or {}).get("id"))
    except (IndexError, KeyError, TypeError):
        return None, None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--batch", type=int, default=300)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    if not os.environ.get("MONGO_URL", "").strip():
        print("MONGO_URL unset; nothing to do")
        return 1
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    from bson import ObjectId
    from pymongo import UpdateOne

    from app.services.runs_db_mongo import (
        _blob_collection,
        _data_dir,
        _get_collection,
        player_index_for_hash,
    )
    from app.services.users_db import get_user, get_user_by_steam_id

    coll = _get_collection()
    counts: Counter = Counter()
    touched_users: set[str] = set()
    accounts: dict[str, dict | None] = {}
    users: dict[str, dict | None] = {}

    def account_for(sid: str) -> dict | None:
        if sid not in accounts:
            accounts[sid] = get_user_by_steam_id(sid)
        return accounts[sid]

    def user_by_id(uid) -> dict | None:
        key = str(uid)
        if key not in users:
            users[key] = get_user(key)
        return users[key]

    def load_blobs(hashes: list[str]) -> dict[str, dict | None]:
        blobs: dict[str, dict | None] = {}
        for doc in _blob_collection().find(
            {"_id": {"$in": hashes}}, {"blob": 1, "untrusted": 1}
        ):
            blobs[doc["_id"]] = None if doc.get("untrusted") else doc.get("blob")
        for h in hashes:
            if h in blobs:
                continue
            path = _data_dir / "runs" / f"{h}.json"
            if path.exists():
                try:
                    blobs[h] = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    pass
        return blobs

    def owner_fields(owner_sid: str) -> tuple[dict, dict | None]:
        acct = account_for(owner_sid)
        name = (acct or {}).get("username") or None
        fields = {
            "steam_id": owner_sid,
            "user_id": ObjectId(acct["_id"]) if acct else None,
            "username": name,
            "username_lower": name.lower() if name else None,
            "discord_id": None,
        }
        return fields, acct

    def flush(docs: list[dict]) -> None:
        blobs = load_blobs([d["_id"] for d in docs])
        writes: list[UpdateOne] = []
        for doc in docs:
            counts["scanned"] += 1
            if doc["_id"] in blobs and blobs[doc["_id"]] is None:
                counts["untrusted_blob"] += 1
                continue
            blob = blobs.get(doc["_id"])
            if not blob:
                counts["no_blob"] += 1
                continue
            idx, owner_sid = _slot_owner(blob, doc["_id"], player_index_for_hash)
            if idx is None or not owner_sid:
                counts["no_slot_id"] += 1
                continue

            doc_sid = str(doc.get("steam_id") or "") or None
            acct = user_by_id(doc["user_id"]) if doc.get("user_id") else None
            acct_sid = str((acct or {}).get("steam_id") or "") or None
            if doc_sid is None and acct_sid is None:
                counts["unverifiable"] += 1
                continue
            wrong = (doc_sid is not None and doc_sid != owner_sid) or (
                acct_sid is not None and acct_sid != owner_sid
            )

            if wrong:
                counts["mismatched"] += 1
                update, new_acct = owner_fields(owner_sid)
                counts["relinked" if new_acct else "unlinked"] += 1
                if doc.get("user_id"):
                    touched_users.add(str(doc["user_id"]))
                if new_acct:
                    touched_users.add(str(new_acct["_id"]))
                ops: dict = {"$set": update}
                damage = doc.get("damage")
                uploader_sid = doc_sid or acct_sid
                uploader_slot = (
                    _slot_of_sid(blob, uploader_sid) if uploader_sid else None
                )
                if damage and uploader_slot is not None and uploader_slot != idx:
                    dest = coll.find_one(
                        {"_id": _slot_hash(blob, uploader_slot)}, {"damage": 1}
                    )
                    if dest is None:
                        counts["damage_orphaned"] += 1
                    else:
                        if not dest.get("damage"):
                            writes.append(
                                UpdateOne(
                                    {"_id": dest["_id"], "damage": {"$exists": False}},
                                    {"$set": {"damage": damage}},
                                )
                            )
                        ops["$unset"] = {"damage": ""}
                        counts["damage_moved"] += 1
                writes.append(UpdateOne({"_id": doc["_id"]}, ops))
                logging.info(
                    "%s: %s -> %s (%s)",
                    doc["_id"],
                    doc_sid or acct_sid,
                    owner_sid,
                    update["username"] or "unlinked",
                )
                continue

            fill: dict = {}
            if doc_sid is None:
                fill["steam_id"] = owner_sid
            if doc.get("user_id") is None:
                owner_acct = account_for(owner_sid)
                if owner_acct:
                    name = owner_acct.get("username") or None
                    fill.update(
                        {
                            "user_id": ObjectId(owner_acct["_id"]),
                            "username": name,
                            "username_lower": name.lower() if name else None,
                        }
                    )
                    touched_users.add(str(owner_acct["_id"]))
            if fill:
                counts["filled"] += 1
                writes.append(UpdateOne({"_id": doc["_id"]}, {"$set": fill}))
            else:
                counts["ok"] += 1
        if writes and args.apply:
            coll.bulk_write(writes, ordered=False)
            counts["written"] += len(writes)

    cursor = coll.find(
        {"player_count": {"$gt": 1}},
        {"steam_id": 1, "user_id": 1, "username": 1, "damage": 1},
        sort=[("_id", 1)],
    )
    if args.limit:
        cursor = cursor.limit(args.limit)

    pending: list[dict] = []
    for doc in cursor:
        pending.append(doc)
        if len(pending) >= args.batch:
            flush(pending)
            pending = []
    if pending:
        flush(pending)

    if args.apply and touched_users:
        from app.services.user_insights import invalidate_user_insights

        for uid in touched_users:
            try:
                invalidate_user_insights(uid)
            except Exception:
                pass

    print(dict(counts), "apply" if args.apply else "dry-run", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
