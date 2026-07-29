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
