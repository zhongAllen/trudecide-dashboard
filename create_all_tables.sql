-- ============================================================
-- Trudecide 股票版 - 完整数据库建表脚本
-- 版本: v1.0  日期: 2026-02-26
-- 说明: 在 Supabase Dashboard > SQL Editor 中一次性执行
-- ============================================================

-- ── 1. indicator_meta（宏观指标元数据）──────────────────────────────────────
CREATE TABLE IF NOT EXISTS indicator_meta (
  id             TEXT PRIMARY KEY,
  name_cn        TEXT NOT NULL,
  description_cn TEXT,
  category       TEXT NOT NULL CHECK (category IN ('macro', 'sector', 'stock')),
  unit           TEXT,
  source_name    TEXT,
  source_url     TEXT,
  credibility    TEXT CHECK (credibility IN ('high', 'medium', 'low')),
  frequency      TEXT CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  value_type     TEXT CHECK (value_type IN ('level', 'yoy', 'mom', 'qoq', 'flow', 'rate', 'index')),
  created_at     TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE indicator_meta IS '宏观指标元数据，每个指标一行，描述指标的基本属性';
COMMENT ON COLUMN indicator_meta.frequency IS '数据更新频率：daily=日度, monthly=月度, quarterly=季度, yearly=年度';
COMMENT ON COLUMN indicator_meta.value_type IS '指标数值性质：level=绝对量, yoy=同比增速, mom=环比增速, qoq=季比增速, flow=增量, rate=利率, index=指数';

-- ── 2. indicator_values（宏观指标时序数据）──────────────────────────────────
CREATE TABLE IF NOT EXISTS indicator_values (
  indicator_id  TEXT NOT NULL REFERENCES indicator_meta(id),
  trade_date    DATE NOT NULL,
  publish_date  DATE NOT NULL,
  value         NUMERIC,
  revision_seq  INT DEFAULT 0,
  collected_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (indicator_id, trade_date, revision_seq)
);

COMMENT ON TABLE indicator_values IS '宏观指标时序数据，trade_date 约定为区间末日期（与 Wind/CEIC 惯例一致）';
COMMENT ON COLUMN indicator_values.trade_date IS '数据所属时间点（区间末日期）：季度数据用季末日期如2024-09-30，月度用月末日期，日度用当天';
COMMENT ON COLUMN indicator_values.publish_date IS '数据实际发布日期（用于回测时避免未来数据泄露）';
COMMENT ON COLUMN indicator_values.revision_seq IS '修订版本号，0=初始值，1=第一次修订，以此类推';

CREATE INDEX IF NOT EXISTS idx_indicator_values_date     ON indicator_values (trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_indicator_values_id_date  ON indicator_values (indicator_id, trade_date DESC);

-- ── 3. sector_meta（板块元数据）─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sector_meta (
  id           TEXT PRIMARY KEY,
  name_cn      TEXT NOT NULL,
  system       TEXT NOT NULL CHECK (system IN ('tdx', 'dc')),
  level        INT  NOT NULL CHECK (level IN (1, 2, 3)),
  parent_id    TEXT REFERENCES sector_meta(id),
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sector_meta IS '板块元数据，支持通达信(tdx)和东方财富(dc)两套分类体系';
COMMENT ON COLUMN sector_meta.system IS '分类体系：tdx=通达信行业分类, dc=东方财富概念板块';
COMMENT ON COLUMN sector_meta.level IS '层级：1=一级行业, 2=二级行业, 3=细分/概念';

-- ── 4. sector_stock_map（板块-股票映射）─────────────────────────────────────
CREATE TABLE IF NOT EXISTS sector_stock_map (
  sector_id   TEXT NOT NULL REFERENCES sector_meta(id),
  ts_code     TEXT NOT NULL,
  in_date     DATE,
  out_date    DATE,
  is_current  BOOLEAN DEFAULT true,
  PRIMARY KEY (sector_id, ts_code)
);

COMMENT ON TABLE sector_stock_map IS '板块与股票的多对多映射关系，支持历史成分股追踪';
COMMENT ON COLUMN sector_stock_map.ts_code IS 'Tushare 股票代码，格式：000001.SZ';
COMMENT ON COLUMN sector_stock_map.is_current IS '是否为当前成分股';

CREATE INDEX IF NOT EXISTS idx_sector_stock_ts_code  ON sector_stock_map (ts_code);
CREATE INDEX IF NOT EXISTS idx_sector_stock_current  ON sector_stock_map (sector_id) WHERE is_current = true;

-- ── 5. sector_daily（板块日度行情）──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sector_daily (
  sector_id        TEXT NOT NULL REFERENCES sector_meta(id),
  trade_date       DATE NOT NULL,
  open             NUMERIC,
  high             NUMERIC,
  low              NUMERIC,
  close            NUMERIC,
  pct_chg          NUMERIC,
  volume           NUMERIC,
  amount           NUMERIC,
  up_count         INT,
  down_count       INT,
  flat_count       INT,
  avg_pe           NUMERIC,
  total_mv         NUMERIC,
  collected_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (sector_id, trade_date)
);

COMMENT ON TABLE sector_daily IS '板块日度行情数据，来源于东方财富/通达信';
COMMENT ON COLUMN sector_daily.amount IS '成交额（亿元）';
COMMENT ON COLUMN sector_daily.total_mv IS '总市值（亿元）';

CREATE INDEX IF NOT EXISTS idx_sector_daily_date  ON sector_daily (trade_date DESC);

-- ── 6. stock_meta（个股元数据）──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_meta (
  ts_code       TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL,
  name_cn       TEXT NOT NULL,
  area          TEXT,
  industry      TEXT,
  market        TEXT CHECK (market IN ('主板', '创业板', '科创板', '北交所', 'B股')),
  list_date     DATE,
  delist_date   DATE,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE stock_meta IS '个股基础信息，来源于 Tushare Pro stock_basic 接口';
COMMENT ON COLUMN stock_meta.ts_code IS 'Tushare 股票代码，格式：000001.SZ';

CREATE INDEX IF NOT EXISTS idx_stock_meta_symbol   ON stock_meta (symbol);
CREATE INDEX IF NOT EXISTS idx_stock_meta_industry ON stock_meta (industry);
CREATE INDEX IF NOT EXISTS idx_stock_meta_active   ON stock_meta (is_active) WHERE is_active = true;

-- ── 7. stock_daily（个股日度行情）───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_daily (
  ts_code      TEXT NOT NULL REFERENCES stock_meta(ts_code),
  trade_date   DATE NOT NULL,
  open         NUMERIC,
  high         NUMERIC,
  low          NUMERIC,
  close        NUMERIC,
  pre_close    NUMERIC,
  pct_chg      NUMERIC,
  vol          NUMERIC,
  amount       NUMERIC,
  adj_factor   NUMERIC,
  pe_ttm       NUMERIC,
  pb           NUMERIC,
  ps_ttm       NUMERIC,
  total_mv     NUMERIC,
  circ_mv      NUMERIC,
  collected_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ts_code, trade_date)
);

COMMENT ON TABLE stock_daily IS '个股日度行情+估值数据，来源于 Tushare Pro daily + daily_basic 接口';
COMMENT ON COLUMN stock_daily.amount IS '成交额（万元，Tushare 原始单位）';
COMMENT ON COLUMN stock_daily.total_mv IS '总市值（万元，Tushare 原始单位）';
COMMENT ON COLUMN stock_daily.adj_factor IS '复权因子，用于计算前复权价格';

CREATE INDEX IF NOT EXISTS idx_stock_daily_date      ON stock_daily (trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_daily_code_date ON stock_daily (ts_code, trade_date DESC);

-- ── 8. news（新闻舆情）──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news (
  id           BIGSERIAL PRIMARY KEY,
  ts_code      TEXT,
  title        TEXT NOT NULL,
  content      TEXT,
  pub_time     TIMESTAMPTZ NOT NULL,
  source       TEXT,
  url          TEXT,
  sentiment    NUMERIC CHECK (sentiment BETWEEN -1 AND 1),
  keywords     TEXT[],
  collected_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE news IS '新闻舆情数据，来源于 Tushare Pro news 接口';
COMMENT ON COLUMN news.ts_code IS '关联股票代码（NULL 表示市场整体新闻）';
COMMENT ON COLUMN news.sentiment IS '情感得分：-1=极度负面, 0=中性, 1=极度正面';

CREATE INDEX IF NOT EXISTS idx_news_pub_time ON news (pub_time DESC);
CREATE INDEX IF NOT EXISTS idx_news_ts_code  ON news (ts_code) WHERE ts_code IS NOT NULL;

-- ============================================================
-- 启用行级安全（RLS）
-- ============================================================
ALTER TABLE indicator_meta    ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_values  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_meta       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_stock_map  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_meta        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_daily       ENABLE ROW LEVEL SECURITY;
ALTER TABLE news              ENABLE ROW LEVEL SECURITY;

-- ── 读取策略（所有人可读）──────────────────────────────────────────────────
CREATE POLICY allow_read_indicator_meta    ON indicator_meta    FOR SELECT USING (true);
CREATE POLICY allow_read_indicator_values  ON indicator_values  FOR SELECT USING (true);
CREATE POLICY allow_read_sector_meta       ON sector_meta       FOR SELECT USING (true);
CREATE POLICY allow_read_sector_stock_map  ON sector_stock_map  FOR SELECT USING (true);
CREATE POLICY allow_read_sector_daily      ON sector_daily      FOR SELECT USING (true);
CREATE POLICY allow_read_stock_meta        ON stock_meta        FOR SELECT USING (true);
CREATE POLICY allow_read_stock_daily       ON stock_daily       FOR SELECT USING (true);
CREATE POLICY allow_read_news              ON news              FOR SELECT USING (true);

-- ── 写入策略（service_role 可写）────────────────────────────────────────────
CREATE POLICY allow_write_indicator_meta    ON indicator_meta    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_indicator_values  ON indicator_values  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_sector_meta       ON sector_meta       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_sector_stock_map  ON sector_stock_map  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_sector_daily      ON sector_daily      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_stock_meta        ON stock_meta        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_stock_daily       ON stock_daily       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_news              ON news              FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 种子数据：indicator_meta（14个核心宏观指标）
-- ============================================================
INSERT INTO indicator_meta (id, name_cn, description_cn, category, unit, source_name, source_url, credibility, frequency, value_type) VALUES
  ('cn_gdp_yoy',        'GDP同比增速',          '中国国内生产总值同比增速，季度数据',                   'macro', '%',   'AKShare/国家统计局', 'https://data.stats.gov.cn', 'high', 'quarterly', 'yoy'),
  ('cn_cpi_yoy',        'CPI同比增速',          '居民消费价格指数同比变化，反映通胀水平',               'macro', '%',   'AKShare/国家统计局', 'https://data.stats.gov.cn', 'high', 'monthly',   'yoy'),
  ('cn_ppi_yoy',        'PPI同比增速',          '工业生产者出厂价格指数同比变化，反映上游通胀',         'macro', '%',   'AKShare/国家统计局', 'https://data.stats.gov.cn', 'high', 'monthly',   'yoy'),
  ('cn_pmi_mfg',        '制造业PMI',            '制造业采购经理人指数，50为荣枯线',                     'macro', '点',  'AKShare/国家统计局', 'https://data.stats.gov.cn', 'high', 'monthly',   'index'),
  ('cn_pmi_service',    '非制造业PMI',          '非制造业（服务业+建筑业）采购经理人指数',              'macro', '点',  'AKShare/国家统计局', 'https://data.stats.gov.cn', 'high', 'monthly',   'index'),
  ('cn_m2_yoy',         'M2同比增速',           '广义货币供应量M2同比增速，反映货币宽松程度',           'macro', '%',   'AKShare/中国人民银行', 'http://www.pbc.gov.cn',    'high', 'monthly',   'yoy'),
  ('cn_social_finance', '社会融资规模增量',     '当月社会融资规模增量，反映实体经济融资需求',           'macro', '亿元', 'AKShare/中国人民银行', 'http://www.pbc.gov.cn',   'high', 'monthly',   'flow'),
  ('cn_new_loans',      '新增人民币贷款',       '当月金融机构新增人民币贷款，反映信贷扩张',             'macro', '亿元', 'AKShare/中国人民银行', 'http://www.pbc.gov.cn',   'high', 'monthly',   'flow'),
  ('cn_export_yoy',     '出口金额同比',         '中国出口总额同比增速，反映外需强弱',                   'macro', '%',   'AKShare/海关总署',    'http://www.customs.gov.cn', 'high', 'monthly',  'yoy'),
  ('cn_import_yoy',     '进口金额同比',         '中国进口总额同比增速，反映内需强弱',                   'macro', '%',   'AKShare/海关总署',    'http://www.customs.gov.cn', 'high', 'monthly',  'yoy'),
  ('cn_industrial_yoy', '工业增加值同比',       '规模以上工业增加值同比增速，反映工业生产活跃度',       'macro', '%',   'AKShare/国家统计局', 'https://data.stats.gov.cn', 'high', 'monthly',   'yoy'),
  ('cn_retail_yoy',     '社会消费品零售总额同比', '社零总额同比增速，反映消费需求强弱',                'macro', '%',   'AKShare/国家统计局', 'https://data.stats.gov.cn', 'high', 'monthly',   'yoy'),
  ('cn_fai_yoy',        '固定资产投资同比',     '全国固定资产投资（不含农户）累计同比增速',             'macro', '%',   'AKShare/国家统计局', 'https://data.stats.gov.cn', 'high', 'monthly',   'yoy'),
  ('cn_lpr_1y',         '1年期LPR',             '1年期贷款市场报价利率，政策利率锚',                    'macro', '%',   'AKShare/中国人民银行', 'http://www.pbc.gov.cn',    'high', 'monthly',   'rate')
ON CONFLICT (id) DO UPDATE SET
  name_cn        = EXCLUDED.name_cn,
  description_cn = EXCLUDED.description_cn,
  unit           = EXCLUDED.unit,
  source_name    = EXCLUDED.source_name,
  frequency      = EXCLUDED.frequency,
  value_type     = EXCLUDED.value_type;

-- ============================================================
-- 验证建表结果
-- ============================================================
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS col_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
