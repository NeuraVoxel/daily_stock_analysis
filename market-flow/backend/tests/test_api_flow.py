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
