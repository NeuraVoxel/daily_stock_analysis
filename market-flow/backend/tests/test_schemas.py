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
