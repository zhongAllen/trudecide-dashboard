-- REQ-072: 宏观宽表版本管理 - SQL迁移文件 v2
-- 功能: 为 macro_wide_snapshot 表增加 config_version 字段，用于关联打分配置的版本。

-- 1. 为 macro_wide_snapshot 表添加 config_version 列
ALTER TABLE macro_wide_snapshot
ADD COLUMN IF NOT EXISTS config_version INTEGER;

-- 2. (可选) 为新列添加注释，说明其用途
COMMENT ON COLUMN macro_wide_snapshot.config_version IS '关联的打分配置版本号 (macro_scoring_config.version)，用于追溯该条快照数据的计算逻辑';

-- 3. (可选) 如果需要，可以为新列创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_macro_snapshot_config_version ON macro_wide_snapshot (config_version);

-- 4. 为 macro_scoring_config 表增加 changelog 字段
ALTER TABLE macro_scoring_config
ADD COLUMN IF NOT EXISTS changelog TEXT;

-- 5. (可选) 为新列添加注释
COMMENT ON COLUMN macro_scoring_config.changelog IS '该版本配置的核心变更说明';

-- 迁移完成
