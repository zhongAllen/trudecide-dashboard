-- REQ-068 修复：collect_log.status CHECK 约束补充 running 状态
-- 执行时机：在 collect_reports_eastmoney_v2.py 首次运行前执行
-- 原因：log_start() 写入初始状态为 'running'，原约束未包含此值
--
-- 执行方式：在 Supabase SQL Editor 中粘贴并运行

-- 1. 删除旧约束
ALTER TABLE collect_log
    DROP CONSTRAINT IF EXISTS chk_collect_log_status;

-- 2. 添加新约束（含 running）
ALTER TABLE collect_log
    ADD CONSTRAINT chk_collect_log_status
    CHECK (status IN ('running', 'complete', 'partial', 'failed'));

-- 验证
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'chk_collect_log_status';
