-- 宏观宽表月度快照
CREATE TABLE IF NOT EXISTS macro_wide_snapshot (
    snapshot_month CHAR(6) NOT NULL, -- 快照月份 (YYYYMM)
    region TEXT NOT NULL, -- 国家/地区代码 (如 CN, US)
    dimension TEXT NOT NULL, -- 四大维度之一
    timescale TEXT NOT NULL, -- 三时间维度之一 (short/mid/long)
    status TEXT, -- 五状态词之一
    score INTEGER, -- 强度分 (0-100)
    alert_flag BOOLEAN DEFAULT FALSE, -- 是否触发异常
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (snapshot_month, region, dimension, timescale)
);

-- 宏观打分配置表
CREATE TABLE IF NOT EXISTS macro_scoring_config (
    version INTEGER NOT NULL, -- 版本号
    indicator_id TEXT NOT NULL, -- 指标 ID
    dimension TEXT, -- 所属维度
    weight REAL, -- 在维度内的权重
    logic_short JSONB, -- 短期信号计算逻辑
    logic_mid JSONB, -- 中期信号计算逻辑
    logic_long JSONB, -- 长期信号计算逻辑
    is_active BOOLEAN DEFAULT FALSE, -- 是否为当前生效版本
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (version, indicator_id)
);

-- 时序数据表 (如果不存在)
CREATE TABLE IF NOT EXISTS macro_timeseries (
    ts_code TEXT NOT NULL,
    period TEXT NOT NULL,
    value REAL,
    region TEXT,
    PRIMARY KEY (ts_code, period)
);

-- 为相关字段创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_macro_snapshot_region_month ON macro_wide_snapshot (region, snapshot_month);
CREATE INDEX IF NOT EXISTS idx_macro_scoring_config_active ON macro_scoring_config (is_active);
CREATE INDEX IF NOT EXISTS idx_macro_timeseries_region_ts_code ON macro_timeseries (region, ts_code);
