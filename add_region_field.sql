-- ============================================================
-- Trudecide 股票版 - 数据库变更脚本
-- 版本: v1.1  日期: 2026-02-26
-- 变更: 为 indicator_meta 表新增 region 字段（国家/地区）
-- 说明: 在 Supabase Dashboard > SQL Editor 中执行
-- ============================================================

-- Step 1: 新增 region 字段
-- 使用 ISO 3166-1 alpha-2 标准（CN/US/HK/TW/EU/JP 等）
-- DEFAULT 'CN' 确保存量数据不受影响
ALTER TABLE indicator_meta
ADD COLUMN IF NOT EXISTS region CHAR(2) NOT NULL DEFAULT 'CN';

-- Step 2: 为已有的14条种子数据明确标记 region = 'CN'（实际已是默认值，显式更新保证语义清晰）
UPDATE indicator_meta
SET region = 'CN'
WHERE region IS NULL OR region = 'CN';

-- Step 3: 为 region 字段添加索引（支持按国家筛选指标）
CREATE INDEX IF NOT EXISTS idx_indicator_meta_region ON indicator_meta (region);

-- Step 4: 添加注释说明（便于后续维护）
COMMENT ON COLUMN indicator_meta.region IS 'ISO 3166-1 alpha-2 国家/地区代码，如 CN/US/HK/TW/EU/JP/GLOBAL';

-- ============================================================
-- 验证变更结果
-- ============================================================
SELECT
  region,
  COUNT(*) AS indicator_count,
  STRING_AGG(name_cn, '、' ORDER BY id) AS indicators
FROM indicator_meta
GROUP BY region
ORDER BY region;
