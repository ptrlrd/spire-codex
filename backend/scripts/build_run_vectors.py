"""Build the run-composition vector shards (also runs daily in the rebuilder).

python -m scripts.build_run_vectors
"""

import logging
import os


def main() -> int:
    if not os.environ.get("MONGO_URL", "").strip():
        print("MONGO_URL unset; nothing to do")
        return 1
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    from app.services.run_vectors import build_run_vectors

    print(build_run_vectors(), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
