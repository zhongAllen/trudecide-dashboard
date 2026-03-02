import os
import sys
import datetime
sys.path.insert(0, '/home/ubuntu/stock-dashboard')

from supabase import create_client

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

new_content = """# REQ-039 北向资金核心指标重构
- **版本**: 4.0
- **状态**: 已完成
- **作者**: Manus AI
- **更新日期**: 2026-03-02

---

## 1. 变更背景

2024年8月19日，沪深港通交易信息披露机制发生重大调整，不再披露北向资金（外资买卖A股）的实时及日度净买入数据，改为每季度公布持仓快照 [1]。这一变化导致原有依赖日度净买入数据的 `north_net_flow` 指标在 2024-08-19 后彻底失效。

---

## 2. 最终策略决策（v4.0，2026-03-02 确认）

> **核心原则：只研究 2024-08-19 至今的北向资金数据，不追溯历史净买入。**

**决策依据**：
- 2024-08-19 前的净买入数据（`north_net_flow`）与 2024-08-19 后的成交额数据（`north_daily_turnover`）口径完全不同，强行拼接没有分析意义
- 历史净买入数据已从数据库删除，不再维护
- 研究范围统一锁定在新制度下的数据，保证口径一致性

**废弃指标**：
- `north_net_flow`：**已废弃**（indicator_meta 标记 deprecated，indicator_values 数据已清空）

**保留指标（仅 2024-08-19 至今）**：

| 指标 ID | 含义 | 数据源 | 频率 | 单位 |
|---------|------|--------|------|------|
| `north_daily_turnover` | 北向当日成交总额（hgt+sgt） | Tushare moneyflow_hsgt | 日度 | 亿元 |
| `north_turnover_ratio_daily` | 北向成交额占全A比例 | Tushare moneyflow_hsgt + index_daily | 日度 | % |

---

## 3. 指标详细定义

### 3.1 `north_daily_turnover` (北向当日成交总额)

- **计算方式**: `hgt` (沪股通成交额) + `sgt` (深股通成交额)
- **注意**：Tushare 返回的 hgt/sgt 列为 object（字符串）类型，必须用 `pd.to_numeric(errors='coerce')` 转换后再相加，不可直接用 `+` 运算符（否则执行字符串拼接而非数值相加）
- **数据源**: Tushare `moneyflow_hsgt`
- **频率**: 日度
- **单位**: 亿元
- **时间范围**: **2024-08-19 至今**

### 3.2 `north_turnover_ratio_daily` (北向成交额占全A比例-日度)

- **计算公式**: `当日北向成交总额 / 当日A股总成交额`
- **数据源**:
  - 北向成交额: Tushare `moneyflow_hsgt` (hgt+sgt)
  - A股总成交额: Tushare `index_daily` (上证+深证)
- **频率**: 日度
- **单位**: %
- **时间范围**: **2024-08-19 至今**

---

## 4. 数据库变更记录

| 操作 | 内容 |
|------|------|
| 删除 | `indicator_values` 中 north_net_flow 的全部数据（2,264 行） |
| 删除 | `indicator_values` 中 north_daily_turnover 和 north_turnover_ratio_daily 的 2024-08-19 前数据（各 2,299 行） |
| 标记 | `indicator_meta` 中 north_net_flow 标记为 deprecated |
| 修改 | `collect_macro_cn_v2.py` 中两个指标起始年份改为 2024，north_net_flow 从 INDICATOR_MAP 移除 |

---

## 5. 参考资料

[1] 东北证券研究所. (2025-05-07). *【东北策略】北向资金分析方法论——A股资金跟踪手册之一*. 新浪财经.
[2] Manus AI 内部数据验证. (2026-03-02). *Tushare moneyflow_hsgt 接口字段语义分析及 object 类型问题（见踩坑记录 #15）*.
"""

res = sb.table('knowledge_docs').update({
    'content': new_content,
    'updated_at': datetime.datetime.utcnow().isoformat()
}).eq('id', 'req-039-north-net-flow-refactor').execute()

print('更新成功，影响行数:', len(res.data))
if res.data:
    print('文档 id:', res.data[0]['id'])
