"""The split-box artifact bus: pull planning, apply/rotation, hashing."""

import importlib.util
import pathlib

_LAB = pathlib.Path(__file__).resolve().parents[2] / "lab"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, _LAB / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pull_lake = _load("pull_lake")
publish_lake = _load("publish_lake")


def test_plan_downloads_first_pull_takes_everything():
    manifest = {"a.json": {"sha256": "x"}, "b.parquet": {"sha256": "y"}}
    assert sorted(pull_lake.plan_downloads(manifest, {})) == ["a.json", "b.parquet"]


def test_plan_downloads_skips_unchanged():
    manifest = {"a.json": {"sha256": "x"}, "b.parquet": {"sha256": "y2"}}
    applied = {"a.json": {"sha256": "x"}, "b.parquet": {"sha256": "y1"}}
    assert pull_lake.plan_downloads(manifest, applied) == ["b.parquet"]


def test_plan_downloads_all_current_is_empty():
    manifest = {"a.json": {"sha256": "x"}}
    assert pull_lake.plan_downloads(manifest, {"a.json": {"sha256": "x"}}) == []


def test_apply_rotates_charts_blob_and_replaces_others(tmp_path):
    (tmp_path / "charts_blob.json.gz").write_bytes(b"old-charts")
    (tmp_path / "charts_blob.json.gz.pull.tmp").write_bytes(b"new-charts")
    (tmp_path / "entity_store.json").write_bytes(b"old-store")
    (tmp_path / "entity_store.json.pull.tmp").write_bytes(b"new-store")

    pull_lake.apply_downloads(tmp_path, ["charts_blob.json.gz", "entity_store.json"])

    assert (tmp_path / "charts_blob.json.gz").read_bytes() == b"new-charts"
    assert (tmp_path / "charts_blob.prev.json.gz").read_bytes() == b"old-charts"
    assert (tmp_path / "entity_store.json").read_bytes() == b"new-store"
    assert not (tmp_path / "entity_store.prev.json").exists()
    assert not list(tmp_path.glob("*.pull.tmp"))


def test_apply_first_charts_pull_has_nothing_to_rotate(tmp_path):
    (tmp_path / "charts_blob.json.gz.pull.tmp").write_bytes(b"first")
    pull_lake.apply_downloads(tmp_path, ["charts_blob.json.gz"])
    assert (tmp_path / "charts_blob.json.gz").read_bytes() == b"first"
    assert not (tmp_path / "charts_blob.prev.json.gz").exists()


def test_sha256_matches_hashlib(tmp_path):
    import hashlib

    p = tmp_path / "f.bin"
    p.write_bytes(b"spire" * 1000)
    assert publish_lake._sha256(p) == hashlib.sha256(b"spire" * 1000).hexdigest()


def test_serve_set_covers_request_path_reads():
    for name in (
        "community_payload.json",
        "community_cube.json.gz",
        "entity_store.json",
        "entity_cube.json.gz",
        "encounter_store.json",
        "charts_blob.json.gz",
        "frame.parquet",
        "generation.json",
        "ingest_metrics.jsonl",
    ):
        assert name in publish_lake.SERVE_FILES


def test_pull_prebuilds_the_columnar_cube(tmp_path):
    import gzip
    import json

    cube = {"runs": {"standard|1|0|0|v0.1": [3, 1, 3]}, "entities": {"cards": {}}}
    tmp = tmp_path / "entity_cube.json.gz.pull.tmp"
    with gzip.open(tmp, "wt") as f:
        json.dump(cube, f)
    from app.services import lake_cube

    sha = lake_cube.file_sha256(tmp)
    manifest = {"files": {"entity_cube.json.gz": {"sha256": sha}}}
    pull_lake.prebuild_compact(tmp_path, ["entity_store.json"], manifest)
    assert not (tmp_path / "entity_cube.compact").exists()
    pull_lake.prebuild_compact(tmp_path, ["entity_cube.json.gz"], manifest)
    built = lake_cube.CompactCube(
        tmp_path / "entity_cube.compact" / lake_cube.build_name(sha)
    )
    assert built.versions() == {"v0.1": 3}


def test_pull_prebuild_rejects_a_cube_it_cannot_convert(tmp_path):
    import pytest

    from app.services import lake_cube

    tmp = tmp_path / "entity_cube.json.gz.pull.tmp"
    tmp.write_bytes(b"not a gzip stream")
    sha = lake_cube.file_sha256(tmp)
    manifest = {"files": {"entity_cube.json.gz": {"sha256": sha}}}
    with pytest.raises(Exception):
        pull_lake.prebuild_compact(tmp_path, ["entity_cube.json.gz"], manifest)
    assert not list((tmp_path / "entity_cube.compact").glob("*.v*"))
