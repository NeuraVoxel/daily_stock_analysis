from app.services.aggregate import resolve_period


def test_resolve_period_mapping_and_warnings():
    assert resolve_period("realtime")["indicator"] == "今日"
    assert resolve_period("week")["indicator"] == "5日"
    month = resolve_period("month")
    assert month["indicator"] == "10日"
    assert month["warnings"]
    year = resolve_period("year")
    assert year["indicator"] == "10日"
    assert any("年" in w or "year" in w.lower() for w in year["warnings"])
