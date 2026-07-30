import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FlowCanvas } from "./FlowCanvas";
import type { FlowResponse } from "../types/flow";

const fixture: FlowResponse = {
  period: "realtime",
  as_of: "2026-07-29T10:30:00+08:00",
  market: "CN",
  board_type: "industry",
  currency_unit: "yi",
  nodes: [
    { id: "半导体", name: "半导体", side: "out", net: -65.18 },
    { id: "银行", name: "银行", side: "in", net: 4.69 },
    { id: "market_exit", name: "市场离场", side: "exit", net: -60 },
  ],
  display_links: [
    { from: "半导体", to: "银行", amount: 4.69 },
    { from: "半导体", to: "market_exit", amount: 60.49 },
  ],
  pair_links: [],
  meta: {
    source: "akshare/eastmoney",
    link_mode: "display_constructed",
    stale: false,
    warnings: [],
  },
};

describe("FlowCanvas", () => {
  it("renders outflow and inflow labels", () => {
    render(<FlowCanvas data={fixture} particlesEnabled={false} />);
    expect(screen.getAllByText(/半导体/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/银行/).length).toBeGreaterThan(0);
    expect(screen.getByText(/市场离场/)).toBeTruthy();
    expect(screen.getByText(/资金流出板块/)).toBeTruthy();
    expect(screen.getByText(/资金流入方向/)).toBeTruthy();
  });

  it("wraps long sector names across lines with ellipsis", () => {
    const long = "通信网络设备及器件扩展名称";
    const longName = {
      ...fixture,
      nodes: [
        { id: long, name: long, side: "out" as const, net: -10 },
        { id: "银行", name: "银行", side: "in" as const, net: 4 },
        {
          id: "market_exit",
          name: "市场离场",
          side: "exit" as const,
          net: -6,
        },
      ],
      display_links: [{ from: long, to: "market_exit", amount: 6 }],
    };
    render(<FlowCanvas data={longName} particlesEnabled={false} />);
    expect(screen.getByText("通信网络设")).toBeTruthy();
    expect(screen.getByText("备及器件…")).toBeTruthy();
    expect(document.querySelector("title")?.textContent).toBe(long);
  });
});
