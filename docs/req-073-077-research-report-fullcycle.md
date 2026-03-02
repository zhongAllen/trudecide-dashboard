# REQ-073~077：研报数据全周期管理架构

- **版本**: v2.0
- **状态**: open（架构已最终确认，待建表实施）
- **创建日期**: 2026-03-02
- **最后更新**: 2026-03-02
- **作者**: Manus AI
- **核心设计原则**: AI友好优先

---

## 架构决策记录

### 决策一：合库方案（已确认）

`reports` 表与所有关联数据**放在同一个数据库实例中**，不分库。

**AI视角理由**：合库支持原生 SQL JOIN、外键约束和数据库事务（ACID），分库则需要 AI 在应用层模拟这些能力，极易出错且性能极差。

### 决策二：一张宽表（已确认，v2.0 变更）

~~原方案（v1.0）：三张分离的表（`reports` + `report_analysis` + `report_backtest`）~~ **已废弃**

**最终方案（v2.0）：一张宽表 `reports`，三层字段结构。**

**AI视角理由**：
- 研报的核心结论是**客观确定的**（券商分析师写死），AI 只做两件事：提取关键信息、验证结论是否正确。输入确定、任务确定，不需要多表支撑多模型并行。
- 一张宽表让 AI 一次 `SELECT` 拿到一篇研报的全部信息（原文 + AI提取结论 + 各期回测结果），无需 JOIN，认知负担最低。
- `NULL` 值本身即状态：`ai_analyzed_at IS NULL` 表示"待分析"，`bt_30d_at IS NULL` 表示"30天窗口未到期"，AI 无需额外状态字段即可判断生命周期阶段。
- 多回测窗口（30天/90天/180天）通过**语义化字段扩展**实现（`bt_30d_correct`, `bt_90d_correct`...），字段名即含义，AI 直接查询无需解析，比 JSONB 数组更 AI 友好。

---

## 数据模型：`reports` 宽表

> **设计原则**：字段名即文档，AI 无需查手册即可理解每个字段的含义和用途。

### 完整 DDL

```sql
CREATE TABLE IF NOT EXISTS public.reports (

    -- =========================================================
    -- 层一：原始信息层（采集时填入）
    -- =========================================================

    -- 唯一主键，格式：{source}-{infocode}，如 eastmoney-AP20260302xxx
    report_id       TEXT PRIMARY KEY,

    -- 数据来源：eastmoney（东方财富）/ tushare
    source          TEXT NOT NULL,

    -- 研报类型，语义化枚举，AI 无需查手册即可理解
    -- stock=个股研报 / industry=行业研报 / macro=宏观研报 / strategy=策略研报
    report_type     TEXT NOT NULL CHECK (report_type IN ('stock', 'industry', 'macro', 'strategy')),

    publish_date    DATE NOT NULL,      -- 发布日期
    title           TEXT NOT NULL,      -- 研报标题
    abstract        TEXT,               -- 摘要（主要由 Tushare 补充，东方财富无此字段）
    org_name        TEXT,               -- 券商机构名称
    author          TEXT,               -- 作者（多人时逗号分隔）

    -- 个股研报专属（industry/macro/strategy 时为 NULL）
    ts_code         TEXT,               -- 股票代码，Tushare 格式，如 000001.SZ
    stock_name      TEXT,               -- 股票简称

    -- 行业研报专属（stock/macro/strategy 时为 NULL）
    industry_name   TEXT,               -- 行业名称

    -- 分析指标（有则填，无则 NULL）
    rating          TEXT,               -- 原始评级文本，如"买入"/"增持"
    target_price    NUMERIC,            -- 目标价（元）

    -- 原文
    pdf_url         TEXT,               -- PDF 下载链接
    page_count      INTEGER,            -- PDF 页数

    collected_at    TIMESTAMPTZ DEFAULT now(),  -- 采集时间戳

    -- =========================================================
    -- 层二：AI 提取层（AI 分析后填入，初始为 NULL）
    -- =========================================================

    -- AI 提取的核心结论（1~3句话，直接可读）
    key_conclusion  TEXT,

    -- AI 提取的关键量化指标（目标价、时间窗口、触发条件等）
    -- 示例：{"target_price": 100, "horizon_days": 90, "trigger": "Q3业绩超预期"}
    key_targets     JSONB,

    -- AI 标准化后的评级（统一为英文，便于 GROUP BY 统计）
    -- buy / overweight / neutral / underweight / sell
    ai_rating       TEXT CHECK (ai_rating IN ('buy', 'overweight', 'neutral', 'underweight', 'sell')),

    ai_analyzed_at  TIMESTAMPTZ,        -- NULL 表示尚未分析

    -- =========================================================
    -- 层三：回测验证层（到期后由回测引擎填入，初始为 NULL）
    -- 设计原则：字段名直接表达含义，AI 无需解析即可查询
    -- NULL 含义：该时间窗口尚未到期，或研报无对应标的（行业/宏观研报）
    -- =========================================================

    -- 短期回测：30 天
    bt_30d_return   NUMERIC,            -- 标的30天区间回报率（%）
    bt_30d_alpha    NUMERIC,            -- 30天超额收益（相对沪深300，%）
    bt_30d_correct  BOOLEAN,            -- 30天维度：研报结论是否正确
    bt_30d_at       TIMESTAMPTZ,        -- 30天回测执行时间

    -- 中期回测：90 天
    bt_90d_return   NUMERIC,
    bt_90d_alpha    NUMERIC,
    bt_90d_correct  BOOLEAN,
    bt_90d_at       TIMESTAMPTZ,

    -- 长期回测：180 天
    bt_180d_return  NUMERIC,
    bt_180d_alpha   NUMERIC,
    bt_180d_correct BOOLEAN,
    bt_180d_at      TIMESTAMPTZ

    -- 扩展说明：如需新增回测窗口（如 bt_365d_*），执行 ALTER TABLE 加列即可
);

-- 索引设计（按 AI 最常用的查询模式优化）
CREATE INDEX IF NOT EXISTS idx_reports_publish_date  ON reports(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_ts_code       ON reports(ts_code) WHERE ts_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_report_type   ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_org_name      ON reports(org_name);
CREATE INDEX IF NOT EXISTS idx_reports_ai_rating     ON reports(ai_rating) WHERE ai_rating IS NOT NULL;
-- 支持快速找出"待分析"和"待回测"的研报
CREATE INDEX IF NOT EXISTS idx_reports_pending_analysis ON reports(collected_at) WHERE ai_analyzed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reports_pending_bt30  ON reports(publish_date) WHERE bt_30d_at IS NULL AND ts_code IS NOT NULL;
```

