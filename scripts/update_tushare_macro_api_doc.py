import os
import sys
import datetime
sys.path.insert(0, '/home/ubuntu/stock-dashboard')

from supabase import create_client

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# 读取现有内容
res = sb.table('knowledge_docs').select('content').eq('id', 'tushare-macro-api').execute()
existing_content = res.data[0]['content']

# 替换"待收录接口"表格，追加 new_loans 和 fai_yoy 的接口说明
# 先在末尾追加新章节
append_content = """

---

## 6. AKShare 宏观数据接口（CN 补充）

部分 CN 宏观指标 Tushare 不支持，改用 AKShare 接口采集。

### 6.1 新增人民币贷款（new_loans）

- **接口名**: `macro_china_new_financial_credit`
- **来源**: AKShare（金融数据）
- **描述**: 中国新增金融机构贷款（人民币贷款新增），月度数据
- **时间范围**: 2008-01 至今（约 200+ 行）
- **indicator_id**: `new_loans`
- **单位**: 亿元

> **注意（踩坑 #N）**: 原接口 `macro_rmb_loan` 只返回近 30 个月数据（约 2023-08 起），无法获取历史数据。必须改用 `macro_china_new_financial_credit` 接口，该接口可返回 2008-01 至今完整数据。

**调用示例**:
```python
import akshare as ak
df = ak.macro_china_new_financial_credit()
# 字段：月份, 当月, 同比增长, 环比增长
# 取"当月"字段作为 new_loans 值，单位：亿元
```

**字段映射**:
| indicator_id | AKShare 字段 | 说明 |
|---|---|---|
| `new_loans` | `当月` | 当月新增人民币贷款（亿元） |

---

### 6.2 固定资产投资同比（fai_yoy）

- **接口名**: `macro_china_gdzctz`
- **来源**: AKShare（国家统计局）
- **描述**: 中国城镇固定资产投资同比增速，月度数据
- **时间范围**: 2008-03 至今（约 180+ 行）
- **indicator_id**: `fai_yoy`
- **单位**: %

> **注意**: 原接口 `macro_china_fixed_asset_investment` 已失效或数据不完整，改用 `macro_china_gdzctz`。

**调用示例**:
```python
import akshare as ak
df = ak.macro_china_gdzctz()
# 字段：日期, 同比增长, 环比增长
# 取"同比增长"字段作为 fai_yoy 值
```

**字段映射**:
| indicator_id | AKShare 字段 | 说明 |
|---|---|---|
| `fai_yoy` | `同比增长` | 固定资产投资同比（%） |

---

## 7. 接口状态汇总（截至 2026-03-02）

| 指标 | 接口 | 来源 | 状态 | 数据库行数 | 最新日期 |
|---|---|---|---|---|---|
| `cpi_yoy` / `cpi_mom` | `cn_cpi` | Tushare | ✅ 正常 | ~280行 | 2025-12 |
| `ppi_yoy` | `cn_ppi` | Tushare | ✅ 正常 | ~280行 | 2025-12 |
| `pmi_mfg` / `pmi_non_mfg` | `cn_pmi` | Tushare | ✅ 正常（列名大写） | ~248行 | 2025-12 |
| `m2_yoy` / `m2_level` | `cn_m` | Tushare | ✅ 正常 | ~217行 | 2025-12 |
| `social_finance` | `sf_month` | Tushare | ✅ 正常 | 420行 | 2025-12 |
| `new_loans` | `macro_china_new_financial_credit` | AKShare | ✅ 正常（换接口后） | 247行 | 2025-12 |
| `fai_yoy` | `macro_china_gdzctz` | AKShare | ✅ 正常（换接口后） | 180行 | 2025-12 |
| `export_yoy` / `import_yoy` | jin10 接口 | AKShare | ✅ 正常（TLS 已修复） | ~512行 | 2025-12 |
| `social_finance_new` | - | - | ❌ 已废弃（与 social_finance 重复） | 0行 | - |
"""

new_content = existing_content + append_content

# 同时更新"待收录接口"表格，将 new_loans 和 fai_yoy 标记为已解决
new_content = new_content.replace(
    '| 社会融资规模 | `cn_sf` | ⏳ 待用户提供文档 |',
    '| 社会融资规模（存量同比） | `sf_month` (Tushare) | ✅ 已收录，最新 202512，420行 |'
)

res = sb.table('knowledge_docs').update({
    'content': new_content,
    'updated_at': datetime.datetime.utcnow().isoformat()
}).eq('id', 'tushare-macro-api').execute()

print('更新成功，影响行数:', len(res.data))
if res.data:
    print('文档 id:', res.data[0]['id'])
    print('新文档总长度:', len(new_content))
