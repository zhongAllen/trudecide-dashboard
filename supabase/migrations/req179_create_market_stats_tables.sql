-- REQ-179: 市场统计模块
-- 创建市场统计类数据表
-- 版本: v1.5.2

-- 指数技术面因子
CREATE TABLE IF NOT EXISTS index_technical (
    ts_code VARCHAR(20),
    trade_date DATE,
    ma5 DECIMAL(10,2),
    ma10 DECIMAL(10,2),
    ma20 DECIMAL(10,2),
    ma30 DECIMAL(10,2),
    ma60 DECIMAL(10,2),
    macd_dif DECIMAL(10,4),
    macd_dea DECIMAL(10,4),
    macd_bar DECIMAL(10,4),
    kdj_k DECIMAL(10,4),
    kdj_d DECIMAL(10,4),
    kdj_j DECIMAL(10,4),
    rsi6 DECIMAL(10,4),
    rsi12 DECIMAL(10,4),
    rsi24 DECIMAL(10,4),
    boll_upper DECIMAL(10,2),
    boll_mid DECIMAL(10,2),
    boll_lower DECIMAL(10,2),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 沪深市场每日交易统计
CREATE TABLE IF NOT EXISTS market_daily_info (
    trade_date DATE PRIMARY KEY,
    market VARCHAR(10),
    total_stocks INT,
    up_stocks INT,
    down_stocks INT,
    flat_stocks INT,
    limit_up INT,
    limit_down INT,
    total_volume BIGINT,
    total_amount DECIMAL(20,2),
    avg_pe DECIMAL(10,4),
    avg_pb DECIMAL(10,4),
    avg_turnover DECIMAL(10,4),
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 深圳市场每日交易情况
CREATE TABLE IF NOT EXISTS sz_market_daily (
    trade_date DATE PRIMARY KEY,
    mainboard_up INT,
    mainboard_down INT,
    sme_up INT,
    sme_down INT,
    chinext_up INT,
    chinext_down INT,
    mainboard_volume BIGINT,
    mainboard_amount DECIMAL(20,2),
    sme_volume BIGINT,
    sme_amount DECIMAL(20,2),
    chinext_volume BIGINT,
    chinext_amount DECIMAL(20,2),
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_index_technical_ts_code ON index_technical(ts_code);
CREATE INDEX IF NOT EXISTS idx_index_technical_trade_date ON index_technical(trade_date);

-- 启用RLS
ALTER TABLE index_technical ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_daily_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE sz_market_daily ENABLE ROW LEVEL SECURITY;

-- 创建读取策略
CREATE POLICY allow_read_index_technical ON index_technical FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_market_daily_info ON market_daily_info FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_read_sz_market_daily ON sz_market_daily FOR SELECT TO anon, authenticated USING (true);

-- 创建写入策略
CREATE POLICY allow_write_index_technical ON index_technical FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_market_daily_info ON market_daily_info FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY allow_write_sz_market_daily ON sz_market_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 添加表注释
COMMENT ON TABLE index_technical IS '指数技术面因子 - REQ-179';
COMMENT ON TABLE market_daily_info IS '沪深市场每日交易统计 - REQ-179';
COMMENT ON TABLE sz_market_daily IS '深圳市场每日交易情况 - REQ-179';
