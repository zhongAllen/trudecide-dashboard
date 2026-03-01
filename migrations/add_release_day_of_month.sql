-- ============================================================
-- Migration: 为 indicator_meta 添加 release_day_of_month 字段
-- 目的: 解决数据质量检查 timeliness_stale 误报问题
--       区分「数据源未发布」和「采集失败」两种情况
-- 执行位置: Supabase Dashboard → SQL Editor
-- 日期: 2026-02-28
-- ============================================================

-- ── Step 1: 添加字段 ──────────────────────────────────────────
-- release_day_of_month: 月度指标的常规发布日（1-31）
-- 含义：每月几号发布该指标的上月数据
-- NULL 表示：非月度指标，或发布日不固定
ALTER TABLE indicator_meta
ADD COLUMN IF NOT EXISTS release_day_of_month INTEGER
    CHECK (release_day_of_month BETWEEN 1 AND 31);

COMMENT ON COLUMN indicator_meta.release_day_of_month IS
'月度指标的常规发布日（1-31）。例如 CPI 每月10号发布，填10；PMI 每月最后一天发布，填31。NULL 表示非月度指标或发布日不固定。用于数据质量检查中区分「数据源未发布」和「采集失败」两种情况。';

-- ── Step 2: 填充 CN 月度指标的发布日 ─────────────────────────
-- 数据来源：国家统计局、人民银行官方历史发布规律

-- CPI / PPI：国家统计局通常在每月 9-10 日发布
UPDATE indicator_meta
SET release_day_of_month = 10
WHERE region = 'CN'
  AND id IN ('cpi_yoy', 'cpi_mom', 'ppi_yoy');

-- PMI 制造业 / 非制造业：国家统计局通常在每月最后一天发布
UPDATE indicator_meta
SET release_day_of_month = 31
WHERE region = 'CN'
  AND id IN ('pmi_mfg', 'pmi_non_mfg');

-- M2 / 信贷 / 社融：人民银行通常在每月 10-15 日发布
UPDATE indicator_meta
SET release_day_of_month = 15
WHERE region = 'CN'
  AND id IN ('m2_yoy', 'm2_level', 'new_loans', 'social_finance', 'social_finance_yoy');

-- 进出口：海关总署通常在每月 7-10 日发布
UPDATE indicator_meta
SET release_day_of_month = 10
WHERE region = 'CN'
  AND id IN ('export_yoy', 'import_yoy', 'trade_balance');

-- 工业增加值 / 社会消费品零售 / 固定资产投资：国家统计局通常在每月 15-16 日发布
UPDATE indicator_meta
SET release_day_of_month = 16
WHERE region = 'CN'
  AND id IN ('industrial_yoy', 'retail_yoy', 'fai_yoy', 'industrial_profits_yoy');

-- 城镇调查失业率：通常随月度数据一并发布，约 20 日
UPDATE indicator_meta
SET release_day_of_month = 20
WHERE region = 'CN'
  AND id IN ('unemployment_rate');

-- ── Step 3: 验证结果 ──────────────────────────────────────────
SELECT
    id,
    name_cn,
    frequency,
    release_day_of_month,
    CASE
        WHEN release_day_of_month IS NULL AND frequency = 'monthly' THEN '⚠️ 月度指标但未配置发布日'
        WHEN release_day_of_month IS NOT NULL THEN '✅ 已配置'
        ELSE '— 非月度指标'
    END AS status
FROM indicator_meta
WHERE region = 'CN'
ORDER BY frequency, release_day_of_month NULLS LAST, id;
