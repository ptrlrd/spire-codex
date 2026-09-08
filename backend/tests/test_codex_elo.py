"""Codex Elo is a Bradley-Terry fit over reward-screen picks. These pin the
Bayesian prior: thin samples shrink toward the anchor, big samples don't
care, and the numpy and pure-Python paths agree."""

import pytest

from app.services import run_entity_stats as res

ANCHOR = res._ELO_ANCHOR


def _big_field(
    n_wins: int,
    n_losses: int,
    card: str = "CARD",
    field: tuple[str, ...] = ("A", "B", "C"),
) -> dict:
    pairs: dict = {}
    for f in field:
        pairs[(card, f)] = n_wins
        pairs[(f, card)] = n_losses
        for g in field:
            if f != g:
                pairs[(f, g)] = 400
    return pairs


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_thin_undefeated_card_stays_near_the_anchor(backend):
    pairs = _big_field(n_wins=10, n_losses=0)
    elo, _ = res._compute_codex_elo(pairs, backend=backend)
    assert elo["CARD"] > ANCHOR
    assert elo["CARD"] < ANCHOR + res._ELO_SPREAD


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_undefeated_with_many_games_outranks_undefeated_with_few(backend):
    thin = res._compute_codex_elo(_big_field(10, 0), backend=backend)[0]["CARD"]
    thick = res._compute_codex_elo(_big_field(2000, 100), backend=backend)[0]["CARD"]
    assert thick > thin + 100


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_big_samples_are_barely_moved_by_the_prior(backend, monkeypatch):
    pairs = _big_field(n_wins=3000, n_losses=1000)
    with_prior = res._compute_codex_elo(pairs, backend=backend)[0]["CARD"]
    monkeypatch.setattr(res, "_ELO_PRIOR_GAMES", 0.0)
    without = res._compute_codex_elo(pairs, backend=backend)[0]["CARD"]
    assert abs(with_prior - without) < 3


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_equal_records_get_equal_ratings_and_a_loser_sits_below_anchor(backend):
    pairs = {
        ("X", "Y"): 50,
        ("Y", "X"): 50,
        ("Z", "X"): 0,
        ("X", "Z"): 60,
        ("Z", "Y"): 0,
        ("Y", "Z"): 60,
    }
    elo, _ = res._compute_codex_elo(pairs, backend=backend)
    assert elo["X"] == elo["Y"]
    assert elo["Z"] < ANCHOR
    assert elo["X"] > ANCHOR


def test_numpy_and_python_paths_agree():
    pairs = _big_field(n_wins=37, n_losses=9)
    pairs[("D", "A")] = 15
    pairs[("A", "D")] = 25
    a = res._compute_codex_elo(pairs, backend="numpy")[0]
    b = res._compute_codex_elo(pairs, backend="python")[0]
    assert a.keys() == b.keys()
    for k in a:
        assert abs(a[k] - b[k]) <= 0.2


def test_min_games_still_drops_unrated_cards():
    pairs = _big_field(n_wins=3, n_losses=1)
    elo, strengths = res._compute_codex_elo(pairs)
    assert "CARD" not in elo
    assert "CARD" in strengths
