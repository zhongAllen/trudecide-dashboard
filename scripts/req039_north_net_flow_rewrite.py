"""
REQ-039: north_net_flow 口径统一变更
将北向资金从日度净买入改为月度净买入

执行步骤：
1. 删除 indicator_values 中 indicator_id='north_net_flow' 的所有数据
2. 从 Tushare 获取 2014-11 ~ 2024-08 的日度数据，按月汇总
3. 从 AKShare 获取 2024-09 ~ 至今的月度净买入数据
4. 合并写入 indicator_values

用户手动执行：python3 req039_north_net_flow_rewrite.py
"""

import os
import time
import pandas as pd
from datetime import datetime, date
from supabase import create_client

# ─── 初始化 ───────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
TUSHARE_TOKEN = "ed1c5e0fc8d80c3eea50dd0bd596565da471d13e103c1b3a086a0254"
INDICATOR_ID = "north_net_flow"

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=" * 60)
print("REQ-039: north_net_flow 口径统一变更（日度→月度）")
print("=" * 60)

# ─── Step 1: 查看现有数据 ─────────────────────────────────────────────────────
print("\n[Step 1] 查询现有数据...")
existing = sb.table("indicator_values") \
    .select("date,value") \
    .eq("indicator_id", INDICATOR_ID) \
    .order("date") \
    .execute()

if existing.data:
    dates = [r["date"] for r in existing.data]
    print(f"  现有记录数: {len(existing.data)}")
    print(f"  日期范围: {dates[0]} ~ {dates[-1]}")
    print(f"  前3条: {existing.data[:3]}")
    print(f"  后3条: {existing.data[-3:]}")
else:
    print("  无现有数据")

# ─── Step 2: 从 Tushare 获取日度数据并按月汇总（2014-11 ~ 2024-08）─────────────
print("\n[Step 2] 从 Tushare 获取日度数据（2014-11 ~ 2024-08）...")

try:
    import tushare as ts
    pro = ts.pro_api(TUSHARE_TOKEN)

    # 分批获取（Tushare 单次限制 2000 条）
    all_daily = []
    start_date = "20141117"  # 沪股通开通日
    end_date = "20240831"

    # 按年分批
    years = list(range(2014, 2025))
    for i, year in enumerate(years):
        y_start = f"{year}0101" if year > 2014 else "20141117"
        y_end = f"{year}1231" if year < 2024 else "20240831"
        
        try:
            df = pro.moneyflow_hsgt(
                start_date=y_start,
                end_date=y_end,
                fields="trade_date,north_money"
            )
            if df is not None and len(df) > 0:
                all_daily.append(df)
                print(f"  {year}: {len(df)} 条")
            time.sleep(0.3)  # 避免频率限制
        except Exception as e:
            print(f"  {year} 获取失败: {e}")
            time.sleep(1)

    if all_daily:
        df_daily = pd.concat(all_daily, ignore_index=True)
        df_daily["trade_date"] = pd.to_datetime(df_daily["trade_date"])
        df_daily = df_daily.dropna(subset=["north_money"])
        df_daily["north_money"] = pd.to_numeric(df_daily["north_money"], errors="coerce")
        df_daily = df_daily.dropna(subset=["north_money"])

        # 按月汇总（单位：百万元）
        df_daily["month"] = df_daily["trade_date"].dt.to_period("M")
        df_monthly_tushare = df_daily.groupby("month")["north_money"].sum().reset_index()
        df_monthly_tushare["date"] = df_monthly_tushare["month"].dt.to_timestamp(how="end").dt.date
        df_monthly_tushare = df_monthly_tushare[["date", "north_money"]].rename(columns={"north_money": "value"})
        
        print(f"\n  Tushare 月度汇总: {len(df_monthly_tushare)} 个月")
        print(f"  范围: {df_monthly_tushare['date'].min()} ~ {df_monthly_tushare['date'].max()}")
        print(f"  样本:\n{df_monthly_tushare.head(3).to_string()}")
    else:
        print("  警告: Tushare 未获取到数据")
        df_monthly_tushare = pd.DataFrame(columns=["date", "value"])

except ImportError:
    print("  Tushare 未安装，尝试安装...")
    os.system("sudo pip3 install tushare -q")
    print("  请重新运行脚本")
    exit(1)
except Exception as e:
    print(f"  Tushare 获取失败: {e}")
    df_monthly_tushare = pd.DataFrame(columns=["date", "value"])

