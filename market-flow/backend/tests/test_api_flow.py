import pandas as pd
from fastapi.testclient import TestClient

from app.api import routes_flow
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


def test_get_flow_rejects_at_scrub():
    client = TestClient(app)
    res = client.get("/api/flow", params={"period": "realtime", "at": "2026-07-29T10:00:00"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "unsupported_scrub"


def test_get_flow_stale_after_upstream_failure(monkeypatch):
    df = pd.DataFrame(
        {
            "名称": ["半导体", "银行"],
            "今日主力净流入-净额": [-1_000_000_000, 200_000_000],
        }
    )
    calls = {"n": 0}

    def fetch(indicator):
        calls["n"] += 1
        if calls["n"] == 1:
            return df
        raise RuntimeError("network")

    monkeypatch.setattr(
        fetch_eastmoney,
        "fetch_sector_fund_flow_rank",
        fetch,
    )
    routes_flow._cache._store.clear()
    routes_flow._last_good.clear()

    client = TestClient(app)
    first = client.get("/api/flow", params={"period": "day"})
    assert first.status_code == 200
    assert first.json()["meta"]["stale"] is False

    routes_flow._cache._store.clear()
    second = client.get("/api/flow", params={"period": "day"})
    assert second.status_code == 200
    assert second.json()["meta"]["stale"] is True


def test_health_ok():
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_get_flow_empty_data(monkeypatch):
    monkeypatch.setattr(
        fetch_eastmoney,
        "fetch_sector_fund_flow_rank",
        lambda indicator: pd.DataFrame(),
    )
    routes_flow._cache._store.clear()
    routes_flow._last_good.clear()

    client = TestClient(app)
    res = client.get("/api/flow", params={"period": "day"})
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "empty_data"


def test_get_flow_upstream_error(monkeypatch):
    def boom(indicator):
        raise RuntimeError("network")

    monkeypatch.setattr(
        fetch_eastmoney,
        "fetch_sector_fund_flow_rank",
        boom,
    )
    routes_flow._cache._store.clear()
    routes_flow._last_good.clear()

    client = TestClient(app)
    res = client.get("/api/flow", params={"period": "day"})
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "upstream_unavailable"
