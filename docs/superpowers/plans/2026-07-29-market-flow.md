# Market Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `market-flow/` app that shows A-share industry fund flows as a high-fidelity arc+particle diagram for realtime / day / week / month / year.

**Architecture:** Independent FastAPI backend fetches East Money industry ranks via AkShare, normalizes nets, builds display-constructed links (plus `market_exit`), caches responses; React+Vite frontend renders D3 arcs and Canvas particles with period tabs and an intraday scrubber (session snapshots only).

**Tech Stack:** Python 3.10+, FastAPI, uvicorn, pydantic, akshare, pytest; React 18, TypeScript, Vite, d3, vitest.

**Spec:** `docs/superpowers/specs/2026-07-29-market-flow-design.md`

---

## File map

| Path | Responsibility |
| --- | --- |
| `market-flow/README.md` | How to install and run backend + frontend |
| `market-flow/backend/requirements.txt` | Backend deps |
| `market-flow/backend/.env.example` | TTL, TopN/TopM, timeouts (no root `.env`) |
| `market-flow/backend/app/__init__.py` | Package marker |
| `market-flow/backend/app/main.py` | FastAPI app + CORS for Vite |
| `market-flow/backend/app/schemas/flow.py` | Pydantic request/response models |
| `market-flow/backend/app/services/link_builder.py` | Display links + market_exit |
| `market-flow/backend/app/services/normalize.py` | DataFrame → sector nets (亿元) |
| `market-flow/backend/app/services/aggregate.py` | Period → AkShare indicator + warnings |
| `market-flow/backend/app/services/cache.py` | In-memory TTL cache + single-flight |
| `market-flow/backend/app/services/fetch_eastmoney.py` | AkShare `stock_sector_fund_flow_rank` |
| `market-flow/backend/app/services/flow_service.py` | Orchestrate fetch → normalize → links → cache |
| `market-flow/backend/app/api/routes_flow.py` | `GET /api/flow` |
| `market-flow/backend/tests/...` | Pytest suite (run from `market-flow/backend`) |
| `market-flow/frontend/...` | Vite React app |
| `market-flow/frontend/src/types/flow.ts` | Mirror API types |
| `market-flow/frontend/src/api/client.ts` | Fetch helper |
| `market-flow/frontend/src/components/PeriodTabs.tsx` | Period switcher |
| `market-flow/frontend/src/components/TimeScrubber.tsx` | Intraday scrubber UI |
| `market-flow/frontend/src/components/FlowCanvas.tsx` | SVG arcs + Canvas particles |
| `market-flow/frontend/src/App.tsx` | Wire data, polling, layout |

**Period mapping (public-source constraint — required):**

| API `period` | Upstream indicator | Notes |
| --- | --- | --- |
| `realtime` | `今日` | Same as live day cumulative; scrubber uses **in-process session snapshots** only |
| `day` | `今日` | Same upstream; label as day snapshot |
| `week` | `5日` | Closest public window |
| `month` | `10日` | Closest public window; add warning |
| `year` | `10日` | No year window publicly; add strong warning that year is approximated |

Do **not** invent fake year aggregation. Always surface honesty via `meta.warnings`.

---

### Task 1: Backend scaffold + schemas

**Files:**
- Create: `market-flow/backend/requirements.txt`
- Create: `market-flow/backend/.env.example`
- Create: `market-flow/backend/app/__init__.py`
- Create: `market-flow/backend/app/schemas/__init__.py`
- Create: `market-flow/backend/app/schemas/flow.py`
- Create: `market-flow/backend/tests/test_schemas.py`
- Create: `market-flow/backend/pytest.ini`

- [ ] **Step 1: Write requirements and pytest config**

`market-flow/backend/requirements.txt`:

```text
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
akshare>=1.14.0
pandas>=2.0.0
httpx>=0.27.0
pytest>=8.0.0
```

`market-flow/backend/pytest.ini`:

```ini
[pytest]
pythonpath = .
testpaths = tests
```

`market-flow/backend/.env.example`:

```env
FLOW_TOP_N=10
FLOW_TOP_M=10
CACHE_TTL_REALTIME_SEC=45
CACHE_TTL_DAY_SEC=600
CACHE_TTL_LONG_SEC=3600
UPSTREAM_TIMEOUT_SEC=20
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

- [ ] **Step 2: Write failing schema round-trip test**

```python
# market-flow/backend/tests/test_schemas.py
from app.schemas.flow import FlowResponse, FlowNode, DisplayLink, FlowMeta


def test_flow_response_requires_pair_links_list():
    payload = FlowResponse(
        period="realtime",
        as_of="2026-07-29T10:30:00+08:00",
        market="CN",
        board_type="industry",
        currency_unit="yi",
        nodes=[
            FlowNode(id="半导体", name="半导体", side="out", net=-65.18),
            FlowNode(id="银行", name="银行", side="in", net=4.69),
            FlowNode(id="market_exit", name="市场离场", side="exit", net=-50.0),
        ],
        display_links=[
            DisplayLink(from_id="半导体", to="银行", amount=1.2),
            DisplayLink(from_id="半导体", to="market_exit", amount=40.5),
        ],
        pair_links=[],
        meta=FlowMeta(
            source="akshare/eastmoney",
            link_mode="display_constructed",
            stale=False,
            warnings=[],
        ),
    )
    data = payload.model_dump(by_alias=True)
    assert data["pair_links"] == []
    assert data["display_links"][0]["from"] == "半导体"
    assert data["meta"]["link_mode"] == "display_constructed"
```

Note: use field alias `from` → Python attribute `from_id` because `from` is reserved.

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
cd market-flow/backend && pip install -r requirements.txt && pytest tests/test_schemas.py -v
```

Expected: FAIL with `ModuleNotFoundError: app.schemas`

- [ ] **Step 4: Implement schemas**

