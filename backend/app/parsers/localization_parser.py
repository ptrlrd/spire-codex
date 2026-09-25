"""Generate i18n message packs.
Based on translation_parser and may eventually replace it, but currently more simply exports more raw packs containing all messages from the game files.
Will later be extended to transform templated messages into ICU for the frontend
"""

import itertools
import json
import os

from parser_paths import loc_dir as _loc_dir, data_dir as _data_dir

EMPTY_KEY_FILLER = "!"


def extract_group_key(entry):
    (key_parts, _) = entry
    return key_parts[0] if len(key_parts) > 0 else EMPTY_KEY_FILLER


"""
Build nested structures from the semi-structre of the raw key-value pairs

The game's message system allows keys like "x.y" to coexisting with "x.y.z" because it doesn't physically nest them
But next-intl does physically nest them and will reject the use of . in a key.
This has utility in next-intl as it allows us to target namespaces.
However, it is possible for any given y to be both a terminating field and a namespace, so we need to detect and seperate such cases.

This can done recursively by:
1. binning items together by the the first key x in x.y.z.
2. Examine each bin for recursive sub-binning
2a. in the case that we find a bin with exactly one item and no further parts to the key, it is a normal terminating key and can be assign literally
2b. in the case that we have multiple items in a bin, or even one item with muliple parts, call the method recursively on those items
2c. in the case that one among multiple items has no remaining keys parts at all, give it a special character (say '!') to correspond to the empty key that would otherwise be unrepresentatble.

After the initial binning stage, the returned results must use a given key at most once, so raise an exception if there is a collision within a bin.

Note: the path param is purely for debugging
"""


def apply_nesting(messages):
    # no more nesting to apply, we can just return the value and we don't need to potentially unravel anything
    if len(messages) == 1:
        (key_parts, value) = messages[0]
        if len(key_parts) == 0:
            return value

    return {
        # note: key_parts[1:] deliberately failed if we ever hit multiple values without sub-keys. It should be manifestly impossible, but still, fail-fast is better than infinite recursion
        key: apply_nesting(
            [(key_parts[1:], value) for (key_parts, value) in sub_messages]
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
        messages = json.load(f)
        return renest_messages(messages)


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang) / "localization"
    filenames = filter(lambda x: x.endswith(".json"), os.listdir(loc_dir))
    os.makedirs(output_dir,exist_ok=True)
    for name in filenames:
        messages = load_messages_file(loc_dir / name)
        output_file = output_dir / name
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)
        print(f"Generated messages -> {output_file}")

if __name__ == "__main__":
    main()
