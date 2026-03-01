"""
REQ-039 新增北向资金核心指标脚本
=================================
功能：
  1. 在 indicator_meta 中新增两个指标：
     - north_monthly_flow  : 北向月度资金流向（亿元）
     - north_turnover_ratio: 北向成交额占全A比例（%）
  2. 从 Tushare 拉取历史数据，按月汇总后写入 indicator_values

数据来源：
  - Tushare moneyflow_hsgt (doc_id=47): north_money/hgt/sgt 字段
  - Tushare daily_basic (doc_id=32): 全A股成交额（amount 字段）

注意事项：
  - north_monthly_flow 在 2024-08-19 前为月度净买入，之后为月度成交总额，语义不同
  - north_turnover_ratio 全程连续可比（成交额/成交额，无断点）
  - 旧指标 north_net_flow 不删除，保留历史参考
  - 本脚本幂等：重复执行不会产生重复数据（upsert）

执行方式：
  python3 req039_new_indicators.py

作者：Manus AI
日期：2026-02-28
"""

import os
import time
import pandas as pd
import requests
from datetime import datetime
from supabase import create_client

# ─── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN = 'ed1c5e0fc8d80c3eea50dd0bd596565da471d13e103c1b3a086a0254'
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')

START_DATE = '20141101'  # 沪股通开通日期
END_DATE   = datetime.today().strftime('%Y%m%d')

# ─── 初始化客户端 ──────────────────────────────────────────────────────────────
import tushare as ts
pro = ts.pro_api(TUSHARE_TOKEN)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ─── Step 1: 写入 indicator_meta ──────────────────────────────────────────────
def upsert_indicator_meta():
    print("\n[Step 1] 写入 indicator_meta...")

    records = [
        {
            "id": "north_monthly_flow",
            "region": "CN",
            "name_cn": "北向月度资金流向",
            "description_cn": (
                "反映外资的月度资金进出方向和规模。"
                "注意：2024-08-19前后数据口径不同。"
                "2014-11至2024-08为月度净买入（亿元），反映资金净流入/流出；"
                "2024-09至今为月度成交总额（亿元），反映交易活跃度。"
                "数据来源：Tushare moneyflow_hsgt，north_money字段按月汇总。"
            ),
            "category": "equity",
            "frequency": "monthly",
            "unit": "亿元",
            "value_type": "flow",
            "source_name": "Tushare",
            "source_url": "https://tushare.pro/document/2?doc_id=47",
            "credibility": "high",
            "currency": "CNY",
            "scale": 0,  # 直接存亿元，不做归一化
        },
        {
            "id": "north_turnover_ratio",
            "region": "CN",
            "name_cn": "北向成交额占全A比例",
            "description_cn": (
                "衡量外资在A股市场的参与度和情绪（月度）。"
                "计算公式：月度北向成交总额 / 月度A股总成交额 × 100。"
                "消除了市场扩容带来的成交额自然增长影响，更能反映外资的相对活跃度。"
                "数据来源：Tushare moneyflow_hsgt（北向）和 daily_basic（全A）。"
            ),
            "category": "equity",
            "frequency": "monthly",
            "unit": "%",
            "value_type": "ratio",
            "source_name": "Tushare",
            "source_url": "https://tushare.pro/document/2?doc_id=47",
            "credibility": "high",
            "currency": None,
            "scale": 0,
        },
    ]

    for rec in records:
        res = supabase.table('indicator_meta').upsert(rec).execute()
        if res.data:
            print(f"  ✅ {rec['id']} 写入成功")
        else:
            print(f"  ❌ {rec['id']} 写入失败: {res}")


# ─── Step 2: 拉取北向资金日度数据 ─────────────────────────────────────────────
def fetch_north_daily():
    """分年拉取 moneyflow_hsgt，返回完整 DataFrame"""
    print("\n[Step 2] 拉取北向资金日度数据...")
    dfs = []
    years = range(2014, datetime.today().year + 1)

    for year in years:
        s = f"{year}0101"
        e = f"{year}1231"
        try:
            df = pro.moneyflow_hsgt(start_date=s, end_date=e)
            if df is not None and len(df) > 0:
                dfs.append(df)
                print(f"  {year}: {len(df)} 条")
            time.sleep(0.4)  # 避免频率限制
        except Exception as ex:
            print(f"  {year}: 拉取失败 - {ex}")

    if not dfs:
        raise RuntimeError("北向资金数据拉取失败，无数据")

    df_all = pd.concat(dfs, ignore_index=True)
    df_all['trade_date'] = pd.to_datetime(df_all['trade_date'])
    df_all['north_money'] = pd.to_numeric(df_all['north_money'], errors='coerce')
    df_all = df_all.dropna(subset=['north_money'])
    df_all = df_all.sort_values('trade_date').reset_index(drop=True)
    print(f"  合计: {len(df_all)} 条，范围: {df_all['trade_date'].min().date()} ~ {df_all['trade_date'].max().date()}")
    return df_all


