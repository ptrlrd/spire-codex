"""The site search index: typo and prefix tolerance, exact-name ranking,
language scoping, page and image documents, grouped output, atomic rebuilds
under the file lock, and the router's fallback while no index exists."""

import json
import threading

import pytest
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.routers import search as search_router
from app.services import search_index

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


@pytest.fixture
def index(tmp_path, monkeypatch):
    index_dir = tmp_path / "idx"
    monkeypatch.setattr(search_index, "languages", lambda: ["eng", "zhs", "deu"])
    monkeypatch.setattr(
        search_index,
        "_entity_docs",
        lambda lang: iter(d for d in _docs() if d["lang"] == lang),
    )
    monkeypatch.setattr(
        search_index,
        "_shared_docs",
        lambda: iter(d for d in _docs() if d["lang"] == "any" and d["kind"] != "image"),
    )
    monkeypatch.setattr(
        search_index,
        "_image_docs",
        lambda: ([d for d in _docs() if d["kind"] == "image"], True),
    )
    monkeypatch.setattr(search_index, "source_fingerprint", lambda: "fp-1")
    reader = search_index._Reader(index_dir)
    monkeypatch.setattr(search_index, "_reader", reader)
    monkeypatch.setattr(search_index, "INDEX_DIR", index_dir)
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


def test_prefix_and_description_matches(index):
    groups = search_index.grouped("inna", "eng")
    assert _names(groups, "Keywords") == ["Innate"]
    assert "Writhe" in _names(search_index.grouped("innate", "eng"), "Cards")


def test_language_scoping_and_cjk_substrings(index):
    assert _names(search_index.grouped("镇纸", "zhs"), "Relics") == ["铅制镇纸"]
    assert search_index.grouped("镇纸", "eng") == []
    assert _names(search_index.grouped("wächter", "deu"), "Cards") == ["Grabwächterin"]
    assert _names(search_index.grouped("paperweight", "zhs"), "Relics") == []


def test_pages_images_and_news_are_found_and_ordered(index):
    groups = search_index.grouped("images", "eng")
    assert _names(groups, "Pages") == ["Images"]
    groups = search_index.grouped("anchor", "eng")
    labels = [g["label"] for g in groups]
    assert labels[0] == "Relics"
    assert labels.index("Images") > labels.index("Relics")
    assert labels.index("News") > labels.index("Images")
    images = next(g for g in groups if g["label"] == "Images")
    assert all(i["external"] and i["thumb"] for i in images["items"])
    assert len(images["items"]) == 2


def test_short_or_empty_queries(index):
    assert search_index.grouped("   ", "eng") == []
    assert search_index.grouped("!!", "eng") == []


def test_rebuild_swaps_atomically_and_reopens(index, monkeypatch):
    meta = search_index.read_meta(index)
    assert meta["docs"] == len(_docs())
    assert meta["images_complete"] is True
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
    assert not index.with_name(index.name + ".build").exists()
    assert not index.with_name(index.name + ".old").exists()
    search_index._reader.force_check()
    assert _names(search_index.grouped("brand", "eng"), "Cards") == ["Brand New"]
    assert search_index.grouped("strike", "eng") == []


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


def test_meta_survives_alongside_tantivy_files(index):
    assert (index / search_index.META_NAME).exists()
    assert (
        json.loads((index / search_index.META_NAME).read_text())["schema"]
        == search_index.SCHEMA_VERSION
    )
