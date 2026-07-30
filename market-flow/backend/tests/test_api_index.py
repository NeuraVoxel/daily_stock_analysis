from fastapi.testclient import TestClient

from app.api import routes_index
from app.main import app
from app.services import fetch_eastmoney


def test_get_shanghai_index_ok(monkeypatch):
    monkeypatch.setattr(
        fetch_eastmoney,
        "fetch_shanghai_index",
        lambda **kwargs: {
            "code": "000001",
            "name": "上证指数",
            "price": 3804.69,
            "prev_close": 3828.47,
            "change": -23.78,
            "change_pct": -0.62,
            "source": "eastmoney",
        },
    )
    routes_index._cache._store.clear()
    routes_index._last_good = None

    client = TestClient(app)
    res = client.get("/api/index/shanghai")
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "上证指数"
    assert body["price"] == 3804.69
    assert body["change_pct"] == -0.62
    assert body["stale"] is False


def test_get_shanghai_index_stale_after_failure(monkeypatch):
    calls = {"n": 0}

    def fetch(**kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return {
                "code": "000001",
                "name": "上证指数",
                "price": 3804.69,
                "prev_close": 3828.47,
                "change": -23.78,
                "change_pct": -0.62,
                "source": "eastmoney",
            }
        raise RuntimeError("network")

    monkeypatch.setattr(fetch_eastmoney, "fetch_shanghai_index", fetch)
    routes_index._cache._store.clear()
    routes_index._last_good = None

    client = TestClient(app)
    first = client.get("/api/index/shanghai")
    assert first.status_code == 200
    assert first.json()["stale"] is False

    routes_index._cache._store.clear()
    second = client.get("/api/index/shanghai")
    assert second.status_code == 200
    assert second.json()["stale"] is True


def test_get_shanghai_index_unavailable(monkeypatch):
    monkeypatch.setattr(
        fetch_eastmoney,
        "fetch_shanghai_index",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("network")),
    )
    routes_index._cache._store.clear()
    routes_index._last_good = None

    client = TestClient(app)
    res = client.get("/api/index/shanghai")
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "upstream_unavailable"
