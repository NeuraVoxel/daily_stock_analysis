from __future__ import annotations

import pandas as pd

_NAME_KEYS = ("名称", "板块", "行业", "name")
_NET_SUFFIX = "主力净流入-净额"


def normalize_sector_rank_df(df: pd.DataFrame, *, indicator: str) -> list[dict]:
    if df is None or df.empty:
        return []

    name_col = next(
        (c for c in df.columns if any(k in str(c) for k in _NAME_KEYS)),
        None,
    )
    # Prefer indicator-prefixed net column, else any 主力净流入-净额
    net_col = None
    preferred = f"{indicator}{_NET_SUFFIX}" if not indicator.endswith("净额") else indicator
    for c in df.columns:
        if str(c) == preferred or str(c).endswith(_NET_SUFFIX) or "净流入-净额" in str(c):
            net_col = c
            break
    if name_col is None or net_col is None:
        return []

    rows: list[dict] = []
    for _, raw in df.iterrows():
        name = str(raw[name_col]).strip()
        if not name or name == "nan":
            continue
        val = pd.to_numeric(raw[net_col], errors="coerce")
        if pd.isna(val):
            continue
        net_yi = float(val) / 1e8
        rows.append({"id": name, "name": name, "net": round(net_yi, 4)})
    return rows
