"""
REQ-039 Step 2: 更新 indicator_meta 中 north_net_flow 的元数据
将 frequency 从 daily 改为 monthly，并更新描述说明口径变更
"""
import os
from datetime import datetime
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# 先查看当前元数据
current = sb.table("indicator_meta") \
    .select("*") \
    .eq("indicator_id", "north_net_flow") \
    .execute()

if not current.data:
    print("⚠️  indicator_meta 中未找到 north_net_flow，请检查 indicator_id 是否正确")
    exit(1)

print("当前元数据：")
for k, v in current.data[0].items():
    print(f"  {k}: {v}")
print()

# 更新内容
updates = {
    "frequency": "monthly",
    "description_cn": "北向资金月度净买入额（沪股通+深股通合计）。"
                      "2014-11 ~ 2024-08 数据来源：Tushare moneyflow_hsgt 日度数据按月汇总；"
                      "2024-09 起监管政策变化，不再公布日度净买入，改为月度披露。"
                      "单位：百万元（人民币）。",
    "updated_at": datetime.utcnow().isoformat()
}

print("将更新为：")
for k, v in updates.items():
    print(f"  {k}: {v}")
print()

confirm = input("确认更新？(yes/no): ").strip().lower()
if confirm != "yes":
    print("已取消")
    exit(0)

result = sb.table("indicator_meta") \
    .update(updates) \
    .eq("indicator_id", "north_net_flow") \
    .execute()

print(f"✅ 元数据更新完成")
print(f"  更新后 frequency: {result.data[0].get('frequency')}")
