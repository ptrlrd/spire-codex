"""Export the game's own localization tables as one next-intl message pack
per language: data/<lang>/messages.json = {table: nested messages}, with every
template converted from the game's SmartFormat syntax to ICU MessageFormat.

The game keys are dotted ("X.title" next to "X.title.short"); next-intl nests
on dots and rejects a key that is both a leaf and a namespace, so a leaf that
collides with a namespace is stored under the "!" key inside it.
"""

import itertools
import json
import os
import sys

from message_parser import convert_table
from parser_paths import data_dir as _data_dir, loc_dir as _loc_dir

EMPTY_KEY_FILLER = "!"


def extract_group_key(entry):
    (key_parts, _) = entry
    return key_parts[0] if len(key_parts) > 0 else EMPTY_KEY_FILLER


def apply_nesting(messages, path=()):
    if len(messages) == 1:
        (key_parts, value) = messages[0]
        if len(key_parts) == 0:
            return value
    if len(messages) > 1 and all(len(key_parts) == 0 for key_parts, _ in messages):
        raise ValueError(f"localization key collision at {'.'.join(path) or '<root>'}")
    return {
        key: apply_nesting(
            [(key_parts[1:], value) for (key_parts, value) in sub_messages],
            path + (key,),
        )
        for key, sub_messages in itertools.groupby(
            sorted(messages, key=extract_group_key), key=extract_group_key
        )
    }


def renest_messages(messages):
    split = [(key.split("."), value) for key, value in messages.items()]
    return apply_nesting(split)


def load_messages_file(path):
    with open(path, "r", encoding="utf8") as f:
        raw = json.load(f)
    if not isinstance(raw, dict):
        raise ValueError(f"{path.name}: expected an object of messages")
    return renest_messages(raw)


def build_message_pack(loc_dir, lang: str = "eng") -> tuple[dict, dict]:
    pack: dict = {}
    reports: dict = {}
    for name in sorted(os.listdir(loc_dir)):
        if not name.endswith(".json"):
            continue
        table = name[: -len(".json")]
        try:
            messages = load_messages_file(loc_dir / name)
        except ValueError as error:
            print(f"Skipping {name}: {error}")
            continue
        converted, report = convert_table(messages, language=lang)
        pack[table] = converted
        reports[table] = report
    return pack, reports


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    if not loc_dir.is_dir():
        print(f"No localization tables for {lang}; the API falls back to eng")
        return
    pack, reports = build_message_pack(loc_dir, lang)
    output_file = _data_dir(lang) / "messages.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(pack, f, indent=1, ensure_ascii=False)
        f.write("\n")
    unconvertible = sum(r.get("unconvertible", 0) for r in reports.values())
    invalid = sum(r.get("invalid_icu", 0) for r in reports.values())
    print(
        f"Generated {len(pack)} localization tables -> {output_file}"
        f" ({unconvertible} strings left as literals, {invalid} failed ICU validation)"
    )
    if unconvertible:
        for table, r in reports.items():
            if r.get("unconvertible"):
                print(
                    f"  {table}: {r['unconvertible']} {r.get('unconvertible_examples', [])[:3]}"
                )


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "eng")
