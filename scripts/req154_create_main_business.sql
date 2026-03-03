-- REQ-154: 创建 stock_main_business 表，存储主营业务构成
-- Tushare 接口: fina_mainbz_vip

CREATE TABLE IF NOT EXISTS stock_main_business (
    id BIGSERIAL PRIMARY KEY,
    ts_code TEXT NOT NULL,
    end_date DATE NOT NULL,          -- 报告期
    bz_type TEXT NOT NULL,           -- 业务类型 (P:按产品, D:按地区)
    bz_item TEXT NOT NULL,           -- 项目名称
    bz_sales NUMERIC,                -- 营业收入 (元)
    bz_profit NUMERIC,               -- 营业利润 (元)
    bz_cost NUMERIC,                 -- 营业成本 (元)
    sales_ratio NUMERIC,             -- 收入比例 (%)
    profit_ratio NUMERIC,            -- 利润比例 (%)
    cost_ratio NUMERIC,              -- 成本比例 (%)
    curr_type TEXT,                  -- 货币代码
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 创建复合唯一索引以支持 upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_main_business_unique ON stock_main_business(ts_code, end_date, bz_type, bz_item);

-- 添加备注
COMMENT ON TABLE stock_main_business IS '上市公司主营业务构成 (REQ-154)';
COMMENT ON COLUMN stock_main_business.ts_code IS 'TS股票代码';
COMMENT ON COLUMN stock_main_business.end_date IS '报告期';
COMMENT ON COLUMN stock_main_business.bz_type IS '业务类型 (P:按产品, D:按地区)';
COMMENT ON COLUMN stock_main_business.bz_item IS '项目名称';
COMMENT ON COLUMN stock_main_business.bz_sales IS '营业收入 (元)';
COMMENT ON COLUMN stock_main_business.bz_profit IS '营业利润 (元)';
COMMENT ON COLUMN stock_main_business.bz_cost IS '营业成本 (元)';
COMMENT ON COLUMN stock_main_business.sales_ratio IS '收入比例 (%)';
COMMENT ON COLUMN stock_main_business.profit_ratio IS '利润比例 (%)';
COMMENT ON COLUMN stock_main_business.cost_ratio IS '成本比例 (%)';
