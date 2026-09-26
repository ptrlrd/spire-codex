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
    if special.count_documents({}) == 0:
        for i, name in enumerate(SPECIAL):
            thanks.upsert_special({"name": name, "order": i})
        print(f"special thanks seeded: {len(SPECIAL)}")
    else:
        print("special thanks already populated, skipped")
    supporters = thanks._supporters()
    if supporters.count_documents({}) == 0:
        today = datetime.now(timezone.utc).replace(microsecond=0)
        for name in KOFI:
            thanks.record_supporter(
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
        print(f"kofi supporters seeded: {len(KOFI)}")
    else:
        print("kofi supporters already populated, skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
