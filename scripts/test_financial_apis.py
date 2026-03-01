"""
测试 Tushare 财务三表及相关接口
目的：了解实际返回字段数、字段名、数据类型，为建表 SQL 提供依据
"""
import os, time
import tushare as ts
import pandas as pd

TUSHARE_TOKEN = os.environ.get('TUSHARE_TOKEN', '')
pro = ts.pro_api(TUSHARE_TOKEN)

def test_api(name, func, **kwargs):
    print(f"\n{'='*60}")
    print(f"接口: {name}")
    try:
        df = func(**kwargs)
        if df is None or df.empty:
            print("  ⚠️  返回空数据")
            return None
        print(f"  ✅ 返回行数: {len(df)}")
        print(f"  📊 字段数: {len(df.columns)}")
        print(f"  📋 字段列表:")
        for i, col in enumerate(df.columns):
            dtype = str(df[col].dtype)
            sample = df[col].dropna().iloc[0] if not df[col].dropna().empty else 'NULL'
            print(f"    [{i+1:3d}] {col:<35} {dtype:<10} 样本: {sample}")
        return df
    except Exception as e:
        print(f"  ❌ 失败: {e}")
        return None

# 测试参数：用一只典型股票 + 一个报告期
TS_CODE = '600000.SH'
PERIOD = '20231231'

print("=" * 60)
print("Tushare 财务相关接口测试")
print("=" * 60)

# 1. 利润表（单只股票版）
df_income = test_api(
    "income（利润表，单只）",
    pro.income,
    ts_code=TS_CODE,
    start_date='20230101',
    end_date='20231231'
)
time.sleep(1)

# 2. 资产负债表（单只股票版）
df_balance = test_api(
    "balancesheet（资产负债表，单只）",
    pro.balancesheet,
    ts_code=TS_CODE,
    start_date='20230101',
    end_date='20231231'
)
time.sleep(1)

# 3. 现金流量表（单只股票版）
df_cashflow = test_api(
    "cashflow（现金流量表，单只）",
    pro.cashflow,
    ts_code=TS_CODE,
    start_date='20230101',
    end_date='20231231'
)
time.sleep(1)

# 4. 财务指标（单只股票版）
df_fina = test_api(
    "fina_indicator（财务指标，单只）",
    pro.fina_indicator,
    ts_code=TS_CODE,
    start_date='20230101',
    end_date='20231231'
)
time.sleep(1)

# 5. 每日指标（daily_basic）
df_basic = test_api(
    "daily_basic（每日估值指标）",
    pro.daily_basic,
    trade_date='20231229'
)
time.sleep(1)

# 6. 前十大流通股东
df_holders = test_api(
    "top10_floatholders（前十大流通股东）",
    pro.top10_floatholders,
    ts_code=TS_CODE,
    period='20231231'
)
time.sleep(1)

# 7. 股权质押统计
df_pledge = test_api(
    "pledge_stat（股权质押统计）",
    pro.pledge_stat,
    ts_code=TS_CODE
)
time.sleep(1)

# 8. 股票回购
df_repurchase = test_api(
    "repurchase（股票回购）",
    pro.repurchase,
    ts_code=TS_CODE
)
time.sleep(1)

# 9. 股东增减持
df_holdertrade = test_api(
    "stk_holdertrade（股东增减持）",
    pro.stk_holdertrade,
    ts_code=TS_CODE
)

# 汇总
print("\n" + "="*60)
print("📊 字段数汇总")
print("="*60)
for name, df in [
    ("income（利润表）", df_income),
    ("balancesheet（资产负债表）", df_balance),
    ("cashflow（现金流量表）", df_cashflow),
    ("fina_indicator（财务指标）", df_fina),
    ("daily_basic（每日估值）", df_basic),
    ("top10_floatholders（股东）", df_holders),
    ("pledge_stat（质押）", df_pledge),
    ("repurchase（回购）", df_repurchase),
    ("stk_holdertrade（增减持）", df_holdertrade),
]:
    count = len(df.columns) if df is not None and not df.empty else "N/A"
    print(f"  {name:<35} {count} 字段")
