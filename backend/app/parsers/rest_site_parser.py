"""Generate the rest-site option catalog from the decompiled C# option
classes.

Every campfire action the game offers is a `RestSiteOption` subclass under
`MegaCrit.Sts2.Core.Entities.RestSite/`, each declaring its id through
`OptionId => "SMITH"`. This parser reads those declarations and writes
`data/<lang>/rest_site_options.json` (id plus the localized name from the
game's `rest_site_ui` table) so the stats tables can tell a base-game
campfire choice from a modded one without a hand-kept list. A class file in
that directory whose id the parser cannot read fails the parse loudly.
"""

import json
import re
import sys
from pathlib import Path

from parser_paths import DECOMPILED, RAW_DIR, data_dir, loc_dir

REST_SITE_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Entities.RestSite"
_OPTION_ID = re.compile(r'override\s+string\s+OptionId\s*=>\s*"([A-Z0-9_]+)"')
_ABSTRACT = re.compile(r"\babstract\s+class\s+\w*RestSiteOption\b")


def parse_option_ids(src_dir: Path = REST_SITE_DIR) -> list[str]:
    """Option ids from every concrete RestSiteOption class, sorted. Raises
    when a concrete class file declares no id the parser understands."""
    ids: list[str] = []
    missing: list[str] = []
    for path in sorted(src_dir.glob("*RestSiteOption.cs")):
        text = path.read_text(encoding="utf-8")
        if _ABSTRACT.search(text):
            continue
        m = _OPTION_ID.search(text)
        if m is None:
            missing.append(path.name)
            continue
        ids.append(m.group(1))
    if missing:
        raise RuntimeError(
            "rest site option classes without a readable OptionId: "
            + ", ".join(missing)
        )
    if not ids:
        raise RuntimeError(f"no RestSiteOption classes found under {src_dir}")
    return sorted(set(ids))


def _names(lang: str) -> dict[str, str]:
    path = loc_dir(lang) / "rest_site_ui.json"
    if not path.exists():
        return {}
    table = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for key, value in table.items():
        m = re.fullmatch(r"OPTION_([A-Z0-9_]+)\.name", key)
        if m and isinstance(value, str):
            out[m.group(1)] = value
    return out


def build_options(lang: str, ids: list[str]) -> list[dict]:
    names = _names(lang)
    eng = _names("eng") if lang != "eng" else names
    return [
        {"id": oid, "name": names.get(oid) or eng.get(oid) or oid.title()}
        for oid in ids
    ]


def main(languages: list[str] | None = None) -> None:
    ids = parse_option_ids()
    if not languages:
        languages = sorted(
            d.name for d in (RAW_DIR / "localization").iterdir() if d.is_dir()
        )
    for lang in languages:
        if not loc_dir(lang).is_dir():
            continue
        out = data_dir(lang) / "rest_site_options.json"
        out.write_text(
            json.dumps(build_options(lang, ids), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    print(f"Generated rest_site_options.json for {len(ids)} options: {', '.join(ids)}")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
