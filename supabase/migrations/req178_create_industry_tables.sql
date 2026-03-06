-- REQ-178: 行业数据模块
-- 创建行业分类和行情数据表
-- 版本: v1.5.2

-- 申万行业分类
CREATE TABLE IF NOT EXISTS sw_industry_classify (
    code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100),
    industry_type VARCHAR(20),
    level VARCHAR(10),
    parent_code VARCHAR(20),
    is_valid BOOLEAN DEFAULT true,
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 申万行业成分
CREATE TABLE IF NOT EXISTS sw_industry_member (
    index_code VARCHAR(20),
    con_code VARCHAR(20),
    con_name VARCHAR(100),
    in_date DATE,
    out_date DATE,
    is_new BOOLEAN DEFAULT true,
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (index_code, con_code, in_date)
);

-- 申万行业指数日行情
CREATE TABLE IF NOT EXISTS sw_industry_daily (
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

-- 中信行业分类
CREATE TABLE IF NOT EXISTS citic_industry_classify (
    code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100),
    industry_type VARCHAR(20),
    level VARCHAR(10),
    parent_code VARCHAR(20),
    is_valid BOOLEAN DEFAULT true,
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 中信行业成分
CREATE TABLE IF NOT EXISTS citic_industry_member (
    index_code VARCHAR(20),
    con_code VARCHAR(20),
    con_name VARCHAR(100),
    in_date DATE,
    out_date DATE,
    is_new BOOLEAN DEFAULT true,
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (index_code, con_code, in_date)
);

-- 中信行业指数日行情
CREATE TABLE IF NOT EXISTS citic_industry_daily (
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

-- 国际主要指数
CREATE TABLE IF NOT EXISTS global_index (
    ts_code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100),
    market VARCHAR(50),
    category VARCHAR(50),
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 国际指数日线
CREATE TABLE IF NOT EXISTS global_index_daily (
    ts_code VARCHAR(20),
    trade_date DATE,
    open DECIMAL(10,2),
    high DECIMAL(10,2),
    low DECIMAL(10,2),
    close DECIMAL(10,2),
    pre_close DECIMAL(10,2),
    change DECIMAL(10,2),
    pct_chg DECIMAL(10,4),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_sw_industry_member_code ON sw_industry_member(index_code);
CREATE INDEX IF NOT EXISTS idx_sw_industry_daily_ts_code ON sw_industry_daily(ts_code);
CREATE INDEX IF NOT EXISTS idx_citic_industry_member_code ON citic_industry_member(index_code);
CREATE INDEX IF NOT EXISTS idx_citic_industry_daily_ts_code ON citic_industry_daily(ts_code);
CREATE INDEX IF NOT EXISTS idx_global_index_daily_ts_code ON global_index_daily(ts_code);

-- 启用RLS
ALTER TABLE sw_industry_classify ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_industry_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_industry_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE citic_industry_classify ENABLE ROW LEVEL SECURITY;
ALTER TABLE citic_industry_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE citic_industry_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_index_daily ENABLE ROW LEVEL SECURITY;

-- 创建读取策略
CREATE POLICY allow_read_sw_industry_classify ON sw_industry_classify FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_sw_industry_member ON sw_industry_member FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_sw_industry_daily ON sw_industry_daily FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_citic_industry_classify ON citic_industry_classify FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_citic_industry_member ON citic_industry_member FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_citic_industry_daily ON citic_industry_daily FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_global_index ON global_index FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_global_index_daily ON global_index_daily FOR SELECT TO anon, authenticated USING (true);

-- 创建写入策略
CREATE POLICY allow_write_sw_industry_classify ON sw_industry_classify FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_sw_industry_member ON sw_industry_member FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_sw_industry_daily ON sw_industry_daily FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_citic_industry_classify ON citic_industry_classify FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_citic_industry_member ON citic_industry_member FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_citic_industry_daily ON citic_industry_daily FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_global_index ON global_index FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_global_index_daily ON global_index_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 添加表注释
COMMENT ON TABLE sw_industry_classify IS '申万行业分类 - REQ-178';
COMMENT ON TABLE sw_industry_member IS '申万行业成分 - REQ-178';
COMMENT ON TABLE sw_industry_daily IS '申万行业指数日行情 - REQ-178';
COMMENT ON TABLE citic_industry_classify IS '中信行业分类 - REQ-178';
COMMENT ON TABLE citic_industry_member IS '中信行业成分 - REQ-178';
COMMENT ON TABLE citic_industry_daily IS '中信行业指数日行情 - REQ-178';
COMMENT ON TABLE global_index IS '国际主要指数 - REQ-178';
COMMENT ON TABLE global_index_daily IS '国际指数日线 - REQ-178';