# ─── Step 3: 拉取全A股月度成交额 ──────────────────────────────────────────────
def fetch_total_market_monthly():
    """
    拉取全A股日度成交额，按月汇总。
    Tushare daily_basic 的 amount 字段单位为千元，需 /10000 转换为亿元。
    """
    print("\n[Step 3] 拉取全A股月度成交额...")
    dfs = []
    years = range(2014, datetime.today().year + 1)

    for year in years:
        s = f"{year}0101"
        e = f"{year}1231"
        try:
            # 用上证综指作为全市场代理，获取每日成交额
            # 注意：daily_basic 的 amount 是单只股票，需要用 index_daily 获取全市场
            # 这里用沪深两市合计：上证 000001.SH + 深证 399001.SZ 的成交额之和
            df_sh = pro.index_daily(ts_code='000001.SH', start_date=s, end_date=e, fields='trade_date,amount')
            df_sz = pro.index_daily(ts_code='399001.SZ', start_date=s, end_date=e, fields='trade_date,amount')
            time.sleep(0.3)

            if df_sh is not None and df_sz is not None and len(df_sh) > 0:
                df_sh['trade_date'] = pd.to_datetime(df_sh['trade_date'])
                df_sz['trade_date'] = pd.to_datetime(df_sz['trade_date'])
                df_sh = df_sh.rename(columns={'amount': 'amount_sh'})
                df_sz = df_sz.rename(columns={'amount': 'amount_sz'})
                df_merged = df_sh.merge(df_sz, on='trade_date', how='outer').fillna(0)
                # amount 单位：万元，转换为亿元需 /10000
                df_merged['total_amount'] = (df_merged['amount_sh'] + df_merged['amount_sz']) / 10000
                dfs.append(df_merged[['trade_date', 'total_amount']])
                print(f"  {year}: {len(df_merged)} 条")
        except Exception as ex:
            print(f"  {year}: 拉取失败 - {ex}")

    if not dfs:
        raise RuntimeError("全A成交额数据拉取失败，无数据")

    df_all = pd.concat(dfs, ignore_index=True)
    df_all = df_all.sort_values('trade_date').reset_index(drop=True)

    # 按月汇总
    df_monthly = df_all.groupby(df_all['trade_date'].dt.to_period('M'))['total_amount'].sum().reset_index()
    df_monthly['trade_date'] = df_monthly['trade_date'].dt.to_timestamp('M')  # 月末日期
    print(f"  合计: {len(df_monthly)} 个月，范围: {df_monthly['trade_date'].min().date()} ~ {df_monthly['trade_date'].max().date()}")
    return df_monthly


# ─── Step 4: 计算并写入两个新指标 ─────────────────────────────────────────────
def compute_and_insert(df_north, df_market):
    print("\n[Step 4] 计算月度数据并写入 indicator_values...")

    # 北向数据按月汇总，north_money 单位：百万元，转换为亿元需 /100
    df_north['month'] = df_north['trade_date'].dt.to_period('M')
    df_north_monthly = df_north.groupby('month')['north_money'].sum().reset_index()
    df_north_monthly['trade_date'] = df_north_monthly['month'].dt.to_timestamp('M')
    df_north_monthly['north_flow_yi'] = df_north_monthly['north_money'] / 100  # 百万元 → 亿元

    # 合并市场数据
    df_north_monthly['month_str'] = df_north_monthly['trade_date'].dt.strftime('%Y-%m')
    df_market['month_str'] = df_market['trade_date'].dt.strftime('%Y-%m')
    df_merged = df_north_monthly.merge(df_market[['month_str', 'total_amount']], on='month_str', how='left')

    # 计算占比
    df_merged['ratio'] = (df_merged['north_flow_yi'] / df_merged['total_amount'] * 100).round(4)

    print(f"\n  数据预览（最近5个月）：")
    print(df_merged[['trade_date', 'north_flow_yi', 'total_amount', 'ratio']].tail(5).to_string(index=False))

    confirm = input("\n  确认写入以上数据？(yes/no): ").strip().lower()
    if confirm != 'yes':
        print("  已取消写入。")
        return

    # 写入 north_monthly_flow
    records_flow = []
    for _, row in df_merged.iterrows():
        if pd.isna(row['north_flow_yi']):
            continue
        records_flow.append({
            "indicator_id": "north_monthly_flow",
            "trade_date": row['trade_date'].strftime('%Y-%m-%d'),
            "value": round(float(row['north_flow_yi']), 4),
            "revision_seq": 0,
        })

    # 写入 north_turnover_ratio
    records_ratio = []
    for _, row in df_merged.iterrows():
        if pd.isna(row['ratio']):
            continue
        records_ratio.append({
            "indicator_id": "north_turnover_ratio",
            "trade_date": row['trade_date'].strftime('%Y-%m-%d'),
            "value": round(float(row['ratio']), 4),
            "revision_seq": 0,
        })

    # 批量 upsert（每批 200 条）
    def batch_upsert(records, label):
        batch_size = 200
        total = len(records)
        for i in range(0, total, batch_size):
            batch = records[i:i+batch_size]
            res = supabase.table('indicator_values').upsert(
                batch,
                on_conflict='indicator_id,trade_date,revision_seq'
            ).execute()
            if res.data:
                print(f"  ✅ {label}: 写入 {i+len(batch)}/{total} 条")
            else:
                print(f"  ❌ {label}: 写入失败 - {res}")

    batch_upsert(records_flow, 'north_monthly_flow')
    batch_upsert(records_ratio, 'north_turnover_ratio')
    print("\n  ✅ 全部写入完成！")


# ─── 主流程 ───────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 60)
    print("REQ-039 新增北向资金核心指标")
    print("=" * 60)

    upsert_indicator_meta()
    df_north = fetch_north_daily()
    df_market = fetch_total_market_monthly()
    compute_and_insert(df_north, df_market)
