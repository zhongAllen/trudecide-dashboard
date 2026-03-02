import os
import sys
import datetime
sys.path.insert(0, '/home/ubuntu/stock-dashboard')

from supabase import create_client

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# 读取现有内容
res = sb.table('knowledge_docs').select('content').eq('id', 'data-model-v8').execute()
existing_content = res.data[0]['content']

# 追加 v16.0 变更日志
append_content = """
---

### v16.0 变更日志（2026-03-02）

**北向资金策略决策（REQ-119）**：
- `north_net_flow`：标记为 `deprecated`（credibility = deprecated），`indicator_values` 中全部数据已清空（2,264 行已删除）
- `north_daily_turnover`：数据范围收窄为 **2024-08-19 至今**（2024-08-19 前的 2,299 行已删除）
- `north_turnover_ratio_daily`：同上，数据范围收窄为 **2024-08-19 至今**
- 决策原因：2024-08-19 前的净买入数据与新制度下的成交额数据口径不可比，不应拼接使用

**指标废弃（REQ-120）**：
- `social_finance_new`：标记为 `deprecated`，与 `social_finance` 完全重复，132 行数据已删除

**数据补采（REQ-121/123）**：
- `new_loans`：接口从 `AKShare macro_rmb_loan`（只有近 30 月）改为 `macro_china_new_financial_credit`（2008-01 至今），数据从 60 行扩充至 247 行
- `fai_yoy`：接口改为 `AKShare macro_china_gdzctz`，数据从缺失扩充至 180 行（2008-03 至今）
- `social_finance`：从 Tushare `sf_month` 补采历史数据，从 132 行扩充至 420 行（2002-01 至今）
- `social_finance_yoy`：修复错误数据（原来存的是存量绝对值而非同比），重新用 `sf_month.stk_endval` 计算存量同比，最新值 2025-12 = 8.27%
- `trade_balance`：新增 CN 数据，补采 531 行（1981-02 ~ 2025-08）
- `gdp_per_capita`：新增 CN 数据，补采 60 行（1965 ~ 2024，最新 13,303 美元）
- `fx_usd`、`savings_rate`、`agri_value_added_pct`、`policy_rate`：World Bank 2024 年数据已发布，全部更新至 2024-12-31
"""

new_content = existing_content + append_content

res = sb.table('knowledge_docs').update({
    'content': new_content,
    'updated_at': datetime.datetime.utcnow().isoformat()
}).eq('id', 'data-model-v8').execute()

print('更新成功，影响行数:', len(res.data))
if res.data:
    print('文档 id:', res.data[0]['id'])
    print('新文档总长度:', len(new_content))
