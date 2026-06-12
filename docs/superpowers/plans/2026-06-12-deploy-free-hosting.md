# Deployment Plan: Free Hosting (Vercel + Render) + VPS-Ready Docker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 3–4 BLOCK on interactive user steps — pause and ask rather than improvising credentials.

**Goal:** The app live at `https://project.razzak.me` on free hosting (Vercel web + Render api), plus a self-contained production Docker stack (Caddy TLS) the user can run on any VPS with one command.

**Architecture:** Two deployment paths sharing one codebase: (1) Vercel builds `web/` with production env; the api Docker image runs on Render free tier (must bind `$PORT`). (2) `docker-compose.prod.yml` — web + api + Caddy reverse proxy with automatic Let's Encrypt, domains/env from root `.env`. Supabase stays as-is for both.

**Tech Stack:** Vercel CLI (`npx vercel`), Render (Docker web service), Caddy 2, docker compose.

**Prereq:** Sub-project A (premium upgrade) merged to `main` and verified.

---

### Task 1: API image binds $PORT (Render-compatible, compose-unchanged)

**Files:**
- Modify: `api/Dockerfile` (CMD only)

- [ ] **Step 1: Replace the CMD line** in `api/Dockerfile`:

```dockerfile
# Shell-form with a default keeps localhost/compose on 8000 while platforms
# that inject PORT (Render) get honored automatically.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

- [ ] **Step 2: Verify locally:** `docker compose up -d --build api` then `curl -s localhost:8000/health` → `{"status":"ok","mock":true}`. Also verify the override path: `docker run --rm -d -e PORT=8123 -e MOCK_MODE=true -p 8123:8123 --name port-test grad_proj-api && sleep 2 && curl -s localhost:8123/health && docker rm -f port-test` → same body.

- [ ] **Step 3: Commit**

```bash
git add api/Dockerfile && git commit -m "feat(api): honor injected PORT for PaaS hosts, default 8000"
```

---

### Task 2: VPS-ready production stack (Caddy + HTTPS, one command)

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `deploy/Caddyfile`
- Modify: `.env.example` (two new vars)
- Modify: `README.md` (new "Deploy on a VPS" section)

- [ ] **Step 1: Create `deploy/Caddyfile`:**

```
# Caddy terminates HTTPS (automatic Let's Encrypt) and proxies to the two
# services on the internal compose network. Domains come from .env.
{$DOMAIN_WEB} {
	reverse_proxy web:3000
}

{$DOMAIN_API} {
	reverse_proxy api:8000
}
```

- [ ] **Step 2: Create `docker-compose.prod.yml`** (self-contained — NOT an overlay, to avoid merge surprises; web/api publish no host ports, only Caddy does):

```yaml
# Production stack for a VPS: docker compose -f docker-compose.prod.yml up -d --build
# Prereqs: root .env filled (Supabase keys, NEXT_PUBLIC_API_URL=https://$DOMAIN_API,
# CORS_ORIGINS=https://$DOMAIN_WEB, DOMAIN_WEB, DOMAIN_API) and both domains'
# DNS A records pointing at this machine. Caddy fetches TLS automatically.
services:
  api:
    build: ./api
    restart: unless-stopped
    environment:
      MOCK_MODE: ${MOCK_MODE:-true}
      CORS_ORIGINS: ${CORS_ORIGINS:?set CORS_ORIGINS in .env}
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 5s
      retries: 3

  web:
    build:
      context: ./web
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL:?set in .env}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY:?set in .env}
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:?set in .env}
    restart: unless-stopped
    depends_on:
      - api
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/en').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN_WEB: ${DOMAIN_WEB:?set DOMAIN_WEB in .env}
      DOMAIN_API: ${DOMAIN_API:?set DOMAIN_API in .env}
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
      - api

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 3: Append to `.env.example`:**

```bash
# VPS production (docker-compose.prod.yml) only: the two public hostnames.
# Their DNS A records must point at the VPS; Caddy fetches TLS automatically.
DOMAIN_WEB=project.example.com
DOMAIN_API=api.example.com
```

- [ ] **Step 4: README "Deploy on a VPS" section** (after the existing docker section): DNS A records for both domains → VPS IP (Cloudflare: proxy OFF until first cert issues), `cp .env.example .env` and fill Supabase keys + `NEXT_PUBLIC_API_URL=https://<DOMAIN_API>` + `CORS_ORIGINS=https://<DOMAIN_WEB>` + both domains, then `docker compose -f docker-compose.prod.yml up -d --build`. Note ports 80/443 must be open and that web/api are not host-exposed (Caddy is the only entrypoint).