```python
# market-flow/backend/app/__init__.py
# empty

# market-flow/backend/app/schemas/__init__.py
# empty

# market-flow/backend/app/schemas/flow.py
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Period = Literal["realtime", "day", "week", "month", "year"]
NodeSide = Literal["out", "in", "exit"]


class FlowNode(BaseModel):
    id: str
    name: str
    side: NodeSide
    net: float


class DisplayLink(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_id: str = Field(alias="from")
    to: str
    amount: float


class PairLink(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_id: str = Field(alias="from")
    to: str
    amount: float


class FlowMeta(BaseModel):
    source: str
    link_mode: Literal["display_constructed"] = "display_constructed"
    stale: bool = False
    warnings: list[str] = Field(default_factory=list)


class FlowResponse(BaseModel):
    period: Period
    as_of: str
    market: Literal["CN"] = "CN"
    board_type: Literal["industry"] = "industry"
    currency_unit: Literal["yi"] = "yi"
    nodes: list[FlowNode]
    display_links: list[DisplayLink]
    pair_links: list[PairLink] = Field(default_factory=list)
    meta: FlowMeta


class FlowErrorBody(BaseModel):
    code: Literal["upstream_unavailable", "empty_data", "unsupported_scrub"]
    message: str


class FlowErrorResponse(BaseModel):
    error: FlowErrorBody
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd market-flow/backend && pytest tests/test_schemas.py -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add market-flow/backend
git commit -m "feat(market-flow): scaffold backend schemas"
```

---

### Task 2: `link_builder` (TDD)

**Files:**
- Create: `market-flow/backend/app/services/__init__.py`
- Create: `market-flow/backend/app/services/link_builder.py`
- Create: `market-flow/backend/tests/test_link_builder.py`

- [ ] **Step 1: Write failing tests**

```python
# market-flow/backend/tests/test_link_builder.py
from app.services.link_builder import build_display_graph


def test_outflow_side_conserved_and_exit_non_negative():
    sectors = [
        {"id": "A", "name": "A", "net": -100.0},
        {"id": "B", "name": "B", "net": -50.0},
        {"id": "X", "name": "X", "net": 30.0},
        {"id": "Y", "name": "Y", "net": 20.0},
    ]
    nodes, links, warnings = build_display_graph(sectors, top_n=10, top_m=10)

    exit_node = next(n for n in nodes if n["id"] == "market_exit")
    assert exit_node["net"] <= 0
    assert abs(exit_node["net"]) == 100.0  # 150 out - 50 in

    by_from = {}
    for link in links:
        by_from.setdefault(link["from"], 0.0)
        by_from[link["from"]] += link["amount"]
    assert abs(by_from["A"] - 100.0) < 1e-6
    assert abs(by_from["B"] - 50.0) < 1e-6
    assert warnings == []


def test_top_n_truncation_adds_warning():
    sectors = [{"id": f"O{i}", "name": f"O{i}", "net": -float(i + 1)} for i in range(12)]
    sectors += [{"id": "IN", "name": "IN", "net": 5.0}]
    nodes, links, warnings = build_display_graph(sectors, top_n=3, top_m=3)
    assert any("truncat" in w.lower() or "截断" in w for w in warnings)
    assert len([n for n in nodes if n["side"] == "out"]) == 3
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd market-flow/backend && pytest tests/test_link_builder.py -v
```

Expected: FAIL `ModuleNotFoundError`

- [ ] **Step 3: Implement `link_builder.py`**

```python
# market-flow/backend/app/services/__init__.py
# empty

# market-flow/backend/app/services/link_builder.py
from __future__ import annotations

from typing import Any


def build_display_graph(
    sectors: list[dict[str, Any]],
    *,
    top_n: int = 10,
    top_m: int = 10,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    """Build nodes + display_links from per-sector nets (亿元).

    Outflow nets are negative; inflow nets positive.
    """
    warnings: list[str] = []
    outs = sorted(
        [s for s in sectors if float(s["net"]) < 0],
        key=lambda s: float(s["net"]),
    )
    ins = sorted(
        [s for s in sectors if float(s["net"]) > 0],
        key=lambda s: float(s["net"]),
        reverse=True,
    )

    if len(outs) > top_n:
        warnings.append(f"流出板块已截断为 Top-{top_n}，流入侧守恒可能不完整")
    if len(ins) > top_m:
        warnings.append(f"流入板块已截断为 Top-{top_m}")

    outs = outs[:top_n]
    ins = ins[:top_m]

    total_out = sum(-float(s["net"]) for s in outs)
    total_in = sum(float(s["net"]) for s in ins)
    exit_amount = max(0.0, total_out - total_in)

    nodes: list[dict[str, Any]] = []
    for s in outs:
        nodes.append(
            {
                "id": s["id"],
                "name": s["name"],
                "side": "out",
                "net": float(s["net"]),
            }
        )
    for s in ins:
        nodes.append(
            {
                "id": s["id"],
                "name": s["name"],
                "side": "in",
                "net": float(s["net"]),
            }
        )
    nodes.append(
        {
            "id": "market_exit",
            "name": "市场离场",
            "side": "exit",
            "net": -exit_amount,
        }
    )

    links: list[dict[str, Any]] = []
    if total_out <= 0:
        return nodes, links, warnings

    for out in outs:
        out_amt = -float(out["net"])
        remaining = out_amt
        if total_in > 0:
            for inn in ins:
                share = float(inn["net"]) / total_in
                alloc = out_amt * (total_in / total_out) * share
                if alloc <= 0:
                    continue
                links.append(
                    {
                        "from": out["id"],
                        "to": inn["id"],
                        "amount": round(alloc, 4),
                    }
                )
                remaining -= alloc
        if remaining > 1e-9:
            links.append(
                {
                    "from": out["id"],
                    "to": "market_exit",
                    "amount": round(remaining, 4),
                }
            )

    return nodes, links, warnings
```

