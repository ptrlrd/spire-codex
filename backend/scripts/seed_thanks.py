"""Seed the Thank You page storage with the names the old static page
carried, once. Empty collections only; re-runs are no-ops.

    python -m scripts.seed_thanks
"""

import os
from datetime import datetime, timezone

SPECIAL = [
    "vesper-arch",
    "terracubist",
    "U77654",
    "Purple Aspired Dreaming",
    "Kobaru",
    "Severi",
]
KOFI = ["Katie K", "LeMerkur", "SpireMeta", "GabrielPBC"]


def main() -> int:
    if not os.environ.get("MONGO_URL", "").strip():
        print("MONGO_URL unset; nothing to do")
        return 1
    from app.services import thanks

    special = thanks._special()
    added = 0
    for i, name in enumerate(SPECIAL):
        sid = "seed-" + name.lower().replace(" ", "-")
        if special.find_one({"_id": sid}, {"_id": 1}) is None:
            special.insert_one(
                {
                    "_id": sid,
                    "name": name,
                    "note": None,
                    "url": None,
                    "order": i,
                    "created_at": datetime.now(timezone.utc),
                }
            )
            added += 1
    print(f"special thanks seeded: {added} added, {len(SPECIAL) - added} present")
    today = datetime.now(timezone.utc).replace(microsecond=0)
    created = 0
    for name in KOFI:
        res = thanks.record_supporter(
            {
                "kofi_transaction_id": f"seed-{name.lower().replace(' ', '-')}",
                "from_name": name,
                "type": "Donation",
                "amount": 0,
                "currency": "USD",
                "timestamp": today.isoformat(),
                "is_public": True,
                "source": "seed",
            }
        )
        created += int(res["created"])
    print(f"kofi supporters seeded: {created} added, {len(KOFI) - created} present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
