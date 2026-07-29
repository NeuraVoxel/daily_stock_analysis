from app.services.link_builder import build_display_graph


def test_outflow_side_conserved_and_exit_non_negative():
    sectors = [
        {"id": "A", "name": "A", "net": -100.0},
        {"id": "B", "name": "B", "net": -50.0},
        {"id": "X", "name": "X", "net": 30.0},
        {"id": "Y", "name": "Y", "net": 20.0},
    ]
    nodes, links, warnings = build_display_graph(sectors, top_n=10, top_m=10)

    exit_node = next(n for n in nodes if n["id"] == "market_exit")
    assert exit_node["net"] <= 0
    assert abs(exit_node["net"]) == 100.0  # 150 out - 50 in

    by_from = {}
    for link in links:
        by_from.setdefault(link["from"], 0.0)
        by_from[link["from"]] += link["amount"]
    assert abs(by_from["A"] - 100.0) < 1e-6
    assert abs(by_from["B"] - 50.0) < 1e-6
    assert warnings == []


def test_top_n_truncation_adds_warning():
    sectors = [{"id": f"O{i}", "name": f"O{i}", "net": -float(i + 1)} for i in range(12)]
    sectors += [{"id": "IN", "name": "IN", "net": 5.0}]
    nodes, links, warnings = build_display_graph(sectors, top_n=3, top_m=3)
    assert any("truncat" in w.lower() or "截断" in w for w in warnings)
    assert len([n for n in nodes if n["side"] == "out"]) == 3
