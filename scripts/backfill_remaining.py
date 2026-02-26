#!/usr/bin/env python3
"""
backfill_remaining.py - 宏观指标历史数据全量回填脚本（第二批）

核心设计：
1.  **目标驱动**：脚本围绕 `indicator_meta` 中定义的指标 ID 进行采集，而不是写死采集逻辑。
2.  **模块化采集**：每个指标或一组相关指标是一个独立的 `collect_*` 函数，清晰、可单独测试。
3.  **数据源适配**：针对不同数据源（AKShare、国家统计局、商务部）的特性（如SSL版本、API格式）编写了专门的适配逻辑。
4.  **健壮性**：统一的 `make_row` 和 `upsert_rows` 函数处理了数据清洗、格式化、分批写入和重试逻辑。

踩坑记录 (WHY):
-   **[坑] DR001/DR007 接口缺失**
    -   **现象**: AKShare 中没有直接名为 `dr001` 或 `dr007` 的接口。
    -   **原因**: DR（存款类机构间质押式回购）与 FR（银行间质押式回购）高度相关，但并非同一指标。AKShare 提供了 `repo_rate_hist` 接口，可以获取 FR 数据。
    -   **解决方案**: **用 FR001/FR007 数据作为 DR001/DR007 的近似替代**。这是一个业务决策，因为两者走势高度趋同，对于宏观分析足够。脚本中明确记录了此替代关系。

-   **[坑] 国家统计局 SSL 握手失败**
    -   **现象**: `ak.macro_china_urban_unemployment()` 报 SSL 错误。
    -   **原因**: 与商务部接口类似，`data.stats.gov.cn` 服务器的 TLS 配置与沙箱环境不兼容。
    -   **解决方案**: 绕过 AKShare，直接请求国家统计局的**公开 JSON API** (`/easyquery.htm`)，并手动构造请求参数。这种方式比改全局 SSL 配置更安全、更精确。

-   **[坑] GDP 季比数据缺失**
    -   **现象**: `ak.macro_china_gdp()` 只提供**累计同比**，不提供单季度环比（QoQ）。
    -   **原因**: 这是数据源（国家统计局）的发布口径。
    -   **解决方案**: **从累计绝对值数据中反算单季度绝对值，再计算环比**。例如，Q2单季 = (Q1+Q2累计) - Q1累计。这会引入少量误差，但在无法获取原始数据的情况下是最佳实践。

-   **[坑] 北向资金接口分页问题**
    -   **现象**: `ak.stock_hsgt_hist_em()` 默认只返回少量数据。
    -   **原因**: 东方财富的这个接口需要分页加载。
    -   **解决方案**: AKShare 内部已处理分页，只需调用一次即可获取全部历史数据，但**耗时较长**，需要有耐心。
"""

import os, sys, time, re, calendar, requests, pandas as pd, akshare as ak, urllib3, ssl, json

# ── 配置 ─────────────────────────────────────────────────────
SUPABASE_URL = "https://ozwgqdcqtkdprvhuacjk.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96d2dxZGNxdGtkcHJ2aHVhY2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyMjk4MCwiZXhwIjoyMDg0OTk4OTgwfQ.ZhG6Pqh3czUbiVRiuzEBWvJBbgHdwTYNPqZgzAAuOUM"
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}
DRY_RUN = "--dry-run" in sys.argv
urllib3.disable_warnings()

# ── 工具函数 ──────────────────────────────────────────────────
# ... (此处省略与 backfill_all.py 相同的工具函数: quarter_to_date, month_to_date, make_row, upsert_rows)

# ── 各指标采集函数 ────────────────────────────────────────────

def collect_social_finance():
    """社融增量 - 数据源: 商务部 (data.mofcom.gov.cn)
    - **WHY**: AKShare 原接口 `macro_china_shrzgm` 因目标服务器 TLS 版本过低导致 SSL 握手失败。
    - **HOW**: 绕过 AKShare，通过自定义 `TLSAdapter` 降级 SSL 安全级别直接请求 API。
    """
    # ... (采集逻辑)

def collect_unemployment_rate():
    """城镇调查失业率 - 数据源: 国家统计局 (data.stats.gov.cn)
    - **WHY**: AKShare 接口 `macro_china_urban_unemployment` 同样遭遇 SSL 握手失败。
    - **HOW**: 浏览器抓包分析，直接请求国家统计局的 JSONP 接口 (`/easyquery.htm`)，构造参数获取数据。
    """
    # ... (采集逻辑)

def collect_gdp_qoq():
    """GDP 季比 - 数据源: 从累计值计算
    - **WHY**: AKShare `macro_china_gdp` 只提供累计同比，无单季环比。
    - **HOW**: 先获取 `gdp_level`（累计绝对值），再通过 `Q2_level = (Q1+Q2)_level - Q1_level` 反算出单季绝对值，最后计算环比。
    """
    # ... (计算逻辑)

def collect_dr_rate():
    """DR001/DR007 - 数据源: AKShare `repo_rate_hist` (用 FR001/FR007 替代)
    - **WHY**: AKShare 无直接 DR 利率接口。
    - **HOW**: 使用走势高度相关的银行间质押式回购利率（FR）作为替代。这是一个业务决策。
    """
    # ... (采集逻辑)

# ... (其他指标采集函数: all_a_pb, hs300_pb 等)

# ── 主流程 ──────────────────────────────────────────────────
if __name__ == "__main__":
    # ... (调用所有 collect_* 函数)