Allocation rule: each outflow contributes proportionally so Σ(links to inflows) = `total_in` and Σ(links to market_exit) = `exit_amount`, while each outflow’s link amounts sum to its outflow.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd market-flow/backend && pytest tests/test_link_builder.py -v
```

If `test_outflow_side_conserved` fails due to float/allocation math, adjust remaining assignment so per-`from` sums match `|net|` exactly (prefer fixing exit residual on last link).

- [ ] **Step 5: Commit**

```bash
git add market-flow/backend/app/services/link_builder.py market-flow/backend/tests/test_link_builder.py
git commit -m "feat(market-flow): add display link builder"
```

---

### Task 3: `normalize` + `aggregate`

**Files:**
- Create: `market-flow/backend/app/services/normalize.py`
- Create: `market-flow/backend/app/services/aggregate.py`
- Create: `market-flow/backend/tests/test_normalize.py`
- Create: `market-flow/backend/tests/test_aggregate.py`

- [ ] **Step 1: Write failing tests**

```python
# market-flow/backend/tests/test_normalize.py
import pandas as pd
from app.services.normalize import normalize_sector_rank_df


def test_normalize_converts_yuan_to_yi_and_picks_net_column():
    df = pd.DataFrame(
        {
            "名称": ["半导体", "银行"],
            "今日主力净流入-净额": [-6_518_000_000, 469_000_000],
        }
    )
    rows = normalize_sector_rank_df(df, indicator="今日")
    by_id = {r["id"]: r for r in rows}
    assert abs(by_id["半导体"]["net"] - (-65.18)) < 0.01
    assert abs(by_id["银行"]["net"] - 4.69) < 0.01
```

```python
# market-flow/backend/tests/test_aggregate.py
from app.services.aggregate import resolve_period


def test_resolve_period_mapping_and_warnings():
    assert resolve_period("realtime")["indicator"] == "今日"
    assert resolve_period("week")["indicator"] == "5日"
    month = resolve_period("month")
    assert month["indicator"] == "10日"
    assert month["warnings"]
    year = resolve_period("year")
    assert year["indicator"] == "10日"
    assert any("年" in w or "year" in w.lower() for w in year["warnings"])
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd market-flow/backend && pytest tests/test_normalize.py tests/test_aggregate.py -v
```

- [ ] **Step 3: Implement**

```python
# market-flow/backend/app/services/normalize.py
from __future__ import annotations

import pandas as pd

_NAME_KEYS = ("名称", "板块", "行业", "name")
_NET_SUFFIX = "主力净流入-净额"


def normalize_sector_rank_df(df: pd.DataFrame, *, indicator: str) -> list[dict]:
    if df is None or df.empty:
        return []

    name_col = next(
        (c for c in df.columns if any(k in str(c) for k in _NAME_KEYS)),
        None,
    )
    # Prefer indicator-prefixed net column, else any 主力净流入-净额
    net_col = None
    preferred = f"{indicator}{_NET_SUFFIX}" if not indicator.endswith("净额") else indicator
    for c in df.columns:
        if str(c) == preferred or str(c).endswith(_NET_SUFFIX) or "净流入-净额" in str(c):
            net_col = c
            break
    if name_col is None or net_col is None:
        return []

    rows: list[dict] = []
    for _, raw in df.iterrows():
        name = str(raw[name_col]).strip()
        if not name or name == "nan":
            continue
        val = pd.to_numeric(raw[net_col], errors="coerce")
        if pd.isna(val):
            continue
        net_yi = float(val) / 1e8
        rows.append({"id": name, "name": name, "net": round(net_yi, 4)})
    return rows
```

```python
# market-flow/backend/app/services/aggregate.py
from __future__ import annotations

from typing import Any, Literal

Period = Literal["realtime", "day", "week", "month", "year"]

_MAP: dict[Period, dict[str, Any]] = {
    "realtime": {"indicator": "今日", "warnings": []},
    "day": {"indicator": "今日", "warnings": []},
    "week": {"indicator": "5日", "warnings": ["周视图使用公开源「5日」窗口近似"]},
    "month": {
        "indicator": "10日",
        "warnings": ["月视图使用公开源「10日」窗口近似，非自然月加总"],
    },
    "year": {
        "indicator": "10日",
        "warnings": [
            "年视图暂无公开年窗口，当前降级为「10日」近似，请勿当作真实年资金流"
        ],
    },
}


def resolve_period(period: Period) -> dict[str, Any]:
    return {
        "indicator": _MAP[period]["indicator"],
        "warnings": list(_MAP[period]["warnings"]),
    }
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd market-flow/backend && pytest tests/test_normalize.py tests/test_aggregate.py -v
```

- [ ] **Step 5: Commit**

```bash
git add market-flow/backend/app/services/normalize.py market-flow/backend/app/services/aggregate.py \
  market-flow/backend/tests/test_normalize.py market-flow/backend/tests/test_aggregate.py
git commit -m "feat(market-flow): add normalize and period mapping"
```

---

### Task 4: Cache + fetch + flow_service

**Files:**
- Create: `market-flow/backend/app/services/cache.py`
- Create: `market-flow/backend/app/services/fetch_eastmoney.py`
- Create: `market-flow/backend/app/services/flow_service.py`
- Create: `market-flow/backend/app/settings.py`
- Create: `market-flow/backend/tests/test_cache.py`
- Create: `market-flow/backend/tests/test_flow_service.py`

- [ ] **Step 1: Write failing cache + service tests**

```python
# market-flow/backend/tests/test_cache.py
import time
from app.services.cache import TtlCache


def test_ttl_cache_hit_and_expire():
    c = TtlCache()
    c.set("k", {"ok": 1}, ttl_sec=1)
    assert c.get("k") == {"ok": 1}
    time.sleep(1.1)
    assert c.get("k") is None


