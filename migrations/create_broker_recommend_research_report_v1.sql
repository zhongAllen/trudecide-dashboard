-- ============================================================
-- 迁移文件: create_broker_recommend_research_report_v1.sql
-- 版本: v1.0
-- 日期: 2026-03-01
-- 关联需求: REQ-069（broker_recommend）、REQ-070（research_report）
-- ============================================================

-- ── 1. broker_recommend（券商月度金股）────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broker_recommend (
    month           CHAR(6)         NOT NULL,   -- 月度，格式 YYYYMM，如 202601
    broker          TEXT            NOT NULL,   -- 券商名称，如 东兴证券
    ts_code         TEXT            NOT NULL,   -- 股票代码，如 000001.SZ
    name            TEXT,                       -- 股票简称
    collected_at    TIMESTAMPTZ     DEFAULT now(),  -- 采集时间戳

    CONSTRAINT pk_broker_recommend PRIMARY KEY (month, broker, ts_code)
);

-- 索引：按月查询（最常用）
CREATE INDEX IF NOT EXISTS idx_broker_recommend_month
    ON broker_recommend (month DESC);

-- 索引：按股票查询（联动 research_report）
CREATE INDEX IF NOT EXISTS idx_broker_recommend_ts_code
    ON broker_recommend (ts_code);

-- 索引：按券商查询
CREATE INDEX IF NOT EXISTS idx_broker_recommend_broker
    ON broker_recommend (broker);

COMMENT ON TABLE broker_recommend IS '券商月度金股推荐。数据来源：Tushare broker_recommend（6000积分）。采集范围：近3年（2023-01至今）。主键：(month, broker, ts_code)。';
COMMENT ON COLUMN broker_recommend.month IS '月度，格式 YYYYMM，如 202601';
COMMENT ON COLUMN broker_recommend.broker IS '券商名称，如 东兴证券';
COMMENT ON COLUMN broker_recommend.ts_code IS '股票代码，Tushare 格式，如 000001.SZ';
COMMENT ON COLUMN broker_recommend.name IS '股票简称';
COMMENT ON COLUMN broker_recommend.collected_at IS '数据采集时间戳，自动填充';


-- ── 2. research_report（券商研究报告）────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_report (
    trade_date      DATE            NOT NULL,   -- 报告日期
    title_hash      TEXT            NOT NULL,   -- 去重哈希：md5(trade_date::text || title)，应用层计算
    title           TEXT            NOT NULL,   -- 报告标题（含券商名、股票名、日期，最长约94字符）
    report_type     TEXT,                       -- 报告类型：个股研报 / 行业研报
    author          TEXT,                       -- 分析师姓名（逗号分隔，约9.3%为 NULL）
    stock_name      TEXT,                       -- 股票简称（行业研报为 NULL）
    ts_code         TEXT,                       -- 股票代码（行业研报为 NULL）
    inst_csname     TEXT,                       -- 券商机构简称（偶有 NULL）
    ind_name        TEXT,                       -- 行业名称（偶有 NULL，约0.7%）
    url             TEXT            NOT NULL,   -- PDF 报告下载链接（dfcfw.com，最长约73字符）
    collected_at    TIMESTAMPTZ     DEFAULT now(),  -- 采集时间戳

    CONSTRAINT pk_research_report PRIMARY KEY (trade_date, title_hash),
    CONSTRAINT chk_report_type CHECK (report_type IN ('个股研报', '行业研报'))
);

-- 索引：按日期查询（最常用，增量采集用）
CREATE INDEX IF NOT EXISTS idx_research_report_trade_date
    ON research_report (trade_date DESC);

-- 索引：按股票查询（含 NULL，partial index 效率更高）
CREATE INDEX IF NOT EXISTS idx_research_report_ts_code
    ON research_report (ts_code)
    WHERE ts_code IS NOT NULL;

-- 索引：按券商查询
CREATE INDEX IF NOT EXISTS idx_research_report_inst
    ON research_report (inst_csname)
    WHERE inst_csname IS NOT NULL;

-- 索引：按报告类型过滤
CREATE INDEX IF NOT EXISTS idx_research_report_type
    ON research_report (report_type);

COMMENT ON TABLE research_report IS '券商研究报告元数据。数据来源：Tushare research_report（单独权限，每天最多5次调用）。采集范围：近1年（2025-03-01至今）。主键：(trade_date, title_hash)，title_hash=md5(trade_date||title)。';
COMMENT ON COLUMN research_report.trade_date IS '报告发布日期';
COMMENT ON COLUMN research_report.title_hash IS '去重哈希，应用层计算：import hashlib; hashlib.md5(f"{trade_date}{title}".encode()).hexdigest()';
COMMENT ON COLUMN research_report.title IS '报告标题，格式通常为：{券商}_{标题}_{日期}.pdf';
COMMENT ON COLUMN research_report.report_type IS '报告类型：个股研报 或 行业研报';
COMMENT ON COLUMN research_report.author IS '分析师姓名，多人时逗号分隔，约9.3%为 NULL';
COMMENT ON COLUMN research_report.stock_name IS '股票简称，行业研报时为 NULL';
COMMENT ON COLUMN research_report.ts_code IS '股票代码，行业研报时为 NULL';
COMMENT ON COLUMN research_report.inst_csname IS '券商机构简称';
COMMENT ON COLUMN research_report.ind_name IS '行业名称';
COMMENT ON COLUMN research_report.url IS 'PDF 报告下载链接，格式：https://pdf.dfcfw.com/pdf/H3_AP{...}.pdf';
COMMENT ON COLUMN research_report.collected_at IS '数据采集时间戳，自动填充';
