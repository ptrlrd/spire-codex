"""The rest-site option parser reads every concrete RestSiteOption class
and fails loudly on one it cannot map."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

import rest_site_parser  # noqa: E402

BASE = (
    "public abstract class RestSiteOption\n{\n"
    "\tpublic abstract string OptionId { get; }\n}\n"
)


def _write(src: Path, name: str, body: str) -> None:
    (src / name).write_text(body, encoding="utf-8")


def test_parses_every_concrete_option(tmp_path):
    _write(tmp_path, "RestSiteOption.cs", BASE)
    _write(
        tmp_path,
        "SmithRestSiteOption.cs",
        "public sealed class SmithRestSiteOption : RestSiteOption\n{\n"
        '\tpublic override string OptionId => "SMITH";\n}\n',
    )
    _write(
        tmp_path,
        "HealRestSiteOption.cs",
        "public sealed class HealRestSiteOption : RestSiteOption\n{\n"
        '\tpublic override string OptionId => "HEAL";\n}\n',
    )
    assert rest_site_parser.parse_option_ids(tmp_path) == ["HEAL", "SMITH"]


def test_unmapped_option_class_fails(tmp_path):
    _write(tmp_path, "RestSiteOption.cs", BASE)
    _write(
        tmp_path,
        "StokeRestSiteOption.cs",
        "public sealed class StokeRestSiteOption : RestSiteOption\n{\n}\n",
    )
    with pytest.raises(RuntimeError, match="StokeRestSiteOption.cs"):
        rest_site_parser.parse_option_ids(tmp_path)


def test_real_catalog_matches_the_game():
    src = rest_site_parser.REST_SITE_DIR
    if not src.is_dir():
        pytest.skip("no decompiled game sources checked out")
    ids = rest_site_parser.parse_option_ids(src)
    assert {"SMITH", "HEAL", "DIG", "MEND"} <= set(ids)
