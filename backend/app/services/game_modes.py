"""The modes a run can be played in, read from one place so the API
validators, the stats mode brackets and the profile breakdowns agree.

Standard is the ladder. Every other mode is its own pool, the way the daily
climb always was: it has its own bracket and filter, and nothing files it
under standard."""

STANDARD = "standard"
GAME_MODES = ("standard", "daily", "custom", "blitz", "dread")
SEPARATE_MODES = tuple(m for m in GAME_MODES if m != STANDARD)

_KNOWN = frozenset(GAME_MODES)


def normalize_game_mode(value) -> str:
    """A run's stored mode in its canonical spelling; a missing mode is a
    standard run, which is how runs were stored before modes existed."""
    return str(value or STANDARD).strip().lower() or STANDARD


def is_game_mode(value) -> bool:
    return value in _KNOWN


def is_game_mode_filter(value) -> bool:
    """True for a ?game_mode= value an endpoint may act on: unset, or one of
    the known modes."""
    return value in (None, "") or value in _KNOWN