- [ ] **Step 5: Verify structurally (no real domains needed):**

```bash
DOMAIN_WEB=web.localhost DOMAIN_API=api.localhost docker compose -f docker-compose.prod.yml config >/dev/null && echo "compose valid"
docker compose -f docker-compose.prod.yml up -d --build
sleep 25 && docker compose -f docker-compose.prod.yml ps   # web+api healthy
curl -s -H "Host: web.localhost" http://localhost/en -o /dev/null -w '%{http_code}\n'   # 200 via caddy (http->https redirect 308 also acceptable)
docker compose -f docker-compose.prod.yml down
docker compose up -d   # restore the dev demo stack
```

(`*.localhost` resolves to 127.0.0.1; Caddy serves localhost domains with an internal cert, so a 308 redirect or 200 both prove routing. The point is: services build, become healthy, and Caddy proxies.)

- [ ] **Step 6: Commit**

```bash
git add docker-compose.prod.yml deploy/Caddyfile .env.example README.md
git commit -m "feat: VPS-ready production stack — Caddy HTTPS, healthchecks, one command"
```

---

### Task 3: API on Render free tier (INTERACTIVE — needs user)

**Files:** none in repo (Render dashboard / API)

- [ ] **Step 1: Ask the user** to create a free account at render.com. Two supported routes — let the user pick: (a) connect a GitHub repo (requires pushing this repo to GitHub first — coordinate with the user; repo currently has NO remote), or (b) user creates the service manually in the dashboard with these exact settings while you supply values:
  - Type: Web Service, runtime Docker, root directory `api/`.
  - Instance type: Free.
  - Env vars: `MOCK_MODE=true`, `CORS_ORIGINS=https://project.razzak.me`.
- [ ] **Step 2: Record the assigned URL** (`https://<service>.onrender.com`), verify `curl -s <url>/health` → `{"status":"ok","mock":true}` (first hit may take ~50s — free tier cold start).
- [ ] **Step 3 (optional, user choice): custom domain `api.razzak.me`** — user adds the domain in Render, then adds the CNAME Render shows (Cloudflare, proxy OFF). Then CORS needs no change (origin is the WEB domain), but `NEXT_PUBLIC_API_URL` in Task 4 uses `https://api.razzak.me`.

---

### Task 4: Web on Vercel at project.razzak.me (INTERACTIVE — needs user)

**Files:** none in repo

- [ ] **Step 1: User runs `npx vercel login`** (browser/email confirmation), from `web/`.
- [ ] **Step 2: Deploy:** from `web/`: `npx vercel --prod` — answer prompts: scope = user's account, link to new project `damagescale`, root is current dir. Then set production env vars and redeploy:

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production   # value: https://actzgzycogqukuvlmenp.supabase.co
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production   # the sb_publishable_ key
npx vercel env add NEXT_PUBLIC_API_URL production   # Render URL from Task 3
npx vercel --prod
```

- [ ] **Step 3: Domain:** `npx vercel domains add project.razzak.me` (or dashboard → project → Domains). DNS: the user has already been told to add `CNAME project → cname.vercel-dns.com.` (proxy OFF). Verify `https://project.razzak.me` serves.

---

### Task 5: Live verification + docs

- [ ] **Step 1:** From the deployed site (real browser via playwright-over-CDP if possible, else curl matrix): `/en` + `/ar` load over HTTPS; register/login against live Supabase; analyze a sample (browser → Render api CORS works); result saves; history shows it.
- [ ] **Step 2:** Update README deployment section with the live URLs, the Render cold-start warm-up note ("hit `<api>/health` one minute before presenting"), and the Vercel/Render env tables.
- [ ] **Step 3:** Commit: `git add README.md && git commit -m "docs: live deployment URLs + warm-up note"`.
- [ ] **Step 4:** Supabase auth hardening for the live domain: remind the user to add `https://project.razzak.me` to Supabase Auth → URL Configuration (Site URL / redirect allow-list) — email links and future auth flows depend on it.

## Self-review notes

- Spec B1→Task 4, B2→Tasks 1+3, B3→Task 5; VPS requirement (user message 2026-06-12) → Task 2.
- Interactive boundaries are explicit (Tasks 3–4); everything else is automatable.
- Task 2 Step 5 restores the dev stack so the local demo keeps working.
