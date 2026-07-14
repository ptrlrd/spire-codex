"""Build and cache the offer-conditioned draft recommendations.

Run inside the backend container:

    python -m scripts.build_draft_recs

Temporal replay of every run's card offers vs. the deck it already held, scoring
each (offered card | held item) pair by lift over the card's baseline take-rate.
Writes per-context recommendation docs + a base-rate doc to the `draft_recs`
collection for the entity pages and the live /api/draft-advice scorer.
Infrequent by design and decoupled from the snapshot walk (like item_pairings).
"""

import time


def main() -> int:
    t = time.time()
    from app.services.draft_recs import build_and_store

    n = build_and_store()
    print(f"draft-recs: stored {n} contexts in {time.time() - t:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
