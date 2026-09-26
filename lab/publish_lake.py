"""Upload the serve artifacts to R2 after a completed cycle. latest.json
is written last so the puller only sees fully uploaded generations; the
two newest generations are kept.
Needs its own bucket-scoped token: LAKE_R2_ACCESS_KEY_ID /
LAKE_R2_SECRET_ACCESS_KEY / LAKE_R2_ENDPOINT / LAKE_R2_BUCKET."""

import hashlib
import json
import os
import pathlib
import sys
import time

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))

SERVE_FILES = (
    "community_payload.json",
    "community_cube.json.gz",
    "entity_store.json",
    "entity_cube.json.gz",
    "encounter_store.json",
    "charts_blob.json.gz",
    "frame.parquet",
    "generation.json",
    "ingest_metrics.jsonl",
    "runs_export.jsonl.gz",
    "runs_export.json",
    "player_elo.json",
)

KEEP_GENERATIONS = 2


def _client():
    import boto3
    from botocore.config import Config

    key = os.environ.get("LAKE_R2_ACCESS_KEY_ID", "").strip()
    secret = os.environ.get("LAKE_R2_SECRET_ACCESS_KEY", "").strip()
    endpoint = os.environ.get("LAKE_R2_ENDPOINT", "").strip()
    if not (key and secret and endpoint):
        raise RuntimeError("LAKE_R2_* not configured")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def _bucket() -> str:
    b = os.environ.get("LAKE_R2_BUCKET", "").strip()
    if not b:
        raise RuntimeError("LAKE_R2_BUCKET not set")
    return b


def _sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _prune(client, bucket: str, keep: set[str]) -> int:
    doomed: list[dict] = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix="gen/"):
        for obj in page.get("Contents") or []:
            parts = obj["Key"].split("/")
            if len(parts) >= 3 and parts[1] not in keep:
                doomed.append({"Key": obj["Key"]})
    for i in range(0, len(doomed), 1000):
        client.delete_objects(Bucket=bucket, Delete={"Objects": doomed[i : i + 1000]})
    return len(doomed)


def publish() -> dict:
    gen = json.loads((LAKE / "generation.json").read_text())
    gen_id = gen["generation_id"]
    client = _client()
    bucket = _bucket()

    t0 = time.time()
    files: dict[str, dict] = {}
    for name in SERVE_FILES:
        path = LAKE / name
        if not path.exists():
            print(f"publish: {name} missing, not shipped", flush=True)
            continue
        st = path.stat()
        client.upload_file(str(path), bucket, f"gen/{gen_id}/{name}")
        files[name] = {"bytes": st.st_size, "sha256": _sha256(path)}
        print(f"publish: {name} ({st.st_size:,} bytes)", flush=True)

    manifest = {
        "generation_id": gen_id,
        "published_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "files": files,
    }
    client.put_object(
        Bucket=bucket,
        Key="latest.json",
        Body=json.dumps(manifest, indent=1).encode(),
        ContentType="application/json",
    )
    gens = set()
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix="gen/", Delimiter="/"):
        for pre in page.get("CommonPrefixes") or []:
            gens.add(pre["Prefix"].split("/")[1])
    keep = set(sorted(gens, reverse=True)[:KEEP_GENERATIONS])
    n = _prune(client, bucket, keep)
    print(
        f"publish: generation {gen_id} up ({len(files)} files, "
        f"{n} old objects pruned) in {time.time() - t0:.0f}s",
        flush=True,
    )
    return manifest


if __name__ == "__main__":
    try:
        publish()
    except Exception as e:
        print(f"publish failed: {e}", flush=True)
        sys.exit(1)
