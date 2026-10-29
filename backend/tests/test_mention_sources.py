"""Mention source parsers on canned payloads: shapes, ids, urls, dates,
engagement, feed parsing variants and search query building."""

from datetime import datetime, timezone

from app.services import mention_sources as ms


def test_reddit_listing_parses_posts_and_comments():
    payload = {
        "data": {
            "children": [
                {
                    "kind": "t3",
                    "data": {
                        "name": "t3_abc",
                        "title": "Anyone tried Spire Codex?",
                        "selftext": "It tracks my runs nicely",
                        "permalink": "/r/slaythespire/comments/abc/anyone/",
                        "author": "carol",
                        "subreddit_name_prefixed": "r/slaythespire",
                        "created_utc": 1791936000.0,
                        "score": 42,
                        "num_comments": 7,
                    },
                },
                {
                    "kind": "t1",
                    "data": {
                        "name": "t1_def",
                        "link_title": "Anyone tried Spire Codex?",
                        "body": "I use it every day",
                        "permalink": "/r/slaythespire/comments/abc/def/",
                        "author": "dave",
                        "subreddit_name_prefixed": "r/slaythespire",
                        "created_utc": 1791936600.0,
                        "score": 3,
                        "num_comments": 0,
                    },
                },
            ]
        }
    }
    out = ms.parse_reddit_listing(payload, community=True)
    assert [f.kind for f in out] == ["post", "comment"]
    assert out[0].external_id == "t3_abc"
    assert out[0].url == "https://www.reddit.com/r/slaythespire/comments/abc/anyone/"
    assert out[0].author == "carol"
    assert out[0].author_url == "https://www.reddit.com/user/carol"
    assert out[0].space == "r/slaythespire"
    assert out[0].community is True
    assert out[0].created_at == datetime.fromtimestamp(1791936000.0, tz=timezone.utc)
    assert out[0].engagement == {"score": 42, "comments": 7}
    assert out[1].title == "Comment on: Anyone tried Spire Codex?"
    assert out[1].text == "I use it every day"


def test_bluesky_posts_parse_url_from_uri_and_engagement():
    payload = {
        "posts": [
            {
                "uri": "at://did:plc:123/app.bsky.feed.post/3kxyz",
                "author": {"handle": "eve.bsky.social"},
                "record": {
                    "text": "spire-codex is great",
                    "createdAt": "2026-10-10T18:30:00.000Z",
                },
                "likeCount": 2,
                "repostCount": 1,
                "replyCount": 4,
                "quoteCount": 0,
            }
        ]
    }
    out = ms.parse_bluesky_posts(payload)
    assert len(out) == 1
    f = out[0]
    assert f.external_id == "at://did:plc:123/app.bsky.feed.post/3kxyz"
    assert f.url == "https://bsky.app/profile/eve.bsky.social/post/3kxyz"
    assert f.text == "spire-codex is great"
    assert f.author_url == "https://bsky.app/profile/eve.bsky.social"
    assert f.space == "Bluesky"
    assert f.created_at.year == 2026 and f.created_at.hour == 18
    assert f.engagement == {"likes": 2, "reposts": 1, "replies": 4, "quotes": 0}


def test_youtube_search_carries_the_query_fallback():
    payload = {
        "items": [
            {
                "id": {"videoId": "v1d"},
                "snippet": {
                    "title": "Spire Codex tier list",
                    "description": "win rate talk",
                    "channelTitle": "Spire Tube",
                    "channelId": "ch1",
                    "publishedAt": "2026-10-11T09:00:00Z",
                },
            }
        ]
    }
    out = ms.parse_youtube_search(payload, "community", "tier list")
    f = out[0]
    assert f.external_id == "v1d"
    assert f.url == "https://www.youtube.com/watch?v=v1d"
    assert f.kind == "video"
    assert f.author == "Spire Tube"
    assert f.author_url == "https://www.youtube.com/channel/ch1"
    assert f.space == "YouTube"
    assert f.query_group == "community" and f.query_term == "tier list"
    assert f.engagement == {}


