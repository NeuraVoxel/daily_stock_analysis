from __future__ import annotations

import pandas as pd


def fetch_sector_fund_flow_rank(*, indicator: str) -> pd.DataFrame:
    """Fetch industry fund-flow rank from AkShare / East Money."""
    import akshare as ak

    df = ak.stock_sector_fund_flow_rank(
        indicator=indicator,
        sector_type="行业资金流",
    )
    if df is None:
        return pd.DataFrame()
    return df
