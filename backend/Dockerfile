# BeFit API — container image for Cloud Run (or any Docker host).
#
# Cloud Run injects $PORT; everything else (Mongo URI, API keys) arrives as
# environment variables from Secret Manager. Nothing secret is baked in here.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# One worker: Cloud Run scales by adding instances, and a single process keeps
# the in-process scheduler and caches from running twice.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
