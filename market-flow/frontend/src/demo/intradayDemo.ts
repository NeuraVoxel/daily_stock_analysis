import type { DisplayLink, FlowNode, FlowResponse } from "../types/flow";

/** A-share session: 09:30–11:30 + 13:00–15:00 = 240 trading minutes. */
const MORNING_START = 9 * 60 + 30;
const MORNING_END = 11 * 60 + 30;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 15 * 60;
const TRADING_MINUTES = 240;

/**
 * Fallback close targets when live seed is unavailable.
 * Magnitudes track typical East Money industry Top-10 day totals (~千亿级流出).
 */
const FALLBACK_OUT: { id: string; net: number }[] = [
  { id: "电子", net: -340 },
  { id: "通信", net: -130 },
  { id: "通信设备", net: -125 },
  { id: "半导体", net: -124 },
  { id: "通信网络设备及器件", net: -116 },
  { id: "消费电子", net: -95 },
  { id: "元件", net: -80 },
  { id: "软件开发", net: -72 },
  { id: "计算机设备", net: -68 },
  { id: "专用设备", net: -60 },
];

const FALLBACK_IN: { id: string; net: number }[] = [
  { id: "银行", net: 25 },
  { id: "白酒", net: 15 },
  { id: "保险", net: 14 },
  { id: "煤炭行业", net: 13 },
  { id: "电力", net: 12 },
  { id: "石油行业", net: 11 },
  { id: "股份制银行", net: 17 },
  { id: "家电行业", net: 10 },
  { id: "航运港口", net: 9 },
  { id: "食品饮料", net: 8 },
];

/** Map wall-clock minutes since midnight onto [0, 240] trading minutes. */
export function clockToTradingMinute(h: number, m: number): number | null {
  const abs = h * 60 + m;
  if (abs >= MORNING_START && abs <= MORNING_END) return abs - MORNING_START;
  if (abs >= AFTERNOON_START && abs <= AFTERNOON_END) {
    return 120 + (abs - AFTERNOON_START);
  }
  return null;
}

