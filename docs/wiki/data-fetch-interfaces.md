# 单股分析：数据获取入口与底层接口

本文统计 **分析一只股票时**，各数据块如何进入系统：统一入口、fallback 顺序、以及底层库 / HTTP API。

总入口：`data_provider/base.py` → `DataFetcherManager`。  
情报 / 社媒不在 `data_provider/`，见文末。  
用户向降级说明见 [data-source-stability.md](../data-source-stability.md)；分析需要哪些信息见 [stock-analysis.md](stock-analysis.md)。

实现若与本文冲突，以代码为准。

---

## 1. 总览：数据类型 → 管理器方法

| 数据类型 | Pipeline 何时用 | Manager 入口 | 失败策略 |
| --- | --- | --- | --- |
| 日线 OHLCV | `fetch_and_save_stock_data` | `get_daily_data` | 按市场过滤后，按 fetcher `priority` 依次尝试；熔断短期跳过 |
| 股票名称 | `analyze_stock` 开头 | `get_stock_name` | 缓存 → 静态表 → 指数名 → 可选实时名 → 各 fetcher |
| 实时行情 | Step 1 | `get_realtime_quote` | 开关关闭 / 全失败 → 用历史收盘价继续 |
| 筹码分布 | Step 2 | `get_chip_distribution` | 仅实现方尝试；失败 → `None` |
| 基本面上下文 | Step 2.5 | `get_fundamental_context` | 块级 partial/failed；不拖垮主链路 |
| 所属板块 | 基本面后附加 | `get_belong_boards`（CN） | 失败则 boards 为空 |
| 技术趋势 | Step 3 | **不拉网**：`StockTrendAnalyzer` 读本地日线 | 本地无足够 K 线则跳过 |
| 新闻情报 | Step 4 | `SearchService.search_comprehensive_intel` | 无搜索源则跳过 |
| 美股社媒情绪 | Step 4.5 | `SocialSentimentService.get_social_context` | 仅美股；无 Key 跳过 |

```text
Pipeline
  ├─ DataFetcherManager.get_daily_data          → 多 Fetcher fallback
  ├─ DataFetcherManager.get_realtime_quote      → CN: REALTIME_SOURCE_PRIORITY token 链
  ├─ DataFetcherManager.get_chip_distribution   → 实现 get_chip_distribution 的 Fetcher
  ├─ DataFetcherManager.get_fundamental_context → AkShare / yfinance 适配器 + 实时估值
  ├─ StockTrendAnalyzer.analyze                 → SQLite 日线计算
  ├─ SearchService.search_comprehensive_intel   → 搜索 Provider 链
  └─ SocialSentimentService (US)                → Adanos 等 HTTP API
```

---

## 2. Fetcher 一览（库 / 接口 / 能力）

默认在 `_init_default_fetchers()` 中创建；未配置 Token 的可选源**不实例化**。

| Fetcher | 文件 | 默认日线优先级 | 市场（日线 support map） | 主要能力 | 底层获取方式 |
| --- | --- | --- | --- | --- | --- |
| EfinanceFetcher | `efinance_fetcher.py` | 0（`EFINANCE_PRIORITY`） | CN | 日线、实时、指数、市场统计、板块排名、所属板块 | **efinance**：`get_quote_history`、`get_realtime_quotes`、`get_belong_board` 等 |
| TencentFetcher | `tencent_fetcher.py` | 0（硬编码） | CN | 日线 | HTTP `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get` |
| AkshareFetcher | `akshare_fetcher.py` | 1（`AKSHARE_PRIORITY`） | CN, HK | 日线、实时、筹码、指数、市场统计、板块排名 | **akshare** + 新浪/腾讯 HTTP（见下） |
| PytdxFetcher | `pytdx_fetcher.py` | 2（`PYTDX_PRIORITY`） | CN | 日线、名称、实时(dict) | **pytdx** `TdxHq_API.get_security_bars` 等；可配 `PYTDX_HOST`/`PORT`/`SERVERS` |
| BaostockFetcher | `baostock_fetcher.py` | 3（`BAOSTOCK_PRIORITY`） | CN | 日线、名称 | **baostock** `query_history_k_data_plus` |
| YfinanceFetcher | `yfinance_fetcher.py` | 4（`YFINANCE_PRIORITY`） | CN, HK, US, JP, KR, TW | 日线、实时、多市场指数 | **yfinance**；美股指数另有 Stooq HTTP 兜底 |
| TushareFetcher | `tushare_fetcher.py` | Token 可用时约 **-1**（最前） | CN, HK | 日线、实时、名称、筹码、指数、市场统计、板块 | Tushare Pro/HTTP（`TUSHARE_TOKEN`，可选 `TUSHARE_HTTP_URL`） |
| TickFlowFetcher | `tickflow_fetcher.py` | `TICKFLOW_PRIORITY`（默认 2） | CN | 日线、实时、名称、指数、市场统计、板块、批量预取 | **tickflow** SDK：`klines` / `quotes` / `instruments`（需 `TICKFLOW_API_KEY`） |
| LongbridgeFetcher | `longbridge_fetcher.py` | `LONGBRIDGE_PRIORITY`（默认 5） | HK, US | 日线、实时、名称 | **longbridge** OpenAPI（需 App Key/Secret/Token 或 OAuth） |
| FinnhubFetcher | `finnhub_fetcher.py` | 2 | US | 日线、实时、名称 | REST `https://finnhub.io/api/v1`（`/stock/candle`、`/quote` 等，`FINNHUB_API_KEY`） |
| AlphaVantageFetcher | `alphavantage_fetcher.py` | 3 | US | 日线、实时、名称 | REST `https://www.alphavantage.co/query`（`TIME_SERIES_DAILY`、`GLOBAL_QUOTE` 等） |

