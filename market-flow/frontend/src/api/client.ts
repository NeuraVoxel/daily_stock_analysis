import type { FlowResponse, Period } from "../types/flow";

export interface IndexQuote {
  code: string;
  name: string;
  price: number;
  prev_close?: number | null;
  change?: number | null;
  change_pct: number;
  as_of: string;
  source: string;
  stale: boolean;
}

export async function fetchFlow(
  period: Period,
  at?: string,
): Promise<FlowResponse> {
  const params = new URLSearchParams({ period });
  if (at) params.set("at", at);
  const res = await fetch(`/api/flow?${params.toString()}`);
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message ?? "请求失败";
    throw new Error(msg);
  }
  return body as FlowResponse;
}

export async function fetchShanghaiIndex(): Promise<IndexQuote> {
  const res = await fetch("/api/index/shanghai");
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message ?? "指数请求失败";
    throw new Error(msg);
  }
  return body as IndexQuote;
}
