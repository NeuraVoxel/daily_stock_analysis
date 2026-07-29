from __future__ import annotations

from typing import Any, Literal

Period = Literal["realtime", "day", "week", "month", "year"]

_MAP: dict[Period, dict[str, Any]] = {
    "realtime": {"indicator": "今日", "warnings": []},
    "day": {"indicator": "今日", "warnings": []},
    "week": {"indicator": "5日", "warnings": ["周视图使用公开源「5日」窗口近似"]},
    "month": {
        "indicator": "10日",
        "warnings": ["月视图使用公开源「10日」窗口近似，非自然月加总"],
    },
    "year": {
        "indicator": "10日",
        "warnings": [
            "年视图暂无公开年窗口，当前降级为「10日」近似，请勿当作真实年资金流"
        ],
    },
}


def resolve_period(period: Period) -> dict[str, Any]:
    return {
        "indicator": _MAP[period]["indicator"],
        "warnings": list(_MAP[period]["warnings"]),
    }
