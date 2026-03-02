-- ============================================================
-- REQ-073: 创建研报宽表 reports
-- 版本: v2.0（一张宽表方案，AI友好优先）
-- 执行位置: Supabase SQL Editor
-- 执行方式: 直接粘贴执行，幂等（IF NOT EXISTS / IF EXISTS 保护）
-- ============================================================

-- 建表
CREATE TABLE IF NOT EXISTS public.reports (

    -- =========================================================
    -- 层一：原始信息层（采集时填入）
    -- =========================================================
    -- 唯一主键，格式：{source}-{infocode}，如 eastmoney-AP20260302xxx / tushare-abc123
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
    -- NULL 含义：ai_analyzed_at IS NULL 表示该研报尚未被 AI 分析
    -- =========================================================
    -- AI 提取的核心结论（1~3句话，直接可读）
    key_conclusion  TEXT,

    -- AI 提取的关键量化指标（目标价、时间窗口、触发条件等）
    -- 示例：{"target_price": 100, "horizon_days": 90, "trigger": "Q3业绩超预期"}
    key_targets     JSONB,

    -- AI 标准化后的评级（统一为英文，便于 GROUP BY 统计准确率）
    -- buy / overweight / neutral / underweight / sell
    ai_rating       TEXT CHECK (ai_rating IN ('buy', 'overweight', 'neutral', 'underweight', 'sell')),

    ai_analyzed_at  TIMESTAMPTZ,        -- NULL 表示尚未分析

    -- =========================================================
    -- 层三：回测验证层（到期后由回测引擎填入，初始为 NULL）
    -- NULL 含义：该时间窗口尚未到期，或研报无对应标的（行业/宏观研报）
    -- 扩展方式：如需新增回测窗口，执行 ALTER TABLE 加列即可
    -- =========================================================

    -- 短期回测：30 天
    bt_30d_return   NUMERIC,            -- 标的30天区间回报率（%）
    bt_30d_alpha    NUMERIC,            -- 30天超额收益（相对沪深300，%）
    bt_30d_correct  BOOLEAN,            -- 30天维度：研报结论是否正确
    bt_30d_at       TIMESTAMPTZ,        -- 30天回测执行时间戳

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
);

-- =========================================================
-- 索引（按 AI 最常用的查询模式优化）
-- =========================================================

-- 按发布日期查询（最常用）
CREATE INDEX IF NOT EXISTS idx_reports_publish_date
    ON reports(publish_date DESC);

-- 按股票代码查询（个股研报分析）
CREATE INDEX IF NOT EXISTS idx_reports_ts_code
    ON reports(ts_code) WHERE ts_code IS NOT NULL;

-- 按研报类型过滤
CREATE INDEX IF NOT EXISTS idx_reports_report_type
    ON reports(report_type);

-- 按券商查询（统计各券商研报准确率）
CREATE INDEX IF NOT EXISTS idx_reports_org_name
    ON reports(org_name);

-- 按 AI 评级查询
CREATE INDEX IF NOT EXISTS idx_reports_ai_rating
    ON reports(ai_rating) WHERE ai_rating IS NOT NULL;

-- 快速找出"待 AI 分析"的研报（ai_analyzed_at 为 NULL）
CREATE INDEX IF NOT EXISTS idx_reports_pending_analysis
    ON reports(collected_at) WHERE ai_analyzed_at IS NULL;

-- 快速找出"30天窗口待回测"的个股研报
CREATE INDEX IF NOT EXISTS idx_reports_pending_bt30
    ON reports(publish_date) WHERE bt_30d_at IS NULL AND ts_code IS NOT NULL;

-- =========================================================
-- 验证（执行后应返回 "reports 表创建成功"）
-- =========================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'reports'
    ) THEN
        RAISE NOTICE 'reports 表创建成功，共 % 列',
            (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'reports');
    END IF;
END $$;