辅助适配器（不进日线 priority 列表）：

| 适配器 | 文件 | 用途 | 底层 |
| --- | --- | --- | --- |
| AkshareFundamentalAdapter | `fundamental_adapter.py` | A 股基本面块 | 动态调用 `ak.<api>` 候选列表 |
| YfinanceFundamentalAdapter | `yfinance_fundamental_adapter.py` | 外股基本面 | `yf.Ticker` info / 季报 / 分红 |
| TwInstitutionalFetcher | `tw_institutional_fetcher.py` | 台股三大法人 | TWSE T86 / TPEx OpenAPI |

---

## 3. 日线 OHLCV：`get_daily_data`

### 3.1 路由

- **CN / HK / JP / KR / TW**：对 `_fetchers` 按 `priority` 排序，再按 `_DAILY_MARKET_FETCHER_SUPPORT` 过滤市场，再过滤 `daily_data` 能力与日线熔断。
- **US**：固定路由（不完全依赖通用 priority）：
  - 指数 → Yfinance → Finnhub
  - 个股 → 有 Longbridge 时：Longbridge → Finnhub → AlphaVantage → Yfinance；否则 Finnhub → AlphaVantage → Yfinance → Longbridge

### 3.2 典型底层接口（按源）

| 源 | 代表性调用 |
| --- | --- |
| Efinance | `ef.stock.get_quote_history(...)` |
| Tencent | `web.ifzq.gtimg.cn` 复权 K 线 |
| AkShare CN | `ak.stock_zh_a_hist` → `stock_zh_a_daily` → `stock_zh_a_hist_tx`；ETF：`fund_etf_hist_em` |
| AkShare HK | `ak.stock_hk_hist` |
| Tushare | `daily` / `fund_daily` / `hk_daily` |
| TickFlow | `client.klines.get` / batch |
| Pytdx | `get_security_bars` |
| Baostock | `query_history_k_data_plus` |
| YFinance | `yf` history；US 指数可走 Stooq |
| Longbridge | `history_candlesticks_*` |
| Finnhub | `/stock/candle` |
| Alpha Vantage | `TIME_SERIES_DAILY` |

### 3.3 CN 日线优先级示例（全开）

**Tushare(-1) → Efinance(0) → Tencent(0) → Akshare(1) → TickFlow/Pytdx(2) → Baostock(3) → Yfinance(4)**  
（US-only 源对 CN 会被市场过滤掉。）

落库：`pipeline.fetch_and_save_stock_data` → SQLite `StockDaily`。

---

## 4. 实时行情：`get_realtime_quote`

开关：`ENABLE_REALTIME_QUOTE`。

### 4.1 按市场

| 市场 | 策略 |
| --- | --- |
| CN | 走 `REALTIME_SOURCE_PRIORITY` **token 链**（与日线 fetcher priority **独立**） |
| US / HK | 双源 + 字段补全；配置了 Longbridge 时优先 Longbridge，美股还可补 Finnhub / Alpha Vantage |
| JP / KR / TW | 仅 Yfinance |

主源成功后，后续源最多再补一轮字段：量比、换手、PE/PB、市值、振幅等。