def test_single_flight_dedupes():
    c = TtlCache()
    calls = {"n": 0}

    def factory():
        calls["n"] += 1
        return {"v": calls["n"]}

    a = c.get_or_set("x", ttl_sec=30, factory=factory)
    b = c.get_or_set("x", ttl_sec=30, factory=factory)
    assert a == b == {"v": 1}
    assert calls["n"] == 1
```

```python
# market-flow/backend/tests/test_flow_service.py
import pandas as pd
from app.services.flow_service import build_flow_response


def test_build_flow_response_with_injected_df():
    df = pd.DataFrame(
        {
            "名称": ["半导体", "银行", "白酒"],
            "今日主力净流入-净额": [-6_518_000_000, 469_000_000, 361_000_000],
        }
    )
    resp = build_flow_response(
        period="realtime",
        df=df,
        indicator="今日",
        extra_warnings=[],
        as_of="2026-07-29T10:30:00+08:00",
        stale=False,
        top_n=10,
        top_m=10,
    )
    assert resp.pair_links == []
    assert resp.meta.link_mode == "display_constructed"
    assert any(n.id == "market_exit" for n in resp.nodes)
    assert len(resp.display_links) >= 1
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd market-flow/backend && pytest tests/test_cache.py tests/test_flow_service.py -v
```

- [ ] **Step 3: Implement cache, settings, fetch, flow_service**

```python
# market-flow/backend/app/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    flow_top_n: int = 10
    flow_top_m: int = 10
    cache_ttl_realtime_sec: int = 45
    cache_ttl_day_sec: int = 600
    cache_ttl_long_sec: int = 3600
    upstream_timeout_sec: int = 20
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


def get_settings() -> Settings:
    return Settings()
```

```python
# market-flow/backend/app/services/cache.py
from __future__ import annotations

import threading
import time
from typing import Any, Callable


class TtlCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self._inflight: dict[str, threading.Event] = {}

    def get(self, key: str) -> Any | None:
        with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires_at, value = item
            if time.time() >= expires_at:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, *, ttl_sec: float) -> None:
        with self._lock:
            self._store[key] = (time.time() + ttl_sec, value)

    def get_or_set(self, key: str, *, ttl_sec: float, factory: Callable[[], Any]) -> Any:
        hit = self.get(key)
        if hit is not None:
            return hit
        with self._lock:
            event = self._inflight.get(key)
            if event is None:
                event = threading.Event()
                self._inflight[key] = event
                owner = True
            else:
                owner = False
        if not owner:
            event.wait(timeout=60)
            return self.get(key)
        try:
            value = factory()
            self.set(key, value, ttl_sec=ttl_sec)
            return value
        finally:
            with self._lock:
                self._inflight.pop(key, None)
            event.set()
```

```python
# market-flow/backend/app/services/fetch_eastmoney.py
from __future__ import annotations

import pandas as pd


def fetch_sector_fund_flow_rank(*, indicator: str) -> pd.DataFrame:
    """Fetch industry fund-flow rank from AkShare / East Money."""
    import akshare as ak

    df = ak.stock_sector_fund_flow_rank(
        indicator=indicator,
        sector_type="行业资金流",
    )
    if df is None:
        return pd.DataFrame()
    return df
```

```python
# market-flow/backend/app/services/flow_service.py
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Literal

import pandas as pd

from app.schemas.flow import DisplayLink, FlowMeta, FlowNode, FlowResponse
from app.services.aggregate import resolve_period
from app.services.link_builder import build_display_graph
from app.services.normalize import normalize_sector_rank_df

Period = Literal["realtime", "day", "week", "month", "year"]
CN_TZ = timezone(timedelta(hours=8))


def build_flow_response(
    *,
    period: Period,
    df: pd.DataFrame,
    indicator: str,
    extra_warnings: list[str],
    as_of: str,
    stale: bool,
    top_n: int,
    top_m: int,
) -> FlowResponse:
    sectors = normalize_sector_rank_df(df, indicator=indicator)
    nodes_raw, links_raw, link_warnings = build_display_graph(
        sectors, top_n=top_n, top_m=top_m
    )
    warnings = list(extra_warnings) + link_warnings
    nodes = [FlowNode(**n) for n in nodes_raw]
    links = [
        DisplayLink.model_validate(
            {"from": x["from"], "to": x["to"], "amount": x["amount"]}
        )
        for x in links_raw
    ]
    return FlowResponse(
        period=period,
        as_of=as_of,
        nodes=nodes,
        display_links=links,
        pair_links=[],
        meta=FlowMeta(
            source="akshare/eastmoney",
            link_mode="display_constructed",
            stale=stale,
            warnings=warnings,
        ),
    )


def ttl_for_period(period: Period, settings: Any) -> int:
    if period == "realtime":
        return settings.cache_ttl_realtime_sec
    if period == "day":
        return settings.cache_ttl_day_sec
    return settings.cache_ttl_long_sec


def now_as_of() -> str:
    return datetime.now(CN_TZ).replace(microsecond=0).isoformat()
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd market-flow/backend && pytest tests/test_cache.py tests/test_flow_service.py -v
```

- [ ] **Step 5: Commit**

```bash
git add market-flow/backend/app/settings.py market-flow/backend/app/services \
  market-flow/backend/tests/test_cache.py market-flow/backend/tests/test_flow_service.py
git commit -m "feat(market-flow): add cache, fetch, and flow service"
```

---

### Task 5: FastAPI route + main

**Files:**
- Create: `market-flow/backend/app/api/__init__.py`
- Create: `market-flow/backend/app/api/routes_flow.py`
- Create: `market-flow/backend/app/main.py`
- Create: `market-flow/backend/tests/test_api_flow.py`

- [ ] **Step 1: Write API test with mocked fetch**

```python
# market-flow/backend/tests/test_api_flow.py
import pandas as pd
from fastapi.testclient import TestClient
from app.main import app
from app.services import fetch_eastmoney


