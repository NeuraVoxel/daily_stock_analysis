from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.schemas.flow import FlowResponse
from app.services import fetch_eastmoney
from app.services.aggregate import resolve_period
from app.services.cache import TtlCache
from app.services.flow_service import build_flow_response, now_as_of, ttl_for_period
from app.settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()
_cache = TtlCache()
_last_good: dict[str, FlowResponse] = {}

Period = Literal["realtime", "day", "week", "month", "year"]


@router.get("/flow", response_model=FlowResponse)
def get_flow(
    period: Period = Query(...),
    at: Optional[str] = Query(None),
) -> FlowResponse | JSONResponse:
    settings = get_settings()
    resolved = resolve_period(period)
    indicator = resolved["indicator"]
    cache_key = f"{period}:{indicator}:industry"

    if at is not None:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "unsupported_scrub",
                    "message": "当前公开源不支持按历史时刻回放，请使用页面内会话快照时间轴",
                }
            },
        )

    def factory() -> FlowResponse:
        df, source = fetch_eastmoney.fetch_sector_fund_flow_rank(
            indicator=indicator,
            timeout_sec=float(settings.upstream_timeout_sec),
        )
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
            source=source,
        )

    try:
        resp = _cache.get_or_set(
            cache_key,
            ttl_sec=ttl_for_period(period, settings),
            factory=factory,
        )
        if resp is None:
            raise RuntimeError("cache_miss_after_fetch")
        _last_good[cache_key] = resp
        return resp
    except Exception as exc:
        if isinstance(exc, RuntimeError) and str(exc) == "empty_data":
            logger.warning("flow empty_data period=%s indicator=%s", period, indicator)
            return JSONResponse(
                status_code=503,
                content={
                    "error": {
                        "code": "empty_data",
                        "message": "资金流数据为空，请稍后重试",
                    }
                },
            )
        logger.exception(
            "flow upstream failure period=%s indicator=%s: %s",
            period,
            indicator,
            exc,
        )
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
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "upstream_unavailable",
                    "message": "资金流数据暂时不可用，请稍后重试",
                }
            },
        )
