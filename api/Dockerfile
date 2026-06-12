# DamageScale API (FastAPI mock predictor). MOCK_MODE and CORS_ORIGINS are
# read from the environment at runtime (main.py / predict/interface.py), so
# this one image serves localhost and the university server unchanged.
FROM python:3.12-slim

# No .pyc litter in the image; unbuffered stdout so `docker compose logs`
# shows uvicorn output immediately.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Non-root runtime user — the API needs no privileges beyond reading /app.
RUN useradd --create-home --uid 1001 damagescale

WORKDIR /app

# requirements.txt first so source edits never bust the pip layer cache.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

USER damagescale
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
