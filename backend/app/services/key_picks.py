"""The few cards and relics that say what a run was, for run-list rows:
the rarest picks, newest first among equals, never starters or basics."""

from functools import lru_cache

CARD_RANK = {"Ancient": 5, "Rare": 4, "Uncommon": 3, "Event": 2, "Common": 1}
RELIC_RANK = {
    "Ancient Relic": 5,
    "Rare Relic": 4,
    "Shop Relic": 3,
    "Uncommon Relic": 3,
    "Event Relic": 2,
    "Common Relic": 1,
}


@lru_cache(maxsize=1)
def _boss_monsters() -> dict[str, str]:
    from . import data_service

    out = {}
    for e in data_service.load_encounters("eng"):
        monsters = e.get("monsters") or []
        if monsters:
            out[str(e.get("id", "")).upper()] = str(monsters[0].get("id", "")).upper()
    return out


def last_bosses(boss_rooms: list | None) -> list[dict]:
    """The boss fight(s) of the deepest act that had one: two on a
    double-boss act 3, none for a run that never reached a boss."""
    acts = [a for a in (boss_rooms or []) if isinstance(a, list) and a]
    if not acts:
        return []
    monsters = _boss_monsters()
    out = []
    for model in acts[-1]:
        eid = str(model or "").split(".", 1)[-1].upper()
        if eid:
            out.append(
                {"id": eid, "monster": monsters.get(eid, eid.removesuffix("_BOSS"))}
            )
    return out


@lru_cache(maxsize=1)
def _ranks() -> tuple[dict[str, int], dict[str, int]]:
    from . import data_service

    cards = {
        str(c.get("id", "")).upper(): CARD_RANK.get(c.get("rarity"), 0)
        for c in data_service.load_cards("eng")
    }
    relics = {
        str(r.get("id", "")).upper(): RELIC_RANK.get(r.get("rarity"), 0)
        for r in data_service.load_relics("eng")
    }
    return cards, relics


def key_picks(
    deck: list | None, relics: list | None, n: int = 4
) -> tuple[list[dict], list[str]]:
    card_rank, relic_rank = _ranks()
    best: dict[str, tuple] = {}
    for c in deck or []:
        cid = str((c or {}).get("id") or "").upper()
        rank = card_rank.get(cid, 0)
        if not rank:
            continue
        floor = c.get("floor_added") or 0
        prev = best.get(cid)
        up = bool(c.get("upgraded")) or bool(prev and prev[2])
        best[cid] = (rank, max(floor, prev[1] if prev else 0), up)
    cards = sorted(best.items(), key=lambda kv: (-kv[1][0], -kv[1][1]))[:n]
    seen: dict[str, tuple] = {}
    for r in relics or []:
        rid = str((r or {}).get("id") or "").upper()
        rank = relic_rank.get(rid, 0)
        if rank and rid not in seen:
            seen[rid] = (rank, r.get("floor_added") or 0)
    rel = sorted(seen.items(), key=lambda kv: (-kv[1][0], -kv[1][1]))[:n]
    return (
        [{"id": cid, "upgraded": v[2]} for cid, v in cards],
        [rid for rid, _ in rel],
    )
