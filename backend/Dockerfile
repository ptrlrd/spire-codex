FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# static/ is ~2.6 GB of PNG and audio that only changes on game updates;
# app/ changes every release. Copy static/ first so a code-only change
# reuses the cached static layer instead of rebuilding and re-uploading
# 2.6 GB on every build (and re-downloading it on every deploy pull).
COPY static/ static/
COPY app/ app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
