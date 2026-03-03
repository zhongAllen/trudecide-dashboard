-- REQ-161: 创建 stock_managers 表，存储上市公司高管信息
-- Tushare 接口: stk_managers（积分要求：2000分）
-- 数据特点：含历史任职记录，同一人可有多条（不同任期/职务）
-- 更新策略：UPSERT（按 ts_code + ann_date + name + title 去重）

CREATE TABLE IF NOT EXISTS stock_managers (
    id          BIGSERIAL   PRIMARY KEY,
    ts_code     TEXT        NOT NULL,   -- TS股票代码
    ann_date    DATE,                   -- 公告日期
    name        TEXT        NOT NULL,   -- 姓名
    gender      TEXT,                   -- 性别（M/F）
    lev         TEXT,                   -- 岗位类别（董事/监事/高管等）
    title       TEXT,                   -- 具体岗位（董事长/总经理/CFO等）
    edu         TEXT,                   -- 学历
    national    TEXT,                   -- 国籍
    birthday    TEXT,                   -- 出生年月（YYYYMM 格式）
    begin_date  DATE,                   -- 上任日期
    end_date    DATE,                   -- 离任日期（NULL 表示在任）
    resume      TEXT,                   -- 个人简历
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 唯一约束：同一公司同一公告日期同一人同一职务只有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_managers_unique
    ON stock_managers(ts_code, ann_date, name, title);

-- 查询索引
CREATE INDEX IF NOT EXISTS idx_stock_managers_ts_code ON stock_managers(ts_code);
CREATE INDEX IF NOT EXISTS idx_stock_managers_end_date ON stock_managers(end_date);

-- 表注释
COMMENT ON TABLE  stock_managers IS '上市公司高管任职信息 (REQ-161)，来源：Tushare stk_managers 接口';
COMMENT ON COLUMN stock_managers.ts_code    IS 'TS股票代码';
COMMENT ON COLUMN stock_managers.ann_date   IS '公告日期';
COMMENT ON COLUMN stock_managers.name       IS '高管姓名';
COMMENT ON COLUMN stock_managers.gender     IS '性别：M男 F女';
COMMENT ON COLUMN stock_managers.lev        IS '岗位类别：如 董事、监事、高级管理人员';
COMMENT ON COLUMN stock_managers.title      IS '具体职务：如 董事长、总经理、CFO、董秘';
COMMENT ON COLUMN stock_managers.edu        IS '最高学历';
COMMENT ON COLUMN stock_managers.national   IS '国籍';
COMMENT ON COLUMN stock_managers.birthday   IS '出生年月，格式 YYYYMM';
COMMENT ON COLUMN stock_managers.begin_date IS '本次任职开始日期';
COMMENT ON COLUMN stock_managers.end_date   IS '本次任职结束日期，NULL 表示仍在任';
COMMENT ON COLUMN stock_managers.resume     IS '个人简历（较长文本）';
