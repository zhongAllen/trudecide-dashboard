"""更新知识库文档：补充 research_report 接口的 abstr 字段和 inst_csname 输入参数"""
import os, requests, json
from datetime import datetime, timezone

url = os.environ['SUPABASE_URL']
key = os.environ['SUPABASE_SERVICE_KEY']
headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

# 读取当前文档
r = requests.get(f"{url}/rest/v1/knowledge_docs?id=eq.tushare-broker-recommend-npr-api&limit=1", headers=headers)
doc = r.json()[0]
content = doc['content']

# 定位research_report部分
idx_start = content.find('## 二、research_report')
idx_end = content.find('## 三、npr')

# 新的research_report部分（补充abstr字段和inst_csname输入参数）
new_section = """## 二、research_report — 券商研究报告

**描述**：获取券商发布的个股研报和行业研报，历史从 2017-01-01 开始，每天两次增量更新。

**积分要求**：单独开通权限（与积分无关，当前账号已有权限）

**限量**：单次最大1000条，可按日期循环提取，**每天总量不限制**

### 输入参数

| 参数名 | 类型 | 必选 | 描述 |
|--------|------|------|------|
| `trade_date` | str | N | 研报日期（格式：YYYYMMDD） |
| `start_date` | str | N | 研报开始日期（格式：YYYYMMDD） |
| `end_date` | str | N | 研报结束日期（格式：YYYYMMDD） |
| `report_type` | str | N | 研报类别：`个股研报` / `行业研报` |
| `ts_code` | str | N | 股票代码，如 `000001.SZ` |
| `inst_csname` | str | N | 券商名称，如 `东吴证券` |
| `ind_name` | str | N | 行业名称 |

### 输出参数

| 字段名 | 类型 | 描述 |
|--------|------|------|
| `trade_date` | str | 研报发布时间（YYYYMMDD） |
| `abstr` | str | 研报摘要 |
| `title` | str | 研报标题 |
| `report_type` | str | 研报类别：个股研报 / 行业研报 |
| `author` | str | 作者（分析师姓名，逗号分隔） |
| `name` | str | 股票名称（行业研报为 None） |
| `ts_code` | str | 股票代码（行业研报为 None） |
| `inst_csname` | str | 机构简称（券商名称） |
| `ind_name` | str | 行业名称 |
| `url` | str | PDF 报告下载链接（dfcfw.com） |

### 代码示例

```python
import tushare as ts
pro = ts.pro_api(token)

# 获取指定日期的研报（推荐用法）
df = pro.research_report(trade_date='20260121',
                         fields='trade_date,title,author,inst_csname')

# 按日期范围查询（最多1000条/次）
df = pro.research_report(start_date='20260201', end_date='20260228')

# 查询特定股票的研报
df = pro.research_report(ts_code='600519.SH')  # 贵州茅台

# 查询特定券商的研报
df = pro.research_report(inst_csname='东吴证券', start_date='20260201', end_date='20260228')
```

### 数据库表设计（research_report）

| 字段名 | 类型 | 约束 | 描述 |
|--------|------|------|------|
| `trade_date` | DATE | NOT NULL | 研报发布日期 |
| `title_hash` | VARCHAR(32) | NOT NULL | md5(trade_date+title)，去重键 |
| `title` | TEXT | NOT NULL | 研报标题 |
| `abstr` | TEXT | NULL | 研报摘要 |
| `report_type` | VARCHAR(20) | NULL | 研报类别 |
| `author` | VARCHAR(200) | NULL | 作者 |
| `stock_name` | VARCHAR(50) | NULL | 股票名称 |
| `ts_code` | VARCHAR(20) | NULL | 股票代码 |
| `inst_csname` | VARCHAR(50) | NULL | 机构简称 |
| `ind_name` | VARCHAR(100) | NULL | 行业名称 |
| `url` | TEXT | NULL | PDF下载链接 |
| `collected_at` | TIMESTAMPTZ | DEFAULT now() | 采集时间 |

> **唯一约束**：`(trade_date, title_hash)` — 防止重复插入

### 实测数据（2026-03-01 验证）

- 贵州茅台（600519.SH）：777 篇历史研报
- 平安银行（000001.SZ）：239 篇历史研报
- 2026年2月全市场：>1000 篇（行业研报占 78.6%）
- 活跃券商（2026年2月 TOP5）：东吴证券90篇、国金证券66篇、开源证券66篇、国信证券62篇、山西证券62篇

### 采集策略

- **增量采集**：每日运行，按 `trade_date=昨日` 查询，UPSERT 写入
- **全量补采**：按日循环从 20250301 至今（每天总量不限，但建议控制速率）
- **脚本**：`scripts/collect_research_report.py`
- ⚠️ **注意**：`abstr` 字段在数据库表中存在，脚本需确保写入

### 使用建议

- PDF 链接格式：`https://pdf.dfcfw.com/pdf/H3_AP{...}.pdf`，可直接下载
- 行业研报中 `ts_code` 和 `name` 为 None，需用 `ind_name` 筛选
- 可与 `broker_recommend` 联动：对金股推荐标的自动拉取近期研报

---
"""

# 替换文档中的research_report部分
new_content = content[:idx_start] + new_section + content[idx_end:]
print(f"原文档长度: {len(content)}, 新文档长度: {len(new_content)}")

# 更新数据库
now = datetime.now(timezone.utc).isoformat()
r2 = requests.patch(
    f"{url}/rest/v1/knowledge_docs?id=eq.tushare-broker-recommend-npr-api",
    headers={**headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
    data=json.dumps({"content": new_content, "updated_at": now})
)
print(f"更新状态: {r2.status_code}")
if r2.status_code not in (200, 204):
    print(f"错误: {r2.text[:200]}")
else:
    print("知识库文档更新成功")
