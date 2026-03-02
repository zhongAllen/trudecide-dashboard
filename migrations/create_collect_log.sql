-- REQ-068：采集执行日志表（事实表）
-- 记录每次采集的实际结果，是所有采集行为的唯一事实来源
-- 版本: v1.0 (2026-03-02)

CREATE TABLE IF NOT EXISTS collect_log (
    id              BIGSERIAL PRIMARY KEY,
    module          TEXT        NOT NULL,           -- 采集模块名，与 collect_target.module 对应
    run_date        DATE        NOT NULL,           -- 本次采集的业务日期
    target_version  INTEGER     NOT NULL,           -- 使用的目标版本（对应 collect_target.version）
    target_count    BIGINT,                         -- 本次目标量（快照，避免目标变更影响历史记录）
    actual_count    BIGINT,                         -- 实际写入量（脚本统计）
    completion_rate NUMERIC(5,4),                   -- 完成度（actual_count / target_count），如 0.9985 = 99.85%
    status          TEXT        NOT NULL,           -- 完成状态：complete / partial / failed
    error_msg       TEXT,                           -- 错误信息（status = failed 时填写）
    started_at      TIMESTAMPTZ,                    -- 采集开始时间
    finished_at     TIMESTAMPTZ,                    -- 采集结束时间
    repaired_at     TIMESTAMPTZ,                    -- 补采完成时间（NULL 表示未修复）
    note            TEXT,                           -- 人工备注（如：节假日无数据属正常）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 唯一约束：每个模块每天只有一条记录（UPSERT 策略）
ALTER TABLE collect_log
    ADD CONSTRAINT uq_collect_log_module_date UNIQUE (module, run_date);

-- 索引：按模块+日期快速查询
CREATE INDEX IF NOT EXISTS idx_collect_log_module_date
    ON collect_log (module, run_date DESC);

-- 索引：按状态过滤异常
CREATE INDEX IF NOT EXISTS idx_collect_log_status
    ON collect_log (status, run_date DESC)
    WHERE status IN ('partial', 'failed');

-- 状态值约束
ALTER TABLE collect_log
    ADD CONSTRAINT chk_collect_log_status
    CHECK (status IN ('complete', 'partial', 'failed'));

-- 注释
COMMENT ON TABLE collect_log IS 'REQ-068 采集执行日志表：记录每次采集的实际结果，是所有采集行为的唯一事实来源';
COMMENT ON COLUMN collect_log.module IS '采集模块名，与 collect_target.module 对应';
COMMENT ON COLUMN collect_log.run_date IS '本次采集的业务日期';
COMMENT ON COLUMN collect_log.target_version IS '使用的目标版本，对应 collect_target.version';
COMMENT ON COLUMN collect_log.target_count IS '本次目标量快照，避免目标变更影响历史记录';
COMMENT ON COLUMN collect_log.actual_count IS '实际写入量，由采集脚本统计后写入';
COMMENT ON COLUMN collect_log.completion_rate IS '完成度 = actual_count / target_count，如 0.9985 表示 99.85%';
COMMENT ON COLUMN collect_log.status IS '完成状态：complete(>=99%) / partial(1%~99%) / failed(0%或异常)';
COMMENT ON COLUMN collect_log.error_msg IS '错误信息，status=failed 时填写';
COMMENT ON COLUMN collect_log.repaired_at IS '补采完成时间，NULL 表示未修复';
COMMENT ON COLUMN collect_log.note IS '人工备注，如：节假日无数据属正常';
