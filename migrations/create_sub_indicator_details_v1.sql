-- 钻取功能：子维度指标详情表
-- 存储每个宏观矩阵单元格点击后，在侧边抽屉中显示的详细子指标数据
CREATE TABLE IF NOT EXISTS macro_sub_indicator_details (
    id BIGSERIAL PRIMARY KEY, -- 唯一ID
    snapshot_month CHAR(6) NOT NULL, -- 快照月份 (YYYYMM)，关联 macro_wide_snapshot
    region TEXT NOT NULL, -- 国家/地区代码 (CN, US)
    dimension TEXT NOT NULL, -- 主维度 (宏观经济, 流动性, ...)
    timescale TEXT NOT NULL, -- 时间尺度 (short, mid, long)
    
    -- 子指标核心信息
    indicator_id TEXT NOT NULL, -- 子指标ID (pmi, cpi, ...)
    indicator_name TEXT, -- 子指标名称 (PMI采购经理指数, ...)
    
    -- 定量数据
    latest_value TEXT, -- 最新值 (格式灵活，如 50.3, '3.2%', '-1.5%')
    latest_period TEXT, -- 最新值对应的周期 (如 2026-02)
    trend TEXT, -- 近期趋势的定性描述 (回升, 下降, 持平, 走阔, 收窄)
    
    -- 定性结论
    qualitative_conclusion TEXT, -- 对该指标的综合定性分析结论
    
    -- 关联A股影响的解释
    ashare_impact_correlation TEXT, -- 与A股相关性 (positive, negative, neutral)
    ashare_impact_explanation TEXT, -- 影响机制的详细文字说明

    -- 指标解释 (Tooltip或抽屉中显示)
    professional_explanation TEXT, -- 专业解释
    layman_explanation TEXT, -- 通俗解释

    -- 版本与时间戳
    config_version INTEGER, -- 计算时所用的打分模型版本号
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- 复合唯一键，确保同一快照下每个子指标只有一条记录
    UNIQUE (snapshot_month, region, dimension, timescale, indicator_id)
);

-- 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_sub_indicator_details_query ON macro_sub_indicator_details (snapshot_month, region, dimension, timescale);
COMMENT ON TABLE macro_sub_indicator_details IS '宏观矩阵子维度指标钻取详情表';
COMMENT ON COLUMN macro_sub_indicator_details.qualitative_conclusion IS '对该指标的综合定性分析，是“定性结论”的核心字段';
COMMENT ON COLUMN macro_sub_indicator_details.latest_value IS '指标的最新“定量数据”';
