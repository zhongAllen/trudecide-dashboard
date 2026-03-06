-- 创建股票周K线表
CREATE TABLE IF NOT EXISTS stock_weekly (
    ts_code TEXT NOT NULL,
    trade_date DATE NOT NULL,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    pre_close NUMERIC,
    change NUMERIC,
    pct_chg NUMERIC,
    vol NUMERIC,
    amount NUMERIC,
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 创建股票月K线表
CREATE TABLE IF NOT EXISTS stock_monthly (
    ts_code TEXT NOT NULL,
    trade_date DATE NOT NULL,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    pre_close NUMERIC,
    change NUMERIC,
    pct_chg NUMERIC,
    vol NUMERIC,
    amount NUMERIC,
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ts_code, trade_date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_stock_weekly_ts_code ON stock_weekly(ts_code);
CREATE INDEX IF NOT EXISTS idx_stock_weekly_trade_date ON stock_weekly(trade_date);
CREATE INDEX IF NOT EXISTS idx_stock_monthly_ts_code ON stock_monthly(ts_code);
CREATE INDEX IF NOT EXISTS idx_stock_monthly_trade_date ON stock_monthly(trade_date);

-- 添加表注释
COMMENT ON TABLE stock_weekly IS '股票周K线数据，来自Tushare stk_weekly接口';
COMMENT ON TABLE stock_monthly IS '股票月K线数据，来自Tushare stk_monthly接口';
