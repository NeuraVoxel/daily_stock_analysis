# Market Flow — A-Share Sector Fund Flow Visualization

**Date:** 2026-07-29  
**Status:** Approved for implementation planning  
**Reference UI:** Mobile-style sector fund-flow diagram (left outflow / right inflow / market exit, arc + particle motion, dark theme, intraday scrubber)

## 1. Goal

Build a **standalone** application under `market-flow/` that visualizes A-share **industry** sector capital flows as a high-fidelity flow diagram, with period views:

- Realtime (intraday cumulative, scrubber when history slices exist)
- Day / Week / Month / Year

Zero coupling with existing `apps/dsa-web`, `api/`, `data_provider/`, root `.env`, or main Docker/CI publish paths in this MVP.

## 2. Decisions (locked)

| Topic | Choice |
| --- | --- |
| Delivery | Independent full-stack directory `market-flow/` |
| Market | A-shares only |
| Data source | Public free APIs (AkShare / East Money style); accept rate limits |
| Board type | Fixed **industry** boards for MVP (use the industry universe returned by the chosen public source, e.g. East Money industry list via AkShare — do not invent a custom taxonomy); concept boards later |
| Visual fidelity | High: nodes, arcs, particles, dark theme, time scrubber |
| Stack | React + Vite frontend; FastAPI backend; D3/SVG arcs + Canvas particles |
| Link semantics | Display-constructed flows for MVP; reserve `pair_links` for true pairwise rotation later |

## 3. Architecture

```text
market-flow/
  README.md
  backend/
    app/
      main.py
      api/routes_flow.py
      services/
        fetch_eastmoney.py
        normalize.py
        link_builder.py
        aggregate.py
        cache.py
      schemas/flow.py
    requirements.txt
    .env.example
  frontend/
    package.json
    src/
      App.tsx
      components/
        PeriodTabs.tsx
        TimeScrubber.tsx
        FlowCanvas.tsx
      api/client.ts
      types/flow.ts
```

**Runtime**

- Backend: `uvicorn` JSON API (localhost by default)
- Frontend: Vite dev server; proxy `/api` → backend
- Do not mount into existing `server.py` / main Docker stack unless explicitly requested later

**Data flow**

```text
Public source → fetch → normalize → (realtime slice | period aggregate)
            → link_builder(display_links + market_exit)
            → cache → GET /api/flow?period=&at=
            → React → FlowCanvas
```

## 4. API contract

`GET /api/flow?period={realtime|day|week|month|year}&at={optional ISO datetime}`

### Success payload

```json
{
  "period": "realtime",
  "as_of": "2026-07-29T10:30:00+08:00",
  "market": "CN",
  "board_type": "industry",
  "currency_unit": "yi",
  "nodes": [
    { "id": "半导体", "name": "半导体", "side": "out", "net": -65.18 },
    { "id": "银行", "name": "银行", "side": "in", "net": 4.69 },
    { "id": "market_exit", "name": "市场离场", "side": "exit", "net": -224.61 }
  ],
  "display_links": [
    { "from": "半导体", "to": "银行", "amount": 1.2 },
    { "from": "半导体", "to": "market_exit", "amount": 40.5 }
  ],
  "pair_links": [],
  "meta": {
    "source": "akshare/eastmoney",
    "link_mode": "display_constructed",
    "stale": false,
    "warnings": []
  }
}
```

### Field rules

- Amounts in **亿元** (`currency_unit: "yi"`)
- `nodes[].net`: outflow negative, inflow positive; `market_exit` uses negative net for exit magnitude
- `pair_links`: always `[]` in MVP; schema reserved for phase-2 true X→Y rotation
- `meta.link_mode`: `"display_constructed"` for MVP

### Period semantics

| period | Meaning |
| --- | --- |
| `realtime` | Same-day cumulative to now (or `at`); scrubber when historical slices exist |
| `day` | Last complete trading day (or specified day close snapshot) |
| `week` / `month` / `year` | Sum industry nets over the window, then run the same `link_builder` |

If public sources lack minute-level history, scrubber is disabled or sparse; surface reason in `meta.warnings` (e.g. unsupported scrub).

### Error payload

```json
{
  "error": {
    "code": "upstream_unavailable",
    "message": "资金流数据暂时不可用，请稍后重试"
  }
}
```

