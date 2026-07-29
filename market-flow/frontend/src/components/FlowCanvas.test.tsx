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
    expect(screen.getByText(/半导体/)).toBeTruthy();
    expect(screen.getByText(/银行/)).toBeTruthy();
    expect(screen.getByText(/市场离场/)).toBeTruthy();
  });
});
