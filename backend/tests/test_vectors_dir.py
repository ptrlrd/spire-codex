"""Archetype vectors come from VECTORS_DIR, then the lake copy the pull
brought down, then data/vectors."""

from app.services import run_vectors


def test_vector_dir_order(monkeypatch, tmp_path):
    lake, data = tmp_path / "lake", tmp_path / "data"
    monkeypatch.delenv("VECTORS_DIR", raising=False)
    monkeypatch.setenv("LAKE_DIR", str(lake))
    monkeypatch.setenv("DATA_DIR", str(data))
    assert run_vectors._vec_dir() == data / "vectors"
    (lake / "vectors").mkdir(parents=True)
    (lake / "vectors" / "archetypes.json").write_text("{}")
    assert run_vectors._vec_dir() == lake / "vectors"
    monkeypatch.setenv("VECTORS_DIR", str(tmp_path / "x"))
    assert run_vectors._vec_dir() == tmp_path / "x"
