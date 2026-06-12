# Render deploy target: Render builds with the REPO ROOT as context by
# default, so this file mirrors api/Dockerfile with root-relative COPY paths.
# Local/dev/VPS stacks keep using api/Dockerfile (context ./api) via compose.
FROM python:3.12-slim

# No .pyc litter in the image; unbuffered stdout so platform logs stream.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Non-root runtime user — the API needs no privileges beyond reading /app.
RUN useradd --create-home --uid 1001 damagescale

WORKDIR /app

# requirements.txt first so source edits never bust the pip layer cache.
COPY api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY api/ .

USER damagescale
EXPOSE 8000
# Shell-form with a default keeps localhost on 8000 while platforms that
# inject PORT (Render) get honored automatically.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
