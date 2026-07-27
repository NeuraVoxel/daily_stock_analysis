# 如何分析一只股票（本项目视角）

本文从当前仓库实现出发，说明：**分析一只股票需要哪些信息**，以及 **代码里实际怎么跑完一遍单股分析**。

入口与编排以 `main.py` → `src/core/pipeline.py`（`StockAnalysisPipeline`）为准；实现细节若与本文冲突，以代码为准。

---

## 1. 一句话结论

本项目不是「只把行情丢给大模型」，而是：

1. 先抓取并落库 **日线 OHLCV**（分析骨架）
2. 再聚合 **实时行情 / 筹码 / 基本面 / 技术趋势 / 新闻情报**（可降级）
3. 打包成结构化 Prompt，由 **LLM** 产出「决策仪表盘」JSON
4. 经 **阶段 / 结构护栏** 后落库、渲染报告、可选推送

**最低可跑通**：股票代码 + 本地库 + 至少一个 LLM Key。  
**要出「像样」的报告**：再配行情源与搜索源；缺一块会降级，一般不整单失败。

各数据块的 **统一入口、fallback、底层库/HTTP** 见专篇：[data-fetch-interfaces.md](data-fetch-interfaces.md)。

---

## 2. 端到端流程

```text
CLI / 定时 / API / Web
  → StockAnalysisPipeline.run(stock_codes)
    → process_single_stock(code)
      → fetch_and_save_stock_data()     # 日线 → SQLite
      → analyze_stock()                 # 除非 --dry-run
          → 市场阶段 / 日级大盘上下文（可选）
          → 实时行情、筹码、基本面、市场结构
          → StockTrendAnalyzer（MA / 乖离 / 量能 / MACD / RSI）
          → 分支：
              · AGENT_MODE / skills → Agent 链路
              · 默认 → 多维情报搜索 → 增强上下文 → GeminiAnalyzer
          → 护栏 + save_analysis_history
          → 通知（批量或单股）
```

| 步骤 | 做什么 | 主要代码 |
| --- | --- | --- |
| 解析标的 | `STOCK_LIST` / `--stocks` / `--portfolio` | `main.py` |
| 拉日线 | 约 30 日 OHLCV，断点续传 | `pipeline.fetch_and_save_stock_data` |
| 增强数据 | 实时、筹码、基本面、趋势 | `pipeline.analyze_stock` |
| 情报 | 新闻 / 风险 / 业绩等（可选） | `src/search_service.py` |
| AI | 结构化 Prompt → JSON 仪表盘 | `src/analyzer.py` |
| 产出 | 历史库 + Jinja 报告 + 推送 | `storage` / `report_renderer` / `notification` |

常用命令：

```bash
python main.py --stocks 600519,hk00700,AAPL
python main.py --stocks 600519 --dry-run      # 只拉数，不调 LLM
python main.py --stocks 600519 --no-notify
```

代码格式示例：A 股 `600519`，港股 `hk00700`，美股 `AAPL`。

---

## 3. 需要哪些信息？

按「硬依赖 → 软依赖 → 增强」分层。缺增强项时，链路尽量 **fail-open**（记日志 / 标 missing，继续分析）。

### 3.1 硬依赖（没有就跑不动或没有 AI 结论）

