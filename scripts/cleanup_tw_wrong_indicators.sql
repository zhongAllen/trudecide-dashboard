-- ============================================================
-- 清理脚本：删除错误引入的 TW 个股/ETF 指标数据
-- 背景：tw_tsmc_price（台积电股价）和 tw_taiex_etf（0050 ETF）
--       属于个股/ETF 层面，不属于宏观指标体系，需全部清除。
--       tw_taiex（台湾加权指数）和 tw_twd_usd（台币/美元汇率）
--       同样在本次一并清除，等待后续按规范重新接入台湾宏观数据。
-- 执行方式：在 Supabase Dashboard → SQL Editor 中粘贴执行
-- 执行顺序：必须先删 indicator_values（子表），再删 indicator_meta（主表）
-- ============================================================

-- Step 1: 删除所有 TW 指标的时序数据（indicator_values）
DELETE FROM indicator_values
WHERE region = 'TW';

-- Step 2: 删除所有 TW 指标的元数据（indicator_meta）
DELETE FROM indicator_meta
WHERE region = 'TW';

-- Step 3: 验证清理结果（执行后应返回 0 条）
SELECT 'indicator_values TW count' AS check_item, COUNT(*) AS remaining
FROM indicator_values WHERE region = 'TW'
UNION ALL
SELECT 'indicator_meta TW count' AS check_item, COUNT(*) AS remaining
FROM indicator_meta WHERE region = 'TW';
