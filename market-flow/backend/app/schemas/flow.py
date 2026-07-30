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


class IndexQuote(BaseModel):
    code: str
    name: str
    price: float
    prev_close: float | None = None
    change: float | None = None
    change_pct: float
    as_of: str
    source: str
    stale: bool = False
