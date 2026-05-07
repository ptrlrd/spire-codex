"""Mechanics pages — markdown content with frontmatter, served via /api/mechanics/sections.

Each `data/mechanics_pages/<slug>.md` file is the source of truth for one
/mechanics/<slug> page. YAML frontmatter carries the title/description/category
metadata; the body is GitHub-flavored Markdown with two flavors of inline
template tokens that the resolver expands at request time:

  {{constants.path.to.field [| filter]}}     # value lookup with optional formatter
  {{table:<name>}}                            # whole-table macro

Filters: `pct` (0.6 → "60%"), `pct2` (preserve up to 2 decimals), `mult`
(0.75 → "0.75x"), `gold` (75 → "75g"), `range` ({min:10,max:20} → "10-20"),
`range_gold` ({min:10,max:20} → "10-20g"). Nested fields are dot-separated;
constants come from `mechanics_constants.json`.

Tables: `character_stats`, `monster_scaling`, `ascension_levels`. These are
resolved at request time so the overlay never needs to fan out to additional
endpoints — one fetch returns fully-baked Markdown.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import frontmatter

from .data_service import (
    DATA_DIR,
    _resolve_base,
    _get_version,
    load_characters,
    load_monsters,
)

logger = logging.getLogger(__name__)


def _pages_dir() -> Path:
    """Mechanics pages live in `data/mechanics_pages/` — language-agnostic for now.

    The prose isn't translated yet (CLAUDE.md flags it as a known i18n gap),
    so a single language-agnostic source tree mirrors the current state. When
    translations land we can introduce per-lang directories without changing
    the API shape.
    """
    return DATA_DIR / "mechanics_pages"


def _load_constants() -> dict:
    """Same lookup pattern as `routers/mechanics.py::_load_constants`.

    Tries the version-resolved location first so beta deployments pick up
    rebalanced numbers, falls back to the unversioned file used by stable.
    """
    candidates = [
        _resolve_base(_get_version()) / "mechanics_constants.json",
        DATA_DIR / "mechanics_constants.json",
    ]
    for path in candidates:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    return {}


# ── Filters ──────────────────────────────────────────────────────────────


def _format_pct(value: float, decimals: int = 0) -> str:
    """0.6 → '60%'; with decimals=2, 0.0149 → '1.49%'.

    Trims trailing zeros so 0.5 reads "50%" not "50.0%" — matches the
    JS helper that the existing frontend uses.
    """
    pct = float(value) * 100
    if decimals == 0 and pct == int(pct):
        return f"{int(pct)}%"
    formatted = f"{pct:.{max(decimals, 2)}f}".rstrip("0").rstrip(".")
    return f"{formatted}%"


def _format_mult(value: float) -> str:
    formatted = f"{float(value):.2f}".rstrip("0").rstrip(".")
    return f"{formatted}x"


def _format_gold(value: int | float) -> str:
    return f"{int(value)}g"


def _format_range(value: dict) -> str:
    lo = value.get("min")
    hi = value.get("max")
    return f"{lo}" if lo == hi else f"{lo}-{hi}"


def _format_range_gold(value: dict) -> str:
    return f"{_format_range(value)}g"


_FILTERS = {
    "pct": _format_pct,
    "pct2": lambda v: _format_pct(v, decimals=2),
    "mult": _format_mult,
    "gold": _format_gold,
    "range": _format_range,
    "range_gold": _format_range_gold,
}


def _lookup(obj: Any, dotted_path: str) -> Any:
    cur = obj
    for part in dotted_path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            cur = getattr(cur, part, None)
        if cur is None:
            return None
    return cur


_TOKEN_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def _resolve_value_token(expression: str, constants: dict) -> str:
    """`constants.x.y | pct` → resolved string. Returns the original token
    on failure so authors can spot broken references in the rendered output."""
    parts = [p.strip() for p in expression.split("|")]
    base = parts[0]
    filt = parts[1] if len(parts) > 1 else None

    if not base.startswith("constants."):
        return f"{{{{ {expression} }}}}"
    value = _lookup(constants, base[len("constants.") :])
    if value is None:
        return f"{{{{ {expression} }}}}"
    if filt is None:
        return str(value)
    formatter = _FILTERS.get(filt)
    if formatter is None:
        return str(value)
    try:
        return formatter(value)
    except Exception as exc:
        logger.warning("token format failed for %s: %s", expression, exc)
        return f"{{{{ {expression} }}}}"


# ── Table macros ─────────────────────────────────────────────────────────


def _resolve_table_character_stats() -> str:
    chars = load_characters("eng")
    order = ["IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"]
    by_id = {c.get("id"): c for c in chars}
    rows = [by_id[c] for c in order if c in by_id]
    lines = [
        "| Character | HP | Gold | Deck | Orb Slots |",
        "|-----------|---:|-----:|-----:|----------:|",
    ]
    for c in rows:
        name = c.get("name", "")
        if name.startswith("The "):
            name = name[4:]
        deck_size = len(c.get("starting_deck") or [])
        # orb_slots is null on non-Defect characters; coerce to 0 so the
        # rendered Markdown table reads "0" instead of literal "None".
        orb_slots = c.get("orb_slots") or 0
        lines.append(
            f"| {name} | {c.get('starting_hp', '')} | "
            f"{c.get('starting_gold', '')} | {deck_size} | "
            f"{orb_slots} |"
        )
    return "\n".join(lines)


def _format_hit(damage: int | float, hits: int | None) -> str:
    if hits and hits > 1:
        return f"{damage}×{hits}"
    return f"{damage}"


def _resolve_table_monster_scaling() -> str:
    monsters = load_monsters("eng")
    rows: list[dict] = []
    for m in monsters:
        hp_min = m.get("min_hp")
        hp_max = m.get("max_hp")
        hp_min_a = m.get("min_hp_ascension")
        hp_max_a = m.get("max_hp_ascension")
        hp_range = (
            ""
            if hp_min is None
            else (f"{hp_min}" if hp_min == hp_max else f"{hp_min}-{hp_max}")
        )
        hp_range_a = (
            ""
            if hp_min_a is None
            else (f"{hp_min_a}" if hp_min_a == hp_max_a else f"{hp_min_a}-{hp_max_a}")
        )
        hp_delta = (
            (hp_max_a - hp_max) if (hp_max is not None and hp_max_a is not None) else 0
        )

        moves = m.get("moves") or []
        best_move: dict | None = None
        best_delta = 0
        for mv in moves:
            dmg = mv.get("damage") or {}
            base = dmg.get("normal")
            asc = dmg.get("ascension")
            if base is not None and asc is not None and asc - base > best_delta:
                best_delta = asc - base
                best_move = mv
        if best_move is None:
            base_dmg_text = ""
            asc_dmg_text = ""
        else:
            dmg = best_move.get("damage") or {}
            hits = dmg.get("hit_count")
            base_dmg_text = (
                f"{best_move.get('name')} {_format_hit(dmg.get('normal'), hits)}"
            )
            asc_dmg_text = _format_hit(dmg.get("ascension"), hits)

        if hp_delta > 0 or best_delta > 0:
            rows.append(
                {
                    "id": m.get("id", ""),
                    "name": m.get("name", ""),
                    "type": m.get("type") or "Normal",
                    "hp": hp_range or "—",
                    "hp_a": hp_range_a or "—",
                    "hp_delta": hp_delta,
                    "base_dmg": base_dmg_text or "—",
                    "asc_dmg": asc_dmg_text or "—",
                    "dmg_delta": best_delta,
                }
            )
    rows.sort(key=lambda r: (-r["hp_delta"], -r["dmg_delta"]))
    lines = [
        "| Monster | Type | HP | HP @ A7+ | Top attack | @ A2+ |",
        "|---------|------|----|----------|-----------|-------|",
    ]
    for r in rows:
        hp_a = r["hp_a"] + (f" (+{r['hp_delta']})" if r["hp_delta"] > 0 else "")
        asc_dmg = r["asc_dmg"] + (f" (+{r['dmg_delta']})" if r["dmg_delta"] > 0 else "")
        slug = str(r["id"]).lower()
        lines.append(
            f"| [{r['name']}](/monsters/{slug}) | {r['type']} | {r['hp']} | "
            f"{hp_a} | {r['base_dmg']} | {asc_dmg} |"
        )
    return "\n".join(lines)


# Effect descriptions stay hand-curated — the C# enum gives us the order
# and naming, but the prose is interpretive (e.g. "5 → 8 elites on map" is
# derived from MapModel constants, not the AscensionLevel enum itself).
_ASCENSION_EFFECTS = {
    "SwarmingElites": ("Swarming Elites", "5 → 8 elites on map"),
    "WearyTraveler": ("Weary Traveler", "Ancient heals only 80%"),
    "Poverty": ("Poverty", "Gold rewards x0.75"),
    "TightBelt": ("Tight Belt", "3 → 2 potion slots"),
    "AscendersBane": ("Ascender's Bane", "Start with Ascender's Bane curse"),
    "Inflation": (
        "Inflation",
        "Card removal at the Merchant is more expensive (base 100g, +50g per use)",
    ),
    "Scarcity": ("Scarcity", "~50% rarer cards, slower pity"),
    "ToughEnemies": ("Tough Enemies", "Enemy HP increases (per-enemy)"),
    "DeadlyEnemies": ("Deadly Enemies", "Enemy damage increases (per-enemy)"),
    "DoubleBoss": ("Double Boss", "Two bosses at end of the final act"),
}


def _resolve_table_ascension_levels(constants: dict) -> str:
    levels = constants.get("ascension_levels") or list(_ASCENSION_EFFECTS.keys())
    lines = ["| Level | Name | Effect |", "|------:|------|--------|"]
    for i, key in enumerate(levels, start=1):
        display, effect = _ASCENSION_EFFECTS.get(key, (key, "—"))
        lines.append(f"| {i} | {display} | {effect} |")
    return "\n".join(lines)


_TABLE_RESOLVERS: dict[str, Any] = {
    "character_stats": lambda _constants: _resolve_table_character_stats(),
    "monster_scaling": lambda _constants: _resolve_table_monster_scaling(),
    "ascension_levels": _resolve_table_ascension_levels,
}


def _resolve(body: str, constants: dict) -> str:
    """Replace `{{...}}` tokens in the markdown body."""

    def replace(match: re.Match) -> str:
        expression = match.group(1).strip()
        if expression.startswith("table:"):
            name = expression[len("table:") :].strip()
            resolver = _TABLE_RESOLVERS.get(name)
            if resolver is None:
                return match.group(0)
            try:
                return resolver(constants)
            except Exception as exc:
                logger.warning("table resolver %s failed: %s", name, exc)
                return match.group(0)
        return _resolve_value_token(expression, constants)

    return _TOKEN_RE.sub(replace, body)


# ── Public API ───────────────────────────────────────────────────────────


def list_sections() -> list[dict]:
    """All section index entries, ordered by frontmatter `order` then slug."""
    pages_dir = _pages_dir()
    if not pages_dir.exists():
        return []
    sections = []
    for path in sorted(pages_dir.glob("*.md")):
        post = frontmatter.load(path)
        meta = post.metadata
        sections.append(
            {
                "slug": path.stem,
                "title": meta.get("title", path.stem),
                "description": meta.get("description", ""),
                "category": meta.get("category", "mechanics"),
                "order": meta.get("order", 999),
            }
        )
    sections.sort(key=lambda s: (s["order"], s["slug"]))
    return sections


def get_section(slug: str) -> dict | None:
    """Single section, with template tokens resolved against current constants."""
    path = _pages_dir() / f"{slug}.md"
    if not path.exists():
        return None
    post = frontmatter.load(path)
    meta = post.metadata
    body = _resolve(post.content, _load_constants())
    return {
        "slug": slug,
        "title": meta.get("title", slug),
        "description": meta.get("description", ""),
        "category": meta.get("category", "mechanics"),
        "order": meta.get("order", 999),
        "body_markdown": body,
    }
