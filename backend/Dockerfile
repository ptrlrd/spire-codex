FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends webp && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY static/ static/

# Overwolf overlay fetches images from the backend, not the CDN yet, so
# regenerate webp from the tracked PNG sources at build time. (.dockerignore
# keeps host webp out of the build context; these are built fresh in-image.)
# Run cwebp across all cores -- the serial find -exec left CPUs idle and
# made this the slowest build step by far.
RUN find static/images -name '*.png' -print0 \
    | xargs -0 -P "$(nproc)" -I {} sh -c 'cwebp -q 95 -m 6 -quiet "$1" -o "${1%.png}.webp"' _ {}

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
