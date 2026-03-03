-- REQ-160: 创建 stock_company_info 表，存储上市公司基本信息
-- Tushare 接口: stock_company（积分要求：120分）
-- 数据特点：静态数据，全量采集一次，定期更新即可
-- 更新策略：TRUNCATE + INSERT（全量覆盖）

CREATE TABLE IF NOT EXISTS stock_company_info (
    ts_code         TEXT        NOT NULL,   -- TS股票代码（PK）
    com_name        TEXT,                   -- 公司全称
    com_id          TEXT,                   -- 统一社会信用代码
    exchange        TEXT,                   -- 交易所代码（SSE/SZSE/BSE）
    chairman        TEXT,                   -- 法人代表
    manager         TEXT,                   -- 总经理
    secretary       TEXT,                   -- 董秘
    reg_capital     NUMERIC,                -- 注册资本（万元）
    setup_date      DATE,                   -- 注册日期
    province        TEXT,                   -- 所在省份
    city            TEXT,                   -- 所在城市
    introduction    TEXT,                   -- 公司介绍
    website         TEXT,                   -- 公司主页
    email           TEXT,                   -- 电子邮件
    office          TEXT,                   -- 办公室地址
    employees       INTEGER,                -- 员工人数
    main_business   TEXT,                   -- 主要业务及产品
    business_scope  TEXT,                   -- 经营范围
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (ts_code)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_stock_company_info_exchange ON stock_company_info(exchange);
CREATE INDEX IF NOT EXISTS idx_stock_company_info_province ON stock_company_info(province);

-- 表注释
COMMENT ON TABLE  stock_company_info IS '上市公司基本信息 (REQ-160)，来源：Tushare stock_company 接口';
COMMENT ON COLUMN stock_company_info.ts_code       IS 'TS股票代码，主键';
COMMENT ON COLUMN stock_company_info.com_name      IS '公司全称';
COMMENT ON COLUMN stock_company_info.com_id        IS '统一社会信用代码';
COMMENT ON COLUMN stock_company_info.exchange      IS '交易所代码：SSE上交所 SZSE深交所 BSE北交所';
COMMENT ON COLUMN stock_company_info.chairman      IS '法人代表（董事长）';
COMMENT ON COLUMN stock_company_info.manager       IS '总经理（CEO）';
COMMENT ON COLUMN stock_company_info.secretary     IS '董秘';
COMMENT ON COLUMN stock_company_info.reg_capital   IS '注册资本，单位：万元';
COMMENT ON COLUMN stock_company_info.setup_date    IS '公司注册日期';
COMMENT ON COLUMN stock_company_info.province      IS '注册所在省份';
COMMENT ON COLUMN stock_company_info.city          IS '注册所在城市';
COMMENT ON COLUMN stock_company_info.introduction  IS '公司简介（较短）';
COMMENT ON COLUMN stock_company_info.website       IS '公司官网 URL';
COMMENT ON COLUMN stock_company_info.email         IS '投资者关系邮箱';
COMMENT ON COLUMN stock_company_info.employees     IS '员工人数（人）';
COMMENT ON COLUMN stock_company_info.main_business IS '主要业务及产品描述';
COMMENT ON COLUMN stock_company_info.business_scope IS '经营范围（较长）';
