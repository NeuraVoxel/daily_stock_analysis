# Market Flow — 行业资金流向

Standalone A-share **industry** sector fund-flow visualization. This app lives under `market-flow/` and is **not** part of the main DSA runtime (`main.py`, `server.py`, `apps/dsa-web`, root `.env`, or main Docker/CI paths).

## Quick start

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

Optional config: copy `backend/.env.example` to `backend/.env` (timeouts, cache TTLs, Top-N/M). Do **not** use the repository root `.env`.

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
