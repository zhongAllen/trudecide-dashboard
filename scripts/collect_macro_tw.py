#!/usr/bin/env python3
"""
collect_macro_tw.py
台湾宏观指标数据采集脚本

【状态】：待实现（REQ-026）
【背景】：
  v1.3.0 版本错误引入了 tw_tsmc_price（台积电股价）和 tw_taiex_etf（0050 ETF）
  等个股/ETF 层面数据，不符合宏观指标体系设计，已通过
  cleanup_tw_wrong_indicators.sql 全部清除。

【REQ-026 规划】：
  数据源：台湾行政院主计总处开放 API 或 IMF DataMapper API（年度数据兜底）
  指标范围（对齐其他国家/地区命名规范）：
    - tw_cpi_yoy          台湾 CPI 同比
    - tw_gdp_yoy          台湾 GDP 实际增速（同比）
    - tw_unemployment_rate 台湾失业率

  indicator_id 命名规范：{region_prefix}_{统一指标名}
  例：tw_cpi_yoy，与 us_cpi_yoy、cn_cpi_yoy 保持一致

【禁止引入的数据】：
  - 个股股价（如台积电 2330.TW）→ 属于 stock_daily 表，不属于 indicator_meta
  - ETF 价格（如 0050.TW）→ 同上
  - 股票指数（如台湾加权指数 ^TWII）→ 属于市场行情，不属于宏观指标体系

【实现时参考】：
  - scripts/collect_macro_global.py（多国宏观采集模式）
  - scripts/collect_macro_cn.py（国内宏观采集模式）
  - 数据模型文档：knowledge_docs['data-model-v8']
  - 数据采集需求文档：knowledge_docs['data-collection-v3']
"""

raise NotImplementedError(
    "collect_macro_tw.py 尚未实现。\n"
    "请先完成 REQ-026：台湾宏观数据采集（主计总处 API，符合宏观指标体系）。\n"
    "参考 collect_macro_global.py 的实现模式。"
)
