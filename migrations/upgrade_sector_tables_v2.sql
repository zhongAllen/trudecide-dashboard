-- ============================================================
-- 板块表结构升级 v2
-- 目标：支持同花顺(ths)、东方财富(dc)、通达信(tdx) 三套体系
-- 执行方式：在 Supabase SQL Editor 中全选执行
-- 生成日期：2026-03-01
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. sector_meta 升级
-- ────────────────────────────────────────────────────────────

-- 1.1 放宽 system 枚举约束
ALTER TABLE sector_meta DROP CONSTRAINT IF EXISTS sector_meta_system_check;
ALTER TABLE sector_meta ADD CONSTRAINT sector_meta_system_check
  CHECK (system IN ('ths', 'dc', 'tdx', 'tushare'));

-- 1.2 放宽 level 约束（改为可空）
ALTER TABLE sector_meta ALTER COLUMN level DROP NOT NULL;

-- 1.3 新增字段
ALTER TABLE sector_meta ADD COLUMN IF NOT EXISTS raw_code   TEXT;
ALTER TABLE sector_meta ADD COLUMN IF NOT EXISTS idx_type   TEXT;
ALTER TABLE sector_meta ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT true;
ALTER TABLE sector_meta ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 1.4 新增索引
CREATE INDEX IF NOT EXISTS idx_sector_meta_system   ON sector_meta (system);
CREATE INDEX IF NOT EXISTS idx_sector_meta_raw_code ON sector_meta (raw_code);
CREATE INDEX IF NOT EXISTS idx_sector_meta_active   ON sector_meta (is_active) WHERE is_active = true;

-- 1.5 更新注释
COMMENT ON TABLE  sector_meta          IS '板块元数据，支持同花顺(ths)、东方财富(dc)、通达信(tdx) 三套分类体系';
COMMENT ON COLUMN sector_meta.system   IS '分类体系：ths=同花顺, dc=东方财富, tdx=通达信, tushare=Tushare自定义';
COMMENT ON COLUMN sector_meta.raw_code IS '原始代码，如 BK1184.DC / 885835.TI / 880728.TDX，供 ETL 脚本直接调用';
COMMENT ON COLUMN sector_meta.idx_type IS '板块类型，如：概念板块/行业板块/风格板块/地区板块';
COMMENT ON COLUMN sector_meta.level    IS '层级：1=概念/一级, 2=二级, NULL=不分层级';
COMMENT ON COLUMN sector_meta.is_active IS '是否当前有效，板块下线时标为 false';


-- ────────────────────────────────────────────────────────────
-- 2. sector_stock_map 升级
-- ────────────────────────────────────────────────────────────

ALTER TABLE sector_stock_map ADD COLUMN IF NOT EXISTS system TEXT;

CREATE INDEX IF NOT EXISTS idx_sector_stock_system ON sector_stock_map (system);

COMMENT ON COLUMN sector_stock_map.system IS '冗余字段：分类体系（ths/dc/tdx），与 sector_meta.system 保持一致';


-- ────────────────────────────────────────────────────────────
-- 3. sector_daily 升级
--    RENAME COLUMN 不支持 IF EXISTS，用 DO $$ 块做条件判断
-- ────────────────────────────────────────────────────────────

-- 3.1 条件重命名（仅当旧列名存在时才执行）
DO $$
BEGIN
  -- pct_chg → pct_change
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sector_daily' AND column_name = 'pct_chg'
  ) THEN
    ALTER TABLE sector_daily RENAME COLUMN pct_chg TO pct_change;
  END IF;

  -- volume → vol
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sector_daily' AND column_name = 'volume'
  ) THEN
    ALTER TABLE sector_daily RENAME COLUMN volume TO vol;
  END IF;

  -- up_count → up_num
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sector_daily' AND column_name = 'up_count'
  ) THEN
    ALTER TABLE sector_daily RENAME COLUMN up_count TO up_num;
  END IF;

  -- down_count → down_num
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sector_daily' AND column_name = 'down_count'
  ) THEN
    ALTER TABLE sector_daily RENAME COLUMN down_count TO down_num;
  END IF;

  -- flat_count → flat_num
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sector_daily' AND column_name = 'flat_count'
  ) THEN
    ALTER TABLE sector_daily RENAME COLUMN flat_count TO flat_num;
  END IF;
