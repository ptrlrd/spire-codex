"""Beta-only cards and relics are in the run vector vocabulary."""

from app.services import data_service, run_vectors


def test_vocab_has_beta_only_cards():
    beta_only = data_service.beta_only_ids("cards")
    assert beta_only
    vocab = set(run_vectors._build_vocab())
    assert {i.upper() for i in beta_only} <= vocab
    assert data_service.get_channel() == "stable"


def test_beta_starters_are_not_draftable(monkeypatch):
    monkeypatch.setattr(run_vectors, "_nondraftable_cache", None)
    beta_only = data_service.beta_only_ids("cards")
    basics = {
        str(c["id"]).upper()
        for c in run_vectors.full_catalog("cards")
        if c.get("rarity_key") == "Basic" and c["id"] in beta_only
    }
    assert basics and basics <= run_vectors._nondraftable()
