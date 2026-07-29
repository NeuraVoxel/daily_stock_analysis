from __future__ import annotations

import pandas as pd

from app.services.fetch_eastmoney import _pages_to_frame, fetch_sector_fund_flow_rank


def test_pages_to_frame_maps_name_and_net():
    rows = [
        {"f14": "半导体", "f62": -6518000000},
        {"f14": "银行", "f62": 469000000},
        {"f14": "坏数据", "f62": "-"},
    ]
    df = _pages_to_frame(rows, indicator="今日")
    assert list(df.columns) == ["名称", "今日主力净流入-净额"]
    assert len(df) == 2
    by_name = dict(zip(df["名称"], df["今日主力净流入-净额"]))
    assert by_name["半导体"] == -6518000000
    assert by_name["银行"] == 469000000


def test_fetch_uses_http_helper(monkeypatch):
    calls = {"n": 0}

    def fake_get(url, *, params, timeout):
        calls["n"] += 1
        assert "eastmoney.com" in url
        assert params["stat"] == "1"
        assert timeout == 12.0
        return {
            "data": {
                "total": 2,
                "diff": [
                    {"f12": "BK0475", "f14": "半导体", "f62": -100000000},
                    {"f12": "BK0477", "f14": "银行", "f62": 50000000},
                ],
            }
        }

    monkeypatch.setattr(
        "app.services.fetch_eastmoney._http_get",
        fake_get,
    )
    df, source = fetch_sector_fund_flow_rank(indicator="今日", timeout_sec=12.0)
    assert calls["n"] >= 1
    assert source == "eastmoney"
    assert isinstance(df, pd.DataFrame)
    assert "名称" in df.columns
    assert "今日主力净流入-净额" in df.columns
    assert len(df) == 2


def test_fetch_falls_back_to_ths(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("push2 down")

    monkeypatch.setattr(
        "app.services.fetch_eastmoney._fetch_eastmoney",
        boom,
    )

    class _AK:
        @staticmethod
        def stock_fund_flow_industry(symbol: str = "即时"):
            assert symbol == "即时"
            return pd.DataFrame(
                {
                    "行业": ["半导体", "银行"],
                    "净额": [-12.5, 3.2],
                }
            )

    import sys
    import types

    fake_ak = types.ModuleType("akshare")
    fake_ak.stock_fund_flow_industry = _AK.stock_fund_flow_industry
    monkeypatch.setitem(sys.modules, "akshare", fake_ak)

    df, source = fetch_sector_fund_flow_rank(indicator="今日", timeout_sec=5.0)
    assert source == "tonghuashun"
    assert list(df["名称"]) == ["半导体", "银行"]
    # 亿元 → 元
    assert abs(df.iloc[0]["今日主力净流入-净额"] - (-12.5 * 1e8)) < 1
    assert abs(df.iloc[1]["今日主力净流入-净额"] - (3.2 * 1e8)) < 1
