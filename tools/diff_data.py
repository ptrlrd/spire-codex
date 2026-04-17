#!/usr/bin/env python3
"""
Compare two versions of Spire Codex data and generate a changelog.

Usage:
  # Compare current data against a git tag/commit:
  python3 diff_data.py v0.9.1

  # Compare two git refs:
  python3 diff_data.py v0.9.1 v0.9.2

  # Compare two directories:
  python3 diff_data.py /path/to/old/data /path/to/new/data

  # Output as markdown:
  python3 diff_data.py v0.9.1 --format md > changelog.md

  # Save as JSON changelog for a game update:
  python3 diff_data.py v0.9.1 --format json \\
      --game-version "0.98.2" --build-id "22238966" \\
      --date "2026-03-09" --title "March Update"

Options:
  --game-version    The game's version string from Steam (e.g. "0.98.2")
  --build-id        Steam build ID (e.g. "22238966") — changes with each depot update
  --date            Date of the update (defaults to today)
  --title           Human-readable title for this changelog entry
  --data-dir        Data directory to diff (default: "data") — use "data-beta" for beta
  --output-dir      Where to save JSON changelogs (default: {data-dir}/changelogs)
  --beta            Shortcut for --data-dir data-beta --output-dir data-beta/changelogs

  The Steam App ID for Slay the Spire 2 is 2868840 (hardcoded).
  Build IDs can be found on SteamDB or via Steam's app info API.

Behaviour notes:
  - Field-level diffs RECURSE into nested dicts and lists. A `vars` change
    becomes individual rows like `vars.DamageVar: 8 -> 10` instead of
    opaque `vars: 2 fields -> 2 fields`. List items with stable `id` fields
    are matched by id (so `moves[BEAM_MOVE]` not `moves[2]`).
  - Hand-curated `features` / `fixes` / `api_changes` arrays are PRESERVED
    when regenerating an existing changelog at the same tag. The data-diff
    portion (`categories`, `summary`) is overwritten on regen, but the
    release notes someone wrote on top survive the merge.
  - data/changelogs/ is write-once at PR time — see
    .github/workflows/changelog-guard.yml. Editing an existing changelog
    requires the `changelog-edit-approved` label on the PR.
"""
import json
import sys
import subprocess
import tempfile
import shutil
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path(__file__).resolve().parent.parent

# Slay the Spire 2 Steam App ID (fixed)
STEAM_APP_ID = 2868840

# Fields to ignore when diffing (noise / internal)
IGNORE_FIELDS = {"image_url", "beta_image_url", "sort_order", "era_position"}

# Human-readable category names
CATEGORY_NAMES = {
    "cards": "Cards",
    "characters": "Characters",
    "relics": "Relics",
    "monsters": "Monsters",
    "potions": "Potions",
    "enchantments": "Enchantments",
    "encounters": "Encounters",
    "events": "Events",
    "powers": "Powers",
    "keywords": "Keywords",
    "intents": "Intents",
    "orbs": "Orbs",
    "afflictions": "Afflictions",
    "modifiers": "Modifiers",
    "achievements": "Achievements",
    "epochs": "Epochs",
    "stories": "Stories",
}

# Key fields to show in "changed" summaries (beyond just the id)
DISPLAY_FIELDS = {
    "cards": ["name", "cost", "damage", "block", "type", "rarity"],
    "relics": ["name", "rarity"],
    "monsters": ["name", "min_hp", "max_hp"],
    "potions": ["name", "rarity"],
    "powers": ["name", "type"],
    "enchantments": ["name"],
    "encounters": ["name", "act"],
    "events": ["name", "type"],
    "epochs": ["title", "era"],
}


