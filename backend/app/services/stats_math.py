"""Small shared statistics helpers for the stats tables: Wilson intervals
on win rates and the lift metric (observed wins minus each player's own
expected wins, in percentage points)."""

import math

LIFT_MIN_SEATS = 20
_Z95 = 1.959963984540054


def wilson_interval(wins: int, n: int, z: float = _Z95) -> list[float] | None:
    """95% Wilson score interval for wins/n as [lo, hi] in percent with one
    decimal; None when there are no trials."""
    if n <= 0:
        return None
    phat = wins / n
    denom = 1 + z * z / n
    centre = phat + z * z / (2 * n)
    half = z * math.sqrt(phat * (1 - phat) / n + z * z / (4 * n * n))
    lo = (centre - half) / denom
    hi = (centre + half) / denom
    return [round(max(0.0, lo) * 100, 1), round(min(1.0, hi) * 100, 1)]


def lift_of(n_exp: int, wins_exp: int, exp_sum: float) -> float | None:
    """Average of (won minus the player's expected win rate) over the seats
    with a known expectation, in percentage points; None below the sample
    floor."""
    if n_exp < LIFT_MIN_SEATS:
        return None
    return round((wins_exp - exp_sum) / n_exp * 100, 1)


def padded_counts(counts, width: int) -> list:
    """A cube counts row widened with zeros so readers written for the
    five-number shape also accept the older two-number rows."""
    out = list(counts[:width]) if counts else []
    out.extend([0] * (width - len(out)))
    return out
