-- ============================================================
-- 迁移脚本：indicator_id 无前缀规范 + 数据模型主键升级
-- 版本：v3（最终版，已在生产环境验证通过）
-- 执行日期：2026-02-27
-- 执行结果：成功
--
-- 本次迁移完成的工作：
--   1. indicator_values 唯一约束加入 region 字段
--   2. indicator_meta 主键从单字段 id 升级为复合主键 (id, region)
--   3. us_bond_10y / cn_bond_10y 迁移为 bond_10y (region=US/CN)
--
-- 【踩坑记录】（供后续参考）
--   坑1：先 UPDATE indicator_meta 会触发外键约束报错
--         → 必须先处理子表，再处理主表
--   坑2：先 UPDATE indicator_values 会因目标值不在主表而报错
--         → 必须先在主表 INSERT 新记录，再更新子表，最后删主表旧记录
--   坑3：indicator_values 唯一约束不含 region，导致 bond_10y 多地区数据冲突
--         → 需先升级唯一约束为 (indicator_id, region, trade_date, revision_seq)
--   坑4：indicator_meta 主键为单字段 id，导致同名指标无法存储多地区元数据
--         → 需升级为复合主键 (id, region)，并同步重建外键
--   坑5：DROP PRIMARY KEY 时报外键依赖错误
--         → 必须先 DROP 外键，再 DROP 主键，再 ADD 新主键，再重建外键
--   坑6：重建外键时，indicator_values 中已有数据引用了主表不存在的记录
--         → 必须先补充主表数据，再重建外键
-- ============================================================

-- ============================================================
-- Phase 1: 升级 indicator_values 唯一约束（加入 region）
-- ============================================================
ALTER TABLE indicator_values
DROP CONSTRAINT indicator_values_unique_key;

ALTER TABLE indicator_values
ADD CONSTRAINT indicator_values_unique_key
UNIQUE (indicator_id, region, trade_date, revision_seq);

-- ============================================================
-- Phase 2: 升级 indicator_meta 主键为复合主键 (id, region)
-- ============================================================

-- 2a. 先删外键（依赖主键索引）
ALTER TABLE indicator_values
DROP CONSTRAINT indicator_values_indicator_id_fkey;

-- 2b. 删旧主键
ALTER TABLE indicator_meta
DROP CONSTRAINT indicator_meta_pkey;

-- 2c. 建复合主键
ALTER TABLE indicator_meta
ADD PRIMARY KEY (id, region);

-- 2d. 补充 bond_10y (region=CN) 元数据（重建外键前必须存在）
INSERT INTO indicator_meta (id, region, name_cn, description_cn, category, frequency, unit, value_type, source_name, source_url, credibility)
VALUES (
    'bond_10y', 'CN',
    '中国10年期国债收益率',
    '中国10年期国债到期收益率，无风险利率基准',
    'macro', 'daily', '%', 'rate',
    'AKShare/东方财富', 'https://eastmoney.com', 'high'
) ON CONFLICT DO NOTHING;

-- 2e. 重建外键（引用复合主键）
ALTER TABLE indicator_values
ADD CONSTRAINT indicator_values_indicator_id_fkey
FOREIGN KEY (indicator_id, region)
REFERENCES indicator_meta (id, region)
ON DELETE CASCADE;

-- ============================================================
-- Phase 3: 迁移 us_bond_10y / cn_bond_10y → bond_10y
-- ============================================================

-- 3a. 主表插入新 id（复制旧记录）
INSERT INTO indicator_meta (id, region, name_cn, description_cn, category, frequency, unit, value_type, source_name, source_url, credibility)
SELECT 'bond_10y', region, name_cn, description_cn, category, frequency, unit, value_type, source_name, source_url, credibility
FROM indicator_meta WHERE id = 'us_bond_10y' AND region = 'US'
ON CONFLICT DO NOTHING;

-- 3b. 子表更新引用
UPDATE indicator_values SET indicator_id = 'bond_10y' WHERE indicator_id = 'us_bond_10y';
UPDATE indicator_values SET indicator_id = 'bond_10y' WHERE indicator_id = 'cn_bond_10y';

-- 3c. 删除主表旧记录
DELETE FROM indicator_meta WHERE id IN ('us_bond_10y', 'cn_bond_10y');

-- ============================================================
-- 验证（应返回 2 行：CN 和 US；第二个查询应返回 0 行）
-- ============================================================
SELECT id, region, name_cn FROM indicator_meta WHERE id = 'bond_10y' ORDER BY region;
SELECT id, region FROM indicator_meta WHERE id IN ('us_bond_10y', 'cn_bond_10y');
