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
        "hackernews",
        "github",
        "feeds",
        "discord",
    ]


class _Resp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status
        self.headers = {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


class _Client:
    def __init__(self, payloads):
        self.payloads = payloads
        self.calls = []

    def _answer(self, method, url, kw):
        self.calls.append((method, url, kw))
        for key, payload in self.payloads.items():
            if key in url:
                return _Resp(payload)
        return _Resp({})

    def get(self, url, **kw):
        return self._answer("GET", url, kw)

    def post(self, url, **kw):
        return self._answer("POST", url, kw)


SETTINGS = {
    "terms": [
        {"text": "spire codex", "group": "brand"},
        {"text": "spirebird", "group": "competitor"},
    ],
    "subreddits": ["slaythespire"],
    "feeds": [],
    "github_exclude": ["user:ptrlrd"],
    "alert_groups": ["brand"],
}


def test_reddit_logs_in_with_post_and_quotes_phrases(monkeypatch):
    monkeypatch.setenv("REDDIT_CLIENT_ID", "id")
    monkeypatch.setenv("REDDIT_CLIENT_SECRET", "secret")
    monkeypatch.setattr(ms, "_reddit_token", {})
    fake = _Client(
        {
            "access_token": {"access_token": "tok", "expires_in": 3600},
            "oauth.reddit.com": {"data": {"children": []}},
        }
    )
    ms.fetch_reddit(SETTINGS, None, fake)
    method, url, kw = fake.calls[0]
    assert method == "POST" and url.endswith("/api/v1/access_token")
    assert kw["data"] == {"grant_type": "client_credentials"}
    searches = [c for c in fake.calls if c[1].endswith("/search")]
    brand_q = searches[0][2]["params"]["q"]
    assert brand_q.startswith('"spire codex" OR spirecodex OR spire-codex')
    assert "site:spire-codex.com" in brand_q


def test_bluesky_logs_in_with_post_and_quotes_phrases(monkeypatch):
    monkeypatch.setenv("BLUESKY_HANDLE", "me.bsky.social")
    monkeypatch.setenv("BLUESKY_APP_PASSWORD", "pw")
    monkeypatch.setattr(ms, "_bluesky_session", {})
    fake = _Client(
        {
            "createSession": {"accessJwt": "jwt"},
            "searchPosts": {"posts": []},
        }
    )
    ms.fetch_bluesky(SETTINGS, None, fake)
    method, url, kw = fake.calls[0]
    assert method == "POST" and url.endswith("createSession")
    assert kw["json"]["identifier"] == "me.bsky.social"
    queries = [c[2]["params"]["q"] for c in fake.calls if c[1].endswith("searchPosts")]
    assert '"spire codex"' in queries and "domain:spire-codex.com" in queries


def test_youtube_and_github_quote_phrases(monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "k")
    fake = _Client({"googleapis": {"items": []}, "api.github.com": {"items": []}})
    ms.fetch_youtube(SETTINGS, None, fake)
    ms.fetch_github(SETTINGS, None, fake)
    yt = [c for c in fake.calls if "googleapis" in c[1]][0][2]["params"]["q"]
    assert yt == '"spire codex"|spirecodex|spire-codex'
    gh = [c[2]["params"]["q"] for c in fake.calls if "api.github.com" in c[1]]
    assert gh[0] == '"spire codex" -user:ptrlrd'
    assert "spirecodex -user:ptrlrd" in gh


def test_search_links_cover_the_sites_without_a_free_api():
    links = {link["label"]: link["url"] for link in ms.search_links(SETTINGS)}
    assert set(links) == {"X", "TikTok", "Threads", "Facebook", "Web, last day"}
    assert links["X"].startswith("https://x.com/search?q=")
    assert "f=live" in links["X"] and "spire-codex.com" in links["X"]
    assert ms.search_links({"terms": []}) == []


def test_source_for_url_maps_hosts():
    assert ms.source_for_url("https://twitter.com/a/status/1") == "x"
    assert ms.source_for_url("https://www.tiktok.com/@a/video/1") == "tiktok"
    assert ms.source_for_url("https://old.reddit.com/r/a") == "reddit"
    assert ms.source_for_url("https://example.org/post") == "web"
    assert ms.source_label("tiktok") == "TikTok"
    assert all(s.name != "x" for s in ms.SOURCES)


def test_bluesky_since_stays_on_the_incoming_cursor(monkeypatch):
    monkeypatch.setenv("BLUESKY_HANDLE", "me.bsky.social")
    monkeypatch.setenv("BLUESKY_APP_PASSWORD", "pw")
    monkeypatch.setattr(ms, "_bluesky_session", {})
    post = {
        "uri": "at://did:plc:a/app.bsky.feed.post/r1",
        "author": {"handle": "a.bsky.social"},
        "record": {"text": "spire codex", "createdAt": "2026-10-28T12:00:00Z"},
    }
    fake = _Client(
        {"createSession": {"accessJwt": "jwt"}, "searchPosts": {"posts": [post]}}
    )
    _, cursor = ms.fetch_bluesky(SETTINGS, "2026-10-01T00:00:00Z", fake)
    sinces = {
        c[2]["params"].get("since") for c in fake.calls if c[1].endswith("searchPosts")
    }
    assert len(sinces) == 1 and next(iter(sinces)).startswith("2026-10-01")
    assert cursor.startswith("2026-10-28")


def test_reddit_competitor_search_has_no_site_filter(monkeypatch):
    monkeypatch.setenv("REDDIT_CLIENT_ID", "id")
    monkeypatch.setenv("REDDIT_CLIENT_SECRET", "secret")
    monkeypatch.setattr(ms, "_reddit_token", {})
    fake = _Client(
        {
            "access_token": {"access_token": "tok", "expires_in": 3600},
            "oauth.reddit.com": {"data": {"children": []}},
        }
    )
    ms.fetch_reddit(SETTINGS, None, fake)
    queries = [c[2]["params"]["q"] for c in fake.calls if c[1].endswith("/search")]
    competitor = next(q for q in queries if "spirebird" in q)
    assert "site:" not in competitor


def test_hn_and_github_items_carry_their_query_group():
    hit = {
        "objectID": "1",
        "title": "A tracker for Slay the Spire",
        "created_at_i": 1790000000,
        "_tags": ["story"],
    }
    issue = {
        "id": 7,
        "html_url": "https://github.com/a/b/issues/7",
        "title": "Use their API",
        "body": "",
        "user": {"login": "dev", "html_url": "https://github.com/dev"},
        "created_at": "2026-10-28T12:00:00Z",
        "comments": 0,
        "repository_url": "https://api.github.com/repos/a/b",
    }
    fake = _Client(
        {"hn.algolia.com": {"hits": [hit]}, "api.github.com": {"items": [issue]}}
    )
    hn, _ = ms.fetch_hackernews(SETTINGS, None, fake)
    assert hn and all(i.query_group for i in hn)
    gh, _ = ms.fetch_github(SETTINGS, None, fake)
    assert len(gh) == 1 and gh[0].query_group == "brand"
    gh_calls = [c for c in fake.calls if "api.github.com" in c[1]]
    assert len(gh_calls) == 4
    assert all(" OR " not in c[2]["params"]["q"] for c in gh_calls)


def test_feed_links_must_be_http():
    xml = (
        b'<?xml version="1.0"?><rss><channel><item><title>Spire Codex</title>'
        b"<link>javascript:alert(1)</link><guid>g1</guid></item></channel></rss>"
    )
    out = ms.parse_feed(
        xml,
        {
            "url": "https://feeds.example/a",
            "label": "A",
            "group": "brand",
            "community": False,
        },
    )
    assert out[0].url == ""


def test_public_https_url_rejects_internal_addresses():
    assert ms.public_https_url("https://1.1.1.1/feed") is True
    for url in (
        "https://127.0.0.1/feed",
        "https://10.0.0.5/feed",
        "https://169.254.169.254/latest",
        "https://[::1]/feed",
        "http://1.1.1.1/feed",
    ):
        assert ms.public_https_url(url) is False, url


def test_slow_feed_hits_the_wall_clock_deadline(monkeypatch):
    class _Stream:
        status_code = 200
        headers = {}

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def raise_for_status(self):
            return None

        def iter_bytes(self):
            while True:
                yield b"<"

    class _SlowClient:
        def stream(self, method, url, timeout=None):
            return _Stream()

    clock = iter(range(0, 10_000, 5))
    monkeypatch.setattr(ms.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(ms, "public_https_url", lambda url: True)
    feed = {
        "url": "https://feeds.example/slow",
        "label": "Slow",
        "group": "",
        "community": False,
    }
    try:
        ms.fetch_feeds({**SETTINGS, "feeds": [feed]}, None, _SlowClient())
    except TimeoutError:
        return
    raise AssertionError("slow feed was not cut off")
