# Headless StS2 mod-card render pipeline.
#
# Stage 1 builds the RenderExporter mod (the typed port of the compendium card
# renderer). Stage 2 is the runtime: steamcmd installs the native Linux game,
# the mods are staged in, and the game runs under Xvfb + Mesa software GL so its
# own engine renders every card to PNG. Convert + upload happen in entrypoint.sh.
#
# This image bundles a full licensed game install + proprietary DLLs at runtime
# and touches Steam credentials. Keep it PRIVATE; never push to a public registry.

# ---- Stage 1: build the exporter mod ----------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS modbuild

ARG GODOT_VERSION=4.5.1
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl unzip ca-certificates && rm -rf /var/lib/apt/lists/*

# Godot 4.5.1 .NET (mono) is needed by the Godot.NET.Sdk build. The exporter is
# code-only (has_pck=false), so no .pck export is required, but the SDK still
# wants a Godot binary on some targets; install it to be safe.
RUN curl -fsSL -o /tmp/godot.zip \
      "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_mono_linux_x86_64.zip" \
    && unzip -q /tmp/godot.zip -d /opt/godot && rm /tmp/godot.zip
ENV GODOT_PATH=/opt/godot/Godot_v${GODOT_VERSION}-stable_mono_linux_x86_64/Godot_v${GODOT_VERSION}-stable_mono_linux.x86_64

WORKDIR /src
COPY render-exporter/ ./render-exporter/
RUN dotnet build render-exporter/RenderExporter.csproj -c Release -o /mod \
    && cp render-exporter/RenderExporter.json /mod/

# ---- Stage 2: runtime (game + render) ---------------------------------------
FROM debian:bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
# steamcmd lives in the non-free/i386 world; enable i386 for its bootstrap libs.
RUN dpkg --add-architecture i386 && apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl tar lib32gcc-s1 \
        xvfb \
        libgl1-mesa-dri mesa-vulkan-drivers libglu1-mesa \
        libfontconfig1 libxi6 libxcursor1 libxrandr2 libxinerama1 libasound2 \
        webp \
        awscli \
        procps \
    && rm -rf /var/lib/apt/lists/*

# Non-root user; steamcmd refuses to run as root. Pre-create the game install
# dir owned by steam (it lives at /game, under root-owned /, which the non-root
# user otherwise can't create -> "Disk write failure"). A named volume mounted
# at /game inherits this ownership, so the ~3GB install persists across runs.
RUN useradd -m -u 1000 steam && mkdir -p /game && chown steam:steam /game
USER steam
WORKDIR /home/steam

# steamcmd (self-updating).
RUN mkdir -p /home/steam/steamcmd \
    && curl -fsSL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
       | tar -xz -C /home/steam/steamcmd
ENV PATH="/home/steam/steamcmd:${PATH}"

# The built exporter mod from stage 1.
COPY --from=modbuild --chown=steam:steam /mod /home/steam/render-exporter-mod

COPY --chown=steam:steam render-container/entrypoint.sh render-container/convert-cards.sh /home/steam/
RUN chmod +x /home/steam/entrypoint.sh /home/steam/convert-cards.sh

# Software GL: render on CPU with llvmpipe (no GPU in the container).
ENV LIBGL_ALWAYS_SOFTWARE=1 \
    GALLIUM_DRIVER=llvmpipe \
    MESA_LOADER_DRIVER_OVERRIDE=llvmpipe

ENTRYPOINT ["/home/steam/entrypoint.sh"]
