import { describe, it, expect } from "vitest";
import {
  buildIntradayDemoSnapshots,
  clockToTradingMinute,
  closeMatchesSeed,
  formatTradingClock,
  seedSideTotals,
} from "./intradayDemo";
import type { FlowResponse } from "../types/flow";

const liveSeed: FlowResponse = {
  period: "realtime",
  as_of: "2026-07-30T15:00:00+08:00",
  market: "CN",
  board_type: "industry",
  currency_unit: "yi",
  nodes: [
    { id: "电子", name: "电子", side: "out", net: -344.07 },
    { id: "通信", name: "通信", side: "out", net: -129.87 },
    { id: "半导体", name: "半导体", side: "out", net: -123.53 },
    { id: "银行", name: "银行", side: "in", net: 24.58 },
    { id: "白酒", name: "白酒", side: "in", net: 14.92 },
    { id: "market_exit", name: "市场离场", side: "exit", net: -557.97 },
  ],
  display_links: [],
  pair_links: [],
  meta: {
    source: "akshare/eastmoney",
    link_mode: "display_constructed",
    stale: false,
    warnings: [],
  },
};

describe("intradayDemo", () => {
  it("maps session clocks onto trading minutes", () => {
    expect(clockToTradingMinute(9, 30)).toBe(0);
    expect(clockToTradingMinute(11, 30)).toBe(120);
    expect(clockToTradingMinute(13, 0)).toBe(120);
    expect(clockToTradingMinute(15, 0)).toBe(240);
    expect(clockToTradingMinute(12, 0)).toBeNull();
  });

  it("formats trading clocks across the lunch break", () => {
    expect(formatTradingClock(0)).toBe("09:30");
    expect(formatTradingClock(120)).toBe("11:30");
    expect(formatTradingClock(125)).toBe("13:05");
    expect(formatTradingClock(240)).toBe("15:00");
  });

  it("builds a full 09:30→15:00 series that grows toward the live seed totals", () => {
    const frames = buildIntradayDemoSnapshots(5, liveSeed);
    expect(frames.length).toBeGreaterThan(40);
    expect(frames[0]?.as_of.slice(11, 16)).toBe("09:30");
    expect(frames.some((f) => f.as_of.slice(11, 16) === "13:00")).toBe(true);
    expect(frames[frames.length - 1]?.as_of.slice(11, 16)).toBe("15:00");

    const firstOut = frames[0]!.nodes
      .filter((n) => n.side === "out")
      .reduce((s, n) => s + Math.abs(n.net), 0);
    const lastOut = frames[frames.length - 1]!.nodes
      .filter((n) => n.side === "out")
      .reduce((s, n) => s + Math.abs(n.net), 0);
    expect(lastOut).toBeGreaterThan(firstOut);
    expect(closeMatchesSeed(frames, liveSeed)).toBe(true);

    const seedTotals = seedSideTotals(liveSeed);
    expect(lastOut).toBeCloseTo(seedTotals.out, 0);
    expect(frames[0]?.nodes.some((n) => n.name === "电子")).toBe(true);
    expect(frames[0]?.meta.source).toBe("demo/intraday");
  });

  it("fallback without seed still uses thousand-yi scale outflows", () => {
    const frames = buildIntradayDemoSnapshots(30);
    const close = frames[frames.length - 1]!;
    const out = close.nodes
      .filter((n) => n.side === "out")
      .reduce((s, n) => s + Math.abs(n.net), 0);
    expect(out).toBeGreaterThan(800);
  });
});