def test_get_flow_ok(monkeypatch):
    df = pd.DataFrame(
        {
            "名称": ["半导体", "银行"],
            "今日主力净流入-净额": [-1_000_000_000, 200_000_000],
        }
    )
    monkeypatch.setattr(
        fetch_eastmoney,
        "fetch_sector_fund_flow_rank",
        lambda indicator: df,
    )
    client = TestClient(app)
    res = client.get("/api/flow", params={"period": "realtime"})
    assert res.status_code == 200
    body = res.json()
    assert body["pair_links"] == []
    assert body["currency_unit"] == "yi"
    assert body["display_links"]


def test_get_flow_upstream_error(monkeypatch):
    def boom(indicator):
        raise RuntimeError("network")

    monkeypatch.setattr(
        fetch_eastmoney,
        "fetch_sector_fund_flow_rank",
        boom,
    )
    client = TestClient(app)
    res = client.get("/api/flow", params={"period": "day"})
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "upstream_unavailable"
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd market-flow/backend && pytest tests/test_api_flow.py -v
```

- [ ] **Step 3: Implement routes + main**

```python
# market-flow/backend/app/api/__init__.py
# empty

# market-flow/backend/app/api/routes_flow.py
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query

from app.schemas.flow import FlowErrorBody, FlowErrorResponse, FlowResponse
from app.services import fetch_eastmoney
from app.services.aggregate import resolve_period
from app.services.cache import TtlCache
from app.services.flow_service import build_flow_response, now_as_of, ttl_for_period
from app.settings import get_settings

router = APIRouter()
_cache = TtlCache()
_last_good: dict[str, FlowResponse] = {}

Period = Literal["realtime", "day", "week", "month", "year"]


@router.get("/flow", response_model=FlowResponse)
def get_flow(
    period: Period = Query(...),
    at: Optional[str] = Query(None),
) -> FlowResponse:
    settings = get_settings()
    resolved = resolve_period(period)
    indicator = resolved["indicator"]
    cache_key = f"{period}:{indicator}:industry"

    if at is not None:
        # MVP: no historical upstream slices; only reject explicit scrub for non-session use
        raise HTTPException(
            status_code=400,
            detail=FlowErrorResponse(
                error=FlowErrorBody(
                    code="unsupported_scrub",
                    message="当前公开源不支持按历史时刻回放，请使用页面内会话快照时间轴",
                )
            ).model_dump(),
        )

    def factory() -> FlowResponse:
        df = fetch_eastmoney.fetch_sector_fund_flow_rank(indicator=indicator)
        if df is None or df.empty:
            raise RuntimeError("empty_data")
        return build_flow_response(
            period=period,
            df=df,
            indicator=indicator,
            extra_warnings=resolved["warnings"],
            as_of=now_as_of(),
            stale=False,
            top_n=settings.flow_top_n,
            top_m=settings.flow_top_m,
        )

    try:
        resp = _cache.get_or_set(
            cache_key,
            ttl_sec=ttl_for_period(period, settings),
            factory=factory,
        )
        _last_good[cache_key] = resp
        return resp
    except Exception:
        stale = _last_good.get(cache_key)
        if stale is not None:
            return stale.model_copy(
                update={
                    "meta": stale.meta.model_copy(
                        update={
                            "stale": True,
                            "warnings": list(stale.meta.warnings)
                            + ["上游失败，返回缓存数据"],
                        }
                    )
                }
            )
        raise HTTPException(
            status_code=503,
            detail=FlowErrorResponse(
                error=FlowErrorBody(
                    code="upstream_unavailable",
                    message="资金流数据暂时不可用，请稍后重试",
                )
            ).model_dump(),
        )
```

**Important:** FastAPI `HTTPException(detail=...)` may nest oddly for the client. Prefer a custom exception handler in `main.py` that returns the JSON shape from the design:

```python
# market-flow/backend/app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes_flow import router as flow_router
from app.settings import get_settings

settings = get_settings()
app = FastAPI(title="Market Flow", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(flow_router, prefix="/api")


@app.exception_handler(Exception)
async def unhandled(_, exc: Exception):
    # Keep generic; routes raise HTTPException for known cases
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "upstream_unavailable",
                "message": "资金流数据暂时不可用，请稍后重试",
            }
        },
    )


@app.get("/api/health")
def health():
    return {"ok": True}
```

Adjust `routes_flow.py` so API tests receive `{"error": {...}}` at top level: use `JSONResponse` directly instead of `HTTPException` for error paths if needed.

```python
# preferred error return in routes_flow.py
from fastapi.responses import JSONResponse

return JSONResponse(
    status_code=503,
    content={
        "error": {
            "code": "upstream_unavailable",
            "message": "资金流数据暂时不可用，请稍后重试",
        }
    },
)
```

Same pattern for `unsupported_scrub` with status 400.

- [ ] **Step 4: Fix tests if detail wrapping differs; ensure PASS**

```bash
cd market-flow/backend && pytest -v
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add market-flow/backend/app/main.py market-flow/backend/app/api \
  market-flow/backend/tests/test_api_flow.py
git commit -m "feat(market-flow): add FastAPI flow endpoint"
```

---

### Task 6: Frontend scaffold + types + client

**Files:**
- Create: `market-flow/frontend/` via Vite
- Create: `market-flow/frontend/src/types/flow.ts`
- Create: `market-flow/frontend/src/api/client.ts`
- Create: `market-flow/frontend/vite.config.ts` (proxy)
- Create: `market-flow/frontend/src/api/client.test.ts`

- [ ] **Step 1: Scaffold Vite app**

```bash
cd market-flow
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install d3
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Configure Vite proxy + vitest**

