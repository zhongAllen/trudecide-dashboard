# 数据库 Schema 设计 v11.1
- **版本**: 9.1
- **作者**: Manus AI
- **更新日期**: 2026-02-28
---
## 核心设计原则
1.  **AI 友好**: 所有表结构和 RLS 策略优先考虑 AI 的可访问性和易用性。
2.  **源数据保真**: 尽可能存储从上游 API 获取的原始数据，不做单位换算或二次加工。
3.  **文档同步**: **任何数据库模型（DDL）的变更，都必须立刻、马上、第一时间更新本文档。**
---
## 表结构定义
### `indicator_meta`
指标元数据表，定义了每个宏观经济指标的静态属性。
| 字段名 | 类型 | 主键 | 约束/索引 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | PK | | 指标唯一 ID，例如 `gdp_yoy` |
| `region` | `CHAR(2)` | | | ISO 3166-1 alpha-2 国家代码 (CN/US/JP) |
| `name_cn` | `TEXT` | | `NOT NULL` | 指标中文名 |
| `description_cn` | `TEXT` | | | 指标详细描述 |
| `category` | `TEXT` | | `CHECK (category IN ("macro", "equity", "fx", "bond", "commodity", "sentiment"))` | 指标分类 |
| `frequency` | `TEXT` | | `CHECK (frequency IN ("daily", "weekly", "monthly", "quarterly", "yearly"))` | 数据频率 |
| `unit` | `TEXT` | | | 数据单位 (%, 亿元, 点) |
| `value_type` | `TEXT` | | **无约束** (v8 移除) | 指标数值类型 (yoy, mom, price, level, rate...)，作为辅助分析标签 |
| `source_name` | `TEXT` | | | **[v9.0 变更]** 主要数据来源机构名称 (Tushare, AKShare/jin10, 国家统计局) |
| `source_url` | `TEXT` | | | 数据来源 URL |
| `credibility` | `TEXT` | | `CHECK (credibility IN ("high", "medium", "low", "deprecated"))` | **[v9.1 变更]** 数据可信度。`deprecated` 表示该指标已废弃，不应再用于常规分析。 |
| `currency` | `CHAR(3)` | | | ISO 4217 货币代码 (CNY/USD/EUR/JPY等) |
| `release_day_of_month` | `INTEGER` | | `CHECK (1-31)` | **[v8.4 新增]** 月度指标的常规发布日（1-31）。用于数据质量检查，区分「数据源未发布」和「采集失败」。NULL 表示非月度或不固定。 |
| `created_at` | `TIMESTAMPTZ` | | `NOT NULL` | 创建时间 |
| `updated_at` | `TIMESTAMPTZ` | | `NOT NULL` | 更新时间 |

