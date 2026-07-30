from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas.flow import IndexQuote
from app.services import fetch_eastmoney
from app.services.cache import TtlCache
from app.services.flow_service import now_as_of
from app.settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()
_cache = TtlCache()
_last_good: IndexQuote | None = None
_CACHE_KEY = "index:shanghai"


@router.get("/index/shanghai", response_model=IndexQuote)
def get_shanghai_index() -> IndexQuote | JSONResponse:
    """Latest 上证指数 quote for the market-flow header."""
    global _last_good
    settings = get_settings()

    def factory() -> IndexQuote:
        raw = fetch_eastmoney.fetch_shanghai_index(
            timeout_sec=float(settings.upstream_timeout_sec),
        )
        return IndexQuote(
            code=raw["code"],
            name=raw["name"],
            price=raw["price"],
            prev_close=raw.get("prev_close"),
            change=raw.get("change"),
            change_pct=raw["change_pct"],
            as_of=now_as_of(),
            source=raw.get("source", "eastmoney"),
            stale=False,
        )

    try:
        quote = _cache.get_or_set(
            _CACHE_KEY,
            ttl_sec=settings.cache_ttl_realtime_sec,
            factory=factory,
        )
        if quote is None:
            raise RuntimeError("cache_miss_after_fetch")
        _last_good = quote
        return quote
    except Exception as exc:  # noqa: BLE001
        logger.exception("shanghai index upstream failure: %s", exc)
        if _last_good is not None:
            return _last_good.model_copy(update={"stale": True})
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "upstream_unavailable",
                    "message": "上证指数暂时不可用，请稍后重试",
                }
            },
        )
