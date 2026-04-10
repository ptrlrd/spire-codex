"""Spire Codex API - FastAPI Application."""
import re
from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from pathlib import Path
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from .routers import cards, characters, relics, monsters, potions, enchantments, encounters, events, powers, keywords, intents, orbs, afflictions, modifiers, achievements, epochs, stories, images, changelogs, feedback, acts, ascensions, names, exports, entity_history, ancient_pools, runs, glossary, guides, versions
from .services.data_service import get_stats, load_translation_maps, current_version
from .dependencies import get_lang, VALID_LANGUAGES, LANGUAGE_NAMES

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="Spire Codex API",
    description="Comprehensive API for Slay the Spire 2 game data — cards, characters, relics, monsters, potions, powers, enchantments, encounters, events, epochs, keywords, orbs, afflictions, modifiers, achievements, and more.",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


_VERSION_RE = re.compile(r'^v?\d+\.\d+')


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


app.add_middleware(VersionMiddleware)
app.add_middleware(CORSStaticMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
