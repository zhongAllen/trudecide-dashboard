-- REQ-163: 创建 stock_holder_number 表，存储股东户数
-- Tushare 接口: stk_holdernumber（积分要求：600分）
-- 数据特点：不定期公布，约每季度一次
-- 更新策略：UPSERT（按 ts_code + end_date 去重）
-- 注意：此表替代 req157_create_holder_number.sql，字段更完整，请执行本文件

CREATE TABLE IF NOT EXISTS stock_holder_number (
    id          BIGSERIAL   PRIMARY KEY,
    ts_code     TEXT        NOT NULL,   -- TS股票代码
    ann_date    DATE,                   -- 公告日期
    end_date    DATE        NOT NULL,   -- 截止日期（统计基准日）
    holder_num  BIGINT,                 -- 股东户数（人）
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 唯一约束：同一公司同一截止日期只有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_holder_number_unique
    ON stock_holder_number(ts_code, end_date);

-- 查询索引
CREATE INDEX IF NOT EXISTS idx_stock_holder_number_ts_code  ON stock_holder_number(ts_code);
CREATE INDEX IF NOT EXISTS idx_stock_holder_number_end_date ON stock_holder_number(end_date);

-- 表注释
COMMENT ON TABLE  stock_holder_number IS '上市公司股东户数 (REQ-163)，来源：Tushare stk_holdernumber 接口';
COMMENT ON COLUMN stock_holder_number.ts_code    IS 'TS股票代码';
COMMENT ON COLUMN stock_holder_number.ann_date   IS '公告日期';
COMMENT ON COLUMN stock_holder_number.end_date   IS '统计截止日期（通常为季末）';
COMMENT ON COLUMN stock_holder_number.holder_num IS '股东户数，单位：人。户数减少通常意味着筹码集中，是看多信号';
