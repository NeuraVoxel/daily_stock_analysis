import type { FlowResponse, Period } from "../types/flow";

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
