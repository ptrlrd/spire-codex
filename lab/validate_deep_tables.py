"""Compare the lake-built deep tables against the legacy summary docs.

The legacy tables froze when refresh_stats_summary left the cycle, so
counts have drifted; what this validates is STRUCTURE: the section keys,
the id namespaces (the likeliest silent breakage — bare-upper lake ids vs
whatever the Mongo docs carried), and whether the same entities rank near
the top. Run after a cycle has stored /lake/deep_tables.json:

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python \
        lake-ingest /lab/validate_deep_tables.py
"""

import sys

sys.path.insert(0, "/lab")
sys.path.insert(0, "/app")


def _ids(rows, key):
    return [r.get(key) for r in rows or [] if r.get(key)]


def main() -> None:
    from app.services.lake_stats import deep_tables_by_key
    from app.services.runs_db_mongo import _filter_key, _summary_coll

    deep = deep_tables_by_key()
    if not deep:
        print("no /lake/deep_tables.json; run a cycle (or run_stage.py deep_tables)")
        sys.exit(1)
    coll = _summary_coll()
    failures = 0
    checked = 0
    for combo in ({}, {"character": "IRONCLAD"}, {"ascension": "10"}):
        key = _filter_key(**combo)
        tables = deep.get(key)
        doc = coll.find_one({"_id": key})
        if not tables or not doc:
            print(f"{key or 'all'}: missing (lake={bool(tables)} doc={bool(doc)})")
            continue
        checked += 1
        print(f"== {key or 'all'} ==")
        for section, id_key in (
            ("top_cards", "card_id"),
            ("pick_rates", "card_id"),
            ("top_relics", "relic_id"),
            ("top_potions", "potion_id"),
            ("deadliest", "encounter"),
        ):
            lake_ids = _ids(tables.get(section), id_key)
            doc_rows = doc.get(section) or []
            if section == "top_potions":
                # The legacy potion list was never sorted and is full of
                # mod-namespaced ids (MARTHCHARACTERMOD-..., KNOWLEDGEDEMON-...)
                # the frontend filtered; sort by offers and drop them so the
                # comparison judges the lake, not the legacy junk.
                doc_rows = sorted(
                    (r for r in doc_rows if "-" not in (r.get(id_key) or "")),
                    key=lambda r: -(r.get("offered") or 0),
                )
            doc_ids = _ids(doc_rows, id_key)
            if not lake_ids:
                print(f"  {section}: lake EMPTY ({len(doc_ids)} legacy rows)")
                if section != "top_potions":  # absent until the new columns build
                    failures += 1
                continue
            if not doc_ids:
                print(f"  {section}: no legacy rows to compare ({len(lake_ids)} lake)")
                continue
            top = set(doc_ids[:20])
            overlap = len(top & set(lake_ids[:40])) / max(1, len(top))
            print(
                f"  {section}: lake {len(lake_ids)} rows, legacy {len(doc_ids)}; "
                f"top-20 overlap {overlap:.0%}; "
                f"sample lake={lake_ids[0]!r} legacy={doc_ids[0]!r}"
            )
            if overlap < 0.5:
                failures += 1
                print("    ^ LOW OVERLAP - check id namespaces above")
    if not checked:
        print("no combos comparable")
        sys.exit(1)
    print(f"done: {failures} failing sections")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