| 信息 | 说明 | 配置 / 入口 |
| --- | --- | --- |
| 股票代码 | 分析对象身份 | `STOCK_LIST`、`--stocks`、持仓导入 |
| 本地数据库 | 存日线与分析历史 | `DATABASE_PATH`（默认 `./data/stock_analysis.db`） |
| LLM 凭证 | 生成决策仪表盘 | `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / Ollama / 渠道模式等 |

### 3.2 骨架数据：日线行情（几乎总要）

日线是技术面与趋势计算的底盘。典型字段（`StockDaily`）：

- OHLCV：`open` / `high` / `low` / `close` / `volume` / `amount` / `pct_chg`
- 衍生：`ma5` / `ma10` / `ma20` / `volume_ratio`
- 元数据：`data_source`

来源经 `DataFetcherManager` 多源 fallback（如 Tushare、efinance、akshare、yfinance、Longbridge 等，视市场与配置而定）。

分析上下文还会从库中取 **最近两日** 对比（今日 / 昨日量价变化、均线状态），见 `storage.get_analysis_context()`。

### 3.3 实时行情（强烈建议）

开关：`ENABLE_REALTIME_QUOTE`（默认开）。用于盘中价量与估值补强，例如：

- 价格、涨跌幅、量 / 额
- **量比**、**换手率**
- PE / PB、总市值 / 流通市值
- 60 日涨跌、52 周高低等（视源能力）
- 质量标记：`is_stale`、`source` 等

不可用时降级为历史收盘价继续分析。

### 3.4 筹码分布（建议，偏 A 股）

开关：`ENABLE_CHIP_DISTRIBUTION`。常见字段：

- 获利比例 `profit_ratio`
- 平均成本 `avg_cost`
- 集中度 `concentration_90` / `concentration_70`
- 成本区间等

获取失败或市场不支持时跳过，Prompt 中会标明不可用。

### 3.5 基本面聚合（建议）

开关：`ENABLE_FUNDAMENTAL_PIPELINE`。统一入口 `get_fundamental_context()`，块级状态 + 数据，失败不拖垮主链路。常见块：

| 块 | 含义（示意） |
| --- | --- |
| `valuation` | 估值：PE/PB/市值等 |
| `growth` / `earnings` | 成长、财报、分红 |
| `institution` | 机构持仓等（如部分市场） |
| `capital_flow` / `dragon_tiger` / `boards` | 资金流、龙虎榜、板块归属 |
| `coverage` / `source_chain` / `errors` | 覆盖度与溯源 |

美/港等外股走 offshore / yfinance 等适配路径，覆盖面可能弱于 A 股。

### 3.6 程序化技术面（不依赖 LLM）

`StockTrendAnalyzer`（`src/stock_analyzer.py`）在约 **90 个自然日** 日线上计算（覆盖 MA60），结果 `TrendAnalysisResult` 注入 Prompt，并参与后置稳定化护栏。

| 维度 | 要点 |
| --- | --- |
| 均线 | MA5 / 10 / 20 / 60；多头偏好 MA5>MA10>MA20 |
| 乖离 | 相对 MA5/10/20；默认 `BIAS_THRESHOLD`（约 5%）以上倾向不追高 |
| 量能 | 相对 5 日均量：缩量回踩更受偏好 |
| MACD | 12/26/9，金叉死叉与零轴 |
| RSI | 6/12/24，超买超卖 |
| 信号 | `BuySignal` + `signal_score`（0–100）+ 理由 / 风险 |

交易理念摘要：**顺势（多头排列）+ 不追高（控乖离）+ 回踩买点 + 量价配合**。

### 3.7 新闻与情报（强烈建议）

无搜索 Key 时跳过情报，退化为偏技术面分析。配置如 `TAVILY_API_KEYS`、`SERPAPI_API_KEYS`、`BRAVE_API_KEYS`、SearXNG、Anspire 等。

`search_comprehensive_intel()` 多维检索（上限约 5 次），常见维度：

- `latest_news`：最新消息
- `risk_check`：风险排查
- `earnings`：业绩预期
- 以及公告 / 市场分析 / 行业等（随市场变化）

美股还可能叠加社交媒体情绪（若服务可用）。

### 3.8 市场与阶段上下文（环境信息）

| 信息 | 作用 |
| --- | --- |
| 市场代码 | `cn` / `hk` / `us` 等，决定日历、源与 Prompt 角色 |
| `MarketPhaseContext` | 盘前 / 盘中 / 收盘等阶段，约束「现在该怎么决策」 |
| 日级大盘上下文 | 可选，共享大盘摘要进 Prompt |
| 市场结构 / 板块 | 从基本面 boards 等拼出结构上下文 |
| `AnalysisContextPack` 摘要 | 低敏数据质量 / 块状态摘要进 Prompt（详见专题文档） |

### 3.9 运行与报告配置（非「行情字段」，但影响结果形态）

| 配置 | 作用 |
| --- | --- |
| `REPORT_TYPE` | `simple` / `brief` / `full` |
| `REPORT_LANGUAGE` | 报告语言 |
| `AGENT_MODE` / `AGENT_SKILLS` | 走 Agent 还是普通分析 |
| `MAX_WORKERS` | 多股并发 |
| 通知渠道 | 企微 / 飞书 / Telegram 等 |

更细的数据源与 fallback 见 [data-source-stability.md](../data-source-stability.md)；上下文包契约见 [analysis-context-pack.md](../analysis-context-pack.md)。

---

## 4. 这些信息如何进大模型？

普通分析路径（非 Agent）大致组装为：

1. 标的身份：代码、名称、日期、市场  
2. 市场阶段 + 可选日级大盘 / 结构 / ContextPack 低敏摘要  
3. 今日行情表：OHLCV、均线、`ma_status`  
4. 实时增强：量比、换手、估值与市值等  
5. 基本面片段：财报 / 资金流 / 机构等（有则写入）  
6. 筹码（或明确不可用）  
7. 预计算趋势：状态、乖离、量能、买卖信号、评分与理由  
8. 昨今日量价对比  
9. 新闻情报块（含日期与风险 / 催化规则）

实现：`pipeline._enhance_context()` → `GeminiAnalyzer._format_prompt()` / `analyze()`。  
系统提示要求输出符合 `AnalysisReportSchema` 的 **决策仪表盘 JSON**（`src/schemas/report_schema.py`）。

Agent 模式会把同类 artifacts 注入 Agent 首轮消息或多 Agent 共享上下文，再由工具与专家链完成分析（配置与成本更高）。

---

## 5. 分析产出是什么？

### 5.1 运行时 `AnalysisResult`

含情绪分、趋势预判、操作建议、`decision_type` / `action`、置信度、叙述字段、现价涨跌、以及完整 `dashboard` 等。

### 5.2 决策仪表盘 `dashboard`（核心结构化结果）

| 区块 | 内容 |
| --- | --- |
| `core_conclusion` | 一句话结论、信号类型、空仓/持仓建议 |
| `data_perspective` | 趋势、价格位置、量能、筹码 |
| `intelligence` | 新闻、风险、催化、业绩、情绪 |
| `battle_plan` | 买卖点、仓位、行动清单 |
| `phase_decision` | 阶段感知的行动窗口 |
| `signal_attribution` | 技术 / 新闻 / 基本面 / 市场等权重归因 |

### 5.3 落库与展示

- 分析历史：`save_analysis_history()`（可选 context snapshot）
- 模板：`templates/report_*.j2`，经 `report_renderer` 渲染
- Web / Desktop / 通知渠道消费同一套结果语义

---

## 6. 「如何分析一只股票」——操作清单

面向使用者：

1. **定标的**：在 `.env` 写 `STOCK_LIST`，或 `python main.py --stocks <代码>`  
2. **配 LLM**：至少一个可用模型渠道（见 [LLM_CONFIG_GUIDE.md](../LLM_CONFIG_GUIDE.md)）  
3. **（建议）配行情 Token**：如 `TUSHARE_TOKEN`，提高日线 / 实时稳定性  
4. **（建议）配搜索 Key**：让情报块有内容，而不是纯技术面  
5. **跑分析**：先 `--dry-run` 验证拉数，再正式跑  
6. **看结果**：Web 报告页、`reports/`、或通知渠道  

面向开发者（对照代码阅读顺序）：

1. `main.py` → `run_full_analysis`  
2. `src/core/pipeline.py` → `process_single_stock` / `analyze_stock`  
3. `data_provider/` → 日线 / 实时 / 筹码 / 基本面  
4. `src/stock_analyzer.py` → 趋势与评分  
5. `src/search_service.py` → 情报  
6. `src/analyzer.py` + `src/schemas/report_schema.py` → Prompt 与输出契约  
7. `src/services/report_renderer.py` + `templates/` → 报告呈现  

---

## 7. 信息完备度速查

| 场景 | 日线 | 实时 | 筹码 | 基本面 | 新闻 | LLM | 预期效果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 最小可跑 | ✓（库内有历史也可） | ✗ | ✗ | ✗ | ✗ | ✓ | 偏技术面、情报空 |
| 日常推荐 | ✓ | ✓ | ✓（A） | ✓ | ✓ | ✓ | 完整仪表盘 |
| 仅拉数 | ✓ | — | — | — | — | ✗ | `--dry-run` |
| Agent 增强 | ✓ | ✓ | 可选 | 可选 | 可选 | ✓ + Agent | 多步工具 / 多专家 |

原则：**单一增强源失败不应拖垮整单**；质量通过 ContextPack 状态与报告中的数据限制提示暴露。

---

## 8. 相关文档与源码锚点

| 主题 | 文档 / 代码 |
| --- | --- |
| 数据获取接口统计 | [data-fetch-interfaces.md](data-fetch-interfaces.md) |
| 数据源与降级 | [data-source-stability.md](../data-source-stability.md) |
| 分析上下文包 | [analysis-context-pack.md](../analysis-context-pack.md) |
| 决策信号 | [decision-signals.md](../decision-signals.md) |
| 资讯源 | [intelligence-sources.md](../intelligence-sources.md) |
| 市场支持 | [market-support.md](../market-support.md) |
| 编排 | `src/core/pipeline.py` |
| 趋势 | `src/stock_analyzer.py` |
| LLM | `src/analyzer.py` |
| Schema | `src/schemas/report_schema.py` |
| 数据入口 | `data_provider/base.py`（`DataFetcherManager`） |

---

## 9. 维护说明

- 本文是 **wiki 说明**，描述当前主链路语义，不是 API 契约冻结稿。  
- 若改分析步骤、必填输入或仪表盘结构，请同步改本文，并评估 [analysis-context-pack.md](../analysis-context-pack.md) / CHANGELOG。  
