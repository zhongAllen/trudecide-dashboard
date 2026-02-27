-- migrate_v6_currency.sql
-- 目的：为 indicator_meta 表新增 currency 字段（ISO 4217 三字母货币代码）
-- 执行时间：2026-02-27
-- 版本：v6
-- 说明：
--   - currency 字段记录该指标的计价货币，与 unit（数量级单位）配合使用
--   - 纯比率/增速/指数类指标（yoy/mom/qoq/rate/index）的 currency 留 NULL
--   - 货币金额类指标（level/flow）填写 ISO 4217 三字母代码

-- Step 1: 新增 currency 字段
ALTER TABLE indicator_meta
  ADD COLUMN IF NOT EXISTS currency CHAR(3) DEFAULT NULL;

COMMENT ON COLUMN indicator_meta.currency IS
  'ISO 4217 三字母货币代码（如 CNY/USD/EUR/JPY）。
   仅货币金额类指标（value_type=level 或 flow）填写；
   纯比率/增速/指数类指标留 NULL。';

-- Step 2: 更新 CN 地区货币金额类指标的 currency 值
-- 人民币计价指标（unit 含"亿元"或"亿"）
UPDATE indicator_meta SET currency = 'CNY' WHERE region = 'CN' AND id IN (
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

-- Step 3: 更新 US 地区指标的 currency 值
-- us_bond_10y 是利率类，currency = NULL（已是默认值，无需更新）
-- 如有 US GDP level 等指标，currency = 'USD'
-- 当前 US 只有 us_bond_10y，为利率类，保持 NULL

-- Step 4: 验证结果
SELECT
  id,
  name_cn,
  unit,
  currency,
  value_type,
  region
FROM indicator_meta
ORDER BY region, id;
