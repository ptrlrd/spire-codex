FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# static/ (~2.6 GB of PNG/audio sources for the /images gallery and ZIP
# downloads) deliberately never ships in the image: prod and dev both
# bind-mount ./backend/static, the same pattern as data/. Image bytes
# are served from the CDN anyway (nginx 301s /static/images/* to
# cdn.spire-codex.com); the local tree only feeds directory listings
# and ZIP building. main.py skips the /static mount if the dir is absent.
COPY app/ app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
