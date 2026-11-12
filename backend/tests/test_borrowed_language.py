"""A language the main game build has no text for is served from the beta
tree's translations, string by string, wherever the English is unchanged."""

import json
import sys
from pathlib import Path

import pytest

from app.services import data_service

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))


def _write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


MAIN_CARDS = [
    {
        "id": "BASH",
        "name": "Bash",
        "description": "Deal 8 damage.",
        "type": "Attack",
        "type_key": "Attack",
        "rarity": "Basic",
        "rarity_key": "Basic",
        "image_url": "/static/images/cards/bash.webp",
        "riders": [{"name": "Vulnerable"}],
    },
    {
        "id": "SCARE",
        "name": "Scare",
        "description": "Main only.",
        "type": "Skill",
        "type_key": "Skill",
        "rarity": "Rare",
        "rarity_key": "Rare",
        "image_url": None,
        "riders": [],
    },
]
BETA_ENG_CARDS = [
    {
        "id": "BASH",
        "name": "Bash",
        "description": "Deal 10 damage.",
        "type": "Attack",
        "type_key": "Attack",
        "rarity": "Basic",
        "rarity_key": "Basic",
        "image_url": None,
        "riders": [{"name": "Vulnerable"}],
    }
]
BETA_ZHT_CARDS = [
    {
        "id": "BASH",
        "name": "猛擊",
        "description": "造成 10 點傷害。",
        "type": "攻擊",
        "type_key": "Attack",
        "rarity": "基本",
        "rarity_key": "Basic",
        "image_url": None,
        "riders": [{"name": "易傷"}],
    }
]
ENG_MAPS = {
    "card_types": {"Attack": "Attack", "Skill": "Skill"},
    "card_rarities": {"Basic": "Basic", "Rare": "Rare"},
}
ZHT_MAPS = {
    "card_types": {"Attack": "攻擊", "Skill": "技能"},
    "card_rarities": {"Basic": "基本", "Rare": "稀有"},
}


@pytest.fixture
def trees(tmp_path, monkeypatch):
    main = tmp_path / "data"
    beta = tmp_path / "data-beta"
    _write(main / "eng" / "cards.json", MAIN_CARDS)
    _write(main / "eng" / "translations.json", ENG_MAPS)
    _write(main / "deu" / "cards.json", [{"id": "BASH", "name": "Hieb"}])
    _write(beta / "v9.9.9" / "eng" / "cards.json", BETA_ENG_CARDS)
    _write(beta / "v9.9.9" / "zht" / "cards.json", BETA_ZHT_CARDS)
    _write(beta / "v9.9.9" / "eng" / "translations.json", ENG_MAPS)
    _write(beta / "v9.9.9" / "zht" / "translations.json", ZHT_MAPS)
    (beta / "latest").write_text("v9.9.9", encoding="utf-8")
    monkeypatch.setattr(data_service, "DATA_DIR", main)
    monkeypatch.setattr(data_service, "BETA_DATA_DIR", beta)
    caches = [
        v
        for v in vars(data_service).values()
        if callable(getattr(v, "cache_clear", None))
    ]
    for cache in caches:
        cache.cache_clear()
    yield main, beta
    for cache in caches:
        cache.cache_clear()


def _load(channel, lang, entity="cards"):
    token = data_service.current_channel.set(channel)
    try:
        return data_service._load_json(lang, entity)
    finally:
        data_service.current_channel.reset(token)


def test_unchanged_strings_come_from_the_beta_translation(trees):
    bash, scare = _load("stable", "zht")
    assert bash["name"] == "猛擊"
    assert bash["riders"] == [{"name": "易傷"}]
    assert bash["image_url"] == "/static/images/cards/bash.webp"
    assert scare["name"] == "Scare"


def test_lists_the_beta_reordered_pair_by_id(trees):
    main, beta = trees
    burn = {"id": "BURN", "name": "Burn"}
    knight = {"id": "MECHA_KNIGHT", "name": "Mecha Knight"}
    subject = {"id": "TEST_SUBJECT", "name": "Test Subject #C14"}
    slime = {"id": "SLIME", "name": "Slime"}
    _write(
        main / "eng" / "cards.json",
        [{**burn, "sources": [knight, subject, slime], "tags": ["Status", "Burn"]}],
    )
    _write(
        beta / "v9.9.9" / "eng" / "cards.json",
        [
            {
                **burn,
                "sources": [knight, {**subject, "name": "Test Subject #C{Count}"}],
                "tags": ["Status", "Burn"],
            }
        ],
    )
    _write(
        beta / "v9.9.9" / "zht" / "cards.json",
        [
            {
                "id": "BURN",
                "name": "灼傷",
                "sources": [
                    {"id": "TEST_SUBJECT", "name": "實驗體 #C{Count}"},
                    {"id": "MECHA_KNIGHT", "name": "機甲騎士"},
                ],
                "tags": ["狀態", "灼傷"],
            }
        ],
    )
    card = _load("stable", "zht")[0]
    assert card["name"] == "灼傷"
    assert card["sources"] == [
        {"id": "MECHA_KNIGHT", "name": "機甲騎士"},
        subject,
        slime,
    ]
    assert card["tags"] == ["狀態", "灼傷"]


def test_rows_with_mismatched_ids_stay_english():
    main = [{"id": "A", "name": "Same"}, {"id": "A", "name": "Same"}]
    lang = [{"id": "B", "name": "乙"}, {"id": "A", "name": "甲"}]
    assert data_service._borrow_text(main, main, lang) == [
        {"id": "A", "name": "Same"},
        {"id": "A", "name": "甲"},
    ]


def test_strings_the_beta_changed_stay_english(trees):
    bash = _load("stable", "zht")[0]
    assert bash["description"] == "Deal 8 damage."


def test_filter_fields_follow_the_translation_maps(trees):
    bash, scare = _load("stable", "zht")
    maps = data_service.load_translation_maps("zht")
    assert maps["card_types"]["Skill"] == "技能"
    assert bash["type"] == maps["card_types"]["Attack"]
    assert scare["type"] == maps["card_types"]["Skill"]
    assert scare["rarity"] == maps["card_rarities"]["Rare"]


def test_borrowing_leaves_the_english_rows_alone(trees):
    _load("stable", "zht")
    assert _load("stable", "eng") == MAIN_CARDS


def test_all_channel_uses_the_borrowed_rows(trees):
    assert _load("all", "zht")[0]["name"] == "猛擊"


def test_languages_with_their_own_file_are_untouched(trees):
    assert _load("stable", "deu") == [{"id": "BASH", "name": "Hieb"}]
    assert _load("stable", "eng") == MAIN_CARDS


def test_english_is_served_when_the_beta_has_no_translation(trees):
    assert _load("stable", "ind") == MAIN_CARDS


def test_english_is_served_without_a_beta(trees):
    (trees[1] / "latest").unlink()
    assert _load("stable", "zht") == MAIN_CARDS


def test_pinned_versions_do_not_borrow(trees):
    _write(trees[0] / "v0.1.0" / "eng" / "cards.json", MAIN_CARDS)
    token = data_service.current_version.set("v0.1.0")
    try:
        assert _load("stable", "zht") == MAIN_CARDS
    finally:
        data_service.current_version.reset(token)


def test_parse_all_skips_languages_the_build_has_no_text_for(tmp_path, monkeypatch):
    import parse_all

    (tmp_path / "eng").mkdir()
    monkeypatch.setattr(parse_all, "loc_dir", lambda lang: tmp_path / lang)
    assert parse_all.languages_with_text(["eng", "zht"]) == ["eng"]
