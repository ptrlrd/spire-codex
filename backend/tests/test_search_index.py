"""The site search index: typo and prefix tolerance, exact-name ranking,
language scoping, page and image documents, grouped output, generation
publishing under the file lock, and the router's fallbacks."""

import json
import os
import threading

import pytest
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.routers import search as search_router
from app.services import data_service, mechanics_pages, search_index

client = TestClient(app)


def _docs():
    d = search_index._doc
    return [
        d(
            doc_id="card:eng:STRIKE",
            kind="card",
            lang="eng",
            name="Strike",
            path="/cards/strike",
            subtitle="Attack",
            text="Deal 6 damage.",
        ),
        d(
            doc_id="card:eng:PERFECTED",
            kind="card",
            lang="eng",
            name="Perfected Strike",
            path="/cards/perfected_strike",
            subtitle="Attack",
            text="Deal damage for every Strike.",
        ),
        d(
            doc_id="card:eng:STOKE",
            kind="card",
            lang="eng",
            name="Stoke",
            path="/cards/stoke",
            subtitle="Skill",
        ),
        d(
            doc_id="relic:eng:ANCHOR",
            kind="relic",
            lang="eng",
            name="Anchor",
            path="/relics/anchor",
            subtitle="Common",
            text="Start each combat with 10 Block.",
        ),
        d(
            doc_id="relic:eng:FAKE",
            kind="relic",
            lang="eng",
            name="Fake Anchor",
            path="/relics/fake_anchor",
            subtitle="Event",
        ),
        d(
            doc_id="relic:eng:LAMENT",
            kind="relic",
            lang="eng",
            name="Neow's Lament",
            path="/relics/neows_lament",
            subtitle="Ancient",
        ),
        d(
            doc_id="relic:eng:BONES",
            kind="relic",
            lang="eng",
            name="Neow's Lament Bones",
            path="/relics/neows_bones",
            subtitle="Ancient",
        ),
        d(
            doc_id="card:eng:MELANCHOLY",
            kind="card",
            lang="eng",
            name="Melancholy",
            path="/cards/melancholy",
            subtitle="Skill",
        ),
        d(
            doc_id="card:eng:INNATE_CARD",
            kind="card",
            lang="eng",
            name="Writhe",
            path="/cards/writhe",
            subtitle="Curse",
            text="Innate. Unplayable.",
        ),
        d(
            doc_id="keyword:eng:INNATE",
            kind="keyword",
            lang="eng",
            name="Innate",
            path="/keywords/innate",
            text="Starts in your hand.",
        ),
        d(
            doc_id="relic:zhs:PAPERWEIGHT",
            kind="relic",
            lang="zhs",
            name="铅制镇纸",
            path="/relics/lead_paperweight",
            subtitle="先古遗物",
        ),
        d(
            doc_id="relic:eng:PAPERWEIGHT",
            kind="relic",
            lang="eng",
            name="Lead Paperweight",
            path="/relics/lead_paperweight",
            subtitle="Ancient",
        ),
        d(
            doc_id="card:deu:WACHTER",
            kind="card",
            lang="deu",
            name="Grabwächterin",
            path="/cards/grave_warden",
            subtitle="Fertigkeit",
        ),
        d(
            doc_id="page:/images",
            kind="page",
            lang="any",
            name="Images",
            path="/images",
            subtitle="/images",
            text="images image sprite asset art download",
        ),
        d(
            doc_id="page:/tier-list",
            kind="page",
            lang="any",
            name="Tier List",
            path="/tier-list",
            subtitle="/tier-list",
            text="tier list ranking best worst",
        ),
        d(
            doc_id="image:v1:relics:anchor.webp",
            kind="image",
            lang="any",
            name="anchor",
            path="https://cdn.example/game/v1/relics/anchor.webp",
            subtitle="Relic Renders (Main v1)",
            text="Relic Renders",
            thumb="https://cdn.example/game/v1/relics/anchor.webp",
        ),
        d(
            doc_id="image:v2:relics:anchor.webp",
            kind="image",
            lang="any",
            name="anchor",
            path="https://cdn.example/game/v2/relics/anchor.webp",
            subtitle="Relic Renders (Beta v2)",
            text="Relic Renders",
            thumb="https://cdn.example/game/v2/relics/anchor.webp",
        ),
        d(
            doc_id="image:v1:assets:ui/anchor.webp",
            kind="image",
            lang="any",
            name="anchor",
            path="https://cdn.example/game/v1/assets/ui/anchor.webp",
            subtitle="Game Assets (Main v1)",
            text="Game Assets ui",
            thumb="https://cdn.example/game/v1/assets/ui/anchor.webp",
        ),
        d(
            doc_id="news:1",
            kind="news",
            lang="any",
            name="Anchor patch notes",
            path="/news/1",
            subtitle="News",
        ),
    ]