### 4.2 CN `REALTIME_SOURCE_PRIORITY` token → 调用

| Token | 实际调用 |
| --- | --- |
| `tencent` / `akshare_qq` | AkShare 路径直连 `http://qt.gtimg.cn/q=...` |
| `akshare_sina` | 直连 `http://hq.sinajs.cn/list=...` |
| `efinance` | `EfinanceFetcher.get_realtime_quote` → `ef.stock.get_realtime_quotes` |
| `akshare_em` | `AkshareFetcher.get_realtime_quote(source="em")` → `ak.stock_zh_a_spot_em` |
| `tushare` | `TushareFetcher.get_realtime_quote` → Pro `quotation` → `ts.get_realtime_quotes` |
| `tickflow` | `TickFlowFetcher.get_realtime_quote` → `client.quotes.get` |

默认（未显式设 env）：`tencent,akshare_sina,efinance,akshare_em`。  
若配置了 `TUSHARE_TOKEN` 且未显式设 priority：自动变为 `tushare,tencent,akshare_sina,efinance,akshare_em`（`Config._resolve_realtime_source_priority`）。

---

## 5. 筹码分布：`get_chip_distribution`

开关：`ENABLE_CHIP_DISTRIBUTION`。

当前实现了该方法的 Fetcher：**TushareFetcher**、**AkshareFetcher**（按日线同一套 priority 遍历 + 筹码熔断）。

| 源 | 底层接口 |
| --- | --- |
| AkShare | `ak.stock_cyq_em(symbol=...)`（A 股；港股直接跳过） |
| Tushare | `cyq_chips`（常配合 `daily` 取收盘价） |

无有效核心指标（均成本 / 集中度等）视为失败，尝试下一源；全失败返回 `None`。

---

## 6. 基本面：`get_fundamental_context`

开关：`ENABLE_FUNDAMENTAL_PIPELINE`。有阶段超时、单块超时、重试与短缓存（`FUNDAMENTAL_*`）。

### 6.1 A 股（CN）块 → 来源

| 块 | 填充方式 | 底层（示意） |
| --- | --- | --- |
| `valuation` | Manager 从 `get_realtime_quote` 取 PE/PB/市值 | 见 §4 |
| `growth` | `AkshareFundamentalAdapter.get_fundamental_bundle` | `stock_financial_abstract` / `stock_financial_analysis_indicator` 等 |
| `earnings` | 同上（预告/快报/财报/分红） | `stock_yjyg_em`、`stock_yjbb_em`、`stock_yjkb_em`、分红相关 `stock_fhps_*` / cninfo 等 |
| `institution` | 同上 | `stock_institute_hold` / `stock_institute_recommend`；十大股东等 |
| `capital_flow` | `get_capital_flow_context` → adapter | `stock_individual_fund_flow` / `stock_main_fund_flow`；板块资金流 |
| `dragon_tiger` | `get_dragon_tiger_context` | `stock_lhb_*_em` 等 |
| `boards` | `get_board_context` → 各 fetcher `get_sector_rankings` | efinance / akshare / tushare / tickflow |
| `belong_boards` | Pipeline `_attach_belong_boards...` → `get_belong_boards` | **Efinance** `ef.stock.get_belong_board` |

ETF：资金流 / 龙虎榜 / 部分 boards 常标 `not_supported`。

### 6.2 外股（HK/US/JP/KR/TW）

`_build_offshore_fundamental_context`：

| 块 | 来源 |
| --- | --- |
| `valuation` | 实时行情 PE/PB/MV |
| `growth` / `earnings` / `belong_boards` | `YfinanceFundamentalAdapter.get_fundamental_bundle` |
| `institution` | 仅 TW：`TwInstitutionalFetcher.get_institutional_net`；其余 `not_supported` |
| `capital_flow` / `dragon_tiger` / `boards` | `not_supported` |

---

## 7. 本地计算（非外部行情接口）

| 数据 | 入口 | 如何得到 |
| --- | --- | --- |
| 分析简上下文 | `storage.get_analysis_context` | 库内最近两日 OHLCV 对比 |
| 趋势 / 买卖评分 | `StockTrendAnalyzer.analyze` | ~90 自然日日线 → MA/乖离/量能/MACD/RSI |
| 市场阶段 | `build_market_phase_context` | 日历与本地时间，非行情 HTTP |
| ContextPack 摘要 | `AnalysisContextBuilder` | 组装已有 artifacts，**zero-fetch** |

