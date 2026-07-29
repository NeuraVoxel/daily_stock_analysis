from __future__ import annotations

import logging
import math
import time
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

_URLS = (
    "https://push2.eastmoney.com/api/qt/clist/get",
    "https://push2delay.eastmoney.com/api/qt/clist/get",
)
_SECTOR_TYPE_MAP = {"行业资金流": "2", "概念资金流": "3", "地域资金流": "1"}
_INDICATOR_MAP: dict[str, tuple[str, str, str]] = {
    # fid0, stat, fields — mirrors akshare.stock.stock_fund_em.stock_sector_fund_flow_rank
    "今日": (
        "f62",
        "1",
        "f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124",
    ),
    "5日": (
        "f164",
        "5",
        "f12,f14,f2,f109,f164,f165,f166,f167,f168,f169,f170,f171,f172,f173,f257,f258,f124",
    ),
    "10日": (
        "f174",
        "10",
        "f12,f14,f2,f160,f174,f175,f176,f177,f178,f179,f180,f181,f182,f183,f260,f261,f124",
    ),
}
_NET_FIELD = {"今日": "f62", "5日": "f164", "10日": "f174"}
_THS_SYMBOL = {"今日": "即时", "5日": "5日排行", "10日": "10日排行"}
_HEADERS = {
    "Referer": "https://data.eastmoney.com/bkzj/hy.html",
    "Accept": "application/json, text/plain, */*",
}


def _http_get(url: str, *, params: dict[str, Any], timeout: float) -> dict[str, Any]:
    """GET with browser TLS fingerprint (plain requests often reset in Docker)."""
    from curl_cffi import requests as crequests

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            resp = crequests.get(
                url,
                params=params,
                headers=_HEADERS,
                impersonate="chrome",
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict):
                raise RuntimeError("eastmoney response is not a JSON object")
            return data
        except Exception as exc:  # noqa: BLE001 — retries then re-raise
            last_err = exc
            logger.warning(
                "eastmoney fetch attempt %s url=%s failed: %s",
                attempt + 1,
                url,
                exc,
            )
            time.sleep(0.4 * (attempt + 1))
    assert last_err is not None
    raise last_err


def _pages_to_frame(rows: list[dict[str, Any]], *, indicator: str) -> pd.DataFrame:
    net_key = _NET_FIELD[indicator]
    name_col = "名称"
    net_col = f"{indicator}主力净流入-净额"
    records: list[dict[str, Any]] = []
    for row in rows:
        name = row.get("f14")
        net = row.get(net_key)
        if name is None or net is None or net == "-":
            continue
        # Sector boards use BK* codes; skip stock-like rows if mirror ignores fs filter
        code = str(row.get("f12") or "")
        if code and not code.startswith("BK") and code.isdigit() and len(code) == 6:
            continue
        records.append({name_col: str(name).strip(), net_col: net})
    if not records:
        return pd.DataFrame(columns=[name_col, net_col])
    df = pd.DataFrame(records)
    df[net_col] = pd.to_numeric(df[net_col], errors="coerce")
    df = df.dropna(subset=[net_col])
    return df.reset_index(drop=True)


def _fetch_eastmoney(
    *,
    indicator: str,
    sector_type: str,
    timeout_sec: float,
) -> pd.DataFrame:
    fid0, stat, fields = _INDICATOR_MAP[indicator]
    base_params: dict[str, Any] = {
        "pn": "1",
        "pz": "100",
        "po": "1",
        "np": "1",
        "ut": "b2884a393a59ad64002292a3e90d46a5",
        "fltt": "2",
        "invt": "2",
        "fid0": fid0,
        "fs": f"m:90 t:{_SECTOR_TYPE_MAP[sector_type]}",
        "stat": stat,
        "fields": fields,
        "rt": "52975239",
        "_": int(time.time() * 1000),
    }

    last_err: Exception | None = None
    for url in _URLS:
        try:
            first = _http_get(url, params=base_params, timeout=timeout_sec)
            payload = first.get("data") or {}
            total = int(payload.get("total") or 0)
            diff = payload.get("diff") or []
            if not isinstance(diff, list):
                continue
            rows: list[dict[str, Any]] = list(diff)
            total_page = max(1, math.ceil(total / 100)) if total else 1
            # Cap pages to avoid hammering when a mirror returns a huge unrelated universe
            total_page = min(total_page, 6)
            for page in range(2, total_page + 1):
                params = dict(base_params)
                params["pn"] = str(page)
                params["_"] = int(time.time() * 1000)
                page_json = _http_get(url, params=params, timeout=timeout_sec)
                page_diff = (page_json.get("data") or {}).get("diff") or []
                if isinstance(page_diff, list):
                    rows.extend(page_diff)
            df = _pages_to_frame(rows, indicator=indicator)
            if not df.empty:
                return df
            last_err = RuntimeError(f"empty sector rows from {url}")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("eastmoney primary failed url=%s: %s", url, exc)
    if last_err is not None:
        raise last_err
    return pd.DataFrame()


def _fetch_ths_fallback(*, indicator: str) -> pd.DataFrame:
    """Tonghuashun industry fund flow — used when East Money push2 is unreachable."""
    import akshare as ak

    symbol = _THS_SYMBOL[indicator]
    raw = ak.stock_fund_flow_industry(symbol=symbol)
    if raw is None or raw.empty:
        return pd.DataFrame()

    name_col = next((c for c in raw.columns if str(c) in ("行业", "名称", "板块")), None)
    net_col_src = next((c for c in raw.columns if str(c) in ("净额", "净流入")), None)
    if name_col is None or net_col_src is None:
        raise RuntimeError(f"unexpected THS columns: {list(raw.columns)}")

    # THS 净额 already in 亿元; normalize expects 元 then /1e8
    out = pd.DataFrame(
        {
            "名称": raw[name_col].astype(str).str.strip(),
            f"{indicator}主力净流入-净额": pd.to_numeric(raw[net_col_src], errors="coerce")
            * 1e8,
        }
    )
    out = out.dropna(subset=[f"{indicator}主力净流入-净额"])
    out = out[out["名称"].astype(bool)]
    return out.reset_index(drop=True)


def fetch_sector_fund_flow_rank(
    *,
    indicator: str,
    sector_type: str = "行业资金流",
    timeout_sec: float = 20.0,
) -> tuple[pd.DataFrame, str]:
    """Fetch industry fund-flow rank.

    Returns (dataframe, source_id) where source_id is
    ``eastmoney`` or ``tonghuashun``.
    """
    if indicator not in _INDICATOR_MAP:
        raise ValueError(f"unsupported indicator: {indicator}")
    if sector_type not in _SECTOR_TYPE_MAP:
        raise ValueError(f"unsupported sector_type: {sector_type}")

    try:
        df = _fetch_eastmoney(
            indicator=indicator,
            sector_type=sector_type,
            timeout_sec=timeout_sec,
        )
        if df is not None and not df.empty:
            return df, "eastmoney"
    except Exception as exc:  # noqa: BLE001
        logger.warning("eastmoney path failed, trying THS fallback: %s", exc)

    if sector_type != "行业资金流":
        raise RuntimeError("THS fallback only supports 行业资金流")

    df = _fetch_ths_fallback(indicator=indicator)
    if df.empty:
        raise RuntimeError("empty_data")
    logger.info("using tonghuashun industry fund-flow fallback indicator=%s", indicator)
    return df, "tonghuashun"
