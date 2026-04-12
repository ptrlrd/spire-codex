"""Parse guide markdown files with YAML frontmatter into JSON."""

import json

import frontmatter

from parser_paths import DATA_DIR

GUIDES_DIR = DATA_DIR / "guides"


def parse_guides() -> list[dict]:
    if not GUIDES_DIR.exists():
        return []

    guides = []
    for filepath in sorted(GUIDES_DIR.glob("*.md")):
        post = frontmatter.load(filepath)
        guide = {
            "id": post.get("slug", filepath.stem),
            "slug": post.get("slug", filepath.stem),
            "title": post.get("title", filepath.stem),
            "author": post.get("author", "Anonymous"),
            "date": str(post.get("date", "")),
            "updated": str(post.get("updated", "")) if post.get("updated") else None,
            "category": post.get("category", "general"),
            "tags": post.get("tags", []),
            "summary": post.get("summary", ""),
            "difficulty": post.get("difficulty", "beginner"),
            "character": post.get("character"),
            "website": post.get("website"),
            "bluesky": post.get("bluesky"),
            "twitter": post.get("twitter"),
            "twitch": post.get("twitch"),
            "content": post.content,
        }
        guides.append(guide)

    guides.sort(key=lambda g: g["date"], reverse=True)
    return guides


def main():
    output = DATA_DIR / "guides.json"
    guides = parse_guides()
    with open(output, "w", encoding="utf-8") as f:
        json.dump(guides, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(guides)} guides -> data/guides.json")


if __name__ == "__main__":
    main()
