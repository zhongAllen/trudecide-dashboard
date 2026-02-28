-- ============================================================
-- Migration: create_index_news_announcement_v1.sql
-- Version:   v11.0
-- Date:      2026-03-01
-- REQ:       REQ-058 (index_daily), REQ-059 (news 改造), REQ-060 (stock_announcement)
-- ============================================================
-- 踩坑规则遵守说明：
--   #11 规则1：PK 设计前已确认 Tushare 接口实际字段
--   #11 规则2：CONFLICT_COLS 与 PK/UNIQUE 约束完全一致
--   #11 规则3：采集脚本写入前按 PK 列去重（见各脚本）
--   #10 规则：不使用 RENAME COLUMN IF EXISTS（不支持）
--   news 改造：title_hash 改为普通 TEXT 列（非 GENERATED ALWAYS），
--              由采集脚本在应用层计算填入，避免 PostgREST upsert 冲突
-- ============================================================


-- ============================================================
-- 1. index_daily — 指数日线行情
--    来源: Tushare index_daily (A股) + index_global (国际)
--    主键: (ts_code, trade_date, market)
--    覆盖: A股全量指数 + 国际主要指数（12个）
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
--    改造: 新增 src 字段 + title_hash 普通列（非 GENERATED）
--
--    ⚠️ 踩坑修正：
--    原方案使用 GENERATED ALWAYS AS (...) STORED 计算列，
--    但 PostgREST upsert 时 payload 中带有该字段会报错：
--    "column title_hash is a generated column"
--    修正为普通 TEXT 列，由采集脚本在应用层计算 md5 后写入。
-- ============================================================

-- 2.1 新增 src 字段（数据源标识）
ALTER TABLE news ADD COLUMN IF NOT EXISTS src TEXT;

-- 2.2 新增 title_hash 普通列（应用层计算，非 GENERATED）
--     值由采集脚本计算：md5(src || '|' || pub_time::text || '|' || title)
ALTER TABLE news ADD COLUMN IF NOT EXISTS title_hash TEXT;

-- 2.3 新增唯一约束防止重复写入
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_dedup ON news (title_hash)
  WHERE title_hash IS NOT NULL;

-- 2.4 补充索引
CREATE INDEX IF NOT EXISTS idx_news_src      ON news (src) WHERE src IS NOT NULL;

-- 2.5 注释
COMMENT ON COLUMN news.src        IS '数据源：sina/wallstreetcn/10jqka/eastmoney/cls/yicai/fenghuang/jinrongjie/yuncaijing';
COMMENT ON COLUMN news.title_hash IS '去重哈希，由采集脚本计算：md5(src||pub_time||title)，写入时 ON CONFLICT DO NOTHING';
COMMENT ON COLUMN news.source     IS '旧字段，已由 src 替代，保留兼容性';

-- 2.6 写入权限（service_role）
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
--    存储: 元数据（标题+链接）+ 正文（content，异步补充）
--
--    PK 设计说明（遵守踩坑 #11 规则1）：
--    disclosure 接口返回字段已确认包含 ts_code / ann_date / type_name，
--    type_name 在脚本中映射为 ann_type（annual/semi/quarter/other），
--    同一股票同一日期可能有多条不同类型公告，三列联合 PK 合理。
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_announcement (
  ts_code      TEXT    NOT NULL,              -- 股票代码（如 000001.SZ）
  ann_date     DATE    NOT NULL,              -- 公告日期
  ann_type     TEXT    NOT NULL,              -- 公告类型（annual/semi/quarter/other）
  title        TEXT,                          -- 公告标题
  url          TEXT,                          -- 原文链接（交易所公告 PDF）
  content      TEXT,                          -- 公告正文（NULL=尚未抓取，异步补充）
  content_at   TIMESTAMPTZ,                   -- 正文抓取时间（NULL 表示尚未抓取）
  collected_at TIMESTAMPTZ DEFAULT now(),     -- 元数据采集时间
  PRIMARY KEY (ts_code, ann_date, ann_type)
);

COMMENT ON TABLE  stock_announcement             IS '上市公司公告，来源于 Tushare disclosure 接口，同时存元数据和正文';
COMMENT ON COLUMN stock_announcement.ts_code     IS '股票代码';
COMMENT ON COLUMN stock_announcement.ann_type    IS '公告类型：annual=年报, semi=半年报, quarter=季报, other=其他';
COMMENT ON COLUMN stock_announcement.content     IS '公告正文，NULL 表示尚未抓取，可通过 url 异步补充';
COMMENT ON COLUMN stock_announcement.content_at  IS '正文抓取完成时间，用于判断是否需要补抓';

CREATE INDEX IF NOT EXISTS idx_ann_date       ON stock_announcement (ann_date DESC);
CREATE INDEX IF NOT EXISTS idx_ann_code       ON stock_announcement (ts_code);
CREATE INDEX IF NOT EXISTS idx_ann_type       ON stock_announcement (ann_type);
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
-- [新建] index_daily:
--   PK: (ts_code, trade_date, market)
--   字段: open/high/low/close/pre_close/change/pct_chg
--         vol/amount (cn专有，global为NULL)
--         swing (global专有，cn为NULL)
--         collected_at
--
-- [改造] news:
--   + src TEXT（数据源标识）
--   + title_hash TEXT（应用层计算，普通列，非GENERATED）
--   唯一索引: idx_news_dedup (title_hash) WHERE title_hash IS NOT NULL
--
-- [新建] stock_announcement:
--   PK: (ts_code, ann_date, ann_type)
--   字段: title/url/content/content_at/collected_at
--   部分索引: idx_ann_no_content (content IS NULL)
-- ============================================================
