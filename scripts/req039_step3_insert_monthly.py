"""
REQ-039 Step 3: 写入 north_net_flow 新月度数据
数据来源：Tushare moneyflow_hsgt 日度数据按月汇总
覆盖范围：2014-11 ~ 2024-08（Tushare 日度净买入有效期）
单位：百万元（人民币）

注意：
- 2024-08-16 是 Tushare north_money 字段最后一个有效的日度净买入值
- 2024-08-19 起字段语义变为累计持股市值，不可用于月度汇总
- 因此 2024-08 月度数据仅汇总至 2024-08-16（共 16 个交易日）
- 2024-09 及之后的月度数据需要手动补充（待后续处理）
"""
import os
import time
import pandas as pd
from datetime import date
from supabase import create_client
import tushare as ts

TUSHARE_TOKEN = "ed1c5e0fc8d80c3eea50dd0bd596565da471d13e103c1b3a086a0254"
INDICATOR_ID = "north_net_flow"
REGION = "CN"

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
pro = ts.pro_api(TUSHARE_TOKEN)

print("=" * 60)
print("REQ-039 Step 3: 写入 north_net_flow 月度数据")
print("=" * 60)

# ─── 从 Tushare 获取全量日度数据（2014-11 ~ 2024-08-16）────────────────────
print("\n[1/3] 从 Tushare 获取日度数据（分年批量请求）...")

all_daily = []
# 按年分批，避免单次超限
year_ranges = [
    ("20141117", "20141231"),
    ("20150101", "20151231"),
    ("20160101", "20161231"),
    ("20170101", "20171231"),
    ("20180101", "20181231"),
    ("20190101", "20191231"),
    ("20200101", "20201231"),
    ("20210101", "20211231"),
    ("20220101", "20221231"),
    ("20230101", "20231231"),
    ("20240101", "20240816"),  # 截止到最后有效日
]

for start, end in year_ranges:
    try:
        df = pro.moneyflow_hsgt(
            start_date=start,
            end_date=end,
            fields="trade_date,north_money"
        )
        if df is not None and len(df) > 0:
            all_daily.append(df)
            print(f"  {start[:4]}: {len(df)} 条")
        time.sleep(0.4)
    except Exception as e:
        print(f"  {start[:4]} 获取失败: {e}")
        time.sleep(1)

if not all_daily:
    print("❌ 未获取到任何数据，退出")
    exit(1)

df_all = pd.concat(all_daily, ignore_index=True)
df_all["trade_date"] = pd.to_datetime(df_all["trade_date"])
df_all["north_money"] = pd.to_numeric(df_all["north_money"], errors="coerce")
df_all = df_all.dropna(subset=["north_money"])
df_all = df_all.sort_values("trade_date")

print(f"\n  日度数据总计: {len(df_all)} 条")
print(f"  日期范围: {df_all['trade_date'].min().date()} ~ {df_all['trade_date'].max().date()}")

# ─── 按月汇总 ─────────────────────────────────────────────────────────────────
print("\n[2/3] 按月汇总...")

df_all["month"] = df_all["trade_date"].dt.to_period("M")
df_monthly = df_all.groupby("month")["north_money"].sum().reset_index()

# 月末日期作为数据点日期
df_monthly["date"] = df_monthly["month"].dt.to_timestamp(how="end").dt.date

print(f"  月度数据: {len(df_monthly)} 个月")
print(f"  范围: {df_monthly['date'].min()} ~ {df_monthly['date'].max()}")
print(f"\n  样本数据（前5条）:")
print(df_monthly[["date", "north_money"]].head(5).to_string(index=False))
print(f"\n  样本数据（后5条）:")
print(df_monthly[["date", "north_money"]].tail(5).to_string(index=False))

# 统计验证
print(f"\n  数据验证:")
print(f"  年均净买入: {df_monthly['north_money'].mean()/10000:.1f} 亿元/月")
print(f"  最大单月净买入: {df_monthly['north_money'].max()/10000:.1f} 亿元")
print(f"  最小单月净买入: {df_monthly['north_money'].min()/10000:.1f} 亿元")

# ─── 写入数据库 ───────────────────────────────────────────────────────────────
print("\n[3/3] 准备写入数据库...")

records = []
for _, row in df_monthly.iterrows():
    records.append({
        "indicator_id": INDICATOR_ID,
        "region": REGION,
        "date": row["date"].isoformat(),
        "value": round(float(row["north_money"]), 2),
        "source": "tushare_monthly_agg"
    })

print(f"  待写入记录数: {len(records)} 条")
print()

confirm = input("确认写入以上数据？(yes/no): ").strip().lower()
if confirm != "yes":
    print("已取消，未写入任何数据")
    exit(0)

# 分批写入
BATCH_SIZE = 200
total = 0
for i in range(0, len(records), BATCH_SIZE):
    batch = records[i:i+BATCH_SIZE]
    result = sb.table("indicator_values").insert(batch).execute()
    total += len(result.data) if result.data else len(batch)
    print(f"  已写入 {total}/{len(records)} 条")

print(f"\n✅ Step 3 完成！共写入 {total} 条月度数据")
print()
print("⚠️  待补充：2024-09 ~ 至今的月度净买入数据")
print("   原因：2024-08-19 后 Tushare 字段语义变更，需要其他数据源")
print("   建议：手动查询港交所/东方财富月度报告后补充")