def load_json_file(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_git_data(ref: str, tmp_dir: Path, data_dir: str = "data") -> Path:
    """Extract data files from a git ref into a temp directory."""
    out = tmp_dir / ref.replace("/", "_")
    out.mkdir(parents=True, exist_ok=True)
    # List data files at that ref
    git_data_path = f"{data_dir}/eng/"
    result = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", ref, git_data_path],
        capture_output=True, text=True, cwd=BASE_DIR
    )
    if result.returncode != 0:
        print(f"Error: Could not read git ref '{ref}': {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    for line in result.stdout.strip().split("\n"):
        if not line.endswith(".json"):
            continue
        fname = Path(line).name
        content = subprocess.run(
            ["git", "show", f"{ref}:{line}"],
            capture_output=True, text=True, cwd=BASE_DIR
        )
        if content.returncode == 0:
            (out / fname).write_text(content.stdout, encoding="utf-8")
    return out


def _deep_diff(prefix: str, old, new):
    """Yield (field_path, old_val, new_val) tuples for changed leaves.

    Recurses into dicts and lists so a nested field change becomes its own
    row in the changelog (e.g. `vars.DamageVar: 8 -> 10`) instead of an
    opaque `vars: 2 fields -> 2 fields`. List items with stable `id`
    fields are matched by id; otherwise by index.
    """
    if old == new:
        return
    # Recurse into dicts even when one side is None so e.g. a moves entry
    # added to a monster shows up as `moves[GRASP].damage` rather than the
    # opaque `moves[GRASP]: none -> 5 fields`.
    if isinstance(old, dict) or isinstance(new, dict):
        old_d = old if isinstance(old, dict) else {}
        new_d = new if isinstance(new, dict) else {}
        # Mismatched non-None types (e.g. string -> dict): leaf-level change.
        if (old is not None and not isinstance(old, dict)) or (
            new is not None and not isinstance(new, dict)
        ):
            yield (prefix, old, new)
            return
        all_keys = set(old_d.keys()) | set(new_d.keys())
        for k in sorted(all_keys, key=str):
            sub = f"{prefix}.{k}" if prefix else k
            yield from _deep_diff(sub, old_d.get(k), new_d.get(k))
        return
    if isinstance(old, list) or isinstance(new, list):
        old_l = old if isinstance(old, list) else []
        new_l = new if isinstance(new, list) else []
        if (old is not None and not isinstance(old, list)) or (
            new is not None and not isinstance(new, list)
        ):
            yield (prefix, old, new)
            return
        # Match by id when every element has one — otherwise positional.
        keyed = (
            (old_l or new_l)
            and all(isinstance(x, dict) and "id" in x for x in old_l)
            and all(isinstance(x, dict) and "id" in x for x in new_l)
        )
        if keyed:
            old_by = {x["id"]: x for x in old_l}
            new_by = {x["id"]: x for x in new_l}
            for i in sorted(set(old_by) | set(new_by), key=str):
                sub = f"{prefix}[{i}]"
                yield from _deep_diff(sub, old_by.get(i), new_by.get(i))
        else:
            for i in range(max(len(old_l), len(new_l))):
                sub = f"{prefix}[{i}]"
                ov = old_l[i] if i < len(old_l) else None
                nv = new_l[i] if i < len(new_l) else None
                yield from _deep_diff(sub, ov, nv)
        return
    yield (prefix, old, new)


def diff_entity(old: dict, new: dict) -> dict[str, tuple]:
    """Return changed fields between two entities, recursing into nested data."""
    changes = {}
    for path, old_val, new_val in _deep_diff("", old, new):
        # Skip noise: ignored top-level fields
        top = path.split(".", 1)[0].split("[", 1)[0]
        if top in IGNORE_FIELDS:
            continue
        changes[path] = (old_val, new_val)
    return changes


def diff_category(old_data: list[dict], new_data: list[dict]) -> dict:
    """Diff a single category and return added/removed/changed."""
    old_map = {e["id"]: e for e in old_data}
    new_map = {e["id"]: e for e in new_data}

    old_ids = set(old_map.keys())
    new_ids = set(new_map.keys())

    added = sorted(new_ids - old_ids)
    removed = sorted(old_ids - new_ids)

    changed = {}
    for eid in sorted(old_ids & new_ids):
        field_changes = diff_entity(old_map[eid], new_map[eid])
        if field_changes:
            changed[eid] = {
                "name": new_map[eid].get("name") or new_map[eid].get("title", eid),
                "changes": field_changes,
            }

    return {
        "added": [(eid, new_map[eid]) for eid in added],
        "removed": [(eid, old_map[eid]) for eid in removed],
        "changed": changed,
        "old_count": len(old_data),
        "new_count": len(new_data),
    }


def format_value(val) -> str:
    """Format a value for display.

    Leaves (scalars) render as-is. Small collections render their contents
    inline so the changelog actually says what changed instead of opaque
    "N fields" / "N items"; only falls back to a count when the rendered
    string would be unreadably long.
    """
    if val is None:
        return "none"
    if isinstance(val, bool):
        return "yes" if val else "no"
    if isinstance(val, list):
        if len(val) == 0:
            return "[]"
        rendered = ", ".join(str(v) for v in val)
        if len(rendered) <= 100:
            return rendered
        return f"{len(val)} items"
    if isinstance(val, dict):
        if not val:
            return "{}"
        rendered = ", ".join(f"{k}={v}" for k, v in val.items())
        if len(rendered) <= 100:
            return rendered
        return f"{len(val)} fields"
    if isinstance(val, str) and len(val) > 80:
        return val[:77] + "..."
    return str(val)


def entity_name(entity: dict) -> str:
    return entity.get("name") or entity.get("title") or entity.get("id", "?")


def print_text(results: dict, old_label: str, new_label: str):
    """Print changelog in plain text."""
    print(f"Spire Codex Data Changelog")
    print(f"  {old_label}  →  {new_label}")
    print(f"{'=' * 60}\n")

    total_added = total_removed = total_changed = 0

    for cat_key, cat_name in CATEGORY_NAMES.items():
        if cat_key not in results:
            continue
        diff = results[cat_key]
        n_added = len(diff["added"])
        n_removed = len(diff["removed"])
        n_changed = len(diff["changed"])
        if n_added == 0 and n_removed == 0 and n_changed == 0:
            continue

        total_added += n_added
        total_removed += n_removed
        total_changed += n_changed

        count_change = ""
        if diff["old_count"] != diff["new_count"]:
            count_change = f"  ({diff['old_count']} → {diff['new_count']})"
        print(f"── {cat_name}{count_change} ──")

        if diff["added"]:
            print(f"  + Added ({n_added}):")
            for eid, entity in diff["added"]:
                extras = []
                for field in DISPLAY_FIELDS.get(cat_key, []):
                    val = entity.get(field)
                    if val is not None:
                        extras.append(f"{field}={format_value(val)}")
                extra_str = f"  ({', '.join(extras)})" if extras else ""
                print(f"    + {entity_name(entity)}{extra_str}")

        if diff["removed"]:
            print(f"  - Removed ({n_removed}):")
            for eid, entity in diff["removed"]:
                print(f"    - {entity_name(entity)}")

        if diff["changed"]:
            print(f"  ~ Changed ({n_changed}):")
            for eid, info in diff["changed"].items():
                changes = info["changes"]
                print(f"    ~ {info['name']}:")
                for field, (old_val, new_val) in changes.items():
                    print(f"        {field}: {format_value(old_val)} → {format_value(new_val)}")

        print()

    print(f"{'=' * 60}")
    print(f"Summary: +{total_added} added, -{total_removed} removed, ~{total_changed} changed")


def print_markdown(results: dict, old_label: str, new_label: str):
    """Print changelog in markdown."""
    print(f"# Spire Codex Changelog")
    print(f"**{old_label}** → **{new_label}**\n")

    total_added = total_removed = total_changed = 0

    for cat_key, cat_name in CATEGORY_NAMES.items():
        if cat_key not in results:
            continue
        diff = results[cat_key]
        n_added = len(diff["added"])
        n_removed = len(diff["removed"])
        n_changed = len(diff["changed"])
        if n_added == 0 and n_removed == 0 and n_changed == 0:
            continue

        total_added += n_added
        total_removed += n_removed
        total_changed += n_changed

        count_change = ""
        if diff["old_count"] != diff["new_count"]:
            count_change = f" ({diff['old_count']} → {diff['new_count']})"
        print(f"## {cat_name}{count_change}\n")

        if diff["added"]:
            print(f"### Added ({n_added})")
            for eid, entity in diff["added"]:
                extras = []
                for field in DISPLAY_FIELDS.get(cat_key, []):
                    val = entity.get(field)
                    if val is not None:
                        extras.append(f"{field}: {format_value(val)}")
                extra_str = f" — {', '.join(extras)}" if extras else ""
                print(f"- **{entity_name(entity)}**{extra_str}")
            print()

        if diff["removed"]:
            print(f"### Removed ({n_removed})")
            for eid, entity in diff["removed"]:
                print(f"- ~~{entity_name(entity)}~~")
            print()

        if diff["changed"]:
            print(f"### Changed ({n_changed})")
            for eid, info in diff["changed"].items():
                changes = info["changes"]
                change_strs = []
                for field, (old_val, new_val) in changes.items():
                    change_strs.append(f"`{field}`: {format_value(old_val)} → {format_value(new_val)}")
                print(f"- **{info['name']}**: {'; '.join(change_strs)}")
            print()

    print(f"---\n**Summary:** +{total_added} added, -{total_removed} removed, ~{total_changed} changed")


def build_json_output(results: dict, game_version: str, build_id: str, date: str, title: str, old_label: str, new_label: str) -> dict:
    """Build a JSON-serializable changelog object."""
    categories = []
    total_added = total_removed = total_changed = 0

    for cat_key, cat_name in CATEGORY_NAMES.items():
        if cat_key not in results:
            continue
        diff = results[cat_key]
        n_added = len(diff["added"])
        n_removed = len(diff["removed"])
        n_changed = len(diff["changed"])
        if n_added == 0 and n_removed == 0 and n_changed == 0:
            continue

        total_added += n_added
        total_removed += n_removed
        total_changed += n_changed

        cat_entry = {
            "id": cat_key,
            "name": cat_name,
            "old_count": diff["old_count"],
            "new_count": diff["new_count"],
        }

        if diff["added"]:
            cat_entry["added"] = []
            for eid, entity in diff["added"]:
                entry = {"id": eid, "name": entity_name(entity)}
                for field in DISPLAY_FIELDS.get(cat_key, []):
                    val = entity.get(field)
                    if val is not None:
                        entry[field] = val
                cat_entry["added"].append(entry)

        if diff["removed"]:
            cat_entry["removed"] = [
                {"id": eid, "name": entity_name(entity)}
                for eid, entity in diff["removed"]
            ]

        if diff["changed"]:
            cat_entry["changed"] = []
            for eid, info in diff["changed"].items():
                changes = []
                for field, (old_val, new_val) in info["changes"].items():
                    changes.append({
                        "field": field,
                        "old": format_value(old_val),
                        "new": format_value(new_val),
                    })
                cat_entry["changed"].append({
                    "id": eid,
                    "name": info["name"],
                    "changes": changes,
                })

        categories.append(cat_entry)

    return {
        "app_id": STEAM_APP_ID,
        "game_version": game_version,
        "build_id": build_id,
        "tag": game_version,
        "date": date,
        "title": title,
        "from_ref": old_label,
        "to_ref": new_label,
        "summary": {
            "added": total_added,
            "removed": total_removed,
            "changed": total_changed,
        },
        "categories": categories,
    }


def parse_named_arg(argv: list[str], name: str, default: str = "") -> tuple[str, list[str]]:
    """Extract a --name value pair from argv, return (value, remaining_argv)."""
    if name in argv:
        idx = argv.index(name)
        if idx + 1 < len(argv):
            val = argv[idx + 1]
            return val, argv[:idx] + argv[idx + 2:]
        return default, argv[:idx]
    return default, argv


def main():
    argv = sys.argv[1:]
    fmt, argv = parse_named_arg(argv, "--format", "text")
    game_version, argv = parse_named_arg(argv, "--game-version", "")
    build_id, argv = parse_named_arg(argv, "--build-id", "")
    date, argv = parse_named_arg(argv, "--date", "")
    title, argv = parse_named_arg(argv, "--title", "")
    data_dir_arg, argv = parse_named_arg(argv, "--data-dir", "")
    output_dir_arg, argv = parse_named_arg(argv, "--output-dir", "")
    is_beta = "--beta" in argv
    if is_beta:
        argv = [a for a in argv if a != "--beta"]
    args = [a for a in argv if not a.startswith("--")]

    # Resolve data dir and output dir
    if is_beta:
        data_dir_rel = data_dir_arg or "data-beta"
        output_dir = Path(output_dir_arg) if output_dir_arg else BASE_DIR / "data-beta" / "changelogs"
    else:
        data_dir_rel = data_dir_arg or "data"
        output_dir = Path(output_dir_arg) if output_dir_arg else BASE_DIR / data_dir_rel / "changelogs"
    data_dir = BASE_DIR / data_dir_rel / "eng"

    if len(args) == 0:
        print(__doc__)
        sys.exit(0)

    tmp_dir = None

    if len(args) == 1:
        old_ref = args[0]
        new_dir = data_dir
        new_label = "current"
        tmp_dir = Path(tempfile.mkdtemp())
        old_dir = extract_git_data(old_ref, tmp_dir, data_dir_rel)
        old_label = old_ref
    elif len(args) == 2:
        old_path = Path(args[0])
        new_path = Path(args[1])
        if old_path.is_dir() and new_path.is_dir():
            old_dir = old_path
            new_dir = new_path
            old_label = str(old_path)
            new_label = str(new_path)
        else:
            tmp_dir = Path(tempfile.mkdtemp())
            old_dir = extract_git_data(args[0], tmp_dir, data_dir_rel)
            new_dir = extract_git_data(args[1], tmp_dir, data_dir_rel)
            old_label = args[0]
            new_label = args[1]
    else:
        print("Usage: diff_data.py <old_ref> [new_ref] [--format text|md|json] [--game-version X] [--build-id Y] [--date Z] [--title T] [--beta] [--data-dir DIR] [--output-dir DIR]", file=sys.stderr)
        sys.exit(1)

    try:
        results = {}
        for cat_key in CATEGORY_NAMES:
            old_file = old_dir / f"{cat_key}.json"
            new_file = new_dir / f"{cat_key}.json"
            old_data = load_json_file(old_file)
            new_data = load_json_file(new_file)
            if old_data or new_data:
                results[cat_key] = diff_category(old_data, new_data)

        if fmt == "md":
            print_markdown(results, old_label, new_label)
        elif fmt == "json":
            if not game_version:
                game_version = new_label
            if not date:
                from datetime import date as d
                date = d.today().isoformat()
            if not title:
                title = f"Update {game_version}"
            changelog = build_json_output(results, game_version, build_id, date, title, old_label, new_label)
            # Save to changelogs directory — keyed by tag
            tag = changelog["tag"]
            out_path = output_dir / f"{tag}.json"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            # Preserve hand-curated features/fixes/api_changes when an existing
            # changelog at this tag already has them — diff_data only knows
            # the data diff, not the release notes someone wrote on top.
            if out_path.exists():
                try:
                    with open(out_path, "r", encoding="utf-8") as f:
                        existing = json.load(f)
                    for preserved_key in ("features", "fixes", "api_changes"):
                        if preserved_key in existing and preserved_key not in changelog:
                            changelog[preserved_key] = existing[preserved_key]
                except Exception:
                    pass
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(changelog, f, indent=2, ensure_ascii=False)
            print(f"Saved changelog to {out_path}")
            # Also print to stdout
            print(json.dumps(changelog["summary"], indent=2))
        else:
            print_text(results, old_label, new_label)
    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
