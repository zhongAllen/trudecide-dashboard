-- REQ-068：采集目标基准表（配置表）
-- 定义每个采集模块"应该采多少"的规则，是衡量完整性的基准
-- 版本: v1.0 (2026-03-02)

CREATE TABLE IF NOT EXISTS collect_target (
    id              BIGSERIAL PRIMARY KEY,
    module          TEXT        NOT NULL,           -- 采集模块名，如 reports_eastmoney
    version         INTEGER     NOT NULL DEFAULT 1, -- 目标版本号，从1开始递增
    target_logic    TEXT        NOT NULL,           -- 目标计算逻辑（自然语言描述）
    target_value    BIGINT,                         -- 静态目标量（与 target_sql 二选一）
    target_sql      TEXT,                           -- 动态目标量的查询 SQL（与 target_value 二选一）
    effective_from  DATE        NOT NULL,           -- 本版本生效日期
    effective_to    DATE,                           -- 本版本失效日期（NULL 表示当前有效）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    note            TEXT                            -- 备注（如：为何调整目标量）
);

-- 唯一约束：每个模块的每个版本唯一
ALTER TABLE collect_target
    ADD CONSTRAINT uq_collect_target_module_version UNIQUE (module, version);

-- 索引：按模块快速查询当前有效目标
CREATE INDEX IF NOT EXISTS idx_collect_target_module
    ON collect_target (module, effective_from DESC);

-- 注释
COMMENT ON TABLE collect_target IS 'REQ-068 采集目标基准表：定义每个采集模块的目标量和计算逻辑，支持版本管理';
COMMENT ON COLUMN collect_target.module IS '采集模块名，如 reports_eastmoney / broker_recommend / economic_events';
COMMENT ON COLUMN collect_target.version IS '目标版本号，从1开始递增，目标量变更时递增';
COMMENT ON COLUMN collect_target.target_logic IS '目标计算逻辑的自然语言描述，如"东方财富研报接口 TotalCount 快照"';
COMMENT ON COLUMN collect_target.target_value IS '静态目标量（固定数字），与 target_sql 二选一';
COMMENT ON COLUMN collect_target.target_sql IS '动态目标量的查询 SQL，与 target_value 二选一';
COMMENT ON COLUMN collect_target.effective_from IS '本版本生效日期';
COMMENT ON COLUMN collect_target.effective_to IS '本版本失效日期，NULL 表示当前有效';

-- 初始数据：首批模块目标配置
INSERT INTO collect_target (module, version, target_logic, target_value, effective_from, note)
VALUES
    ('reports_eastmoney', 1, '东方财富研报接口 TotalCount 快照（2026-03-02 首次采集后统计）', 55000, '2026-03-02', '首次配置，目标量来自东方财富 reportapi 接口返回的 TotalCount'),
    ('broker_recommend',  1, 'Tushare broker_recommend 接口全量数据（2026-03-02 首次采集后统计）', 8701, '2026-03-02', '首次配置，目标量来自 Tushare broker_recommend 全量接口'),
    ('economic_events',   1, 'Forex Factory 近 12 个月经济日历事件数（2026-03-02 首次采集后统计）', 114, '2026-03-02', '首次配置，目标量来自 Forex Factory 近 12 个月数据量')
ON CONFLICT (module, version) DO NOTHING;
