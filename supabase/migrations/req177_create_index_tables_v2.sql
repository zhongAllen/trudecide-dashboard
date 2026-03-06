-- REQ-177: 指数数据模块 v2
-- 创建指数相关数据表（补充index_daily缺失的表）
-- 版本: v1.5.2
-- 注意: index_daily表已存在（create_index_news_announcement_v1.sql）

-- 指数基本信息
CREATE TABLE IF NOT EXISTS index_basic (
    ts_code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100),
    market VARCHAR(20),
    publisher VARCHAR(50),
    category VARCHAR(50),
    base_date DATE,
    base_point DECIMAL(10,2),
    list_date DATE,
    description TEXT,
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 指数周线行情
CREATE TABLE IF NOT EXISTS index_weekly (
    ts_code VARCHAR(20),
    trade_date DATE,
    open DECIMAL(10,2),
    high DECIMAL(10,2),
    low DECIMAL(10,2),
    close DECIMAL(10,2),
    pre_close DECIMAL(10,2),
    change DECIMAL(10,2),
    pct_chg DECIMAL(10,4),
    vol BIGINT,
    amount DECIMAL(20,2),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 指数月线行情
CREATE TABLE IF NOT EXISTS index_monthly (
    ts_code VARCHAR(20),
    trade_date DATE,
    open DECIMAL(10,2),
    high DECIMAL(10,2),
    low DECIMAL(10,2),
    close DECIMAL(10,2),
    pre_close DECIMAL(10,2),
    change DECIMAL(10,2),
    pct_chg DECIMAL(10,4),
    vol BIGINT,
    amount DECIMAL(20,2),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 指数成分和权重
CREATE TABLE IF NOT EXISTS index_weight (
    index_code VARCHAR(20),
    con_code VARCHAR(20),
    trade_date DATE,
    weight DECIMAL(10,4),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (index_code, con_code, trade_date)
);

-- 大盘指数每日指标
CREATE TABLE IF NOT EXISTS index_dailybasic (
    ts_code VARCHAR(20),
    trade_date DATE,
    total_mv DECIMAL(20,2),
    float_mv DECIMAL(20,2),
    total_share BIGINT,
    float_share BIGINT,
    free_share BIGINT,
    turnover_rate DECIMAL(10,4),
    turnover_rate_f DECIMAL(10,4),
    pe DECIMAL(10,4),
    pe_ttm DECIMAL(10,4),
    pb DECIMAL(10,4),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_index_basic_market ON index_basic(market);
CREATE INDEX IF NOT EXISTS idx_index_weekly_ts_code ON index_weekly(ts_code);
CREATE INDEX IF NOT EXISTS idx_index_weekly_trade_date ON index_weekly(trade_date);
CREATE INDEX IF NOT EXISTS idx_index_monthly_ts_code ON index_monthly(ts_code);
CREATE INDEX IF NOT EXISTS idx_index_monthly_trade_date ON index_monthly(trade_date);
CREATE INDEX IF NOT EXISTS idx_index_weight_index_code ON index_weight(index_code);
CREATE INDEX IF NOT EXISTS idx_index_weight_trade_date ON index_weight(trade_date);
CREATE INDEX IF NOT EXISTS idx_index_dailybasic_ts_code ON index_dailybasic(ts_code);
CREATE INDEX IF NOT EXISTS idx_index_dailybasic_trade_date ON index_dailybasic(trade_date);

-- 启用RLS
ALTER TABLE index_basic ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_weight ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_dailybasic ENABLE ROW LEVEL SECURITY;

-- 创建读取策略
CREATE POLICY allow_read_index_basic ON index_basic FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_index_weekly ON index_weekly FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_index_monthly ON index_monthly FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_index_weight ON index_weight FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_index_dailybasic ON index_dailybasic FOR SELECT TO anon, authenticated USING (true);

-- 创建写入策略
CREATE POLICY allow_write_index_basic ON index_basic FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_index_weekly ON index_weekly FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_index_monthly ON index_monthly FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_index_weight ON index_weight FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_index_dailybasic ON index_dailybasic FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 添加表注释
COMMENT ON TABLE index_basic IS '指数基本信息 - REQ-177';
COMMENT ON TABLE index_weekly IS '指数周线行情 - REQ-177';
COMMENT ON TABLE index_monthly IS '指数月线行情 - REQ-177';
COMMENT ON TABLE index_weight IS '指数成分和权重 - REQ-177';
COMMENT ON TABLE index_dailybasic IS '大盘指数每日指标 - REQ-177';
