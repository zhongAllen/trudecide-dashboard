-- 采集目标管理台账 v2.1 (全覆盖) 更新 SQL
-- 更新时间: 2026-03-02

-- 1. 修正已有目标
UPDATE collect_target
SET
    target_value = 55057,
    target_logic = 
        CASE
            WHEN module = 'reports_eastmoney' THEN '东方财富研报接口 TotalCount 精确值（2026-03-02 重新核准）'
            ELSE target_logic
        END,
    version = 2
WHERE module = 'reports_eastmoney';

-- 2. 补录缺失目标 (14个模块)
INSERT INTO collect_target (module, version, target_logic, target_value, effective_from, note)
VALUES
    -- 股票市场
    ('stock_meta', 1, 'Tushare stock_basic 接口全量股票数', 5805, '2026-03-02', '基于 DB 现有数据量'),
    ('stock_daily', 1, 'Tushare daily 接口全量日线数据（5805只股票 * 约4年）', 5572800, '2026-03-02', '估算值 (5805 * 240 * 4)，DB当前仅73万条，严重欠采'),
    ('stock_fina_indicator', 1, 'Tushare fina_indicator 接口全量财务指标', 202535, '2026-03-02', '基于 DB 现有数据量'),
    ('stock_announcement', 1, 'Tushare announcement 接口全量公告', 605421, '2026-03-02', '基于 DB 现有数据量'),

    -- 指数与板块
    ('index_daily', 1, 'Tushare index_daily 接口全量指数日线', 2612158, '2026-03-02', '基于 DB 现有数据量'),
    ('sector_meta', 1, 'Tushare ths_index 接口全量板块元数据', 2230, '2026-03-02', '基于 DB 现有数据量'),
    ('sector_daily', 1, 'Tushare ths_daily 接口全量板块日线', 1283106, '2026-03-02', '基于 DB 现有数据量'),
    ('sector_stock_map', 1, 'Tushare ths_member 接口全量板块成分股', 334256, '2026-03-02', '基于 DB 现有数据量'),

    -- 宏观指标
    ('macro_indicator_meta', 1, '各宏观数据源指标定义元数据', 754, '2026-03-02', '基于 DB 现有数据量'),
    ('macro_indicator_values', 1, '754个宏观指标 * 约20年 * 12个月', 180960, '2026-03-02', '估算值 (754 * 20 * 12)，DB当前仅1000条，严重欠采'),

    -- 另类数据
    ('news', 1, '9大来源新闻快讯（金十/财联社等）', 220265, '2026-03-02', '基于 DB 现有数据量'),
    ('cctv_news', 1, 'CCTV 新闻联播文字稿', 797, '2026-03-02', '基于 DB 现有数据量')

ON CONFLICT (module, version) DO NOTHING;
