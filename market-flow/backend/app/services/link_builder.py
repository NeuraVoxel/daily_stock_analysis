from __future__ import annotations

from typing import Any


def build_display_graph(
    sectors: list[dict[str, Any]],
    *,
    top_n: int = 10,
    top_m: int = 10,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    """Build nodes + display_links from per-sector nets (亿元).

    Outflow nets are negative; inflow nets positive. Zero-net sectors are omitted.
    """
    warnings: list[str] = []
    outs = sorted(
        [s for s in sectors if float(s["net"]) < 0],
        key=lambda s: float(s["net"]),
    )
    ins = sorted(
        [s for s in sectors if float(s["net"]) > 0],
        key=lambda s: float(s["net"]),
        reverse=True,
    )

    outs = outs[:top_n]
    ins = ins[:top_m]

    total_out = sum(-float(s["net"]) for s in outs)
    total_in = sum(float(s["net"]) for s in ins)
    exit_amount = max(0.0, total_out - total_in)

    nodes: list[dict[str, Any]] = []
    for s in outs:
        nodes.append(
            {
                "id": s["id"],
                "name": s["name"],
                "side": "out",
                "net": float(s["net"]),
            }
        )
    for s in ins:
        nodes.append(
            {
                "id": s["id"],
                "name": s["name"],
                "side": "in",
                "net": float(s["net"]),
            }
        )
    nodes.append(
        {
            "id": "market_exit",
            "name": "市场离场",
            "side": "exit",
            "net": -exit_amount,
        }
    )

    links: list[dict[str, Any]] = []
    if total_out <= 0:
        return nodes, links, warnings

    for out in outs:
        out_amt = -float(out["net"])
        remaining = out_amt
        if total_in > 0:
            for inn in ins:
                share = float(inn["net"]) / total_in
                alloc = out_amt * (total_in / total_out) * share
                amount = round(alloc, 4)
                if amount <= 0:
                    continue
                links.append(
                    {
                        "from": out["id"],
                        "to": inn["id"],
                        "amount": amount,
                    }
                )
                remaining -= amount
        if remaining > 1e-9:
            links.append(
                {
                    "from": out["id"],
                    "to": "market_exit",
                    "amount": round(remaining, 4),
                }
            )

    return nodes, links, warnings
