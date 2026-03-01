"""
REQ-039 Step 1: 删除 north_net_flow 旧日度数据
执行前请确认：此操作将永久删除 indicator_values 表中 indicator_id='north_net_flow' 的全部记录
"""
import os
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# 先查询现有数据概况
existing = sb.table("indicator_values") \
    .select("date,value") \
    .eq("indicator_id", "north_net_flow") \
    .order("date") \
    .execute()

if not existing.data:
    print("⚠️  当前无数据，无需删除")
else:
    dates = [r["date"] for r in existing.data]
    print(f"当前数据概况：")
    print(f"  记录总数：{len(existing.data)} 条")
    print(f"  日期范围：{dates[0]} ~ {dates[-1]}")
    print(f"  前3条：{existing.data[:3]}")
    print(f"  后3条：{existing.data[-3:]}")
    print()

    confirm = input("确认删除以上全部数据？(yes/no): ").strip().lower()
    if confirm != "yes":
        print("已取消，未删除任何数据")
        exit(0)

    result = sb.table("indicator_values") \
        .delete() \
        .eq("indicator_id", "north_net_flow") \
        .execute()

    print(f"✅ 删除完成，共删除 {len(result.data)} 条记录")
