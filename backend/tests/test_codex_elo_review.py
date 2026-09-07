"""Cases contributed by the review of the Elo prior (kept verbatim)."""

import math

import pytest

from app.services import run_entity_stats as res


def _skip_missing_numpy(backend: str) -> None:
    if backend == "numpy":
        pytest.importorskip("numpy")


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_regularized_fit_satisfies_bt_score_equations(backend):
    _skip_missing_numpy(backend)
    pairs = {
        ("A", "B"): 100,
        ("A", "C"): 100,
    }

    _, strengths = res._compute_codex_elo(pairs, backend=backend)

    prior_games = res._ELO_PRIOR_GAMES
    observed = {card: prior_games / 2.0 for card in strengths}
    expected = {
        card: prior_games * strength / (strength + 1.0)
        for card, strength in strengths.items()
    }

    for (winner, loser), count in pairs.items():
        winner_strength = strengths[winner]
        loser_strength = strengths[loser]
        total_strength = winner_strength + loser_strength

        observed[winner] += count
        expected[winner] += count * winner_strength / total_strength
        expected[loser] += count * loser_strength / total_strength

    assert set(strengths) == {"A", "B", "C"}
    for card in strengths:
        assert observed[card] == pytest.approx(
            expected[card],
            rel=0,
            abs=5e-4,
        )


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_disconnected_neutral_component_does_not_change_other_ratings(backend):
    _skip_missing_numpy(backend)
    base = {
        ("A", "B"): 100,
        ("A", "C"): 100,
    }
    expanded = {
        **base,
        ("X", "Y"): 40,
        ("Y", "X"): 40,
    }

    base_elo, _ = res._compute_codex_elo(base, backend=backend)
    expanded_elo, _ = res._compute_codex_elo(expanded, backend=backend)

    for card in ("A", "B", "C"):
        assert expanded_elo[card] == pytest.approx(
            base_elo[card],
            abs=0.1,
        )

    assert expanded_elo["X"] == res._ELO_ANCHOR
    assert expanded_elo["Y"] == res._ELO_ANCHOR


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_twenty_game_prior_has_expected_effect_at_rating_threshold(backend):
    _skip_missing_numpy(backend)
    pairs = {("A", "B"): 20}

    elo, strengths = res._compute_codex_elo(pairs, backend=backend)

    # With 20 real A-over-B results and 10/10 virtual results per card,
    # symmetry gives p_B = 1 / p_A and:
    # p_A**3 - p_A**2 - p_A - 3 = 0.
    expected_a = 2.130395
    assert strengths["A"] == pytest.approx(expected_a, rel=2e-4)
    assert strengths["B"] == pytest.approx(1.0 / expected_a, rel=2e-4)
    assert elo == {
        "A": 1631.4,
        "B": 1368.6,
    }


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_huge_undefeated_sample_converges_to_finite_regularized_mode(backend):
    _skip_missing_numpy(backend)
    count = 10**12
    pairs = {("A", "B"): count}

    elo, strengths = res._compute_codex_elo(pairs, backend=backend)

    assert all(math.isfinite(value) for value in strengths.values())
    assert strengths["A"] * strengths["B"] == pytest.approx(
        1.0,
        rel=2e-5,
    )

    expected_b_wins = count * strengths["B"] / (
        strengths["A"] + strengths["B"]
    ) + res._ELO_PRIOR_GAMES * strengths["B"] / (strengths["B"] + 1.0)
    assert expected_b_wins == pytest.approx(
        res._ELO_PRIOR_GAMES / 2.0,
        abs=5e-4,
    )
    assert elo["A"] == pytest.approx(3700.0, abs=0.1)
    assert elo["B"] == pytest.approx(-700.0, abs=0.1)


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_nonfinite_warm_start_values_are_ignored(backend):
    _skip_missing_numpy(backend)
    pairs = {
        ("A", "B"): 80,
        ("A", "C"): 30,
        ("B", "A"): 5,
        ("C", "A"): 10,
        ("B", "C"): 20,
        ("C", "B"): 20,
    }

    cold_elo, cold_strengths = res._compute_codex_elo(
        pairs,
        backend=backend,
    )
    poisoned_warm = {card: float("inf") for card in cold_strengths}

    warm_elo, warm_strengths = res._compute_codex_elo(
        pairs,
        warm=poisoned_warm,
        backend=backend,
    )

    assert warm_elo == cold_elo
    assert all(math.isfinite(value) for value in warm_strengths.values())


def test_invalid_backend_is_rejected():
    with pytest.raises(ValueError, match="backend"):
        res._compute_codex_elo(
            {("A", "B"): 20},
            backend="numppy",
        )


@pytest.mark.parametrize("backend", ["python", "numpy"])
def test_all_zero_pair_counts_produce_no_ratings(backend):
    _skip_missing_numpy(backend)
    elo, strengths = res._compute_codex_elo(
        {
            ("A", "B"): 0,
            ("B", "A"): 0,
        },
        backend=backend,
    )

    assert elo == {}
    assert strengths == {}
