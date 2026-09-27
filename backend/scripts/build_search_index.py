"""Build (or rebuild) the site search index from the data tree.

python -m scripts.build_search_index [--force] [--no-images]
"""

import argparse
import json
import logging

from app.services import search_index


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-images", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if args.no_images:
        meta = search_index.build(with_images=False)
    else:
        meta = search_index.ensure_built(force=args.force)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
