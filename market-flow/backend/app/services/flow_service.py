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
