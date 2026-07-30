import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFlow } from "./client";

describe("fetchFlow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/flow with period", async () => {
    const json = {
      period: "day",
      as_of: "2026-07-29T15:00:00+08:00",
      market: "CN",
      board_type: "industry",
      currency_unit: "yi",
      nodes: [],
      display_links: [],
      pair_links: [],
      meta: {
        source: "akshare/eastmoney",
        link_mode: "display_constructed",
        stale: false,
        warnings: [],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => json,
      }),
    );
    const data = await fetchFlow("day");
    expect(fetch).toHaveBeenCalledWith("/api/flow?period=day");
    expect(data.period).toBe("day");
  });

  it("calls /api/index/shanghai", async () => {
    const { fetchShanghaiIndex } = await import("./client");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: "000001",
          name: "上证指数",
          price: 3804.69,
          change_pct: -0.62,
          as_of: "2026-07-30T15:00:00+08:00",
          source: "eastmoney",
          stale: false,
        }),
      }),
    );
    const quote = await fetchShanghaiIndex();
    expect(fetch).toHaveBeenCalledWith("/api/index/shanghai");
    expect(quote.name).toBe("上证指数");
    expect(quote.change_pct).toBe(-0.62);
  });
});
