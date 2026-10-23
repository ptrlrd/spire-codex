"""The pack generator nests dotted game keys for next-intl and refuses
shapes it cannot represent."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

from localization_parser import renest_messages  # noqa: E402


def test_dotted_keys_nest_and_leaf_namespace_clash_uses_the_filler():
    out = renest_messages(
        {"X.title": "A", "X.title.short": "a", "Y": "plain", "Z.a.b": "deep"}
    )
    assert out == {
        "X": {"title": {"!": "A", "short": "a"}},
        "Y": "plain",
        "Z": {"a": {"b": "deep"}},
    }


def test_true_collision_raises_instead_of_recursing():
    with pytest.raises(ValueError, match="collision"):
        renest_messages({"X": "a", "X.!": "b"})
