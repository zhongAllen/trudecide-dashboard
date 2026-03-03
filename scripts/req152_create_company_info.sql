-- REQ-152: 创建 stock_company_info 表，存储上市公司基本信息
-- Tushare 接口: stock_company

CREATE TABLE IF NOT EXISTS stock_company_info (
    ts_code TEXT PRIMARY KEY,
    exchange TEXT,
    chairman TEXT,
    manager TEXT,
    secretary TEXT,
    reg_capital NUMERIC,
    setup_date DATE,
    province TEXT,
    city TEXT,
    introduction TEXT,
    website TEXT,
    email TEXT,
    office TEXT,
    employees INTEGER,
    main_business TEXT,
    business_scope TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 创建唯一索引以支持 upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_company_info_ts_code ON stock_company_info(ts_code);

-- 添加备注
COMMENT ON TABLE stock_company_info IS '上市公司基本信息 (REQ-152)';
COMMENT ON COLUMN stock_company_info.ts_code IS 'TS股票代码';
COMMENT ON COLUMN stock_company_info.chairman IS '法人代表';
COMMENT ON COLUMN stock_company_info.manager IS '总经理';
COMMENT ON COLUMN stock_company_info.secretary IS '董秘';
COMMENT ON COLUMN stock_company_info.reg_capital IS '注册资本 (万元)';
COMMENT ON COLUMN stock_company_info.setup_date IS '成立日期';
COMMENT ON COLUMN stock_company_info.province IS '所在省份';
COMMENT ON COLUMN stock_company_info.introduction IS '公司介绍';
COMMENT ON COLUMN stock_company_info.website IS '公司主页';
COMMENT ON COLUMN stock_company_info.employees IS '员工人数';
COMMENT ON COLUMN stock_company_info.main_business IS '主要业务及产品';
COMMENT ON COLUMN stock_company_info.business_scope IS '经营范围';
