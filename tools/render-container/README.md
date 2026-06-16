# Headless mod-card render pipeline

Automates the 1:1 card render flow from `GENERATING_CARD_RENDERS.md` for
**modded** cards: run Slay the Spire 2 headless in a container with a mod loaded,
let the game's own engine render every card the mod adds, and upload the results
to the CDN. No CSS reconstruction — these are the real engine renders, identical
to how base cards are produced.

```
steamcmd installs native Linux StS2
   -> stage BaseLib + content mod + RenderExporter mod into <game>/mods
   -> launch under Xvfb + Mesa llvmpipe (software GL)
   -> RenderExporter renders every card (ModelDb.AllCards, filtered to the mod)
   -> PNGs to /out  ->  convert to webp  ->  R2 cards-full/mods/<modid>/
```

## How it works

- **`render-exporter/`** (sibling dir) is a BaseLib mod — a typed reimplementation
  of `spire-compendium/payload/Payload.cs`'s card renderer. It loads alongside the
  content mod; because the game registers the mod's cards in `ModelDb.AllCards`, the
  exporter renders them with the exact game frame/banner/orb/font/layout. It only
  arms when `STS2_RENDER_OUT` is set, so it is inert during normal play.
- **`Dockerfile`** — stage 1 builds the exporter mod; stage 2 is the runtime
  (steamcmd + Xvfb + Mesa software GL + libwebp + awscli).
- **`entrypoint.sh`** — installs the game, stages the mods, launches under Xvfb,
  waits for the `_all_done.txt` sentinel, converts, and (optionally) uploads.
- **`convert-cards.sh`** — verbatim from `GENERATING_CARD_RENDERS.md`.

Godot 4's `--headless` renders nothing (dummy rasterizer), so the game runs under
a virtual display (Xvfb) with CPU rendering (llvmpipe), not `--headless`.

## Prerequisites

- Docker with enough CPU/RAM (software rendering is slow).
- A Steam account that **owns** the game (use a dedicated throwaway, never your
  main). First run needs a one-time Steam Guard code.
- `./mods/` containing the mods to load: **`BaseLib/`** and the content mod (e.g.
  `WatcherMod/`). Copy them from a working install's `mods/` folder.
- For upload: an `[r2]` profile in `~/.aws` (the same one the beta render flow uses).

## Run

```bash
cd tools/render-container
mkdir -p mods && cp -r "/path/to/Slay the Spire 2/mods/BaseLib" "/path/to/WatcherMod" mods/

# First run (one-time Steam Guard), English only, no upload — produces ./out_webp:
STEAM_USER=throwaway STEAM_PASS=... STEAM_GUARD=XXXXX \
  MOD_ID=watcher RENDER_PREFIX=WATCHER- ./run.sh

# Later: all languages + upload to the CDN:
STEAM_USER=throwaway STEAM_PASS=... \
  MOD_ID=watcher RENDER_PREFIX=WATCHER- \
  RENDER_LANGS="eng,deu,esp,fra,ita,jpn,kor,pol,ptb,rus,spa,tha,tur,zhs" \
  DO_UPLOAD=1 ./run.sh
```

`RENDER_PREFIX=WATCHER-` renders **only** the mod's cards (not all 576 base cards,
which are already on the CDN). Renders land at `cards-full/mods/<MOD_ID>/<id>.webp`,
which `fullCardUrl` resolves for modded ids.

### Key env vars

| var | default | meaning |
|---|---|---|
| `STEAM_USER` / `STEAM_PASS` | — | account that owns app 2868840 (required) |
| `STEAM_GUARD` | — | one-time 2FA code (first run only; then cached) |
| `MOD_ID` | `watcher` | content mod id = CDN prefix `cards-full/mods/<MOD_ID>/` |
| `RENDER_PREFIX` | `WATCHER-` | only render card ids starting with this |
| `RENDER_CARDS` | `all` | `all` or a comma list of ids |
| `RENDER_LANGS` | English only | comma list of `folder` or `folder=locale` |
| `RENDER_ENCH` | `0` | `1` also renders every valid enchantment (very heavy) |
| `DO_UPLOAD` | `0` | `1` syncs to R2 (needs the `[r2]` aws profile) |

## Status / what is unverified

The mod source, Dockerfile, and scripts are written and lint-checked, but the full
run can only be validated on a machine with the game license, a display path, and
the R2 keys. Specifically unproven here and to verify on first real run:

- exact game type/member names against the live `sts2.dll` (the renderer ports 1:1
  from `Payload.cs`, but the game is Early Access and renames members between
  patches — `ModelVisibility`, `CardModel.Id.Entry`, the internal mutators, etc.);
- the native Linux binary launching under Xvfb + llvmpipe without a black screen
  (fallback: `--rendering-driver vulkan` with Lavapipe, `mesa-vulkan-drivers` is
  already installed);
- Steamworks init in the container without a running client (a `steam_appid.txt`
  is written as a mitigation);
- the md5 sanity check from the doc (an English render vs a localized one must
  differ) once multi-language is enabled.

This image bundles a full licensed game install + proprietary DLLs and touches
Steam credentials. **Keep it private; never push to a public registry.**
