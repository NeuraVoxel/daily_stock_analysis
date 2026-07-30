import type { DisplayLink, FlowNode, FlowResponse } from "../types/flow";

/** A-share session: 09:30–11:30 + 13:00–15:00 = 240 trading minutes. */
const MORNING_START = 9 * 60 + 30;
const MORNING_END = 11 * 60 + 30;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 15 * 60;
const TRADING_MINUTES = 240;

const OUT_BASE: { id: string; peak: number }[] = [
  { id: "半导体", peak: 72 },
  { id: "光伏设备", peak: 48 },
  { id: "消费电子", peak: 36 },
  { id: "新能源车", peak: 31 },
  { id: "软件开发", peak: 27 },
  { id: "医药商业", peak: 22 },
  { id: "通信设备", peak: 18 },
  { id: "游戏", peak: 15 },
];

const IN_BASE: { id: string; peak: number }[] = [
  { id: "银行", peak: 28 },
  { id: "白酒", peak: 22 },
  { id: "保险", peak: 18 },
  { id: "煤炭行业", peak: 16 },
  { id: "电力", peak: 14 },
  { id: "石油行业", peak: 12 },
  { id: "家电行业", peak: 10 },
  { id: "航运港口", peak: 8 },
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

function progressCurve(t: number): number {
  const x = t / TRADING_MINUTES;
  return Math.pow(x, 0.72);
}

function sectorScale(t: number, seed: number, bias: number): number {
  const base = progressCurve(t);
  const wave =
    0.55 + 0.45 * Math.sin((t / TRADING_MINUTES) * Math.PI * 2 + seed);
  const lateFlip = t > 180 ? bias : 1;
  return Math.max(0.02, base * wave * lateFlip);
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

function snapshotAtClock(absMinutes: number, day: string): FlowResponse | null {
  const h = Math.floor(absMinutes / 60);
  const m = absMinutes % 60;
  const tradingMinute = clockToTradingMinute(h, m);
  if (tradingMinute == null) return null;

  const clock = formatClockMinutes(absMinutes);
  const as_of = `${day}T${clock}:00+08:00`;

  const outs: FlowNode[] = OUT_BASE.map((s, i) => {
    const net = -(
      Math.round(
        s.peak * sectorScale(tradingMinute, i * 0.7, 1.15) * 100,
      ) / 100
    );
    return { id: s.id, name: s.id, side: "out" as const, net };
  }).filter((n) => n.net < -0.05);

  const ins: FlowNode[] = IN_BASE.map((s, i) => {
    const lateBoost = s.id === "银行" || s.id === "保险" ? 1.25 : 0.95;
    const net =
      Math.round(
        s.peak *
          sectorScale(tradingMinute, 1.1 + i * 0.55, lateBoost) *
          100,
      ) / 100;
    return { id: s.id, name: s.id, side: "in" as const, net };
  }).filter((n) => n.net > 0.05);

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
      warnings: ["演示数据：合成 09:30–15:00 盘中资金流向回放，非实时行情"],
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

/** Build evenly spaced session snapshots (default every 5 clock minutes). */
export function buildIntradayDemoSnapshots(
  stepMinutes = 5,
  day = "2026-07-30",
): FlowResponse[] {
  const step = Math.max(1, stepMinutes);
  const frames: FlowResponse[] = [];
  for (const abs of sessionClockMinutes(step)) {
    const snap = snapshotAtClock(abs, day);
    if (snap) frames.push(snap);
  }
  const last = frames[frames.length - 1];
  if (!last || last.as_of.slice(11, 16) !== "15:00") {
    const close = snapshotAtClock(AFTERNOON_END, day);
    if (close) frames.push(close);
  }
  return frames;
}

export const DEMO_FRAME_MS = 160;
