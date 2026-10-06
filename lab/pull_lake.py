"""Pull the newest published generation from R2 into /lake and purge the
edge after the files land. Downloads are sha-verified before anything
current is touched; the charts blob keeps its prev rotation.

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python \
        lake-ingest /lab/pull_lake.py
"""

import json
import os
import pathlib
import sys
import time

sys.path.insert(0, "/lab")
sys.path.append("/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))
PULLED = "pulled.json"
STALE_WARN_SECONDS = 12 * 3600

_PREV_ROTATE = {"charts_blob.json.gz": "charts_blob.prev.json.gz"}


def plan_downloads(manifest_files: dict, applied_files: dict) -> list[str]:
    return [
        name
        for name, meta in manifest_files.items()
        if (applied_files.get(name) or {}).get("sha256") != meta.get("sha256")
    ]


def prebuild_compact(lake: pathlib.Path, todo: list[str], manifest: dict) -> None:
    """Build the columnar entity cube from the fresh download before it
    goes live, so no backend worker has to convert it on demand."""
    name = "entity_cube.json.gz"
    if name not in todo:
        return
    from app.services import lake_cube

    started = time.time()
    lake_cube.build_dir(
        lake / (name + ".pull.tmp"),
        lake / "entity_cube.compact",
        sha=manifest["files"][name]["sha256"],
    )
    print(
        f"entity cube columnar build ready in {time.time() - started:.0f}s", flush=True
    )


def apply_downloads(lake: pathlib.Path, names: list[str]) -> None:
    for name in names:
        prev = _PREV_ROTATE.get(name)
        cur = lake / name
        if prev and cur.exists():
            cur.replace(lake / prev)
        (lake / (name + ".pull.tmp")).replace(cur)


def main() -> None:
    import fcntl

    import publish_lake

    lock = open(LAKE / "pull.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("another pull holds /lake/pull.lock; exiting", flush=True)
        sys.exit(1)

    client = publish_lake._client()
    bucket = publish_lake._bucket()
    try:
        body = client.get_object(Bucket=bucket, Key="latest.json")["Body"].read()
    except Exception as e:
        print(f"no published generation readable: {e}", flush=True)
        sys.exit(1)
    manifest = json.loads(body)
    gen_id = manifest["generation_id"]

    try:
        published = (
            time.mktime(time.strptime(manifest["published_at"], "%Y-%m-%dT%H:%M:%SZ"))
            - time.timezone
        )
        age = time.time() - published
        if age > STALE_WARN_SECONDS:
            print(
                f"WARNING: newest published generation is {age / 3600:.1f}h old "
                "- is the ingest box cycling?",
                flush=True,
            )
    except Exception:
        pass

    applied: dict = {}
    try:
        applied = json.loads((LAKE / PULLED).read_text())
    except Exception:
        pass
    applied_files = applied.get("files") or {}
    todo = plan_downloads(manifest["files"], applied_files)
    if not todo:
        print(f"generation {gen_id} already applied; nothing to do", flush=True)
        return

    t0 = time.time()
    for name in todo:
        tmp = LAKE / (name + ".pull.tmp")
        tmp.parent.mkdir(parents=True, exist_ok=True)
        client.download_file(bucket, f"gen/{gen_id}/{name}", str(tmp))
        want = manifest["files"][name]["sha256"]
        got = publish_lake._sha256(tmp)
        if got != want:
            tmp.unlink(missing_ok=True)
            print(f"pull ABORTED: {name} sha mismatch ({got} != {want})", flush=True)
            sys.exit(1)
        print(f"pulled {name} ({tmp.stat().st_size:,} bytes)", flush=True)

    try:
        prebuild_compact(LAKE, todo, manifest)
    except Exception as e:
        print(
            f"entity cube columnar build failed ({e}); workers will build it",
            flush=True,
        )
    apply_downloads(LAKE, todo)
    stale = sorted(
        name
        for name in applied_files
        if name.startswith("exports_by_version/") and name not in manifest["files"]
    )
    for name in stale:
        (LAKE / name).unlink(missing_ok=True)
    if stale:
        print(f"pulled: dropped {len(stale)} stale per-version file(s)", flush=True)

    tmp = LAKE / (PULLED + ".tmp")
    tmp.write_text(json.dumps(manifest, indent=1))
    tmp.replace(LAKE / PULLED)
    print(
        f"generation {gen_id} applied ({len(todo)} files) in {time.time() - t0:.0f}s",
        flush=True,
    )

    import edge_purge

    edge_purge.purge()


if __name__ == "__main__":
    main()
