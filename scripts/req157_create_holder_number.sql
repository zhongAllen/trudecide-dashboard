-- REQ-157: 创建 stock_holder_number 表，存储股东户数
-- Tushare 接口: stk_holdernumber

CREATE TABLE IF NOT EXISTS stock_holder_number (
    id BIGSERIAL PRIMARY KEY,
    ts_code TEXT NOT NULL,
    ann_date DATE,                   -- 公告日期
    end_date DATE NOT NULL,          -- 截止日期
    holder_num BIGINT,                -- 股东户数
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 创建复合唯一索引以支持 upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_holder_number_unique ON stock_holder_number(ts_code, end_date);

-- 添加备注
COMMENT ON TABLE stock_holder_number IS '上市公司股东户数 (REQ-157)';
COMMENT ON COLUMN stock_holder_number.ts_code IS 'TS股票代码';
COMMENT ON COLUMN stock_holder_number.ann_date IS '公告日期';
COMMENT ON COLUMN stock_holder_number.end_date IS '截止日期';
COMMENT ON COLUMN stock_holder_number.holder_num IS '股东户数';
