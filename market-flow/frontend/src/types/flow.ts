export type Period = "realtime" | "day" | "week" | "month" | "year";

export interface FlowNode {
  id: string;
  name: string;
  side: "out" | "in" | "exit";
  net: number;
}

export interface DisplayLink {
  from: string;
  to: string;
  amount: number;
}

export interface FlowMeta {
  source: string;
  link_mode: "display_constructed";
  stale: boolean;
  warnings: string[];
}

export interface FlowResponse {
  period: Period;
  as_of: string;
  market: "CN";
  board_type: "industry";
  currency_unit: "yi";
  nodes: FlowNode[];
  display_links: DisplayLink[];
  pair_links: DisplayLink[];
  meta: FlowMeta;
}

export interface FlowError {
  error: {
    code: "upstream_unavailable" | "empty_data" | "unsupported_scrub";
    message: string;
  };
}