# ─── Step 3: 从 AKShare 获取 2024-09 ~ 至今月度数据 ──────────────────────────
print("\n[Step 3] 从 AKShare 获取 2024-09 ~ 至今月度数据...")

try:
    import akshare as ak

    # 方案A：东方财富月度北向资金净买入
    # stock_em_hsgt_north_net_flow_in 或类似接口
    df_ak = None
    
    # 尝试多个接口
    methods_tried = []
    
    # 方法1: stock_em_hsgt_north_net_flow_in（月度）
    try:
        df_ak = ak.stock_em_hsgt_north_net_flow_in(start_date="20240901", end_date=date.today().strftime("%Y%m%d"))
        methods_tried.append("stock_em_hsgt_north_net_flow_in")
        print(f"  方法1 成功: {df_ak.shape}")
        print(f"  列名: {df_ak.columns.tolist()}")
    except Exception as e:
        print(f"  方法1 失败: {e}")

    # 方法2: stock_hsgt_north_acc_flow_in_em（累计净买入，需要差分）
    if df_ak is None:
        try:
            df_ak2 = ak.stock_hsgt_north_acc_flow_in_em(symbol="北上资金")
            methods_tried.append("stock_hsgt_north_acc_flow_in_em")
            print(f"  方法2 成功: {df_ak2.shape}")
            print(f"  列名: {df_ak2.columns.tolist()}")
            print(f"  样本:\n{df_ak2.head(5).to_string()}")
        except Exception as e:
            print(f"  方法2 失败: {e}")

    # 方法3: 港交所月度数据
    if df_ak is None:
        try:
            df_ak3 = ak.stock_hsgt_hist_em(symbol="北上资金")
            methods_tried.append("stock_hsgt_hist_em")
            print(f"  方法3 成功: {df_ak3.shape}")
            print(f"  列名: {df_ak3.columns.tolist()}")
            print(f"  样本:\n{df_ak3.head(5).to_string()}")
        except Exception as e:
            print(f"  方法3 失败: {e}")

    print(f"\n  已尝试方法: {methods_tried}")

except ImportError:
    print("  AKShare 未安装，尝试安装...")
    os.system("sudo pip3 install akshare -q")
    print("  请重新运行脚本")
    exit(1)
except Exception as e:
    print(f"  AKShare 获取失败: {e}")

# ─── 暂停点：让用户确认数据质量后再执行删除和写入 ────────────────────────────
print("\n" + "=" * 60)
print("【暂停点】请检查上方数据获取结果")
print("如果数据正常，请输入 'yes' 继续执行删除和写入操作")
print("输入其他任何内容则退出")
print("=" * 60)

confirm = input("确认继续? (yes/no): ").strip().lower()
if confirm != "yes":
    print("已取消，未修改任何数据库数据")
    exit(0)

# ─── Step 4: 删除旧数据 ───────────────────────────────────────────────────────
print("\n[Step 4] 删除旧日度数据...")
del_result = sb.table("indicator_values") \
    .delete() \
    .eq("indicator_id", INDICATOR_ID) \
    .execute()
print(f"  已删除记录数: {len(del_result.data) if del_result.data else '未知（执行成功）'}")

# ─── Step 5: 合并并写入新月度数据 ─────────────────────────────────────────────
print("\n[Step 5] 写入新月度数据...")

# 合并 Tushare 月度数据
records_to_insert = []

for _, row in df_monthly_tushare.iterrows():
    dt = row["date"]
    if isinstance(dt, date):
        date_str = dt.isoformat()
    else:
        date_str = str(dt)
    
    records_to_insert.append({
        "indicator_id": INDICATOR_ID,
        "region": "CN",
        "date": date_str,
        "value": round(float(row["value"]), 2),
        "source": "tushare_monthly_agg"
    })

print(f"  Tushare 月度记录数: {len(records_to_insert)}")

# 分批写入
BATCH_SIZE = 500
total_inserted = 0
for i in range(0, len(records_to_insert), BATCH_SIZE):
    batch = records_to_insert[i:i+BATCH_SIZE]
    result = sb.table("indicator_values").insert(batch).execute()
    total_inserted += len(result.data) if result.data else len(batch)
    print(f"  已写入 {total_inserted}/{len(records_to_insert)} 条")

print(f"\n✅ REQ-039 数据重写完成！")
print(f"   共写入 {total_inserted} 条月度数据")
print(f"\n⚠️  注意：2024-09 后的月度数据需要单独补充（见 Step 3 输出）")
print("   请根据 AKShare 接口调试结果，手动补充或告知 AI 继续处理")
