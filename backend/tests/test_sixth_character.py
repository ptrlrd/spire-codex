"""A character that only the beta catalog knows is named, ordered after the
launch five, and accepted wherever the cast used to be a fixed list."""

import json

import pytest
from pydantic import ValidationError

from app.routers import unlocks
from app.routers.charts import SavedChartSpec
from app.services import charts_stats, data_service, official_content as oc
from app.services import published_guides


def _catalog(base, rows):
    (base / "eng").mkdir(parents=True, exist_ok=True)
    (base / "eng" / "characters.json").write_text(json.dumps(rows))


@pytest.fixture()
def beta_fool(tmp_path, monkeypatch):
    main, beta = tmp_path / "data", tmp_path / "data-beta"
    main.mkdir()
    beta.mkdir()
    monkeypatch.setattr(data_service, "DATA_DIR", main)
    monkeypatch.setattr(data_service, "BETA_DATA_DIR", beta)
    _catalog(
        main,
        [
            {"id": "SILENT", "name": "The Silent"},
            {"id": "IRONCLAD", "name": "The Ironclad"},
        ],
    )
    _catalog(
        beta / "v0.200.0",
        [
            {"id": "FOOL", "name": "The Fool"},
            {"id": "IRONCLAD", "name": "Beta Ironclad"},
        ],
    )
    (beta / "latest").write_text("v0.200.0")
    oc.official_ids.cache_clear()
    oc.official_character_names.cache_clear()
    yield
    oc.official_ids.cache_clear()
    oc.official_character_names.cache_clear()


def test_beta_only_character_is_named_after_the_launch_cast(beta_fool):
    assert oc.official_character_names() == {
        "IRONCLAD": "Ironclad",
        "SILENT": "Silent",
        "FOOL": "Fool",
    }
    assert oc.official_character_names(strip_article=False)["FOOL"] == "The Fool"


def test_charts_split_knows_the_beta_character(beta_fool):
    assert charts_stats._official_characters()["FOOL"] == "Fool"


def test_saved_chart_accepts_the_cast_and_rejects_others(beta_fool):
    spec = {
        "source": "cards",
        "bracket": "all",
        "chart": "bar",
        "x": "name",
        "y": "win_rate",
        "sort": "desc",
    }
    assert SavedChartSpec(**spec, character="FOOL").character == "FOOL"
    assert SavedChartSpec(**spec).character is None
    with pytest.raises(ValidationError):
        SavedChartSpec(**spec, character="WATCHER")


def test_guides_accept_the_beta_character(beta_fool):
    assert "fool" in published_guides.valid_characters()
    assert "watcher" not in published_guides.valid_characters()


def test_unlock_epochs_follow_the_catalog():
    chars = {
        "IRONCLAD": {"unlocks_after": None},
        "SILENT": {"unlocks_after": "Ironclad"},
        "FOOL": {"unlocks_after": "Defect"},
        "GHOST": {"unlocks_after": "Fool"},
    }
    epochs = {"SILENT1_EPOCH": {}, "FOOL1_EPOCH": {}}
    assert unlocks._character_unlock_epochs(chars, epochs) == {
        "SILENT": "SILENT1_EPOCH",
        "FOOL": "FOOL1_EPOCH",
    }
