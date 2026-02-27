-- ============================================================
-- migrate_v7_scale.sql
-- 目的：为 indicator_meta 表新增 scale 字段（SDMX UNIT_MULT）
-- 执行人：用户（Sean / Allen）
-- 执行环境：Supabase Dashboard → SQL Editor
-- ============================================================

-- Step 1: 新增 scale 字段
-- scale 遵循 SDMX UNIT_MULT 标准，存储 10 的幂次
-- 例：scale=8 表示数值单位为"亿"，真实值 = value × 10^8
ALTER TABLE indicator_meta
  ADD COLUMN IF NOT EXISTS scale SMALLINT DEFAULT NULL;

COMMENT ON COLUMN indicator_meta.scale IS
  'SDMX UNIT_MULT 标准，10 的幂次。
   真实值 = value × (10^scale)。
   示例：scale=8 (亿), scale=9 (十亿/Billion), scale=6 (百万/Million)。
   仅货币金额类指标（value_type=level 或 flow）填写；
   比率/增速/指数/利率类指标留 NULL。';

-- Step 2: 为 CN 地区货币金额类指标填充 scale 值
-- 所有以"亿元"为单位的指标，scale = 8（即 × 10^8 = 真实元数）
UPDATE indicator_meta
SET scale = 8
WHERE region = 'CN'
  AND id IN (
    'gdp_level',
    'gdp_primary',
    'gdp_secondary',
    'gdp_tertiary',
    'm2_level',
    'margin_balance_sh',
    'margin_balance_sz',
    'new_loans',
    'north_net_flow',
    'social_finance',
    'social_finance_new'
  );

-- Step 3: 验证结果
-- 检查 CN 地区所有指标的 unit / currency / scale 字段
SELECT
  id,
  name_cn,
  unit,
  currency,
  scale,
  value_type
FROM indicator_meta
WHERE region = 'CN'
ORDER BY id;