def test_x_search_joins_users_and_metrics():
    payload = {
        "data": [
            {
                "id": "199",
                "text": "my spirebird clone lost",
                "author_id": "7",
                "created_at": "2026-10-12T10:15:00.000Z",
                "public_metrics": {
                    "like_count": 9,
                    "retweet_count": 3,
                    "reply_count": 5,
                    "quote_count": 1,
                    "impression_count": 8000,
                },
            }
        ],
        "includes": {"users": [{"id": "7", "username": "frank", "name": "Frank"}]},
    }
    out = ms.parse_x_search(payload)
    f = out[0]
    assert f.external_id == "199"
    assert f.url == "https://x.com/frank/status/199"
    assert f.author == "Frank"
    assert f.author_url == "https://x.com/frank"
    assert f.space == "X"
    assert f.created_at.year == 2026 and f.created_at.minute == 15
    assert f.engagement == {
        "likes": 9,
        "reposts": 3,
        "replies": 5,
        "quotes": 1,
        "views": 8000,
    }


def test_hn_hits_split_stories_and_comments_and_strip_html():
    payload = {
        "hits": [
            {
                "objectID": "100",
                "title": "Show HN: Spire Codex",
                "story_text": "<p>Charts &amp; graphs</p>",
                "author": "grace",
                "created_at_i": 1791936000,
                "points": 120,
                "num_comments": 30,
            },
            {
                "objectID": "101",
                "story_title": "Show HN: Spire Codex",
                "comment_text": "Love the <b>win rate</b> page &amp; charts",
                "author": "heidi",
                "created_at_i": 1791936600,
                "points": 1,
                "num_comments": 30,
            },
        ]
    }
    out = ms.parse_hn_hits(payload)
    assert out[0].kind == "story"
    assert out[0].title == "Show HN: Spire Codex"
    assert out[0].text == "Charts & graphs"
    assert out[0].url == "https://news.ycombinator.com/item?id=100"
    assert out[0].author_url == "https://news.ycombinator.com/user?id=grace"
    assert out[0].space == "Hacker News"
    assert out[0].engagement == {"points": 120, "comments": 30}
    assert out[1].kind == "comment"
    assert out[1].title == "Comment on: Show HN: Spire Codex"
    assert out[1].text == "Love the win rate page & charts"
    assert out[1].created_at == datetime.fromtimestamp(1791936600, tz=timezone.utc)


def test_github_issues_detect_pull_requests_and_reactions():
    payload = {
        "items": [
            {
                "id": 501,
                "title": "Tier list export",
                "body": "Please **export** the tier list",
                "html_url": "https://github.com/peter/site/issues/9",
                "repository_url": "https://api.github.com/repos/peter/site",
                "user": {"login": "ivan", "html_url": "https://github.com/ivan"},
                "created_at": "2026-10-13T08:00:00Z",
                "comments": 4,
                "reactions": {"total_count": 6},
            },
            {
                "id": 502,
                "title": "Fix charts",
                "pull_request": {
                    "url": "https://api.github.com/repos/peter/site/pulls/10"
                },
                "html_url": "https://github.com/peter/site/pull/10",
                "repository_url": "https://api.github.com/repos/peter/site",
                "user": {"login": "judy", "html_url": "https://github.com/judy"},
                "created_at": "2026-10-13T09:00:00Z",
                "comments": 1,
                "reactions": {"total_count": 0},
            },
        ]
    }
    out = ms.parse_github_issues(payload)
    assert [f.kind for f in out] == ["issue", "pr"]
    assert out[0].external_id == "501"
    assert out[0].space == "peter/site"
    assert out[0].author == "ivan"
    assert out[0].engagement == {"comments": 4, "reactions": 6}
    assert out[1].url == "https://github.com/peter/site/pull/10"


def test_html_stripping_collapses_tags_and_entities():
    assert (
        ms._strip_html("<p>Hello <b>world</b> &amp; more</p>") == "Hello world & more"
    )


