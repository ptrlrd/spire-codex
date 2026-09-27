"""Build (or rebuild) the site search index from the data tree.

    python -m scripts.build_search_index [--force] [--no-images]

Runs through the same file lock as the app's startup build, so it is safe
to invoke while the backend is running; a --no-images build is recorded as
incomplete and the next app build fills the image rows in.
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
    if args.force:
        with search_index._Lock(search_index._lock_path(search_index.INDEX_DIR)):
            meta = search_index.build(with_images=not args.no_images)
    else:
        meta = search_index.ensure_built(
            require_images=not args.no_images, with_images=not args.no_images
        )
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
