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


def test_rounded_amounts_conserve_outflow_side():
    sectors = [{"id": f"O{i}", "name": f"O{i}", "net": -33.3333} for i in range(3)]
    sectors += [{"id": f"I{i}", "name": f"I{i}", "net": 11.1111} for i in range(4)]
    nodes, links, warnings = build_display_graph(sectors, top_n=10, top_m=10)

    out_nets = {n["id"]: -float(n["net"]) for n in nodes if n["side"] == "out"}
    by_from = {}
    for link in links:
        by_from.setdefault(link["from"], 0.0)
        by_from[link["from"]] += link["amount"]
    for out_id, expected in out_nets.items():
        assert abs(by_from[out_id] - expected) < 1e-6


def test_top_n_truncation_keeps_top_only():
    sectors = [{"id": f"O{i}", "name": f"O{i}", "net": -float(i + 1)} for i in range(12)]
    sectors += [{"id": "IN", "name": "IN", "net": 5.0}]
    nodes, links, warnings = build_display_graph(sectors, top_n=3, top_m=3)
    assert warnings == []
    assert len([n for n in nodes if n["side"] == "out"]) == 3
    assert len([n for n in nodes if n["side"] == "in"]) == 1
    assert links  # still builds display links from truncated set