`market-flow/frontend/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8001",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

Add to `package.json` scripts: `"test": "vitest run"`.

Use backend port **8001** to avoid colliding with main DSA `8000`.

- [ ] **Step 3: Write types + client + failing test**

```ts
// market-flow/frontend/src/types/flow.ts
export type Period = "realtime" | "day" | "week" | "month" | "year";

export interface FlowNode {
  id: string;
  name: string;
  side: "out" | "in" | "exit";
  net: number;
}

export interface DisplayLink {
  from: string;
  to: string;
  amount: number;
}

export interface FlowMeta {
  source: string;
  link_mode: "display_constructed";
  stale: boolean;
  warnings: string[];
}

export interface FlowResponse {
  period: Period;
  as_of: string;
  market: "CN";
  board_type: "industry";
  currency_unit: "yi";
  nodes: FlowNode[];
  display_links: DisplayLink[];
  pair_links: DisplayLink[];
  meta: FlowMeta;
}

export interface FlowError {
  error: {
    code: "upstream_unavailable" | "empty_data" | "unsupported_scrub";
    message: string;
  };
}
```

```ts
// market-flow/frontend/src/api/client.ts
import type { FlowResponse, Period } from "../types/flow";

export async function fetchFlow(
  period: Period,
  at?: string,
): Promise<FlowResponse> {
  const params = new URLSearchParams({ period });
  if (at) params.set("at", at);
  const res = await fetch(`/api/flow?${params.toString()}`);
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message ?? "请求失败";
    throw new Error(msg);
  }
  return body as FlowResponse;
}
```

```ts
// market-flow/frontend/src/api/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFlow } from "./client";

describe("fetchFlow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/flow with period", async () => {
    const json = {
      period: "day",
      as_of: "2026-07-29T15:00:00+08:00",
      market: "CN",
      board_type: "industry",
      currency_unit: "yi",
      nodes: [],
      display_links: [],
      pair_links: [],
      meta: {
        source: "akshare/eastmoney",
        link_mode: "display_constructed",
        stale: false,
        warnings: [],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => json,
      }),
    );
    const data = await fetchFlow("day");
    expect(fetch).toHaveBeenCalledWith("/api/flow?period=day");
    expect(data.period).toBe("day");
  });
});
```

- [ ] **Step 4: Run frontend test**

```bash
cd market-flow/frontend && npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add market-flow/frontend
git commit -m "feat(market-flow): scaffold frontend types and API client"
```

---

### Task 7: PeriodTabs + TimeScrubber

**Files:**
- Create: `market-flow/frontend/src/components/PeriodTabs.tsx`
- Create: `market-flow/frontend/src/components/TimeScrubber.tsx`
- Create: `market-flow/frontend/src/components/PeriodTabs.test.tsx`
- Create: `market-flow/frontend/src/components/TimeScrubber.test.tsx`

- [ ] **Step 1: Write component tests**

```tsx
// market-flow/frontend/src/components/PeriodTabs.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PeriodTabs } from "./PeriodTabs";

describe("PeriodTabs", () => {
  it("emits period on click", () => {
    const onChange = vi.fn();
    render(<PeriodTabs value="realtime" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "每周" }));
    expect(onChange).toHaveBeenCalledWith("week");
  });
});
```

```tsx
// market-flow/frontend/src/components/TimeScrubber.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TimeScrubber } from "./TimeScrubber";

