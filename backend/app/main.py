"""Spire Codex API - FastAPI Application."""

import logging
import os
import re
import time

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from pathlib import Path
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .routers import (
    cards,
    characters,
    relics,
    monsters,
    potions,
    enchantments,
    encounters,
    events,
    powers,
    keywords,
    intents,
    orbs,
    afflictions,
    modifiers,
    achievements,
    badges,
    epochs,
    stories,
    images,
    changelogs,
    feedback,
    acts,
    ascensions,
    names,
    exports,
    entity_history,
    ancient_pools,
    runs,
    glossary,
    guides,
    versions,
    unlocks,
    news,
)
from .services.data_service import get_stats, load_translation_maps, current_version
from .dependencies import get_lang, VALID_LANGUAGES, LANGUAGE_NAMES
from prometheus_fastapi_instrumentator import Instrumentator

from .metrics import (
    api_errors,
    requests_in_flight,
    response_size,
    entity_views,
    entity_list_views,
    search_queries,
    language_usage,
    version_usage,
    widget_loads,
    compare_views,
)

# ── Structured logging ────────────────────────────────────────
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("spire-codex")

# ── Sentry (optional — set SENTRY_DSN env var to enable) ──────
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if SENTRY_DSN:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            traces_sample_rate=0.1,
            environment=os.environ.get("SENTRY_ENV", "production"),
        )
        logger.info("Sentry initialized")
    except ImportError:
        logger.warning("SENTRY_DSN set but sentry-sdk not installed")
    except Exception as e:
        logger.warning("Sentry init failed: %s", e)

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="Spire Codex API",
    description="Comprehensive API for Slay the Spire 2 game data — cards, characters, relics, monsters, potions, powers, enchantments, encounters, events, epochs, keywords, orbs, afflictions, modifiers, achievements, and more.",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


_VERSION_RE = re.compile(r"^v?\d+\.\d+")


class VersionMiddleware(BaseHTTPMiddleware):
    """Extract ?version= from query params and set the contextvar for data_service."""

    async def dispatch(self, request: Request, call_next):
        version = request.query_params.get("version")
        if version and version != "latest" and _VERSION_RE.match(version):
            token = current_version.set(version)
        else:
            token = current_version.set(None)
        try:
            response = await call_next(request)
        finally:
            current_version.reset(token)
        return response


