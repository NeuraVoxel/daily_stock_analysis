import time
from app.services.cache import TtlCache


def test_ttl_cache_hit_and_expire():
    c = TtlCache()
    c.set("k", {"ok": 1}, ttl_sec=1)
    assert c.get("k") == {"ok": 1}
    time.sleep(1.1)
    assert c.get("k") is None


def test_single_flight_dedupes():
    c = TtlCache()
    calls = {"n": 0}

    def factory():
        calls["n"] += 1
        return {"v": calls["n"]}

    a = c.get_or_set("x", ttl_sec=30, factory=factory)
    b = c.get_or_set("x", ttl_sec=30, factory=factory)
    assert a == b == {"v": 1}
    assert calls["n"] == 1