class _Images:
    def __init__(self, docs, complete=True):
        self.docs = docs
        self.complete = complete

    def __iter__(self):
        return iter(self.docs)


def _install(monkeypatch, index_dir, docs=None, images_complete=True):
    docs = _docs() if docs is None else docs
    monkeypatch.setattr(search_index, "languages", lambda: ["eng", "zhs", "deu"])
    monkeypatch.setattr(
        search_index,
        "_entity_docs",
        lambda lang: iter(d for d in docs if d["lang"] == lang),
    )
    monkeypatch.setattr(
        search_index,
        "_shared_docs",
        lambda: iter(d for d in docs if d["lang"] == "any" and d["kind"] != "image"),
    )
    monkeypatch.setattr(
        search_index,
        "_ImageSource",
        lambda: _Images([d for d in docs if d["kind"] == "image"], images_complete),
    )
    monkeypatch.setattr(search_index, "source_fingerprint", lambda: "fp-1")
    reader = search_index._Reader(index_dir)
    monkeypatch.setattr(search_index, "_reader", reader)
    monkeypatch.setattr(search_index, "INDEX_DIR", index_dir)
    return reader


@pytest.fixture
def index(tmp_path, monkeypatch):
    index_dir = tmp_path / "idx"
    reader = _install(monkeypatch, index_dir)
    search_index.build(index_dir)
    reader.force_check()
    return index_dir


def _names(groups, label):
    for g in groups:
        if g["label"] == label:
            return [i["name"] for i in g["items"]]
    return []


def test_exact_name_outranks_partial_and_typos_still_hit(index):
    groups = search_index.grouped("anchor", "eng")
    assert _names(groups, "Relics") == ["Anchor", "Fake Anchor"]
    assert _names(search_index.grouped("ancho", "eng"), "Relics")[0] == "Anchor"
    assert _names(search_index.grouped("strke", "eng"), "Cards")[0] == "Strike"


def test_exact_boost_survives_punctuation_in_names(index):
    assert (
        _names(search_index.grouped("neow's lament", "eng"), "Relics")[0]
        == "Neow's Lament"
    )
    assert (
        _names(search_index.grouped("neows lament", "eng"), "Relics")[0]
        == "Neow's Lament"
    )


def test_prefix_substring_and_description_matches(index):
    assert _names(search_index.grouped("inna", "eng"), "Keywords") == ["Innate"]
    assert "Writhe" in _names(search_index.grouped("innate", "eng"), "Cards")
    assert "Strike" in _names(search_index.grouped("rike", "eng"), "Cards")


def test_language_scoping_and_cjk_substrings(index):
    assert _names(search_index.grouped("镇纸", "zhs"), "Relics") == ["铅制镇纸"]
    assert search_index.grouped("镇纸", "eng") == []
    assert _names(search_index.grouped("wächter", "deu"), "Cards") == ["Grabwächterin"]
    assert _names(search_index.grouped("paperweight", "zhs"), "Relics") == []


def test_pages_images_and_news_are_found_ordered_and_deduped(index):
    assert _names(search_index.grouped("images", "eng"), "Pages") == ["Images"]
    groups = search_index.grouped("anchor", "eng")
    labels = [g["label"] for g in groups]
    assert labels[0] == "Relics"
    assert labels.index("Images") > labels.index("Relics")
    assert labels.index("News") > labels.index("Images")
    images = next(g for g in groups if g["label"] == "Images")
    assert all(i["external"] and i["thumb"] for i in images["items"])
    assert [i["subtitle"] for i in images["items"]] == [
        "Relic Renders (Main v1)",
        "Game Assets (Main v1)",
    ]


def test_core_kinds_cannot_be_crowded_out_by_images(tmp_path, monkeypatch):
    flood = [
        search_index._doc(
            doc_id=f"image:v1:assets:anchor_{i}.webp",
            kind="image",
            lang="any",
            name="anchor",
            path=f"https://cdn.example/a{i}.webp",
            subtitle=f"Game Assets {i} (Main v1)",
            thumb="x",
        )
        for i in range(300)
    ]
    index_dir = tmp_path / "flood"
    reader = _install(monkeypatch, index_dir, docs=_docs() + flood)
    search_index.build(index_dir)
    reader.force_check()
    groups = search_index.grouped("anchor", "eng")
    assert [g["label"] for g in groups][:2] == ["Relics", "News"] or _names(
        groups, "Relics"
    ) == ["Anchor", "Fake Anchor"]
    assert len(next(g for g in groups if g["label"] == "Images")["items"]) == 5


