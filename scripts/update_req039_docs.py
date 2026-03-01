"""REQ-039: north_net_flow 口径变更 - 写入需求文档"""
import os
from datetime import datetime
from supabase import create_client

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_KEY"]
sb = create_client(url, key)

now = datetime.utcnow().isoformat()

# 1. knowledge_doc_meta
meta = {
    "id": "req-039-north-net-flow-refactor",
    "title": "REQ-039 north_net_flow 口径统一变更（日度→月度）",
    "category": "requirement",
    "tags": ["north_net_flow", "口径变更", "数据重构", "北向资金", "月度"],
    "summary": "将 north_net_flow 从日度净买入改为月度净买入，统一 2014-11 至今的口径，解决 2024-09 后监管政策变化导致的字段语义断裂问题",
    "version": 1,
    "status": "in_progress",
    "updated_at": now
}
r = sb.table("knowledge_doc_meta").upsert(meta).execute()
print(f"knowledge_doc_meta: {len(r.data)} rows")

# 2. knowledge_docs
content = (
    "# REQ-039 north_net_flow 口径统一变更\n\n"
    "## 变更背景\n\n"
    "2024年9月起，沪深港通取消每日公布北向资金净买入数据的机制，改为月度披露。\n"
    "Tushare moneyflow_hsgt 接口在 2024-09 后返回的 north_money 字段含义从\n"
    "每日净买入额（百万元）变为北向资金累计持股市值（百万元），两者量纲完全不同。\n\n"
    "## 问题分析\n\n"
    "- 累计持股市值的日差值 != 当日净买入\n"
    "- 日差值 = 净买入 + 持仓股票价格涨跌带来的市值变化\n"
    "- 误差量级：北向持仓约 1.4~1.8 万亿，日均波动 0.5~1.5%，市值变化约 70~270 亿\n"
    "- 实际每日净买入通常在 -200~+200 亿之间，误差与信号同量级，统计上不合理\n\n"
    "## 变更决策\n\n"
    "将 north_net_flow 全部改为月度净买入口径，统一语义：\n"
    "- 2014-11 ~ 2024-08：Tushare moneyflow_hsgt 按月汇总 sum(north_money)，单位：百万元\n"
    "- 2024-09 ~ 至今：AKShare 东方财富月度汇总，直接获取月度净买入\n\n"
    "## 变更影响\n\n"
    "- indicator_meta.frequency: daily -> monthly\n"
    "- indicator_meta.description_cn: 更新说明口径变更\n"
    "- indicator_values: 删除旧日度数据，写入新月度数据（约 120 条）\n"
    "- 数据模型文档: 更新 north_net_flow 字段说明\n\n"
    "## 专业依据\n\n"
    "Bloomberg、Wind 机构用户在做北向资金分析时，2024-09 后也统一使用月度数据。\n"
    "宁可降低数据频率，也要保证口径一致性，这是量化分析的基本原则。\n"
)

doc = {
    "id": "req-039-north-net-flow-refactor",
    "content": content,
    "updated_at": now
}
r2 = sb.table("knowledge_docs").upsert(doc).execute()
print(f"knowledge_docs: {len(r2.data)} rows")
print("REQ-039 文档写入完成")
