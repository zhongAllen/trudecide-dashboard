-- ============================================================
-- REQ-061：新闻联播文字稿表
-- 迁移版本：v11.1
-- 执行日期：2026-03-01
-- 数据来源：Tushare cctv_news 接口（单独权限）
-- 采集范围：近1个月（用户决策 2026-03-01），与 news 表保持一致
-- ============================================================

-- ── cctv_news：新闻联播文字稿 ────────────────────────────────
CREATE TABLE IF NOT EXISTS cctv_news (
    date         DATE        NOT NULL,          -- PK，播出日期（每天唯一）
    title        TEXT,                           -- 标题，通常为"新闻联播 YYYYMMDD"
    content      TEXT,                           -- 完整文字稿正文
    collected_at TIMESTAMPTZ DEFAULT now(),      -- 采集时间戳

    CONSTRAINT pk_cctv_news PRIMARY KEY (date)
);

COMMENT ON TABLE  cctv_news              IS 'CCTV 新闻联播文字稿，每天一条，数据从2017年开始';
COMMENT ON COLUMN cctv_news.date         IS '播出日期，主键，格式 YYYY-MM-DD';
COMMENT ON COLUMN cctv_news.title        IS '标题，通常为"新闻联播 YYYYMMDD"';
COMMENT ON COLUMN cctv_news.content      IS '完整文字稿正文，可能较长（数千字）';
COMMENT ON COLUMN cctv_news.collected_at IS '采集时间戳，自动填充';

-- ── 索引 ─────────────────────────────────────────────────────
-- 按日期范围查询（AI 分析时常用近N天）
CREATE INDEX IF NOT EXISTS idx_cctv_news_date
    ON cctv_news (date DESC);