def test_google_alert_redirect_links_unwrap():
    wrapped = "https://www.google.com/url?q=x&url=https://example.com/post/1&sa=t"
    assert ms._unwrap_google(wrapped) == "https://example.com/post/1"
    assert ms._unwrap_google("https://example.com/plain") == "https://example.com/plain"
    assert ms._unwrap_google("") == ""


RSS_XML = b"""<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Alerts</title>
    <item>
      <title>Spire Codex &amp; the meta</title>
      <link>https://www.google.com/url?url=https://blog.example.com/spire-codex-meta</link>
      <description>&lt;p&gt;A look at win rates&lt;/p&gt;</description>
      <pubDate>Tue, 14 Oct 2026 07:00:00 GMT</pubDate>
      <guid>urn:item:77</guid>
      <dc:creator>News Desk</dc:creator>
    </item>
  </channel>
</rss>"""

ATOM_XML = b"""<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Blog</title>
  <entry>
    <title>Tier list season two</title>
    <link rel="alternate" href="https://blog.example.com/tier-list-2" />
    <content>Talk about pick rates</content>
    <published>2026-10-15T12:00:00Z</published>
    <id>tag:blog.example.com,2026:post-88</id>
    <author><name>Reporter</name></author>
  </entry>
</feed>"""

FEED = {
    "url": "https://alerts.example/rss",
    "label": "My alerts",
    "group": "",
    "community": False,
}


def test_rss_parsing_unwraps_links_and_hashes_ids():
    out = ms.parse_feed(RSS_XML, FEED)
    assert len(out) == 1
    f = out[0]
    assert f.url == "https://blog.example.com/spire-codex-meta"
    assert f.title == "Spire Codex & the meta"
    assert f.text == "A look at win rates"
    assert f.author == "News Desk"
    assert f.space == "My alerts"
    assert f.kind == "article"
    assert f.created_at == datetime(2026, 10, 14, 7, 0, tzinfo=timezone.utc)
    assert (
        f.external_id
        == ms.hashlib.sha1(b"https://alerts.example/rssurn:item:77").hexdigest()[:20]
    )


def test_atom_parsing_reads_entries():
    feed = {**FEED, "label": ""}
    out = ms.parse_feed(ATOM_XML, feed)
    assert len(out) == 1
    f = out[0]
    assert f.url == "https://blog.example.com/tier-list-2"
    assert f.title == "Tier list season two"
    assert f.text == "Talk about pick rates"
    assert f.author == "Reporter"
    assert f.space == "alerts.example"
    assert f.created_at == datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)


def test_feed_entries_carry_group_and_community_flags():
    feed = {**FEED, "label": "Watching", "group": "competitor", "community": True}
    out = ms.parse_feed(RSS_XML, feed)
    assert out[0].query_group == "competitor"
    assert out[0].community is True
    assert out[0].space == "Watching"


def test_term_variants_cover_joined_and_hyphen_forms():
    assert ms.term_variants("spire codex") == [
        "spire codex",
        "spirecodex",
        "spire-codex",
    ]
    assert ms.term_variants("spirebird") == ["spirebird"]
    assert ms.term_variants("win_rate") == ["win rate", "winrate", "win-rate"]


def test_group_variants_dedupe_case_insensitively():
    settings = {
        "terms": [
            {"text": "Spire Codex", "group": "brand"},
            {"text": "spire-codex", "group": "brand"},
        ]
    }
    assert ms.group_variants(settings, "brand") == [
        "Spire Codex",
        "SpireCodex",
        "Spire-Codex",
    ]


def test_missing_env_lists_unset_names(monkeypatch):
    monkeypatch.delenv("REDDIT_CLIENT_ID", raising=False)
    monkeypatch.delenv("REDDIT_CLIENT_SECRET", raising=False)
    reddit = next(s for s in ms.SOURCES if s.name == "reddit")
    assert reddit.missing_env() == ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"]
    github = next(s for s in ms.SOURCES if s.name == "github")
    assert github.missing_env() == []
    assert [s.name for s in ms.SOURCES] == [
        "reddit",
        "bluesky",
        "youtube",
        "x",
        "hackernews",
        "github",
        "feeds",
        "discord",
    ]