Stable codes: `upstream_unavailable` | `empty_data` | `unsupported_scrub`.

## 5. Display link algorithm (`link_builder`)

1. Take top-N net outflow sectors (left, green) and top-M net inflow sectors (right, red). Default N=M≈10 (named constants).
2. Approximate `market_exit ≈ max(0, Σ|outflow| − Σinflow)` when only per-sector nets are available.
3. Allocate each outflow sector’s outflow across right-side inflows (by inflow share) plus remaining to `market_exit`, producing `display_links`.
4. **Outflow-side conservation** must hold for included left nodes. Inflow-side may not fully conserve when Top-N truncation applies; record that in `meta.warnings`.
5. Arc thickness ∝ `amount`; particle density/speed scales with `amount` up to a hard cap.

This is an **explanatory visualization**, not audited pairwise capital rotation. Phase 2 may populate `pair_links` from richer sources without changing the UI container contract.

## 6. Visualization & UX

**Layout**

- Top: period tabs — 实时 / 每天 / 每周 / 每月 / 每年
- Second row: legend (grey initial / green outflow / red inflow / white market exit) + intraday scrubber (realtime only when supported)
- Main: left outflow column, right inflow column, bottom-right market-exit sink
- Footer: `as_of`, source, stale/warning text when present
- Portrait-first; desktop centered with wider canvas

**Rendering layers**

1. SVG/D3: labels, amounts, cubic Bezier arcs (semi-transparent green toward convergence)
2. Canvas overlay: particles along arc paths via `requestAnimationFrame`
3. Honor `prefers-reduced-motion` and a UI toggle to disable particles (arcs remain)

**Interactions**

- Period change → refetch `/api/flow` with new `period`; keep particle engine, swap graph data
- Scrubber → pass `at=`; grey out when unsupported
- Hover node → highlight related arcs; dim others
- Hover/click arc → tooltip `from → to · xx.xx亿`
- Realtime polling every 30–60s; pause when document is hidden

**Performance**

- Cap node counts (Top-N/M) and particle count
- Debounced resize relayout

## 7. Caching, rate limits, config

**Cache key:** `(period, as_of_bucket, board_type)`

**Suggested TTL**

- `realtime`: 30–60s
- `day`: 5–15min
- `week` / `month` / `year`: 1–6h

MVP: in-process memory cache. Optional on-disk cache is non-blocking for MVP.

**Upstream hygiene**

- In-flight dedupe per cache key
- 1–2 retries with backoff
- On failure: return not-too-old stale cache with `meta.stale=true`, else stable error code
- Never leak upstream stack traces to the client

**Config**

- Only `market-flow/backend/.env.example` (timeouts, TTLs, TopN/TopM, optional disk cache)
- Do **not** read repository root `.env`

## 8. Testing & acceptance

**Backend**

- Unit: `normalize`, `link_builder` (outflow conservation, non-negative exit, truncation warnings), `aggregate`
- Contract: `/api/flow` required fields for each period; `pair_links == []`
- Cache: second request for same key does not re-hit upstream (mocked fetch)
- Failure paths: upstream error → stale or stable error code

**Frontend**

- PeriodTabs emits correct query params
- TimeScrubber disabled when unsupported
- FlowCanvas renders left/right nodes and ≥1 arc from fixture
- Light assertion that enabling particles yields particle count > 0
- Visible handling for `meta.stale` / `warnings`

**Manual acceptance (vs reference)**

1. Dark theme; green out / red in / white market exit
2. Arc width varies with amount; particles move along arcs (toggleable)
3. All five periods switch with data change or explicit empty state
4. Realtime polling does not freeze UI; pause when tab hidden
5. Upstream down → readable error/stale, no blank crash

## 9. Out of scope (this round)

- Concept board switching
- True pairwise `pair_links` population
- Integration into `dsa-web` / main FastAPI / desktop
- Main repo Docker/CI publish wiring
- Committing ephemeral reference screenshots into product docs (keep design references external or local-only)

## 10. Phase 2 hints (non-blocking)

- Add `board_type=concept` toggle
- Populate `pair_links` when a source provides X→Y rotation; prefer links from `pair_links` when non-empty, else fall back to `display_links`
- Optional embedding behind a main-app route with an iframe or shared package — only after an explicit coupling decision

## 11. Rollback

Delete or ignore the `market-flow/` directory; no changes to main application runtime paths in MVP.