class CORSStaticMiddleware(BaseHTTPMiddleware):
    """Add CORS headers and cache headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        # Cache API GET responses for 5 minutes (data changes only on redeploy)
        if request.method == "GET" and request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "public, max-age=300"
        return response


_SKIP_PATHS = frozenset(
    ("/health", "/metrics", "/docs", "/openapi.json", "/favicon.ico")
)

# Entity types that have detail routes: /api/{type}/{id}
_ENTITY_TYPES = frozenset(
    (
        "cards",
        "characters",
        "relics",
        "monsters",
        "potions",
        "powers",
        "events",
        "encounters",
        "enchantments",
        "keywords",
        "intents",
        "orbs",
        "afflictions",
        "modifiers",
        "achievements",
        "badges",
        "epochs",
        "stories",
        "acts",
        "ascensions",
        "guides",
    )
)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every request and track detailed metrics."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        requests_in_flight.inc()
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            requests_in_flight.dec()
        elapsed_ms = (time.perf_counter() - start) * 1000

        # Response size tracking
        content_length = response.headers.get("content-length")
        if content_length:
            path = request.url.path
            # Normalize detail paths: /api/cards/BASH -> /api/cards/{id}
            parts = path.strip("/").split("/")
            if len(parts) >= 3 and parts[0] == "api" and parts[1] in _ENTITY_TYPES:
                endpoint = f"/api/{parts[1]}/{{id}}"
            else:
                endpoint = path
            response_size.labels(
                method=request.method,
                endpoint=endpoint,
            ).observe(int(content_length))

        # Track language and version usage
        lang = request.query_params.get("lang")
        if lang:
            language_usage.labels(lang=lang).inc()
        version = request.query_params.get("version")
        if version:
            version_usage.labels(version=version).inc()
        else:
            host = request.headers.get("x-forwarded-host") or request.headers.get(
                "host", ""
            )
            if host.startswith("beta."):
                version_usage.labels(version="latest").inc()

        # Track entity views and searches from API paths
        path = request.url.path
        if path.startswith("/api/") and request.method == "GET":
            parts = path.strip("/").split("/")
            if len(parts) >= 2 and parts[1] in _ENTITY_TYPES:
                etype = parts[1]
                if len(parts) == 3:
                    # Detail view: /api/cards/{id}
                    entity_views.labels(entity_type=etype).inc()
                elif len(parts) == 2:
                    # List view: /api/cards
                    entity_list_views.labels(entity_type=etype).inc()
                    if request.query_params.get("search"):
                        search_queries.labels(entity_type=etype).inc()

            # Compare views
            if len(parts) == 3 and parts[1] == "compare":
                compare_views.labels(pair=parts[2]).inc()

        # Widget script loads
        if path.startswith("/widget/"):
            if "tooltip" in path:
                widget_loads.labels(widget_type="tooltip").inc()
            elif "changelog" in path:
                widget_loads.labels(widget_type="changelog").inc()

        # Error tracking and logging
        if response.status_code >= 400:
            api_errors.labels(
                status_code=str(response.status_code),
                method=request.method,
                path=path,
            ).inc()
            logger.warning(
                "%s %s %d %.0fms",
                request.method,
                path,
                response.status_code,
                elapsed_ms,
            )
        else:
            logger.info(
                "%s %s %d %.0fms",
                request.method,
                path,
                response.status_code,
                elapsed_ms,
            )
        return response


app.add_middleware(VersionMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(CORSStaticMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Prometheus metrics ────────────────────────────────────────
Instrumentator(
    excluded_handlers=["/health", "/metrics", "/docs", "/openapi.json"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.include_router(cards.router)
app.include_router(characters.router)
app.include_router(relics.router)
app.include_router(monsters.router)
app.include_router(potions.router)
app.include_router(enchantments.router)
app.include_router(encounters.router)
app.include_router(events.router)
app.include_router(powers.router)
app.include_router(keywords.router)
app.include_router(intents.router)
app.include_router(orbs.router)
app.include_router(afflictions.router)
app.include_router(modifiers.router)
app.include_router(achievements.router)
app.include_router(badges.router)
app.include_router(epochs.router)
app.include_router(stories.router)
app.include_router(images.router)
app.include_router(changelogs.router)
app.include_router(feedback.router)
app.include_router(acts.router)
app.include_router(ascensions.router)
app.include_router(names.router)
app.include_router(exports.router)
app.include_router(entity_history.router)
app.include_router(ancient_pools.router)
app.include_router(runs.router)
app.include_router(glossary.router)
app.include_router(guides.router)
app.include_router(versions.router)
app.include_router(unlocks.router)
app.include_router(news.router)


@app.get("/api/languages", tags=["Languages"])
def languages(request: Request):
    """Get list of available languages."""
    return [
        {"code": code, "name": LANGUAGE_NAMES.get(code, code)}
        for code in sorted(VALID_LANGUAGES)
    ]


@app.get("/api/translations", tags=["Languages"])
def translations(request: Request, lang: str = Depends(get_lang)):
    """Get translation maps for the given language (section titles, descriptions, character names, filter labels)."""
    return load_translation_maps(lang)


@app.get("/api/stats", tags=["Stats"])
def stats(request: Request, lang: str = Depends(get_lang)):
    """Get total counts of all game entities."""
    return get_stats(lang)


@app.get("/health", tags=["Health"])
def health(request: Request):
    """Health check — verifies the API is running and data is accessible."""
    data_dir = Path(
        os.environ.get("DATA_DIR", Path(__file__).resolve().parents[1] / "data")
    )
    eng_dir = data_dir / "eng"
    data_ok = eng_dir.exists() and any(eng_dir.glob("*.json"))
    return {
        "status": "ok" if data_ok else "degraded",
        "data_available": data_ok,
    }


@app.get("/", tags=["Root"])
def root(request: Request):
    return {
        "name": "Spire Codex API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "cards": "/api/cards",
            "characters": "/api/characters",
            "relics": "/api/relics",
            "monsters": "/api/monsters",
            "potions": "/api/potions",
            "enchantments": "/api/enchantments",
            "encounters": "/api/encounters",
            "events": "/api/events",
            "powers": "/api/powers",
            "keywords": "/api/keywords",
            "intents": "/api/intents",
            "orbs": "/api/orbs",
            "afflictions": "/api/afflictions",
            "modifiers": "/api/modifiers",
            "achievements": "/api/achievements",
            "epochs": "/api/epochs",
            "stories": "/api/stories",
            "acts": "/api/acts",
            "ascensions": "/api/ascensions",
            "ancient_pools": "/api/ancient-pools",
            "runs": "/api/runs",
            "run_stats": "/api/runs/stats",
            "glossary": "/api/glossary",
            "images": "/api/images",
            "changelogs": "/api/changelogs",
            "stats": "/api/stats",
            "languages": "/api/languages",
            "translations": "/api/translations",
        },
    }


STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

logger.info("Spire Codex API ready")
