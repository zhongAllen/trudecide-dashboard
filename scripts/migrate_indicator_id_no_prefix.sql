-- ============================================================
-- 迁移脚本：indicator_id 无前缀规范 - 历史数据修正
-- 背景：项目确立"indicator_id 禁止使用地区前缀"为第一性原理。
--       us_bond_10y (region=US) 和 cn_bond_10y (region=CN) 是历史遗留的
--       违规命名，需迁移为 bond_10y (region=US/CN)。
-- 执行方式：在 Supabase Dashboard → SQL Editor 中粘贴执行
-- 执行顺序：必须按顺序执行，不可跳步
-- 注意：indicator_meta 主键为 id (TEXT)，因此 bond_10y 只能有一条记录。
--       由于 US 和 CN 的 bond_10y 指标含义相同，只是 region 不同，
--       需要先确认主键约束是否为 (id, region) 复合主键或仅 id。
-- ============================================================

-- ============================================================
-- Step 1: 将 indicator_meta 中的旧 id 直接更新为新 id
--         （UPDATE 比 INSERT+DELETE 更安全，不会触发外键问题）
-- ============================================================

-- 1a. us_bond_10y → bond_10y (region=US)
UPDATE indicator_meta
SET id = 'bond_10y'
WHERE id = 'us_bond_10y' AND region = 'US';

-- 1b. cn_bond_10y → bond_10y (region=CN)
UPDATE indicator_meta
SET id = 'bond_10y'
WHERE id = 'cn_bond_10y' AND region = 'CN';

-- ============================================================
-- Step 2: 将 indicator_values 中的旧 indicator_id 同步更新
-- ============================================================

-- 2a. us_bond_10y → bond_10y
UPDATE indicator_values
SET indicator_id = 'bond_10y'
WHERE indicator_id = 'us_bond_10y';

-- 2b. cn_bond_10y → bond_10y
UPDATE indicator_values
SET indicator_id = 'bond_10y'
WHERE indicator_id = 'cn_bond_10y';

-- ============================================================
-- Step 3: 验证迁移结果
-- ============================================================

-- 验证新记录已存在（应返回 2 行：region=US 和 region=CN）
SELECT
    m.id,
    m.region,
    m.name_cn,
    COUNT(v.id) AS value_count
FROM indicator_meta m
LEFT JOIN indicator_values v ON v.indicator_id = m.id AND v.region = m.region
WHERE m.id = 'bond_10y'
GROUP BY m.id, m.region, m.name_cn
ORDER BY m.region;

-- 验证旧数据已清除（应返回 0 行）
SELECT id, region FROM indicator_meta WHERE id IN ('us_bond_10y', 'cn_bond_10y');

-- 验证 indicator_values 中旧数据已清除（应返回 0 行）
SELECT indicator_id, COUNT(*) FROM indicator_values
WHERE indicator_id IN ('us_bond_10y', 'cn_bond_10y')
GROUP BY indicator_id;
