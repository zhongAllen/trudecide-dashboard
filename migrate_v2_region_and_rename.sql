-- ============================================================
-- 数据库迁移 v2（修正版）：indicator_id 规范化 + indicator_values 加 region
-- 修正：先建 indicator_meta 新记录，再更新 indicator_values，最后删旧记录
-- 在 Supabase Dashboard > SQL Editor 中一次性执行
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- STEP 1: indicator_meta 先插入新 ID 记录（复制旧记录内容）
--         必须在更新 indicator_values 之前完成，否则外键报错
-- ══════════════════════════════════════════════════════════════
INSERT INTO indicator_meta (id, name_cn, description_cn, category, unit, source_name, source_url, credibility, frequency, value_type, region)
SELECT
  CASE id
    WHEN 'cn_gdp_yoy'        THEN 'gdp_yoy'
    WHEN 'cn_cpi_yoy'        THEN 'cpi_yoy'
    WHEN 'cn_ppi_yoy'        THEN 'ppi_yoy'
    WHEN 'cn_pmi_mfg'        THEN 'pmi_mfg'
    WHEN 'cn_pmi_service'    THEN 'pmi_non_mfg'
    WHEN 'cn_m2_yoy'         THEN 'm2_yoy'
    WHEN 'cn_social_finance' THEN 'social_finance_new'
    WHEN 'cn_new_loans'      THEN 'new_loans'
    WHEN 'cn_export_yoy'     THEN 'export_yoy'
    WHEN 'cn_import_yoy'     THEN 'import_yoy'
    WHEN 'cn_industrial_yoy' THEN 'industrial_yoy'
    WHEN 'cn_retail_yoy'     THEN 'retail_yoy'
    WHEN 'cn_fai_yoy'        THEN 'fai_yoy'
    WHEN 'cn_lpr_1y'         THEN 'lpr_1y'
  END AS id,
  name_cn, description_cn, category, unit, source_name, source_url, credibility, frequency, value_type, region
FROM indicator_meta
WHERE id IN (
  'cn_gdp_yoy','cn_cpi_yoy','cn_ppi_yoy','cn_pmi_mfg','cn_pmi_service',
  'cn_m2_yoy','cn_social_finance','cn_new_loans','cn_export_yoy','cn_import_yoy',
  'cn_industrial_yoy','cn_retail_yoy','cn_fai_yoy','cn_lpr_1y'
)
ON CONFLICT (id) DO UPDATE SET
  name_cn        = EXCLUDED.name_cn,
  description_cn = EXCLUDED.description_cn,
  unit           = EXCLUDED.unit,
  source_name    = EXCLUDED.source_name,
  frequency      = EXCLUDED.frequency,
  value_type     = EXCLUDED.value_type,
  region         = EXCLUDED.region;

-- ══════════════════════════════════════════════════════════════
-- STEP 2: indicator_values 加 region 字段（默认 CN）
-- ══════════════════════════════════════════════════════════════
ALTER TABLE indicator_values
  ADD COLUMN IF NOT EXISTS region CHAR(2) NOT NULL DEFAULT 'CN';

-- ══════════════════════════════════════════════════════════════
-- STEP 3: 删除旧主键约束
-- ══════════════════════════════════════════════════════════════
ALTER TABLE indicator_values
  DROP CONSTRAINT IF EXISTS indicator_values_pkey;

-- ══════════════════════════════════════════════════════════════
-- STEP 4: 重建主键（含 region）
-- ══════════════════════════════════════════════════════════════
ALTER TABLE indicator_values
  ADD PRIMARY KEY (indicator_id, trade_date, revision_seq, region);

-- ══════════════════════════════════════════════════════════════
-- STEP 5: indicator_values 中旧 ID 重命名（此时新 ID 已在 indicator_meta 中存在）
-- ══════════════════════════════════════════════════════════════
UPDATE indicator_values SET indicator_id = 'gdp_yoy'            WHERE indicator_id = 'cn_gdp_yoy';
UPDATE indicator_values SET indicator_id = 'cpi_yoy'            WHERE indicator_id = 'cn_cpi_yoy';
UPDATE indicator_values SET indicator_id = 'ppi_yoy'            WHERE indicator_id = 'cn_ppi_yoy';
UPDATE indicator_values SET indicator_id = 'pmi_mfg'            WHERE indicator_id = 'cn_pmi_mfg';
UPDATE indicator_values SET indicator_id = 'pmi_non_mfg'        WHERE indicator_id = 'cn_pmi_service';
UPDATE indicator_values SET indicator_id = 'm2_yoy'             WHERE indicator_id = 'cn_m2_yoy';
UPDATE indicator_values SET indicator_id = 'social_finance_new' WHERE indicator_id = 'cn_social_finance';
UPDATE indicator_values SET indicator_id = 'new_loans'          WHERE indicator_id = 'cn_new_loans';
UPDATE indicator_values SET indicator_id = 'export_yoy'         WHERE indicator_id = 'cn_export_yoy';
UPDATE indicator_values SET indicator_id = 'import_yoy'         WHERE indicator_id = 'cn_import_yoy';
UPDATE indicator_values SET indicator_id = 'industrial_yoy'     WHERE indicator_id = 'cn_industrial_yoy';
UPDATE indicator_values SET indicator_id = 'retail_yoy'         WHERE indicator_id = 'cn_retail_yoy';
UPDATE indicator_values SET indicator_id = 'fai_yoy'            WHERE indicator_id = 'cn_fai_yoy';
UPDATE indicator_values SET indicator_id = 'lpr_1y'             WHERE indicator_id = 'cn_lpr_1y';

-- ══════════════════════════════════════════════════════════════
-- STEP 6: 删除 indicator_meta 中旧的 cn_ 前缀记录
--         此时 indicator_values 中已无任何行引用这些旧 ID，可以安全删除
-- ══════════════════════════════════════════════════════════════
DELETE FROM indicator_meta WHERE id IN (
  'cn_gdp_yoy','cn_cpi_yoy','cn_ppi_yoy','cn_pmi_mfg','cn_pmi_service',
  'cn_m2_yoy','cn_social_finance','cn_new_loans','cn_export_yoy','cn_import_yoy',
  'cn_industrial_yoy','cn_retail_yoy','cn_fai_yoy','cn_lpr_1y'
);

-- ══════════════════════════════════════════════════════════════
-- STEP 7: 重建索引
-- ══════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_indicator_values_indicator_id;
DROP INDEX IF EXISTS idx_indicator_values_trade_date;
CREATE INDEX IF NOT EXISTS idx_indicator_values_indicator_region
  ON indicator_values (indicator_id, region, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_indicator_values_trade_date
  ON indicator_values (trade_date DESC);

COMMIT;

-- ══════════════════════════════════════════════════════════════
-- 验证结果
-- ══════════════════════════════════════════════════════════════
-- 1. indicator_meta 总数（应为 29）
SELECT COUNT(*) AS total_indicators FROM indicator_meta;

-- 2. 确认无 cn_ 前缀残留（应为 0）
SELECT COUNT(*) AS cn_prefix_remaining FROM indicator_meta WHERE id LIKE 'cn_%';

-- 3. indicator_values 各指标数据量（总计应仍为 5035 条）
SELECT indicator_id, region, COUNT(*) AS cnt
FROM indicator_values
GROUP BY indicator_id, region
ORDER BY indicator_id;
