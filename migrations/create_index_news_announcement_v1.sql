-- ============================================================
-- Migration: create_index_news_announcement_v1.sql
-- Version:   v11.0
-- Date:      2026-03-01
-- REQ:       REQ-058 (index_daily), REQ-059 (news 改造), REQ-060 (stock_announcement)
-- ============================================================

-- ============================================================
-- 1. index_daily — 指数日线行情
--    来源: Tushare index_daily (A股) + index_global (国际)
--    主键: (ts_code, trade_date, market)
--    覆盖: A股全量指数 + 国际主要指数（约20个）
-- ============================================================
CREATE TABLE IF NOT EXISTS index_daily (
  ts_code      TEXT    NOT NULL,              -- 指数代码（如 000001.SH / SPX）
  trade_date   DATE    NOT NULL,              -- 交易日
  market       TEXT    NOT NULL DEFAULT 'cn', -- 市场来源：cn=A股, global=国际指数
  open         NUMERIC,                       -- 开盘点位
  high         NUMERIC,                       -- 最高点位
  low          NUMERIC,                       -- 最低点位
  close        NUMERIC,                       -- 收盘点位
  pre_close    NUMERIC,                       -- 昨日收盘点
  change       NUMERIC,                       -- 涨跌点
  pct_chg      NUMERIC,                       -- 涨跌幅（%）
  vol          NUMERIC,                       -- 成交量（手），global 指数为 NULL
  amount       NUMERIC,                       -- 成交额（千元），global 指数为 NULL
  swing        NUMERIC,                       -- 振幅（%），仅 global 接口提供，cn 为 NULL
  collected_at TIMESTAMPTZ DEFAULT now(),     -- 采集时间戳
  PRIMARY KEY (ts_code, trade_date, market)
);

COMMENT ON TABLE  index_daily              IS '指数日线行情，支持 A股（cn）和国际主要指数（global）两套来源';
COMMENT ON COLUMN index_daily.ts_code      IS '指数代码，A股如 000001.SH，国际如 SPX/HSI/DJI';
COMMENT ON COLUMN index_daily.market       IS '市场来源：cn=Tushare index_daily，global=Tushare index_global';
COMMENT ON COLUMN index_daily.vol          IS '成交量（手），国际指数为 NULL';
COMMENT ON COLUMN index_daily.amount       IS '成交额（千元），国际指数为 NULL';
COMMENT ON COLUMN index_daily.swing        IS '振幅（%），仅国际指数接口提供，A股为 NULL';

CREATE INDEX IF NOT EXISTS idx_index_daily_date   ON index_daily (trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_index_daily_code   ON index_daily (ts_code);
CREATE INDEX IF NOT EXISTS idx_index_daily_market ON index_daily (market);

ALTER TABLE index_daily ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'index_daily' AND policyname = 'allow_read_index_daily'
  ) THEN
    CREATE POLICY allow_read_index_daily ON index_daily
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'index_daily' AND policyname = 'allow_write_index_daily'
  ) THEN
    CREATE POLICY allow_write_index_daily ON index_daily
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ============================================================
-- 2. news — 新闻快讯（改造现有表）
--    来源: Tushare news 接口（9大来源）
--    改造: 新增 src 字段 + 唯一约束防重复
--    注意: 现有表已有数据（0行），直接 ALTER 安全
-- ============================================================

-- 2.1 新增 src 字段（数据源标识）
ALTER TABLE news ADD COLUMN IF NOT EXISTS src TEXT;

COMMENT ON COLUMN news.src IS '数据源：sina/wallstreetcn/10jqka/eastmoney/cls/yicai/fenghuang/jinrongjie/yuncaijing';
COMMENT ON COLUMN news.source IS '已废弃，由 src 替代，保留兼容性';

-- 2.2 新增唯一约束防止重复写入
-- 注意：title 可能超长，用 MD5 哈希做约束更稳健
ALTER TABLE news ADD COLUMN IF NOT EXISTS title_hash TEXT
  GENERATED ALWAYS AS (md5(COALESCE(src,'') || '|' || pub_time::text || '|' || COALESCE(title,''))) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_dedup ON news (title_hash);

-- 2.3 补充索引
CREATE INDEX IF NOT EXISTS idx_news_src      ON news (src) WHERE src IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_news_pub_time ON news (pub_time DESC);

-- 2.4 写入权限（service_role）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'news' AND policyname = 'allow_write_news'
  ) THEN
    CREATE POLICY allow_write_news ON news
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ============================================================
-- 3. stock_announcement — 上市公司公告
--    来源: Tushare disclosure 接口（需单独权限）
--    主键: (ts_code, ann_date, ann_type)
--    存储: 元数据（标题+链接）+ 正文（content 字段）
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_announcement (
  ts_code      TEXT    NOT NULL,              -- 股票代码（如 000001.SZ）
  ann_date     DATE    NOT NULL,              -- 公告日期
  ann_type     TEXT    NOT NULL,              -- 公告类型（annual/semi/quarter/other）
  title        TEXT,                          -- 公告标题
  url          TEXT,                          -- 原文链接（交易所公告 PDF）
  content      TEXT,                          -- 公告正文（可为 NULL，按需填充）
  content_at   TIMESTAMPTZ,                   -- 正文抓取时间（NULL 表示尚未抓取）
  collected_at TIMESTAMPTZ DEFAULT now(),     -- 元数据采集时间
  PRIMARY KEY (ts_code, ann_date, ann_type)
);

COMMENT ON TABLE  stock_announcement             IS '上市公司公告，来源于 Tushare disclosure 接口，同时存元数据和正文';
COMMENT ON COLUMN stock_announcement.ts_code     IS '股票代码';
COMMENT ON COLUMN stock_announcement.ann_type    IS '公告类型：annual=年报, semi=半年报, quarter=季报, other=其他';
COMMENT ON COLUMN stock_announcement.content     IS '公告正文，NULL 表示尚未抓取，可通过 url 异步补充';
COMMENT ON COLUMN stock_announcement.content_at  IS '正文抓取完成时间，用于判断是否需要补抓';

CREATE INDEX IF NOT EXISTS idx_ann_date   ON stock_announcement (ann_date DESC);
CREATE INDEX IF NOT EXISTS idx_ann_code   ON stock_announcement (ts_code);
CREATE INDEX IF NOT EXISTS idx_ann_type   ON stock_announcement (ann_type);
-- 部分索引：快速找到尚未抓取正文的公告
CREATE INDEX IF NOT EXISTS idx_ann_no_content ON stock_announcement (ann_date)
  WHERE content IS NULL;

ALTER TABLE stock_announcement ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_announcement' AND policyname = 'allow_read_stock_announcement'
  ) THEN
    CREATE POLICY allow_read_stock_announcement ON stock_announcement
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_announcement' AND policyname = 'allow_write_stock_announcement'
  ) THEN
    CREATE POLICY allow_write_stock_announcement ON stock_announcement
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 执行完成后，新增/改造的表如下：
--
-- index_daily:
--   ts_code, trade_date, market (PK)
--   open, high, low, close, pre_close, change, pct_chg
--   vol, amount (cn专有), swing (global专有)
--   collected_at
--
-- news (改造):
--   + src (数据源标识)
--   + title_hash (去重哈希，自动生成)
--   唯一约束: idx_news_dedup (title_hash)
--
-- stock_announcement:
--   ts_code, ann_date, ann_type (PK)
--   title, url, content, content_at, collected_at
--   部分索引: idx_ann_no_content (content IS NULL)
-- ============================================================