def test_short_or_empty_queries(index):
    assert search_index.grouped("   ", "eng") == []
    assert search_index.grouped("!!", "eng") == []


def test_rebuild_publishes_a_new_generation_and_keeps_the_previous(index, monkeypatch):
    meta = search_index.read_meta(index)
    assert meta["docs"] == len(_docs())
    assert meta["images_complete"] is True
    first_gen = meta["dir"]
    monkeypatch.setattr(
        search_index,
        "_entity_docs",
        lambda lang: (
            iter(
                [
                    search_index._doc(
                        doc_id="card:eng:NEW",
                        kind="card",
                        lang="eng",
                        name="Brand New",
                        path="/cards/new",
                    )
                ]
            )
            if lang == "eng"
            else iter([])
        ),
    )
    monkeypatch.setattr(search_index, "source_fingerprint", lambda: "fp-2")
    assert search_index.ensure_built(index)["fingerprint"] == "fp-2"
    assert search_index.ensure_built(index)["fingerprint"] == "fp-2"
    assert search_index.read_meta(index)["dir"] != first_gen
    assert (index / search_index.GENERATIONS_DIR / os.path.basename(first_gen)).exists()
    search_index._reader.force_check()
    assert _names(search_index.grouped("brand", "eng"), "Cards") == ["Brand New"]
    assert search_index.grouped("strike", "eng") == []
    gens = list((index / search_index.GENERATIONS_DIR).iterdir())
    assert len(gens) == 2


def test_failed_build_keeps_the_live_generation(index, monkeypatch):
    live = search_index.read_meta(index)["dir"]

    def boom(lang):
        raise search_index.BuildError("loader down")
        yield

    monkeypatch.setattr(search_index, "_entity_docs", boom)
    monkeypatch.setattr(search_index, "source_fingerprint", lambda: "fp-broken")
    assert search_index.ensure_built(index) is None
    assert search_index.read_meta(index)["dir"] == live
    assert len(list((index / search_index.GENERATIONS_DIR).iterdir())) == 1
    search_index._reader.force_check()
    assert _names(search_index.grouped("anchor", "eng"), "Relics")[0] == "Anchor"