---

## 8. 新闻情报（搜索 Provider）

入口：`src/search_service.py` → `SearchService.search_comprehensive_intel`（多维：最新消息 / 风险 / 业绩等）。

注册顺序（有 Key 才加入；Anspire 会插到队首）：

| Provider | 配置 | 典型 Endpoint |
| --- | --- | --- |
| Anspire | `ANSPIRE_API_KEYS` | `https://plugin.anspire.cn/api/ntsearch/search` |
| Bocha | `BOCHA_API_KEYS` | `https://api.bocha.cn/v1/web-search` |
| Tavily | `TAVILY_API_KEYS` | Tavily Search API |
| Brave | `BRAVE_API_KEYS` | `https://api.search.brave.com/res/v1/web/search` |
| SerpAPI | `SERPAPI_API_KEYS` | SerpAPI |
| MiniMax | `MINIMAX_API_KEYS` | `https://api.minimaxi.com/v1/coding_plan/search` |
| SearXNG | `SEARXNG_BASE_URLS` 或公共实例开关 | 自托管 / 公共 SearXNG |

另有合规 RSS/HTML 情报源：`src/services/intelligence_service.py`（`NEWS_INTEL_*`），见 [intelligence-sources.md](../intelligence-sources.md)。

---

## 9. 美股社媒情绪

| 项 | 说明 |
| --- | --- |
| 服务 | `src/services/social_sentiment_service.py` |
| 开关 | `SOCIAL_SENTIMENT_API_KEY`；URL 默认 `https://api.adanos.org` |
| 范围 | 仅美股代码；Pipeline Step 4.5 |
| 接口示意 | `/reddit/stocks/v1/report/{ticker}`、Reddit/X/Polymarket trending |

---

## 10. 与大盘复盘的边界（单股旁路）

下列 Manager 方法主要服务 **大盘复盘**（`src/market_analyzer.py`），不是单股 OHLCV 主路径，但同一 Fetcher 可能复用：

| 方法 | 说明 |
| --- | --- |
| `get_main_indices` | 主指数；CN 可优先 TickFlow |
| `get_market_stats` | 市场宽度等 |
| `get_sector_rankings` | 板块涨跌排行（也会进基本面 `boards`） |

单股若启用日级大盘上下文，会**读已生成的大盘摘要**，不在此表重复拉指数细节。

---

## 11. 配置速查（按源）

| 源 / 能力 | 关键配置 |
| --- | --- |
| Tushare | `TUSHARE_TOKEN`，可选 `TUSHARE_HTTP_URL` |
| TickFlow | `TICKFLOW_API_KEY`，`TICKFLOW_PRIORITY`，`TICKFLOW_KLINE_ADJUST`，batch 相关 |
| Longbridge | `LONGBRIDGE_APP_KEY` / `SECRET` / `ACCESS_TOKEN`（或 OAuth），`LONGBRIDGE_PRIORITY` |
| Finnhub | `FINNHUB_API_KEY` |
| Alpha Vantage | `ALPHAVANTAGE_API_KEY` |
| 实时 | `ENABLE_REALTIME_QUOTE`，`REALTIME_SOURCE_PRIORITY`，`REALTIME_CACHE_TTL` |
| 筹码 | `ENABLE_CHIP_DISTRIBUTION` |
| 基本面 | `ENABLE_FUNDAMENTAL_PIPELINE`，`FUNDAMENTAL_STAGE_TIMEOUT_SECONDS` 等 |
| 新闻 | `ANSPIRE_API_KEYS`、`TAVILY_API_KEYS`、`BRAVE_API_KEYS`、`SERPAPI_API_KEYS`、`BOCHA_API_KEYS`、`MINIMAX_API_KEYS`、`SEARXNG_*` |
| 社媒 | `SOCIAL_SENTIMENT_API_KEY`，`SOCIAL_SENTIMENT_API_URL` |
| 各免费源优先级 | `EFINANCE_PRIORITY`、`AKSHARE_PRIORITY`、`PYTDX_PRIORITY`、`BAOSTOCK_PRIORITY`、`YFINANCE_PRIORITY` |

---

## 12. 维护说明

- 增删 Fetcher 或改 priority / realtime token / 基本面 API 候选时，请同步更新本文。  
- 更偏「用户怎么配才稳」的说明放在 [data-source-stability.md](../data-source-stability.md)，本文偏 **接口与代码路径统计**。  