END $$;

-- 3.2 新增字段
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS system          TEXT;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS pre_close       NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS change_val      NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS avg_price       NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS turnover_rate   NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS swing           NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS float_mv        NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS pb              NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS limit_up_num    INT;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS limit_down_num  INT;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS bm_buy_net      NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS bm_buy_ratio    NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS bm_net          NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS bm_ratio        NUMERIC;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS leading_code    TEXT;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS leading_name    TEXT;
ALTER TABLE sector_daily ADD COLUMN IF NOT EXISTS leading_pct     NUMERIC;

-- 3.3 新增索引
CREATE INDEX IF NOT EXISTS idx_sector_daily_system ON sector_daily (system);

-- 3.4 更新注释
COMMENT ON TABLE  sector_daily                IS '板块日度行情，支持同花顺/东方财富/通达信三套体系，体系专有字段用 NULL 填充';
COMMENT ON COLUMN sector_daily.system         IS '分类体系：ths=同花顺, dc=东方财富, tdx=通达信';
COMMENT ON COLUMN sector_daily.pct_change     IS '涨跌幅（%）';
COMMENT ON COLUMN sector_daily.vol            IS '成交量（手）';
COMMENT ON COLUMN sector_daily.amount         IS '成交额（元，已统一换算）';
COMMENT ON COLUMN sector_daily.turnover_rate  IS '换手率（%）';
COMMENT ON COLUMN sector_daily.swing          IS '振幅（%），DC/TDX 提供，THS 为 NULL';
COMMENT ON COLUMN sector_daily.total_mv       IS '总市值（亿元），THS/TDX 提供，DC 为 NULL';
COMMENT ON COLUMN sector_daily.float_mv       IS '流通市值（亿元），THS/TDX 提供，DC 为 NULL';
COMMENT ON COLUMN sector_daily.avg_pe         IS '平均市盈率，TDX 提供，其他为 NULL';
COMMENT ON COLUMN sector_daily.pb             IS '市净率，TDX 专有，其他为 NULL';
COMMENT ON COLUMN sector_daily.bm_buy_net     IS '主买净额（元），TDX 专有，其他为 NULL';
COMMENT ON COLUMN sector_daily.bm_ratio       IS '主力占比（%），TDX 专有，其他为 NULL';
COMMENT ON COLUMN sector_daily.leading_code   IS '领涨股代码，DC 专有，其他为 NULL';
COMMENT ON COLUMN sector_daily.leading_pct    IS '领涨股涨幅（%），DC 专有，其他为 NULL';
COMMENT ON COLUMN sector_daily.up_num         IS '上涨家数，DC/TDX 提供，THS 为 NULL';
COMMENT ON COLUMN sector_daily.down_num       IS '下跌家数，DC/TDX 提供，THS 为 NULL';
COMMENT ON COLUMN sector_daily.limit_up_num   IS '涨停家数，TDX 专有，其他为 NULL';
COMMENT ON COLUMN sector_daily.limit_down_num IS '跌停家数，TDX 专有，其他为 NULL';


-- ────────────────────────────────────────────────────────────
-- 4. 补充写入权限（service_role）
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sector_daily' AND policyname = 'allow_write_sector_daily'
  ) THEN
    CREATE POLICY allow_write_sector_daily ON sector_daily
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 执行完成后，三张表字段如下：
--
-- sector_meta:
--   id, name_cn, system, level, parent_id, description, created_at
--   + raw_code, idx_type, is_active, updated_at
--
-- sector_stock_map:
--   sector_id, ts_code, in_date, out_date, is_current
--   + system
--
-- sector_daily:
--   sector_id, trade_date, open, high, low, close, collected_at
--   pct_chg→pct_change, volume→vol, up_count→up_num, down_count→down_num, flat_count→flat_num
--   + system, pre_close, change_val, avg_price, turnover_rate, swing, float_mv
--   + pb, limit_up_num, limit_down_num, bm_buy_net, bm_buy_ratio, bm_net, bm_ratio  (TDX专有)
--   + leading_code, leading_name, leading_pct                                         (DC专有)
-- ============================================================