### 字段层级总览

| 层级 | 字段数 | 填入时机 | NULL 含义 |
| :--- | :--- | :--- | :--- |
| 原始信息层 | 16 | 采集脚本运行时 | 无（必填字段有 NOT NULL 约束） |
| AI 提取层 | 4 | AI 分析模型运行后 | 尚未分析 |
| 回测验证层（30d） | 4 | 发布后30天 | 未到期 / 无标的（行业/宏观研报） |
| 回测验证层（90d） | 4 | 发布后90天 | 同上 |
| 回测验证层（180d） | 4 | 发布后180天 | 同上 |
| **合计** | **32** | — | — |

---

## REQ-073：建表 — reports 宽表

**状态**: open | **优先级**: P1 | **前置依赖**: 无

执行上方完整 DDL，在 Supabase SQL Editor 中一次性建表。

---

## REQ-074：~~建表：report_analysis~~ [已废弃，合并入 reports 宽表]

**状态**: closed | **关闭原因**: v2.0 架构调整，AI提取结果字段已合并入 `reports` 表的"AI提取层"

---

## REQ-075：~~建表：report_backtest~~ [已废弃，合并入 reports 宽表]

**状态**: closed | **关闭原因**: v2.0 架构调整，回测结果字段已合并入 `reports` 表的"回测验证层"

---

## REQ-076：采集 — 东方财富研报采集脚本

**状态**: open | **优先级**: P1 | **前置依赖**: REQ-073（建表完成）

### 数据源
- **接口**: `https://reportapi.eastmoney.com/report/list`
- **调用限制**: **无限制**（无需登录，完全公开）
- **每日数据量**: 个股约100条 + 行业约90条 + 宏观约37条 = **约230条/天**
- **历史数据量**: 2025-01至今约 **18,000+ 条**

### 字段映射

| 东方财富字段 | reports 字段 | 说明 |
| :--- | :--- | :--- |
| `infoCode` | `report_id = 'eastmoney-' + infoCode` | 主键构造 |
| `qType` | `report_type` | 0→stock, 1→industry, 2→macro |
| `publishDate` | `publish_date` | 截取日期部分 |
| `title` | `title` | 直接映射 |
| `orgSName` | `org_name` | 券商简称 |
| `researcher` | `author` | 作者 |
| `stockCode` | `ts_code` | 需加交易所后缀（.SZ/.SH） |
| `stockName` | `stock_name` | 直接映射 |
| `industryName` | `industry_name` | 直接映射 |
| `emRatingName` | `rating` | 原始评级文本 |
| `indvAimPriceT` | `target_price` | 目标价 |
| `attachPages` | `page_count` | PDF页数 |
| 构造 | `pdf_url = 'https://pdf.dfcfw.com/pdf/H3_' + infoCode + '_1.pdf'` | PDF链接 |

### 注意事项
- 东方财富无 `abstract` 字段，该字段留空，由 Tushare 每日5次调用补充
- `ts_code` 转换规则：6位数字开头 `0/2/3` → `.SZ`，开头 `6/9` → `.SH`
- 脚本文件：`scripts/collect_reports_eastmoney.py`（待开发）

---

## REQ-077：迁移 — research_report 旧表数据迁移

**状态**: open | **优先级**: P4 | **前置依赖**: REQ-073, REQ-076

### 迁移 SQL

```sql
INSERT INTO reports (
    report_id, source, report_type, publish_date, title, abstract,
    ts_code, stock_name, industry_name, org_name, author, pdf_url, collected_at
)
SELECT
    'tushare-' || title_hash,
    'tushare',
    CASE
        WHEN ts_code IS NOT NULL AND ts_code != '' THEN 'stock'
        WHEN ind_name IS NOT NULL AND ind_name != '' THEN 'industry'
        ELSE 'macro'
    END,
    trade_date,
    title,
    abstr,
    ts_code,
    stock_name,
    ind_name,
    inst_csname,
    author,
    url,
    collected_at
FROM research_report
ON CONFLICT (report_id) DO NOTHING;
```

> 当前 `research_report` 表为空（0条），迁移可在 REQ-076 采集脚本验证通过后随时执行。

---

## 实施顺序

| 步骤 | 需求 | 内容 | 状态 |
| :--- | :--- | :--- | :--- |
| 1 | REQ-073 | Supabase SQL Editor 执行建表 DDL | open |
| 2 | REQ-076 | 开发东方财富采集脚本，全量补采 2025-01 至今 | open |
| 3 | REQ-077 | 迁移旧表数据（当前为空，可跳过） | open |
| 4 | — | 开发 AI 提取模型（填充 key_conclusion/key_targets/ai_rating） | 后续规划 |
| 5 | — | 开发回测引擎（填充 bt_30d_*/bt_90d_*/bt_180d_*） | 后续规划 |