export function formatClockMinutes(absMinutes: number): string {
  const h = Math.floor(absMinutes / 60);
  const m = absMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Prefer morning label at the lunch seam (t=120 → 11:30). */
export function formatTradingClock(t: number): string {
  const clamped = Math.max(0, Math.min(TRADING_MINUTES, t));
  if (clamped < 120) return formatClockMinutes(MORNING_START + clamped);
  if (clamped === 120) return formatClockMinutes(MORNING_END);
  return formatClockMinutes(AFTERNOON_START + (clamped - 120));
}

/** Monotone growth 0→1; equals 1 exactly at session close. */
function progressCurve(t: number): number {
  const x = Math.min(1, Math.max(0, t / TRADING_MINUTES));
  return Math.pow(x, 0.72);
}

/**
 * Intraday scale toward close target.
 * Mid-session wiggle fades to 0 at close so 15:00 matches seed totals.
 */
function intradayScale(t: number, seed: number): number {
  const base = progressCurve(t);
  const remain = 1 - t / TRADING_MINUTES;
  const wiggle = remain * 0.12 * Math.sin((t / TRADING_MINUTES) * Math.PI * 3 + seed);
  return Math.max(0.01, base * (1 + wiggle));
}

function buildLinks(outs: FlowNode[], ins: FlowNode[]): DisplayLink[] {
  const totalOut = outs.reduce((s, n) => s + Math.abs(n.net), 0);
  const totalIn = ins.reduce((s, n) => s + n.net, 0);
  if (totalOut <= 0) return [];

  const links: DisplayLink[] = [];
  for (const out of outs) {
    const outAmt = Math.abs(out.net);
    let remaining = outAmt;
    if (totalIn > 0) {
      for (const inn of ins) {
        const share = inn.net / totalIn;
        const amount =
          Math.round(outAmt * (totalIn / totalOut) * share * 10000) / 10000;
        if (amount <= 0) continue;
        links.push({ from: out.id, to: inn.id, amount });
        remaining -= amount;
      }
    }
    if (remaining > 1e-6) {
      links.push({
        from: out.id,
        to: "market_exit",
        amount: Math.round(remaining * 10000) / 10000,
      });
    }
  }
  return links;
}

function targetsFromSeed(seed?: FlowResponse | null): {
  outs: { id: string; name: string; net: number }[];
  ins: { id: string; name: string; net: number }[];
  day: string;
  sourceNote: string;
} {
  if (seed) {
    const outs = seed.nodes
      .filter((n) => n.side === "out")
      .map((n) => ({ id: n.id, name: n.name, net: n.net }));
    const ins = seed.nodes
      .filter((n) => n.side === "in")
      .map((n) => ({ id: n.id, name: n.name, net: n.net }));
    if (outs.length > 0) {
      return {
        outs,
        ins,
        day: seed.as_of.slice(0, 10),
        sourceNote: `演示回放：以最新实时快照（${seed.as_of.slice(11, 16)}）为 15:00 终点外推盘中路径，非分钟级真实成交`,
      };
    }
  }
  return {
    outs: FALLBACK_OUT.map((s) => ({ id: s.id, name: s.id, net: s.net })),
    ins: FALLBACK_IN.map((s) => ({ id: s.id, name: s.id, net: s.net })),
    day: "2026-07-30",
    sourceNote:
      "演示回放：无实时快照可用，使用量级接近典型交易日的合成板块净流入/流出",
  };
}

function snapshotAtClock(
  absMinutes: number,
  day: string,
  targets: ReturnType<typeof targetsFromSeed>,
): FlowResponse | null {
  const h = Math.floor(absMinutes / 60);
  const m = absMinutes % 60;
  const tradingMinute = clockToTradingMinute(h, m);
  if (tradingMinute == null) return null;

  const clock = formatClockMinutes(absMinutes);
  const as_of = `${day}T${clock}:00+08:00`;

  const outs: FlowNode[] = targets.outs
    .map((s, i) => {
      const net =
        Math.round(s.net * intradayScale(tradingMinute, i * 0.7) * 100) / 100;
      return { id: s.id, name: s.name, side: "out" as const, net };
    })
    .filter((n) => n.net < -0.05);

  const ins: FlowNode[] = targets.ins
    .map((s, i) => {
      const net =
        Math.round(s.net * intradayScale(tradingMinute, 1.1 + i * 0.55) * 100) /
        100;
      return { id: s.id, name: s.name, side: "in" as const, net };
    })
    .filter((n) => n.net > 0.05);

  const totalOut = outs.reduce((s, n) => s + Math.abs(n.net), 0);
  const totalIn = ins.reduce((s, n) => s + n.net, 0);
  const exitAmount = Math.max(0, Math.round((totalOut - totalIn) * 100) / 100);

  return {
    period: "realtime",
    as_of,
    market: "CN",
    board_type: "industry",
    currency_unit: "yi",
    nodes: [
      ...outs,
      ...ins,
      {
        id: "market_exit",
        name: "市场离场",
        side: "exit",
        net: -exitAmount,
      },
    ],
    display_links: buildLinks(outs, ins),
    pair_links: [],
    meta: {
      source: "demo/intraday",
      link_mode: "display_constructed",
      stale: false,
      warnings: [targets.sourceNote],
    },
  };
}

function* sessionClockMinutes(step: number): Generator<number> {
  for (let abs = MORNING_START; abs <= MORNING_END; abs += step) {
    yield abs;
  }
  for (let abs = AFTERNOON_START; abs <= AFTERNOON_END; abs += step) {
    yield abs;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sideTotals(nodes: FlowNode[], side: "out" | "in"): number {
  return nodes
    .filter((n) => n.side === side)
    .reduce((s, n) => s + Math.abs(n.net), 0);
}

/** Build evenly spaced session snapshots (default every 5 clock minutes). */
export function buildIntradayDemoSnapshots(
  stepMinutes = 5,
  seed?: FlowResponse | null,
): FlowResponse[] {
  const step = Math.max(1, stepMinutes);
  const targets = targetsFromSeed(seed);
  const frames: FlowResponse[] = [];
  for (const abs of sessionClockMinutes(step)) {
    const snap = snapshotAtClock(abs, targets.day, targets);
    if (snap) frames.push(snap);
  }
  const last = frames[frames.length - 1];
  if (!last || last.as_of.slice(11, 16) !== "15:00") {
    const close = snapshotAtClock(AFTERNOON_END, targets.day, targets);
    if (close) frames.push(close);
  }
  return frames;
}

/** Close-frame totals should match the live seed (within rounding). */
export function closeMatchesSeed(
  frames: FlowResponse[],
  seed: FlowResponse,
  tol = 1,
): boolean {
  const close = frames[frames.length - 1];
  if (!close) return false;
  const outDiff = Math.abs(
    sideTotals(close.nodes, "out") - sideTotals(seed.nodes, "out"),
  );
  const inDiff = Math.abs(
    sideTotals(close.nodes, "in") - sideTotals(seed.nodes, "in"),
  );
  return outDiff <= tol && inDiff <= tol;
}

export function seedSideTotals(seed: FlowResponse): {
  out: number;
  in: number;
} {
  return {
    out: round2(sideTotals(seed.nodes, "out")),
    in: round2(sideTotals(seed.nodes, "in")),
  };
}

export const DEMO_FRAME_MS = 160;
