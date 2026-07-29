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
});
