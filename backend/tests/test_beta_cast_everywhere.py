"""A beta-only character reaches search, the live cast used by run filters,
and the IndexNow URL list without a code edit or a restart."""

import importlib.util
import json
from pathlib import Path

import pytest

from app.services import data_service, official_content as oc, search_index
from app.services import runs_db_mongo

MAIN_CARDS = [{"id": "BASH", "name": "Bash", "type": "Attack"}]
BETA_CARDS = [{"id": "FOOLISH_SHOT", "name": "Foolish Shot", "type": "Attack"}]


def _catalog(base: Path, ids: list[str]) -> None:
    (base / "eng").mkdir(parents=True, exist_ok=True)
    rows = [{"id": i, "name": f"The {i.title()}"} for i in ids]
    (base / "eng" / "characters.json").write_text(json.dumps(rows))


def test_search_indexes_beta_only_rows_and_marks_them(monkeypatch):
    def cards(lang):
        if data_service.get_channel() == "all":
            return MAIN_CARDS + BETA_CARDS
        return MAIN_CARDS

    names = {k[2] for k in search_index._ENTITY_KINDS}
    names |= {k[0] for k in search_index._REFERENCE_KINDS}
    for name in names:
        monkeypatch.setattr(data_service, name, lambda lang: [])
    monkeypatch.setattr(data_service, "load_cards", cards)
    monkeypatch.setattr(data_service, "get_beta_version", lambda: "v9.9.9")

    docs = {d["path"]: d for d in search_index._entity_docs("eng")}

    assert docs["/cards/bash"]["subtitle"] == "Attack"
    assert docs["/cards/foolish_shot"]["subtitle"] == "Beta · Attack"
    assert data_service.get_channel() == "stable"


def test_search_stays_main_only_without_a_beta(monkeypatch):
    calls = []

    def cards(lang):
        calls.append(data_service.get_channel())
        return MAIN_CARDS

    names = {k[2] for k in search_index._ENTITY_KINDS}
    names |= {k[0] for k in search_index._REFERENCE_KINDS}
    for name in names:
        monkeypatch.setattr(data_service, name, lambda lang: [])
    monkeypatch.setattr(data_service, "load_cards", cards)
    monkeypatch.setattr(data_service, "get_beta_version", lambda: None)

    docs = list(search_index._entity_docs("eng"))

    assert [d["path"] for d in docs] == ["/cards/bash"]
    assert calls == ["stable"]


@pytest.fixture()
def catalogs(tmp_path, monkeypatch):
    main, beta = tmp_path / "data", tmp_path / "data-beta"
    main.mkdir()
    beta.mkdir()
    monkeypatch.setattr(data_service, "DATA_DIR", main)
    monkeypatch.setattr(data_service, "BETA_DATA_DIR", beta)
    _catalog(main, ["IRONCLAD", "SILENT"])
    oc.official_ids.cache_clear()
    yield main, beta
    oc.official_ids.cache_clear()


def test_run_filters_pick_up_a_new_beta_without_a_restart(catalogs, monkeypatch):
    _main, beta = catalogs
    assert runs_db_mongo.OFFICIAL_CHARACTERS is oc.LIVE_CAST
    assert "FOOL" not in oc.LIVE_CAST
    assert set(oc.LIVE_CAST) == {"IRONCLAD", "SILENT"}

    _catalog(beta / "v0.200.0", ["IRONCLAD", "SILENT", "FOOL"])
    (beta / "latest").write_text("v0.200.0")
    assert "FOOL" not in oc.LIVE_CAST

    monkeypatch.setattr(oc, "_beta_seen", None)
    assert "FOOL" in oc.LIVE_CAST
    assert sorted(oc.LIVE_CAST) == ["FOOL", "IRONCLAD", "SILENT"]
    assert oc.official_character_names()["FOOL"] == "Fool"
    assert {"FOOL", "IRONCLAD", "SILENT"} == oc.LIVE_CAST


def _deploy_tool():
    path = Path(__file__).resolve().parents[2] / "tools" / "deploy.py"
    spec = importlib.util.spec_from_file_location("deploy_tool", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_indexnow_covers_a_beta_only_character(tmp_path, monkeypatch):
    deploy = _deploy_tool()
    main, beta = tmp_path / "data", tmp_path / "data-beta"
    _catalog(main, ["DEFECT", "IRONCLAD", "NECROBINDER", "REGENT", "SILENT"])
    _catalog(beta / "v0.200.0", ["FOOL", "IRONCLAD"])
    (beta / "latest").write_text("v0.200.0")
    monkeypatch.setattr(deploy, "ROOT", tmp_path)
    monkeypatch.setattr(deploy, "DATA_DIR", main)

    assert deploy.site_cast() == [
        "ironclad",
        "silent",
        "defect",
        "necrobinder",
        "regent",
        "fool",
    ]
    urls = deploy.build_indexnow_urls()
    site = deploy.SITE_URL
    for path in (
        "/cards/browse/fool-attacks",
        "/cards/browse/fool-skills",
        "/cards/browse/fool-powers",
        "/compare/regent-vs-fool",
        "/compare/ironclad-vs-fool",
        "/compare/ironclad-vs-silent",
        "/characters/fool",
    ):
        assert f"{site}{path}" in urls
    assert (
        len([u for u in urls if "/compare/" in u and "-vs-" in u and u.count("/") == 4])
        == 15
    )
