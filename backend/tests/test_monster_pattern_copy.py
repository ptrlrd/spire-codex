"""The random attack-pattern shape reads as sentences a player can act on."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

from monster_parser import _build_pattern_description  # noqa: E402

NAMES = {
    "CLAW": "Claw",
    "RIP_AND_TEAR": "Rip and Tear",
    "ROAR": "Roar",
    "HEADBUTT": "Headbutt",
    "SWIPE_RANDOM": "Swipe Random",
    "ILLUSORY_SPORES": "Illusory Spores",
}


def _name(mid):
    return NAMES.get(mid, mid)


def test_mawler_reads_the_way_it_plays():
    states = {
        "moveState": {
            "type": "move",
            "id": "RIP_AND_TEAR_MOVE",
            "follow_up": "randomBranchState",
        },
        "moveState2": {
            "type": "move",
            "id": "ROAR_MOVE",
            "follow_up": "randomBranchState",
        },
        "moveState3": {
            "type": "move",
            "id": "CLAW_MOVE",
            "follow_up": "randomBranchState",
        },
        "randomBranchState": {
            "type": "random",
            "id": "RAND",
            "branches": [
                {
                    "move_id": "RIP_AND_TEAR_MOVE",
                    "weight": 1.0,
                    "repeat": "CannotRepeat",
                },
                {"move_id": "ROAR_MOVE", "weight": 1.0, "repeat": "UseOnlyOnce"},
                {"move_id": "CLAW_MOVE", "weight": 1.0, "repeat": "CannotRepeat"},
            ],
        },
    }
    assert _build_pattern_description(states, "moveState3", _name) == (
        "Opens with Claw. "
        "Every turn after that is an even random pick between Rip and Tear, Roar, and Claw. "
        "Rip and Tear and Claw never repeat back to back. "
        "Roar happens once per fight. "
        "Once Roar is spent, the rest of the fight alternates Claw and Rip and Tear."
    )


def test_weighted_pick_states_the_odds():
    states = {
        "opening": {"type": "move", "id": "ILLUSORY_SPORES_MOVE", "follow_up": "rand"},
        "rand": {
            "type": "random",
            "id": "RAND",
            "branches": [
                {
                    "move_id": "SWIPE_RANDOM_MOVE",
                    "weight": 2.0,
                    "repeat": "CannotRepeat",
                },
                {"move_id": "HEADBUTT_MOVE", "weight": 3.0, "repeat": "CannotRepeat"},
            ],
        },
    }
    assert _build_pattern_description(states, "opening", _name) == (
        "Opens with Illusory Spores. "
        "Every turn after that it picks Swipe Random 40 percent of the time or Headbutt 60 percent of the time. "
        "An attack never repeats back to back."
    )
