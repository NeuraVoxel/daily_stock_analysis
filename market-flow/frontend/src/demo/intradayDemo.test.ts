import { describe, it, expect } from "vitest";
import {
  buildIntradayDemoSnapshots,
  clockToTradingMinute,
  formatTradingClock,
} from "./intradayDemo";

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

  it("builds a full 09:30→15:00 snapshot series with growing flows", () => {
    const frames = buildIntradayDemoSnapshots(5);
    expect(frames.length).toBeGreaterThan(40);
    expect(frames[0]?.as_of.slice(11, 16)).toBe("09:30");
    expect(frames.some((f) => f.as_of.slice(11, 16) === "11:30")).toBe(true);
    expect(frames.some((f) => f.as_of.slice(11, 16) === "13:00")).toBe(true);
    expect(frames[frames.length - 1]?.as_of.slice(11, 16)).toBe("15:00");
    expect(
      frames.some((f) => {
        const hm = f.as_of.slice(11, 16);
        return hm >= "11:31" && hm < "13:00";
      }),
    ).toBe(false);

    const firstExit = Math.abs(
      frames[0]?.nodes.find((n) => n.side === "exit")?.net ?? 0,
    );
    const lastExit = Math.abs(
      frames[frames.length - 1]?.nodes.find((n) => n.side === "exit")?.net ?? 0,
    );
    expect(lastExit).toBeGreaterThan(firstExit);
    expect(frames[0]?.display_links.length).toBeGreaterThan(0);
    expect(frames[0]?.meta.source).toBe("demo/intraday");
  });
});
