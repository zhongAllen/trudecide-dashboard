-- REQ-180: 资金流向模块 v2
-- 创建多源资金流向数据表
-- 版本: v1.5.2
-- 注意: stock_moneyflow表已存在（create_stock_financial_tables_v1.sql），本模块创建扩展表

-- 个股资金流向（Tushare标准）
CREATE TABLE IF NOT EXISTS moneyflow (
    ts_code VARCHAR(20),
    trade_date DATE,
    buy_sm_vol BIGINT,
    buy_sm_amount DECIMAL(20,2),
    sell_sm_vol BIGINT,
    sell_sm_amount DECIMAL(20,2),
    buy_md_vol BIGINT,
    buy_md_amount DECIMAL(20,2),
    sell_md_vol BIGINT,
    sell_md_amount DECIMAL(20,2),
    buy_lg_vol BIGINT,
    buy_lg_amount DECIMAL(20,2),
    sell_lg_vol BIGINT,
    sell_lg_amount DECIMAL(20,2),
    buy_elg_vol BIGINT,
    buy_elg_amount DECIMAL(20,2),
    sell_elg_vol BIGINT,
    sell_elg_amount DECIMAL(20,2),
    net_mf_vol BIGINT,
    net_mf_amount DECIMAL(20,2),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 个股资金流向（同花顺扩展）
CREATE TABLE IF NOT EXISTS moneyflow_ths (
    ts_code VARCHAR(20),
    trade_date DATE,
    buy_amount DECIMAL(20,2),
    sell_amount DECIMAL(20,2),
    net_amount DECIMAL(20,2),
    main_buy_amount DECIMAL(20,2),
    main_sell_amount DECIMAL(20,2),
    main_net_amount DECIMAL(20,2),
    retail_buy_amount DECIMAL(20,2),
    retail_sell_amount DECIMAL(20,2),
    retail_net_amount DECIMAL(20,2),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 个股资金流向（东方财富扩展）
CREATE TABLE IF NOT EXISTS moneyflow_dc (
    ts_code VARCHAR(20),
    trade_date DATE,
    buy_amount DECIMAL(20,2),
    sell_amount DECIMAL(20,2),
    net_amount DECIMAL(20,2),
    main_buy_amount DECIMAL(20,2),
    main_sell_amount DECIMAL(20,2),
    main_net_amount DECIMAL(20,2),
    retail_buy_amount DECIMAL(20,2),
    retail_sell_amount DECIMAL(20,2),
    retail_net_amount DECIMAL(20,2),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 行业/板块资金流向（同花顺）
CREATE TABLE IF NOT EXISTS moneyflow_industry_ths (
    code VARCHAR(20),
    name VARCHAR(100),
    trade_date DATE,
    buy_amount DECIMAL(20,2),
    sell_amount DECIMAL(20,2),
    net_amount DECIMAL(20,2),
    main_buy_amount DECIMAL(20,2),
    main_sell_amount DECIMAL(20,2),
    main_net_amount DECIMAL(20,2),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (code, trade_date)
);

-- 板块资金流向（东方财富）
CREATE TABLE IF NOT EXISTS moneyflow_industry_dc (
    code VARCHAR(20),
    name VARCHAR(100),
    trade_date DATE,
    buy_amount DECIMAL(20,2),
    sell_amount DECIMAL(20,2),
    net_amount DECIMAL(20,2),
    main_buy_amount DECIMAL(20,2),
    main_sell_amount DECIMAL(20,2),
    main_net_amount DECIMAL(20,2),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (code, trade_date)
);

-- 大盘资金流向（东方财富）
CREATE TABLE IF NOT EXISTS moneyflow_market_dc (
    trade_date DATE PRIMARY KEY,
    sh_buy_amount DECIMAL(20,2),
    sh_sell_amount DECIMAL(20,2),
    sh_net_amount DECIMAL(20,2),
    sz_buy_amount DECIMAL(20,2),
    sz_sell_amount DECIMAL(20,2),
    sz_net_amount DECIMAL(20,2),
    total_buy_amount DECIMAL(20,2),
    total_sell_amount DECIMAL(20,2),
    total_net_amount DECIMAL(20,2),
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_moneyflow_ts_code ON moneyflow(ts_code);
CREATE INDEX IF NOT EXISTS idx_moneyflow_trade_date ON moneyflow(trade_date);
CREATE INDEX IF NOT EXISTS idx_moneyflow_ths_ts_code ON moneyflow_ths(ts_code);
CREATE INDEX IF NOT EXISTS idx_moneyflow_ths_trade_date ON moneyflow_ths(trade_date);
CREATE INDEX IF NOT EXISTS idx_moneyflow_dc_ts_code ON moneyflow_dc(ts_code);
CREATE INDEX IF NOT EXISTS idx_moneyflow_dc_trade_date ON moneyflow_dc(trade_date);
CREATE INDEX IF NOT EXISTS idx_moneyflow_industry_ths_code ON moneyflow_industry_ths(code);
CREATE INDEX IF NOT EXISTS idx_moneyflow_industry_ths_date ON moneyflow_industry_ths(trade_date);
CREATE INDEX IF NOT EXISTS idx_moneyflow_industry_dc_code ON moneyflow_industry_dc(code);
CREATE INDEX IF NOT EXISTS idx_moneyflow_industry_dc_date ON moneyflow_industry_dc(trade_date);

-- 启用RLS
ALTER TABLE moneyflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE moneyflow_ths ENABLE ROW LEVEL SECURITY;
ALTER TABLE moneyflow_dc ENABLE ROW LEVEL SECURITY;
ALTER TABLE moneyflow_industry_ths ENABLE ROW LEVEL SECURITY;
ALTER TABLE moneyflow_industry_dc ENABLE ROW LEVEL SECURITY;
ALTER TABLE moneyflow_market_dc ENABLE ROW LEVEL SECURITY;

-- 创建读取策略
CREATE POLICY allow_read_moneyflow ON moneyflow FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_moneyflow_ths ON moneyflow_ths FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_moneyflow_dc ON moneyflow_dc FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_moneyflow_industry_ths ON moneyflow_industry_ths FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_moneyflow_industry_dc ON moneyflow_industry_dc FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_moneyflow_market_dc ON moneyflow_market_dc FOR SELECT TO anon, authenticated USING (true);

-- 创建写入策略
CREATE POLICY allow_write_moneyflow ON moneyflow FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_moneyflow_ths ON moneyflow_ths FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_moneyflow_dc ON moneyflow_dc FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_moneyflow_industry_ths ON moneyflow_industry_ths FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_moneyflow_industry_dc ON moneyflow_industry_dc FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_moneyflow_market_dc ON moneyflow_market_dc FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 添加表注释
COMMENT ON TABLE moneyflow IS '个股资金流向（Tushare标准） - REQ-180';
COMMENT ON TABLE moneyflow_ths IS '个股资金流向（同花顺扩展） - REQ-180';
COMMENT ON TABLE moneyflow_dc IS '个股资金流向（东方财富扩展） - REQ-180';
COMMENT ON TABLE moneyflow_industry_ths IS '行业/板块资金流向（同花顺） - REQ-180';
COMMENT ON TABLE moneyflow_industry_dc IS '板块资金流向（东方财富） - REQ-180';
COMMENT ON TABLE moneyflow_market_dc IS '大盘资金流向（东方财富） - REQ-180';
