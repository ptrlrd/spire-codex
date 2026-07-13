"""Build and cache the item-pairings (card / relic / potion co-occurrence).

Run inside the backend container:

    python -m scripts.build_pairings

Streams official runs from Mongo, scores every co-occurring pair (NPMI +
directional confidence + pair win-rate), and writes the top-N partners per item
to the `item_pairings` collection for the card / relic pages to read. Infrequent
by design — the draft patterns only shift on game patches — and decoupled from
the entity-stats snapshot rebuild so it can't add to that job's memory pressure.
"""

import time


def main() -> int:
    t = time.time()
    from app.services.item_pairings import build_and_store

    n = build_and_store()
    print(f"item-pairings: stored {n} items in {time.time() - t:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
