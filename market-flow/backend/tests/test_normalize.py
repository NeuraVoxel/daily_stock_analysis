import pandas as pd
from app.services.normalize import normalize_sector_rank_df


def test_normalize_converts_yuan_to_yi_and_picks_net_column():
    df = pd.DataFrame(
        {
            "名称": ["半导体", "银行"],
            "今日主力净流入-净额": [-6_518_000_000, 469_000_000],
        }
    )
    rows = normalize_sector_rank_df(df, indicator="今日")
    by_id = {r["id"]: r for r in rows}
    assert abs(by_id["半导体"]["net"] - (-65.18)) < 0.01
    assert abs(by_id["银行"]["net"] - 4.69) < 0.01