def test_concurrent_ensure_builds_once(index, monkeypatch):
    calls = []
    real_build = search_index.build

    def counted(index_dir, **kw):
        calls.append(1)
        return real_build(index_dir, **kw)

    monkeypatch.setattr(search_index, "build", counted)
    monkeypatch.setattr(search_index, "source_fingerprint", lambda: "fp-3")
    threads = [
        threading.Thread(target=search_index.ensure_built, args=(index,))
        for _ in range(4)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert calls == [1]


def test_image_retry_waiters_rebuild_once(tmp_path, monkeypatch):
    index_dir = tmp_path / "retry"
    _install(monkeypatch, index_dir, images_complete=False)
    assert search_index.build(index_dir)["images_complete"] is False
    monkeypatch.setattr(
        search_index,
        "_ImageSource",
        lambda: _Images([d for d in _docs() if d["kind"] == "image"], True),
    )
    calls = []
    real_build = search_index.build

    def counted(index_dir, **kw):
        calls.append(1)
        return real_build(index_dir, **kw)

    monkeypatch.setattr(search_index, "build", counted)
    threads = [
        threading.Thread(
            target=search_index.ensure_built,
            args=(index_dir,),
            kwargs={"require_images": True},
        )
        for _ in range(4)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert calls == [1]
    assert search_index.read_meta(index_dir)["images_complete"] is True
    assert (
        search_index.ensure_built(index_dir, require_images=True)["images_complete"]
        is True
    )
    assert calls == [1]


def test_build_without_images_is_not_marked_complete(tmp_path, monkeypatch):
    index_dir = tmp_path / "noimg"
    _install(monkeypatch, index_dir)
    meta = search_index.build(index_dir, with_images=False)
    assert meta["images_complete"] is False
    assert meta["counts"].get("image", 0) == 0


def test_fingerprint_detects_same_size_write_within_one_second(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    lang_dir = data_dir / "eng"
    lang_dir.mkdir(parents=True)
    cards = lang_dir / "cards.json"
    monkeypatch.setattr(data_service, "DATA_DIR", data_dir)
    monkeypatch.setattr(mechanics_pages, "_pages_dir", lambda: tmp_path / "mechanics")
    stamp = 1_700_000_000_100_000_000
    cards.write_text("[]", encoding="utf-8")
    os.utime(cards, ns=(stamp, stamp))
    before = search_index.source_fingerprint()
    cards.write_text("{}", encoding="utf-8")
    os.utime(cards, ns=(stamp + 1, stamp + 1))
    assert search_index.source_fingerprint() != before


def test_tokens_fold_accents_and_case():
    assert search_index.tokens("Grabwächterin's  BLOCK") == [
        "grabwachterin",
        "s",
        "block",
    ]
    assert search_index.grams("anchor") == ["anc", "nch", "cho", "hor"]
    assert search_index.grams("a") == []


def test_site_pages_reads_the_generated_inventory():
    pages = search_index.site_pages()
    paths = {p["path"] for p in pages}
    assert "/images" in paths and "/tier-list" in paths
    images = next(p for p in pages if p["path"] == "/images")
    assert "sprite" in images["keywords"]


def test_router_serves_the_index_and_falls_back_without_one(index, monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    body = client.get("/api/search", params={"q": "ancho", "lang": "eng"}).json()
    assert body["engine"] == "index"
    assert body["categories"][0]["label"] == "Relics"
    assert body["categories"][0]["items"][0]["path"] == "/relics/anchor"
    monkeypatch.setattr(search_index, "grouped", lambda q, lang: None)
    monkeypatch.setattr(
        search_router,
        "_legacy_categories",
        lambda q, lang: [
            {"label": "Cards", "items": [{"name": q, "path": "/x", "subtitle": ""}]}
        ],
    )
    r = client.get("/api/search", params={"q": "ancho", "lang": "eng"})
    assert r.json()["engine"] == "legacy"
    assert r.headers["cache-control"] == "no-store"
    assert client.get("/api/search", params={"q": "a"}).json() == {
        "query": "a",
        "categories": [],
        "engine": "none",
    }


def test_router_falls_back_when_the_index_query_raises(index, monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)

    def boom(q, lang):
        raise RuntimeError("corrupt segment")

    monkeypatch.setattr(search_index, "grouped", boom)
    monkeypatch.setattr(
        search_router,
        "_legacy_categories",
        lambda q, lang: [
            {
                "label": "Cards",
                "items": [{"name": "Strike", "path": "/cards/strike", "subtitle": ""}],
            }
        ],
    )
    r = client.get("/api/search", params={"q": "strike", "lang": "eng"})
    assert r.status_code == 200
    assert r.json()["engine"] == "legacy"
    assert r.headers["cache-control"] == "no-store"


def test_legacy_scan_covers_pages_and_images(monkeypatch):
    from app.routers import images

    monkeypatch.setattr(images, "_game_dumps", lambda: (("v9.9.9", "beta"),))
    monkeypatch.setattr(images, "_game_manifest", lambda v: {"relics": ["anchor.webp"]})
    cats = search_router._legacy_categories("anchor", "eng")
    by_label = {c["label"]: c["items"] for c in cats}
    assert by_label["Images"][0]["name"] == "anchor"
    assert by_label["Images"][0]["external"] is True
    cats = search_router._legacy_categories("images", "eng")
    assert [i["path"] for i in {c["label"]: c["items"] for c in cats}["Pages"]] == [
        "/images"
    ]


def test_router_appends_semantic_matches_for_long_queries(index, monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(
        search_router,
        "_semantic_items",
        lambda q, limit: [
            {"name": "Anchor", "path": "/relics/anchor", "subtitle": "Relic"},
            {"name": "Bag of Prep", "path": "/relics/bag", "subtitle": "Relic"},
        ],
    )
    body = client.get(
        "/api/search", params={"q": "start with block", "lang": "eng"}
    ).json()
    best = next(c for c in body["categories"] if c["label"] == "Best matches")
    assert [i["name"] for i in best["items"]] == ["Bag of Prep"]
    body = client.get("/api/search", params={"q": "anchor", "lang": "eng"}).json()
    assert all(c["label"] != "Best matches" for c in body["categories"])


def test_meta_lives_in_the_generation_dir(index):
    gen = search_index.current_dir(index)
    assert gen is not None
    assert (
        json.loads((gen / search_index.META_NAME).read_text())["schema"]
        == search_index.SCHEMA_VERSION
    )
    assert search_index.read_meta(index.with_name("nothing")) is None
