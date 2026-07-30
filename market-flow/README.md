# Market Flow — 行业资金流向

Standalone A-share **industry** sector fund-flow visualization. This app lives under `market-flow/` and is **not** part of the main DSA runtime (`main.py`, `server.py`, `apps/dsa-web`, root `.env`, or main `docker/` compose).

## Quick start (Docker)

From `market-flow/`:

```bash
cp .env.example .env   # optional: ports / CORS / cache
docker compose up --build
```

- UI: `http://127.0.0.1:8080` (nginx serves the SPA and proxies `/api` → backend)
- API (direct): `http://127.0.0.1:8001/api/health`

Stop: `docker compose down`

### Hot reload (Vite HMR)

The default compose serves a **built** nginx SPA on `:8080` — source edits need `docker compose up --build frontend`. For live edits, use one of:

**A. Recommended — Docker backend + local Vite**

```bash
# keep API in Docker
docker compose up -d backend

# HMR in a host terminal
cd frontend && pnpm install && pnpm run dev
```

Open `http://127.0.0.1:5173` (proxies `/api` → `:8001`).

**B. Full Docker HMR**

```bash
# stop the nginx SPA stack first (avoids port / project conflicts)
docker compose down
docker compose -f docker-compose.dev.yml up --build
```

Open `http://127.0.0.1:5173`. Mounts `frontend/` into a Vite container; save → browser hot-updates, no nginx rebuild.

## Quick start (local without Docker)

### Backend (Python 3.10+ recommended)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8001
```

Health check: `GET http://127.0.0.1:8001/api/health`

### Frontend

```bash
cd frontend
pnpm install   # or: npm install
pnpm run dev   # or: npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` → `http://127.0.0.1:8001`.

Optional config:
- Docker / compose: `market-flow/.env` (from `.env.example`)
- Local uvicorn: `backend/.env` (from `backend/.env.example`)

Do **not** use the repository root `.env`.
## Period mapping

The UI shows five tabs; the backend maps them to East Money / AkShare indicator windows:

| UI tab | API `period` | Upstream indicator | Notes |
| --- | --- | --- | --- |
| 实时 | `realtime` | 今日 | Intraday cumulative; session snapshots power the scrubber (no API `at=` in MVP) |
| 每天 | `day` | 今日 | Same-day / latest complete snapshot |
| 每周 | `week` | 5日 | **Approximation** — public source has no true calendar week |
| 每月 | `month` | 10日 | **Approximation** — not a natural-month sum |
| 每年 | `year` | 10日 | **Approximation** — no public year window; degraded to 10-day |

Warnings for week/month/year approximations appear in `meta.warnings` and in the UI banner.

## Display-constructed links

Arcs and particles illustrate sector flow direction and magnitude. `display_links` are **constructed for visualization** from top outflow/inflow sectors plus a `market_exit` sink — they are **not** audited pairwise capital rotation. `pair_links` is reserved (`[]` in MVP) for future true X→Y rotation data.

## Intraday demo (09:30→15:00)

The UI **演示 09:30→15:00** button loads a synthetic A-share session (morning 09:30–11:30 + afternoon 13:00–15:00), then auto-plays the scrubber so arcs/particles evolve across the trading day. This does **not** call the API `at=` scrub (unsupported upstream); exit demo to resume live polling.

## Tests

```bash
# Backend (from market-flow/backend)
pytest -v

# Frontend (from market-flow/frontend)
pnpm test
pnpm run build
```

## API

`GET /api/flow?period={realtime|day|week|month|year}`

Returns nodes (green outflow / red inflow / white market exit), `display_links`, and `meta` (`source`, `stale`, `warnings`, `link_mode: display_constructed`).
