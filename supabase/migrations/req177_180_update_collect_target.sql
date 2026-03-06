-- REQ-177~180: 更新collect_target注册
-- 注册所有新数据表的采集目标
-- 版本: v1.5.2

-- 指数数据模块 (REQ-177)
INSERT INTO collect_target (target_code, target_name, target_type, data_source, collection_status, is_active, version, description)
VALUES
('index_basic', '指数基本信息', 'index', 'tushare:index_basic', 'active', true, 1, '指数基础信息'),
('index_weekly', '指数周线行情', 'index', 'tushare:index_weekly', 'active', true, 1, '指数周K线'),
('index_monthly', '指数月线行情', 'index', 'tushare:index_monthly', 'active', true, 1, '指数月K线'),
('index_weight', '指数成分权重', 'index', 'tushare:index_weight', 'active', true, 1, '指数成分股权重'),
('index_dailybasic', '指数每日指标', 'index', 'tushare:index_dailybasic', 'active', true, 1, '指数估值指标')
ON CONFLICT (target_code) DO UPDATE SET
    target_name = EXCLUDED.target_name,
    collection_status = EXCLUDED.collection_status,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 行业数据模块 (REQ-178)
INSERT INTO collect_target (target_code, target_name, target_type, data_source, collection_status, is_active, version, description)
VALUES
('sw_industry', '申万行业数据', 'industry', 'tushare:index_classify,index_member,sw_daily', 'active', true, 1, '申万行业分类、成分、行情'),
('citic_industry', '中信行业数据', 'industry', 'tushare:index_classify,index_member,citic_daily', 'active', true, 1, '中信行业分类、成分、行情'),
('global_index', '国际主要指数', 'index', 'tushare:index_global', 'active', true, 1, '国际指数基础信息和行情')
ON CONFLICT (target_code) DO UPDATE SET
    target_name = EXCLUDED.target_name,
    collection_status = EXCLUDED.collection_status,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 市场统计模块 (REQ-179)
INSERT INTO collect_target (target_code, target_name, target_type, data_source, collection_status, is_active, version, description)
VALUES
('index_technical', '指数技术面因子', 'technical', 'tushare:index_technical', 'active', true, 1, '指数MA/MACD/KDJ/RSI/BOLL'),
('market_daily_info', '市场每日统计', 'market', 'tushare:daily_info', 'active', true, 1, '沪深市场每日交易统计'),
('sz_market_daily', '深圳市场统计', 'market', 'tushare:sz_daily_info', 'active', true, 1, '深圳市场分板块统计')
ON CONFLICT (target_code) DO UPDATE SET
    target_name = EXCLUDED.target_name,
    collection_status = EXCLUDED.collection_status,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 资金流向模块 (REQ-180)
INSERT INTO collect_target (target_code, target_name, target_type, data_source, collection_status, is_active, version, description)
VALUES
('moneyflow', '个股资金流向', 'moneyflow', 'tushare:moneyflow', 'active', true, 1, 'Tushare标准个股资金流向'),
('moneyflow_ths', '同花顺个股资金流向', 'moneyflow', 'tushare:moneyflow_ths', 'active', true, 1, '同花顺个股资金流向'),
('moneyflow_dc', '东方财富个股资金流向', 'moneyflow', 'tushare:moneyflow_dc', 'active', true, 1, '东方财富个股资金流向'),
('moneyflow_industry', '行业板块资金流向', 'moneyflow', 'tushare:moneyflow_industry_ths,moneyflow_industry_dc,moneyflow_market_dc', 'active', true, 1, '行业和大盘资金流向')
ON CONFLICT (target_code) DO UPDATE SET
    target_name = EXCLUDED.target_name,
    collection_status = EXCLUDED.collection_status,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 记录版本更新
COMMENT ON TABLE collect_target IS '数据采集目标表 - v1.5.2更新，新增REQ-177~180指数/行业/市场/资金模块';
