-- REQ-162: 创建 stock_main_business 表，存储主营业务构成
-- Tushare 接口: fina_mainbz（2000分，单股）/ fina_mainbz_vip（5000分，全市场）
-- 数据特点：按报告期+产品/地区分类，每期多条记录
-- 更新策略：UPSERT（按 ts_code + end_date + bz_type + bz_item 去重）

CREATE TABLE IF NOT EXISTS stock_main_business (
    id          BIGSERIAL   PRIMARY KEY,
    ts_code     TEXT        NOT NULL,   -- TS股票代码
    end_date    DATE        NOT NULL,   -- 报告期（季末日期）
    bz_type     TEXT        NOT NULL,   -- 分类维度：P=按产品 D=按地区
    bz_item     TEXT        NOT NULL,   -- 业务来源名称（产品名/地区名）
    bz_sales    NUMERIC,                -- 主营业务收入（元）
    bz_profit   NUMERIC,                -- 主营业务利润（元）
    bz_cost     NUMERIC,                -- 主营业务成本（元）
    curr_type   TEXT,                   -- 货币代码（CNY/USD等）
    update_flag TEXT,                   -- 是否更新标志
    -- 衍生计算字段（采集时预计算，便于前端直接展示）
    sales_pct   NUMERIC,                -- 收入占比（%），由采集脚本计算
    profit_pct  NUMERIC,                -- 利润占比（%），由采集脚本计算
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_main_business_unique
    ON stock_main_business(ts_code, end_date, bz_type, bz_item);

-- 查询索引
CREATE INDEX IF NOT EXISTS idx_stock_main_business_ts_code  ON stock_main_business(ts_code);
CREATE INDEX IF NOT EXISTS idx_stock_main_business_end_date ON stock_main_business(end_date);

-- 表注释
COMMENT ON TABLE  stock_main_business IS '上市公司主营业务构成 (REQ-162)，来源：Tushare fina_mainbz/fina_mainbz_vip 接口';
COMMENT ON COLUMN stock_main_business.ts_code    IS 'TS股票代码';
COMMENT ON COLUMN stock_main_business.end_date   IS '报告期，格式 YYYY-MM-DD（季末）';
COMMENT ON COLUMN stock_main_business.bz_type    IS '分类维度：P=按产品 D=按地区';
COMMENT ON COLUMN stock_main_business.bz_item    IS '业务来源名称';
COMMENT ON COLUMN stock_main_business.bz_sales   IS '主营业务收入，单位：元（原始值）';
COMMENT ON COLUMN stock_main_business.bz_profit  IS '主营业务利润，单位：元（原始值）';
COMMENT ON COLUMN stock_main_business.bz_cost    IS '主营业务成本，单位：元（原始值）';
COMMENT ON COLUMN stock_main_business.curr_type  IS '货币代码，通常为 CNY';
COMMENT ON COLUMN stock_main_business.sales_pct  IS '收入占该期总收入的百分比（%），采集时预计算';
COMMENT ON COLUMN stock_main_business.profit_pct IS '利润占该期总利润的百分比（%），采集时预计算';