describe("TimeScrubber", () => {
  it("disables when unsupported", () => {
    render(
      <TimeScrubber
        enabled={false}
        marks={[]}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("slider")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Implement components**

```tsx
// market-flow/frontend/src/components/PeriodTabs.tsx
import type { Period } from "../types/flow";

const ITEMS: { id: Period; label: string }[] = [
  { id: "realtime", label: "实时" },
  { id: "day", label: "每天" },
  { id: "week", label: "每周" },
  { id: "month", label: "每月" },
  { id: "year", label: "每年" },
];

export function PeriodTabs(props: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div role="tablist" className="period-tabs">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={props.value === item.id}
          className={props.value === item.id ? "active" : ""}
          onClick={() => props.onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

```tsx
// market-flow/frontend/src/components/TimeScrubber.tsx
export function TimeScrubber(props: {
  enabled: boolean;
  marks: string[]; // ISO as_of list from session snapshots
  value: string | null;
  onChange: (iso: string) => void;
}) {
  const max = Math.max(props.marks.length - 1, 0);
  const index = props.value ? Math.max(0, props.marks.indexOf(props.value)) : max;
  return (
    <div className="scrubber">
      <input
        role="slider"
        type="range"
        min={0}
        max={max}
        value={index}
        disabled={!props.enabled || props.marks.length === 0}
        onChange={(e) => {
          const i = Number(e.target.value);
          const mark = props.marks[i];
          if (mark) props.onChange(mark);
        }}
      />
      <div className="scrubber-labels">
        <span>09:30</span>
        <span>11:30</span>
        <span>15:00</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
cd market-flow/frontend && npm test
```

Expected: PASS (add `@testing-library/jest-dom` matchers in `src/test/setup.ts` if `toBeDisabled` needs it)

- [ ] **Step 4: Commit**

```bash
git add market-flow/frontend/src/components
git commit -m "feat(market-flow): add period tabs and time scrubber"
```

---

### Task 8: FlowCanvas (arcs + particles)

**Files:**
- Create: `market-flow/frontend/src/components/FlowCanvas.tsx`
- Create: `market-flow/frontend/src/components/FlowCanvas.test.tsx`
- Create: `market-flow/frontend/src/styles/flow.css`

- [ ] **Step 1: Write render test with fixture**

```tsx
// market-flow/frontend/src/components/FlowCanvas.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FlowCanvas } from "./FlowCanvas";
import type { FlowResponse } from "../types/flow";

const fixture: FlowResponse = {
  period: "realtime",
  as_of: "2026-07-29T10:30:00+08:00",
  market: "CN",
  board_type: "industry",
  currency_unit: "yi",
  nodes: [
    { id: "半导体", name: "半导体", side: "out", net: -65.18 },
    { id: "银行", name: "银行", side: "in", net: 4.69 },
    { id: "market_exit", name: "市场离场", side: "exit", net: -60 },
  ],
  display_links: [
    { from: "半导体", to: "银行", amount: 4.69 },
    { from: "半导体", to: "market_exit", amount: 60.49 },
  ],
  pair_links: [],
  meta: {
    source: "akshare/eastmoney",
    link_mode: "display_constructed",
    stale: false,
    warnings: [],
  },
};

describe("FlowCanvas", () => {
  it("renders outflow and inflow labels", () => {
    render(<FlowCanvas data={fixture} particlesEnabled={false} />);
    expect(screen.getByText(/半导体/)).toBeTruthy();
    expect(screen.getByText(/银行/)).toBeTruthy();
    expect(screen.getByText(/市场离场/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement FlowCanvas**

Implementation requirements (must all be present):

1. Dark background container (`.flow-canvas` near `#0a0a0a`)
2. Layout: left column `side==="out"`, right column `side==="in"`, bottom-right `market_exit`
3. SVG paths: cubic Bezier from left node center to right/exit; `strokeWidth` ∝ `sqrt(amount)` clamped
4. Stroke color green (`#22c55e`) with opacity ~0.35–0.7
5. Canvas overlay: when `particlesEnabled`, spawn particles along path using `path.getTotalLength()` / `getPointAtLength`; cap particle count (e.g. 120); pause when `document.hidden`
6. Respect `prefers-reduced-motion: reduce` → force particles off
7. Hover node: dim unrelated links (CSS class or opacity)

Skeleton:

```tsx
// market-flow/frontend/src/components/FlowCanvas.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { FlowResponse } from "../types/flow";

type Props = {
  data: FlowResponse;
  particlesEnabled: boolean;
};

export function FlowCanvas({ data, particlesEnabled }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const outs = data.nodes.filter((n) => n.side === "out");
  const ins = data.nodes.filter((n) => n.side === "in");
  const exitNode = data.nodes.find((n) => n.side === "exit");

  // compute layout positions in viewBox 0..1000 x 0..700
  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    outs.forEach((n, i) => {
      pos.set(n.id, { x: 120, y: 40 + (i * 600) / Math.max(outs.length - 1, 1) });
    });
    ins.forEach((n, i) => {
      pos.set(n.id, { x: 780, y: 40 + (i * 520) / Math.max(ins.length - 1, 1) });
    });
    if (exitNode) pos.set(exitNode.id, { x: 820, y: 640 });
    return pos;
  }, [outs, ins, exitNode]);

  useEffect(() => {
    // particle rAF loop using layout + display_links; cancel on cleanup
  }, [data, particlesEnabled, layout]);

  return (
    <div className="flow-canvas">
      <svg ref={svgRef} viewBox="0 0 1000 700" className="flow-svg">
        {data.display_links.map((link) => {
          const a = layout.get(link.from);
          const b = layout.get(link.to);
          if (!a || !b) return null;
          const midX = (a.x + b.x) / 2;
          const d = `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
          const active =
            !hoverId || hoverId === link.from || hoverId === link.to;
          return (
            <path
              key={`${link.from}-${link.to}-${link.amount}`}
              d={d}
              fill="none"
              stroke="#22c55e"
              strokeOpacity={active ? 0.55 : 0.12}
              strokeWidth={Math.min(18, 2 + Math.sqrt(link.amount))}
            />
          );
        })}
        {data.nodes.map((n) => {
          const p = layout.get(n.id);
          if (!p) return null;
          const color =
            n.side === "out" ? "#22c55e" : n.side === "in" ? "#ef4444" : "#f5f5f5";
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <circle cx={p.x} cy={p.y} r={5} fill={color} />
              <text
                x={n.side === "out" ? p.x - 12 : p.x + 12}
                y={p.y + 4}
                textAnchor={n.side === "out" ? "end" : "start"}
                fill={color}
                fontSize={14}
              >
                {n.name} {Math.abs(n.net).toFixed(2)}亿
              </text>
            </g>
          );
        })}
      </svg>
      <canvas ref={canvasRef} className="flow-particles" />
    </div>
  );
}
```

Complete the particle `useEffect` in implementation (do not leave empty). Use path length sampling; green particles for normal links, white-ish for links to `market_exit`.

- [ ] **Step 3: Add dark CSS**

```css
/* market-flow/frontend/src/styles/flow.css */
:root {
  --bg: #0a0a0a;
  --text: #e5e5e5;
  --green: #22c55e;
  --red: #ef4444;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Segoe UI", "PingFang SC", sans-serif;
}
.flow-canvas {
  position: relative;
  width: min(960px, 100%);
  margin: 0 auto;
  aspect-ratio: 10 / 7;
  background: radial-gradient(ellipse at center, #141414 0%, #050505 70%);
}
.flow-svg,
.flow-particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.flow-particles {
  pointer-events: none;
}
.period-tabs button.active {
  border-bottom: 2px solid var(--green);
}
```

- [ ] **Step 4: Run tests**

```bash
cd market-flow/frontend && npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add market-flow/frontend/src/components/FlowCanvas.tsx \
  market-flow/frontend/src/components/FlowCanvas.test.tsx \
  market-flow/frontend/src/styles/flow.css
git commit -m "feat(market-flow): render flow arcs and particles"
```

---

### Task 9: App wiring (polling, snapshots, warnings)

**Files:**
- Modify: `market-flow/frontend/src/App.tsx`
- Modify: `market-flow/frontend/src/main.tsx`
- Create: `market-flow/frontend/src/App.test.tsx` (optional light test)

- [ ] **Step 1: Implement App**

Behavior checklist:

1. State: `period`, `data`, `error`, `particlesEnabled`, `snapshots: FlowResponse[]` (realtime only)
2. On period change / mount: `fetchFlow(period)`; on success clear error; if realtime, append to snapshots (dedupe by `as_of`)
3. Poll realtime every 45s; `document.visibilityState === "hidden"` → skip tick
4. Scrubber: when user picks snapshot `as_of`, set displayed data to that snapshot (do **not** call API `at=`)
5. Show `meta.warnings` and stale banner
6. Toggle particles

```tsx
// market-flow/frontend/src/App.tsx (core structure)
import { useCallback, useEffect, useState } from "react";
import { fetchFlow } from "./api/client";
import { PeriodTabs } from "./components/PeriodTabs";
import { TimeScrubber } from "./components/TimeScrubber";
import { FlowCanvas } from "./components/FlowCanvas";
import type { FlowResponse, Period } from "./types/flow";
import "./styles/flow.css";

export default function App() {
  const [period, setPeriod] = useState<Period>("realtime");
  const [live, setLive] = useState<FlowResponse | null>(null);
  const [view, setView] = useState<FlowResponse | null>(null);
  const [snapshots, setSnapshots] = useState<FlowResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [particles, setParticles] = useState(true);

  const load = useCallback(async (p: Period) => {
    try {
      const data = await fetchFlow(p);
      setError(null);
      setLive(data);
      setView(data);
      if (p === "realtime") {
        setSnapshots((prev) => {
          if (prev.some((x) => x.as_of === data.as_of)) return prev;
          return [...prev, data].slice(-80);
        });
      } else {
        setSnapshots([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  useEffect(() => {
    if (period !== "realtime") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load("realtime");
    }, 45_000);
    return () => window.clearInterval(id);
  }, [period, load]);

  return (
    <main className="app">
      <h1>行业资金流向</h1>
      <PeriodTabs value={period} onChange={setPeriod} />
      <TimeScrubber
        enabled={period === "realtime" && snapshots.length > 1}
        marks={snapshots.map((s) => s.as_of)}
        value={view?.as_of ?? null}
        onChange={(iso) => {
          const hit = snapshots.find((s) => s.as_of === iso);
          if (hit) setView(hit);
        }}
      />
      <label>
        <input
          type="checkbox"
          checked={particles}
          onChange={(e) => setParticles(e.target.checked)}
        />
        粒子动画
      </label>
      {error && <div className="banner error">{error}</div>}
      {view?.meta.stale && <div className="banner">数据可能过期（缓存）</div>}
      {view?.meta.warnings?.map((w) => (
        <div key={w} className="banner warn">
          {w}
        </div>
      ))}
      {view ? (
        <FlowCanvas data={view} particlesEnabled={particles} />
      ) : (
        <div>加载中…</div>
      )}
      {view && (
        <footer>
          as_of={view.as_of} · {view.meta.source}
        </footer>
      )}
    </main>
  );
}
```

Wire `main.tsx` to render `<App />`.

- [ ] **Step 2: Manual smoke**

Terminal A:

```bash
cd market-flow/backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Terminal B:

```bash
cd market-flow/frontend && npm run dev
```

Open `http://127.0.0.1:5173` — confirm tabs, arcs, particles, warnings on month/year.

- [ ] **Step 3: Commit**

```bash
git add market-flow/frontend/src
git commit -m "feat(market-flow): wire app polling and session scrubber"
```

---

### Task 10: README + root acceptance

**Files:**
- Create: `market-flow/README.md`

- [ ] **Step 1: Write README**

Include:

- What it is (standalone, not part of DSA runtime)
- Backend: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8001`
- Frontend: `cd frontend && npm install && npm run dev`
- Period mapping table (今日/5日/10日 approximations)
- Note: display-constructed links, not true pairwise rotation
- Tests: `pytest` / `npm test`

- [ ] **Step 2: Run full local verification**

```bash
cd market-flow/backend && pytest -v
cd ../frontend && npm test && npm run build
```

Expected: all green; frontend build succeeds.

- [ ] **Step 3: Commit**

```bash
git add market-flow/README.md
git commit -m "docs(market-flow): add standalone app README"
```

- [ ] **Step 4: Manual acceptance vs design §8**

Check off:

1. Dark theme; green out / red in / white exit
2. Arc width varies; particles toggleable
3. Five periods switch (month/year show approximation warnings)
4. Realtime polling pauses when tab hidden
5. Kill backend → UI shows error or last view without white crash

---

## Spec coverage self-check

| Spec item | Task |
| --- | --- |
| Independent `market-flow/` | 1–10 |
| FastAPI + React/Vite + D3/Canvas | 5, 6, 8 |
| A-share industry only | fetch `行业资金流` |
| Periods realtime/day/week/month/year | aggregate + PeriodTabs |
| Display links + `pair_links: []` | link_builder + schemas |
| `market_exit` | link_builder |
| Cache + stale + single-flight | cache + routes |
| Scrubber | session snapshots in App (API `at` → unsupported) |
| Particles + reduced motion + toggle | FlowCanvas + App |
| Own `.env.example`, no root `.env` | Task 1 |
| Tests backend + frontend | Tasks 1–8 |
| README | Task 10 |
| No dsa-web / main Docker coupling | honored throughout |

## Notes for implementers

- Prefer backend port `8001` and Vite proxy to avoid DSA `8000` clashes.
- If AkShare column names differ by version, extend `normalize_sector_rank_df` keyword matching — keep unit conversion 净额/1e8 → 亿元.
- Do not import anything from repo `src/`, `api/`, or `data_provider/`.