### `indicator_values`
指标时序数据表，存储具体数值。
| 字段名 | 类型 | 主键 | 约束/索引 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGINT` | PK | `IDENTITY` | 自增主键 |
| `indicator_id` | `TEXT` | | `FK -> indicator_meta.id` | 关联指标 ID |
| `trade_date` | `DATE` | | | 数据日期 |
| `value` | `NUMERIC` | | | 指标数值 |
| `revision_seq` | `INT` | | `DEFAULT 0` | 修订序列号，用于处理历史数据修正。**[v9.0 变更]** 0=jin10 (旧), 1=Tushare (新) |
| `created_at` | `TIMESTAMPTZ` | | `NOT NULL` | 创建时间 |

**唯一约束**: `(indicator_id, trade_date, revision_seq)`
---
## 变更日志
### v9.1 变更（2026-02-28）
- **`indicator_meta.credibility`**: 新增 `deprecated` 枚举值，用于标注已废弃的指标（如 `north_net_flow`），以便在数据质量检查和前端展示中过滤。关联需求 REQ-041。

### v9.0 变更（2026-02-28）
- **数据源切换**: CN 月度核心指标（CPI/PPI/PMI/M2）的主数据源从 AKShare/jin10 切换为 **Tushare**，以解决 jin10 数据日期偏移和 TLS 兼容性问题。
- **`indicator_meta.source_name`**: 明确了各指标的主要数据来源。
- **`indicator_values.revision_seq`**: 重新定义了该字段的含义，`0` 代表旧的 jin10 数据，`1` 代表新的 Tushare 数据，实现了数据版本并存。

### v8.4 变更（2026-02-28）
- 在 `indicator_meta` 表中新增 `release_day_of_month` 字段，用于数据质量检查，解决 `timeliness_stale` 误报问题。

### v8.3 变更（2026-02-28）
- 新增 `sh_market_turnover`, `sz_market_turnover`, `total_market_turnover` 三个指标定义。

### v8.2 变更（2026-02-28）
- 新增 `north_daily_turnover` 和 `north_turnover_ratio_daily` 两个指标定义。

### v8.1 变更（2026-02-28）
- (此版本被 v8.2 覆盖) 新增 `north_monthly_flow` 和 `north_turnover_ratio` 两个指标定义。

### v8.0 变更（2026-02-27）
- 解除 `indicator_meta.value_type` 的 CHECK 约束。
- 新增“文档同步”元规则。

---

## 个股精选数据层（v10.0 新增，2026-03-01）

> 参考 Wind 机构级数据库设计，采用分层存储策略。详见需求文档 `req-048-054-stock-individual-data`。

### 设计原则

- **估值与行情分离**：`stock_daily`（OHLCV）与 `stock_daily_basic`（PE/PB/市值）分离，参考 Wind AShareEODPrices + AShareEODDerivativeIndicator
- **财务三表全存**：历史财报不可再生，全字段存储，参考 Wind AShareIncome/AShareBalanceSheet/AShareCashFlow
- **衍生指标全存**：`fina_indicator` 含 TTM/单季/同比预计算指标，存储成本低，全存

### `stock_daily_basic`（每日估值指标）

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `ts_code` | `TEXT` | PK，股票代码 |
| `trade_date` | `DATE` | PK，交易日 |
| `close` | `NUMERIC` | 收盘价（元） |
| `turnover_rate` | `NUMERIC` | 换手率（%） |
| `turnover_rate_f` | `NUMERIC` | 换手率（自由流通股，%） |
| `volume_ratio` | `NUMERIC` | 量比 |
| `pe` | `NUMERIC` | 市盈率（静态，倍） |
| `pe_ttm` | `NUMERIC` | 市盈率 TTM（倍） |
| `pb` | `NUMERIC` | 市净率（倍） |
| `ps` | `NUMERIC` | 市销率（倍） |
| `ps_ttm` | `NUMERIC` | 市销率 TTM（倍） |
| `dv_ratio` | `NUMERIC` | 股息率（%） |
| `dv_ttm` | `NUMERIC` | 股息率 TTM（%） |
| `total_share` | `NUMERIC` | 总股本（万股） |
| `float_share` | `NUMERIC` | 流通股本（万股） |
| `free_share` | `NUMERIC` | 自由流通股本（万股） |
| `total_mv` | `NUMERIC` | 总市值（万元） |
| `circ_mv` | `NUMERIC` | 流通市值（万元） |

**主键**: `(ts_code, trade_date)`，数据来源：Tushare `daily_basic`

### `stock_income`（利润表）

- **字段数**: 85 个，全字段存储
- **主键**: `(ts_code, end_date, report_type)`
- **核心字段**: `total_revenue`（营业总收入）、`n_income_attr_p`（归母净利润）、`basic_eps`（每股收益）、`rd_exp`（研发费用）、`ebit`/`ebitda`
- **数据来源**: Tushare `income` / `income_vip`

### `stock_balance`（资产负债表）

- **字段数**: 152 个，全字段存储
- **主键**: `(ts_code, end_date, report_type)`
- **核心字段**: `total_assets`（总资产）、`total_liab`（总负债）、`money_cap`（货币资金）、`accounts_receiv`（应收账款）
- **数据来源**: Tushare `balancesheet` / `balancesheet_vip`

### `stock_cashflow`（现金流量表）

- **字段数**: 97 个，全字段存储
- **主键**: `(ts_code, end_date, report_type)`
- **核心字段**: `n_cashflow_act`（经营活动现金流净额）、`free_cashflow`（自由现金流）
- **数据来源**: Tushare `cashflow` / `cashflow_vip`

### `stock_fina_indicator`（财务指标）

- **字段数**: 108 个，全字段存储（含 TTM/单季/同比预计算指标）
- **主键**: `(ts_code, end_date)`
- **核心字段**: `roe`/`roe_waa`/`roe_dt`（净资产收益率）、`netprofit_yoy`（净利润同比）、`grossprofit_margin`（毛利率）、`debt_to_assets`（资产负债率）、`fcff`/`fcfe`（自由现金流）
- **数据来源**: Tushare `fina_indicator` / `fina_indicator_vip`

### `stock_moneyflow`（资金流向）

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `ts_code` | `TEXT` | PK，股票代码 |
| `trade_date` | `DATE` | PK，交易日 |
| `source` | `TEXT` | PK，数据来源（dc/ths） |
| `buy_sm_vol` | `NUMERIC` | 小单买入量（手） |
| `sell_sm_vol` | `NUMERIC` | 小单卖出量（手） |
| `buy_md_vol` | `NUMERIC` | 中单买入量（手） |
| `sell_md_vol` | `NUMERIC` | 中单卖出量（手） |
| `buy_lg_vol` | `NUMERIC` | 大单买入量（手） |
| `sell_lg_vol` | `NUMERIC` | 大单卖出量（手） |
| `buy_elg_vol` | `NUMERIC` | 超大单买入量（手） |
| `sell_elg_vol` | `NUMERIC` | 超大单卖出量（手） |
| `net_mf_vol` | `NUMERIC` | 主力净流入量（手） |
| `net_mf_amount` | `NUMERIC` | 主力净流入额（万元） |

**主键**: `(ts_code, trade_date, source)`，数据来源：Tushare `moneyflow_dc` / `moneyflow_ths`

### 事件层（`stock_holders` / `stock_pledge` / `stock_holder_trade`）

| 表名 | 更新频率 | 主键 | 数据来源 |
| :--- | :--- | :--- | :--- |
| `stock_holders` | 季度 | `(ts_code, end_date, holder_name)` | `top10_floatholders` |
| `stock_pledge` | 不定期 | `(ts_code, end_date)` | `pledge_stat` |
| `stock_holder_trade` | 不定期 | `(ts_code, ann_date, holder_name)` | `stk_holdertrade` |

---

### v10.0 变更日志（2026-03-01）

新增个股精选数据层，共 9 张新表：
- `stock_daily_basic`、`stock_income`、`stock_balance`、`stock_cashflow`、`stock_fina_indicator`（REQ-048~052，已建表）
- `stock_moneyflow`、`stock_holders`、`stock_pledge`、`stock_holder_trade`（REQ-053~054，待采集）

迁移文件：`migrations/create_stock_financial_tables_v1.sql`

---

## 指数/新闻/公告数据层（v11.0 新增，2026-03-01）

> 参考 Wind 行情数据库设计，补充指数行情、新闻快讯、上市公司公告三类数据。详见需求文档 `req-058-060-index-news-announcement`。

### `index_daily`（指数日线行情）

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `ts_code` | `TEXT` | PK，指数代码（A股如 000001.SH，国际如 SPX/HSI） |
| `trade_date` | `DATE` | PK，交易日 |
| `market` | `TEXT` | PK，市场来源：cn=A股，global=国际指数 |
| `open` | `NUMERIC` | 开盘点位 |
| `high` | `NUMERIC` | 最高点位 |
| `low` | `NUMERIC` | 最低点位 |
| `close` | `NUMERIC` | 收盘点位 |
| `pre_close` | `NUMERIC` | 昨日收盘点 |
| `change` | `NUMERIC` | 涨跌点 |
| `pct_chg` | `NUMERIC` | 涨跌幅（%） |
| `vol` | `NUMERIC` | 成交量（手），国际指数为 NULL |
| `amount` | `NUMERIC` | 成交额（千元），国际指数为 NULL |
| `swing` | `NUMERIC` | 振幅（%），仅国际指数提供，A股为 NULL |
| `collected_at` | `TIMESTAMPTZ` | 采集时间戳 |

**主键**: `(ts_code, trade_date, market)`
**数据来源**: Tushare `index_daily`（cn）/ `index_global`（global）
**覆盖范围**: A股全量指数（SSE/SZSE/CSI/SW，约 5000+）+ 国际主要指数（12个）
**迁移文件**: `migrations/create_index_news_announcement_v1.sql`

---

### `news`（新闻快讯，改造）

在原有 `news` 表基础上新增字段：

| 新增字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `src` | `TEXT` | 数据源：sina/wallstreetcn/10jqka/eastmoney/cls/yicai/fenghuang/jinrongjie/yuncaijing |
| `title_hash` | `TEXT` | 去重哈希（GENERATED ALWAYS），`md5(src|pub_time|title)` |

**去重约束**: `UNIQUE INDEX idx_news_dedup (title_hash)`，写入时 `ON CONFLICT DO NOTHING`
**数据来源**: Tushare `news` 接口（需单独开通权限）
**覆盖范围**: 9 大来源，历史从 2018-01-01 开始

---

### `stock_announcement`（上市公司公告）

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `ts_code` | `TEXT` | PK，股票代码 |
| `ann_date` | `DATE` | PK，公告日期 |
| `ann_type` | `TEXT` | PK，公告类型：annual/semi/quarter/other |
| `title` | `TEXT` | 公告标题 |
| `url` | `TEXT` | 原文链接（交易所公告 PDF） |
| `content` | `TEXT` | 公告正文（NULL=尚未抓取，异步补充） |
| `content_at` | `TIMESTAMPTZ` | 正文抓取完成时间 |
| `collected_at` | `TIMESTAMPTZ` | 元数据采集时间 |

**主键**: `(ts_code, ann_date, ann_type)`
**部分索引**: `idx_ann_no_content (ann_date) WHERE content IS NULL`，用于快速查找待补抓记录
**数据来源**: Tushare `disclosure` 接口（需单独开通权限）
**采集策略**: 两阶段——先采集元数据，再异步补抓正文（`--mode backfill-content`）

---

### v11.0 变更日志（2026-03-01）

新增指数/新闻/公告数据层，共 2 张新表 + 1 张改造：
- `index_daily`（REQ-058，新建）
- `news`（REQ-059，改造：新增 src + title_hash 字段）
- `stock_announcement`（REQ-060，新建）

迁移文件：`migrations/create_index_news_announcement_v1.sql`


### `cctv_news`（新闻联播文字稿）
| 字段名 | 类型 | 可空 | 说明 |
| :--- | :--- | :--- | :--- |
| `date` | DATE | NOT NULL | **PK（复合）**，播出日期 |
| `title_hash` | TEXT | NOT NULL | **PK（复合）**，md5(date\|title)，应用层计算 |
| `title` | TEXT | NULL | 新闻标题 |
| `content` | TEXT | NULL | 新闻正文 |
| `collected_at` | TIMESTAMPTZ | DEFAULT now() | 采集时间戳，自动填充 |
**主键**: `(date, title_hash)`（复合主键，约束名 `pk_cctv_news`，每天多条，每条独立新闻条目）
**数据来源**: Tushare `cctv_news` 接口（需单独开通权限）
**采集范围**: 近1个月（用户决策 2026-03-01），与 `news` 表保持一致
**采集策略**: 按日期逐天查询，主键冲突时覆盖更新（允许重新采集）

---
### v11.1 变更日志（2026-03-01）
新增新闻联播文字稿数据层：
- `cctv_news`（REQ-061，新建）：每天一条，主键 `date`，存近1个月
迁移文件：`migrations/create_cctv_news_v1.sql`


---

### `sector_meta`（板块元数据）

板块定义表，存储申万行业、同花顺行业、概念板块等的静态属性。

| 字段名 | 类型 | 主键 | 约束 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | PK | `NOT NULL` | 板块唯一ID，格式：`{system}_{raw_code}`，如 `ths_881001` |
| `name_cn` | `TEXT` | | `NOT NULL` | 板块中文名，如 `申万银行` |
| `system` | `TEXT` | | `NOT NULL` | 板块体系：`ths`（同花顺）/ `dc`（东方财富）/ `sw`（申万）/ `concept` |
| `level` | `INT` | | | 行业层级（1/2/3），概念板块为 NULL |
| `parent_id` | `TEXT` | | FK → sector_meta.id | 父级板块 ID |
| `raw_code` | `TEXT` | | | 原始代码（如 Tushare 返回的 ts_code） |
| `idx_type` | `TEXT` | | | 指数类型（ths/dc 等） |
| `is_active` | `BOOL` | | `DEFAULT true` | 是否仍在使用 |
| `description` | `TEXT` | | | 板块描述 |
| `created_at` | `TIMESTAMPTZ` | | `DEFAULT now()` | 创建时间 |
| `updated_at` | `TIMESTAMPTZ` | | `DEFAULT now()` | 更新时间 |

---

### `sector_stock_map`（板块成分股映射）

记录板块与个股的多对多关系，支持历史变更追踪。

| 字段名 | 类型 | 主键 | 约束 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `sector_id` | `TEXT` | PK | FK → sector_meta.id | 板块 ID |
| `ts_code` | `TEXT` | PK | | 股票代码（如 `000001.SZ`） |
| `system` | `TEXT` | PK | | 板块体系（ths/dc/sw/concept） |
| `in_date` | `DATE` | | | 纳入日期 |
| `out_date` | `DATE` | | | 移出日期，NULL 表示仍在成分 |
| `is_current` | `BOOL` | | `DEFAULT true` | 是否当前成分股 |

---

### `sector_daily`（板块日线行情）

板块每日行情数据，主键为 `(sector_id, trade_date)`。

| 字段名 | 类型 | 主键 | 约束 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `sector_id` | `TEXT` | PK | FK → sector_meta.id | 板块 ID |
| `trade_date` | `DATE` | PK | | 交易日 |
| `system` | `TEXT` | | | 板块体系（ths/dc） |
| `open` | `NUMERIC` | | | 开盘点位 |
| `high` | `NUMERIC` | | | 最高点位 |
| `low` | `NUMERIC` | | | 最低点位 |
| `close` | `NUMERIC` | | | 收盘点位 |
| `pre_close` | `NUMERIC` | | | 昨日收盘点 |
| `change_val` | `NUMERIC` | | | 涨跌点 |
| `pct_change` | `NUMERIC` | | | 涨跌幅（%） |
| `avg_price` | `NUMERIC` | | | 平均价 |
| `vol` | `NUMERIC` | | | 成交量（手） |
| `amount` | `NUMERIC` | | | 成交额（千元） |
| `turnover_rate` | `NUMERIC` | | | 换手率（%） |
| `swing` | `NUMERIC` | | | 振幅（%） |
| `up_num` | `INT` | | | 上涨家数 |
| `down_num` | `INT` | | | 下跌家数 |
| `flat_num` | `INT` | | | 平盘家数 |
| `limit_up_num` | `INT` | | | 涨停家数 |
| `limit_down_num` | `INT` | | | 跌停家数 |
| `avg_pe` | `NUMERIC` | | | 平均市盈率 |
| `pb` | `NUMERIC` | | | 平均市净率 |
| `total_mv` | `NUMERIC` | | | 总市值（万元） |
| `float_mv` | `NUMERIC` | | | 流通市值（万元） |
| `bm_buy_net` | `NUMERIC` | | | 北向资金净买入（万元），仅 dc 板块 |
| `bm_buy_ratio` | `NUMERIC` | | | 北向资金净买入占比（%），仅 dc 板块 |
| `bm_net` | `NUMERIC` | | | 北向资金净流入（万元），仅 dc 板块 |
| `bm_ratio` | `NUMERIC` | | | 北向资金净流入占比（%），仅 dc 板块 |
| `leading_code` | `TEXT` | | | 领涨股代码，仅 dc 板块 |
| `leading_name` | `TEXT` | | | 领涨股名称，仅 dc 板块 |
| `leading_pct` | `NUMERIC` | | | 领涨股涨跌幅（%），仅 dc 板块 |
| `collected_at` | `TIMESTAMPTZ` | | `DEFAULT now()` | 采集时间 |

### v11.2 变更日志（2026-03-01）

- **新增** `sector_meta` 表完整字段定义（补录，表已存在）
- **新增** `sector_stock_map` 表完整字段定义（补录，表已存在）
- **新增** `sector_daily` 表完整字段定义（补录，表已存在，含北向资金和领涨股字段）
- **关联需求**：REQ-013（板块数据采集，in_progress）
- **采集脚本**：`scripts/backfill_sector_daily.py`、`scripts/collect_sector_data.py`

---

## 券商荐股 & 研究报告数据层（v12.0 新增，2026-03-01）
> 采集 Tushare `broker_recommend`（券商月度金股）和 `research_report`（券商研究报告）。详见需求文档 `req-069-070-broker-research-report`。

### `broker_recommend`（券商月度金股）

| 字段名 | 类型 | 主键 | 约束 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `month` | `CHAR(6)` | PK | NOT NULL | 月度，格式 YYYYMM，如 `202601` |
| `broker` | `TEXT` | PK | NOT NULL | 券商名称，如 `东兴证券` |
| `ts_code` | `TEXT` | PK | NOT NULL | 股票代码，如 `000001.SZ` |
| `name` | `TEXT` | | | 股票简称 |
| `collected_at` | `TIMESTAMPTZ` | | DEFAULT now() | 采集时间戳 |

**主键**: `(month, broker, ts_code)`
**索引**: `idx_broker_recommend_month`、`idx_broker_recommend_ts_code`、`idx_broker_recommend_broker`
**数据来源**: Tushare `broker_recommend`（6000积分）
**采集脚本**: `scripts/collect_broker_recommend.py`

---

### `research_report`（券商研究报告）

| 字段名 | 类型 | 主键 | 约束 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `trade_date` | `DATE` | PK | NOT NULL | 报告日期 |
| `title_hash` | `TEXT` | PK | NOT NULL | md5(trade_date\|\|title)，应用层计算 |
| `title` | `TEXT` | | NOT NULL | 报告标题（最长约94字符） |
| `report_type` | `TEXT` | | CHECK IN ('个股研报','行业研报') | 报告类型 |
| `author` | `TEXT` | | | 分析师姓名（逗号分隔，约9.3%为 NULL） |
| `stock_name` | `TEXT` | | | 股票简称（行业研报为 NULL） |
| `ts_code` | `TEXT` | | | 股票代码（行业研报为 NULL） |
| `inst_csname` | `TEXT` | | | 券商机构简称 |
| `ind_name` | `TEXT` | | | 行业名称 |
| `url` | `TEXT` | | NOT NULL | PDF 报告下载链接（dfcfw.com） |
| `collected_at` | `TIMESTAMPTZ` | | DEFAULT now() | 采集时间戳 |

**主键**: `(trade_date, title_hash)`
**索引**: `idx_research_report_trade_date`、`idx_research_report_ts_code`、`idx_research_report_inst`、`idx_research_report_type`
**数据来源**: Tushare `research_report`（单独权限，⚠️ 每天最多5次调用）
**采集脚本**: `scripts/collect_research_report.py`

---

### v12.0 变更日志（2026-03-01）
新增券商荐股 & 研究报告数据层，共 2 张新表：
- `broker_recommend`（REQ-069，新建）
- `research_report`（REQ-070，新建）
迁移文件：`migrations/create_broker_recommend_research_report_v1.sql`

---
### `economic_events`（经济日历事件）
| 字段名 | 类型 | 主键 | 约束 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGINT` | PK | AUTO_INCREMENT | 唯一标识符 |
| `event_id` | `TEXT` | | NOT NULL | 事件唯一标识符，从URL中提取 |
| `event_timestamp` | `TIMESTAMPTZ` | | NOT NULL | 事件发生时间 |
| `country` | `TEXT` | | NOT NULL | 相关国家/货币 |
| `title` | `TEXT` | | NOT NULL | 事件标题 |
| `impact` | `TEXT` | | NOT NULL | 重要性等级（High, Medium, Low） |
| `actual` | `TEXT` | | | 实际值 |
| `forecast` | `TEXT` | | | 预测值 |
| `previous` | `TEXT` | | | 前值 |
| `source` | `TEXT` | | DEFAULT 'Forex Factory' | 数据来源 |
| `collected_at` | `TIMESTAMPTZ` | | DEFAULT now() | 采集时间戳 |

**复合唯一约束**: `(event_id, event_timestamp)`
**索引**: `idx_economic_events_timestamp`、`idx_economic_events_country`、`idx_economic_events_impact`
**数据来源**: Forex Factory 官方 JSON 接口
**采集脚本**: `scripts/collect_ff_calendar.py`
---
### v14.0 变更日志（2026-03-01）
新增经济日历事件表，共 1 张新表：
- `economic_events`（REQ-045，新建）
迁移文件：`migrations/create_economic_events_v1.sql`
