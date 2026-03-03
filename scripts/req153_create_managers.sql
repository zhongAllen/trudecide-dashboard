-- REQ-153: 创建 stock_managers 表，存储上市公司高管信息
-- Tushare 接口: stk_managers

CREATE TABLE IF NOT EXISTS stock_managers (
    id BIGSERIAL PRIMARY KEY,
    ts_code TEXT NOT NULL,
    ann_date DATE,
    name TEXT,
    gender TEXT,
    age INTEGER,
    nationality TEXT,
    education TEXT,
    title TEXT,
    begin_date DATE,
    end_date DATE,
    resume TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 创建复合唯一索引以支持 upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_managers_ts_code_name_title ON stock_managers(ts_code, name, title);

-- 添加备注
COMMENT ON TABLE stock_managers IS '上市公司高管信息 (REQ-153)';
COMMENT ON COLUMN stock_managers.ts_code IS 'TS股票代码';
COMMENT ON COLUMN stock_managers.ann_date IS '公告日期';
COMMENT ON COLUMN stock_managers.name IS '姓名';
COMMENT ON COLUMN stock_managers.gender IS '性别';
COMMENT ON COLUMN stock_managers.age IS '年龄';
COMMENT ON COLUMN stock_managers.nationality IS '国籍';
COMMENT ON COLUMN stock_managers.education IS '学历';
COMMENT ON COLUMN stock_managers.title IS '职位';
COMMENT ON COLUMN stock_managers.begin_date IS '任职起始日期';
COMMENT ON COLUMN stock_managers.end_date IS '任职结束日期';
COMMENT ON COLUMN stock_managers.resume IS '个人简历';
