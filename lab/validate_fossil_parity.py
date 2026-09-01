"""Compare the frozen entity_stats_snapshot in Mongo against the lake.

The fossil froze when the rebuilder retired, so raw counts have drifted
upward; what this validates is the CONTRACT, not equality:

  1. Entity coverage — every official entity the fossil tracked exists in
     the lake store, and its picks/wins only grew (a lake count BELOW the
     fossil's means lost data, modulo cheater-hides).
  2. Field coverage — each per-entity fossil field (offered/picked/
     off_act/pick_act/elo/base/upg/act_picks/act_wins/by_character/
     last_submitted_at) is populated on the lake side where the fossil
     had it.
  3. Bracket coverage — every bracket key the fossil materialized per
     entity folds from the entity cube (version keys outside the cube's
     recent window are reported as aged out, not failures).
  4. Blob key coverage — every community/charts/encounters blob key the
     fossil sharded resolves on the lake serving path, same aging rule.
  5. Elo coverage — entities the fossil rated that the lake left unrated
     despite a healthy pick count.

Run on the ingest box (needs Mongo + /lake):

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python \
        lake-ingest /lab/validate_fossil_parity.py
"""

import sys

sys.path.insert(0, "/lab")
sys.path.insert(0, "/app")

AGE_NOTE = "aged out of cube window"


def _fossil_entities(coll, etype):
    doc = coll.find_one({"_id": etype})
    if not doc:
        return []
    entities = doc.get("entities", [])
    if not entities and doc.get("chunk_count"):
        ids = [f"{etype}:chunk:{ci}" for ci in range(int(doc["chunk_count"]))]
        for cdoc in coll.find({"_id": {"$in": ids}}):
            entities.extend(cdoc.get("entities", []))
    return entities


def _blob_keys(coll, meta, blob_id):
    doc = coll.find_one({"_id": blob_id}) or {}
    keys = doc.get("keys")
    if keys:
        return set(keys)
    blob = doc.get("blob") or meta.get(blob_id) or {}
    return set(blob.keys())


def _version_part(key):
    import re

    for part in (key or "").replace("ver:", "").split(":"):
        if re.fullmatch(r"v\d+(\.\d+)*", part):
            return part
    return None


def main() -> None:
    from app.services import charts_blob_lake, lake_stats
    from app.services.run_entity_stats import _official_entity_ids
    from app.services.runs_db_mongo import _summary_coll

    coll = _summary_coll().database["entity_stats_snapshot"]
    meta = coll.find_one({"_id": "__meta__"})
    if not meta:
        print("no fossil snapshot in Mongo (already dropped?); nothing to compare")
        sys.exit(0)
    loaded = lake_stats.entity_store_with_mtime()
    if not loaded:
        print("no lake entity store; run a cycle first")
        sys.exit(1)
    store = loaded[1]
    versions = set(lake_stats.cube_versions())
    failures = 0
    print(
        f"fossil: version={meta.get('snapshot_version')}"
        f" data_through={meta.get('data_through')}"
        f" | lake: generation data_through={store.get('data_through')}"
        f" cube_versions={sorted(versions)}"
    )

    fields = (
        "offered",
        "picked",
        "off_act",
        "pick_act",
        "base",
        "upg",
        "act_picks",
        "act_wins",
        "by_character",
        "last_submitted_at",
    )
    fossil_bracket_keys: set[str] = set()
    for etype in meta.get("entity_types", []):
        fossil = _fossil_entities(coll, etype)
        lake = (store.get("entities") or {}).get(etype) or {}
        official = _official_entity_ids(etype)
        missing, shrunk, no_elo, field_gaps = [], [], [], {}
        for e in fossil:
            eid = e["id"]
            for bk in e.get("brackets") or e.get("cohorts") or {}:
                fossil_bracket_keys.add(bk)
            if official and eid not in official:
                continue
            le = lake.get(eid)
            if le is None:
                if e.get("picks", 0) > 0:
                    missing.append(eid)
                continue
            if le.get("picks", 0) < e.get("picks", 0) * 0.98 - 5:
                shrunk.append(f"{eid} fossil={e.get('picks')} lake={le.get('picks')}")
            if e.get("elo") is not None and le.get("elo") is None:
                if le.get("picks", 0) > 200:
                    no_elo.append(eid)
            for f in fields:
                if e.get(f) not in (None, [], {}) and le.get(f) in (None, [], {}):
                    field_gaps.setdefault(f, []).append(eid)
        print(f"== {etype}: fossil={len(fossil)} lake={len(lake)} ==")
        for label, bad in (
            ("missing from lake", missing),
            ("picks shrank", shrunk),
            ("lost elo", no_elo),
        ):
            if bad:
                failures += 1
                print(f"  FAIL {label} ({len(bad)}): {bad[:8]}")
            else:
                print(f"  ok   {label}: none")
        for f, ids in sorted(field_gaps.items()):
            failures += 1
            print(f"  FAIL field '{f}' empty on lake ({len(ids)}): {ids[:8]}")
        if not field_gaps:
            print("  ok   all fossil fields populated on lake side")

    print("== bracket folds ==")
    aged = folded = 0
    for bk in sorted(fossil_bracket_keys):
        ver = _version_part(bk)
        if ver and ver not in versions:
            aged += 1
            continue
        fold = lake_stats.entity_bracket_fold("cards", bk)
        if fold and fold.get("entries"):
            folded += 1
        else:
            failures += 1
            print(f"  FAIL bracket '{bk}' does not fold from the cube")
    print(f"  ok   {folded} bracket keys fold, {aged} {AGE_NOTE}")

    print("== blob keys ==")
    charts_hit = charts_blob_lake.charts_blob_with_mtime()
    charts_lake = set((charts_hit[1] if charts_hit else {}).keys())
    enc_hit = lake_stats.encounter_store_with_mtime()
    enc_lake = set((enc_hit[1] if enc_hit else {}).keys())
    for blob_id, resolver in (
        ("community", lambda k: lake_stats.community_payload(k) is not None),
        ("charts", lambda k: k.replace("ver:", "") in charts_lake),
        ("encounters", lambda k: k in enc_lake),
    ):
        bad, aged_b, okc = [], 0, 0
        for key in sorted(_blob_keys(coll, meta, blob_id)):
            ver = _version_part(key)
            if ver and ver not in versions:
                aged_b += 1
                continue
            if resolver(key):
                okc += 1
            else:
                bad.append(key)
        if bad:
            failures += 1
            print(f"  FAIL {blob_id}: unresolved keys ({len(bad)}): {bad[:10]}")
        else:
            print(f"  ok   {blob_id}: {okc} keys resolve, {aged_b} {AGE_NOTE}")

    if failures:
        print(f"\nFAIL: {failures} failing checks")
        sys.exit(1)
    print("\nPASS: full contract parity")


if __name__ == "__main__":
    main()
