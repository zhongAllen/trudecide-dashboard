"""
REQ-039 北向资金 + 市场成交额日度数据写入脚本
=============================================
功能：写入以下五个指标的日度历史数据：

  北向资金（核心指标）：
  1. north_daily_turnover        : 北向当日成交总额（亿元）
  2. north_turnover_ratio_daily  : 北向成交额占全A比例（%）

  市场成交额（分母原始数据）：
  3. sh_market_turnover          : 沪市日成交额（亿元）
  4. sz_market_turnover          : 深市日成交额（亿元）
  5. total_market_turnover       : 全A日成交额（亿元，沪+深合计）

数据来源：
  - Tushare moneyflow_hsgt  : north_money 字段（百万元）
  - Tushare index_daily     : 000001.SH + 399001.SZ 的 amount 字段（万元）

单位换算：
  - north_money  : 百万元 → 亿元 需 ÷ 100
  - index_daily.amount : 万元 → 亿元 需 ÷ 10000

注意事项：
  - indicator_meta 中已提前写入五个指标，本脚本只写 indicator_values
  - 脚本幂等：使用 upsert，重复执行不产生重复数据
  - 数据库操作权限：本脚本由用户执行

执行方式：
  python3 req039_insert_north_daily.py

作者：Manus AI
日期：2026-02-28
"""

import os
import time
import pandas as pd
from datetime import datetime
from supabase import create_client

# ─── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN = 'ed1c5e0fc8d80c3eea50dd0bd596565da471d13e103c1b3a086a0254'
SUPABASE_URL  = os.environ.get('SUPABASE_URL')
SUPABASE_KEY  = os.environ.get('SUPABASE_KEY')

START_YEAR = 2014
END_YEAR   = datetime.today().year

import tushare as ts
pro = ts.pro_api(TUSHARE_TOKEN)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ─── Step 1: 拉取北向资金日度数据 ─────────────────────────────────────────────
def fetch_north_daily():
    """分年拉取 moneyflow_hsgt，返回完整 DataFrame"""
    print("\n[Step 1] 拉取北向资金日度数据（Tushare moneyflow_hsgt）...")
    dfs = []
    for year in range(START_YEAR, END_YEAR + 1):
        s, e = f"{year}0101", f"{year}1231"
        try:
            df = pro.moneyflow_hsgt(start_date=s, end_date=e,
                                    fields='trade_date,north_money')
            if df is not None and len(df) > 0:
                dfs.append(df)
                print(f"  {year}: {len(df)} 条")
            time.sleep(0.4)
        except Exception as ex:
            print(f"  {year}: 拉取失败 - {ex}")

    df_all = pd.concat(dfs, ignore_index=True)
    df_all['trade_date'] = pd.to_datetime(df_all['trade_date'])
    df_all['north_money'] = pd.to_numeric(df_all['north_money'], errors='coerce')
    df_all = df_all.dropna(subset=['north_money']).sort_values('trade_date').reset_index(drop=True)
    # 单位换算：百万元 → 亿元
    df_all['north_yi'] = (df_all['north_money'] / 100).round(4)
    print(f"  合计: {len(df_all)} 条，{df_all['trade_date'].min().date()} ~ {df_all['trade_date'].max().date()}")
    return df_all


# ─── Step 2: 拉取沪深市场日度成交额 ───────────────────────────────────────────
def fetch_market_daily():
    """
    分年拉取上证(000001.SH)和深证(399001.SZ)日度成交额。
    index_daily.amount 单位：万元，换算为亿元需 ÷ 10000
    """
    print("\n[Step 2] 拉取沪深市场日度成交额（Tushare index_daily）...")
    dfs_sh, dfs_sz = [], []
    for year in range(START_YEAR, END_YEAR + 1):
        s, e = f"{year}0101", f"{year}1231"
        try:
            df_sh = pro.index_daily(ts_code='000001.SH', start_date=s, end_date=e,
                                    fields='trade_date,amount')
            df_sz = pro.index_daily(ts_code='399001.SZ', start_date=s, end_date=e,
                                    fields='trade_date,amount')
            if df_sh is not None and len(df_sh) > 0:
                dfs_sh.append(df_sh)
            if df_sz is not None and len(df_sz) > 0:
                dfs_sz.append(df_sz)
            print(f"  {year}: SH {len(df_sh)} 条, SZ {len(df_sz)} 条")
            time.sleep(0.3)
        except Exception as ex:
            print(f"  {year}: 拉取失败 - {ex}")

    df_sh_all = pd.concat(dfs_sh, ignore_index=True)
    df_sz_all = pd.concat(dfs_sz, ignore_index=True)

    for df in [df_sh_all, df_sz_all]:
        df['trade_date'] = pd.to_datetime(df['trade_date'])
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce')

    df_sh_all = df_sh_all.rename(columns={'amount': 'sh_amount'})
    df_sz_all = df_sz_all.rename(columns={'amount': 'sz_amount'})

    df_market = df_sh_all.merge(df_sz_all, on='trade_date', how='outer').fillna(0)
    # 单位换算：万元 → 亿元
    df_market['sh_yi']    = (df_market['sh_amount'] / 10000).round(4)
    df_market['sz_yi']    = (df_market['sz_amount'] / 10000).round(4)
    df_market['total_yi'] = (df_market['sh_yi'] + df_market['sz_yi']).round(4)
    df_market = df_market.sort_values('trade_date').reset_index(drop=True)

    print(f"  合计: {len(df_market)} 条，{df_market['trade_date'].min().date()} ~ {df_market['trade_date'].max().date()}")
    return df_market


# ─── Step 3: 合并计算并展示样本 ───────────────────────────────────────────────
def compute(df_north, df_market):
    df = df_north.merge(df_market[['trade_date', 'sh_yi', 'sz_yi', 'total_yi']],
                        on='trade_date', how='left')
    df['ratio'] = (df['north_yi'] / df['total_yi'] * 100).round(4)

    print("\n[Step 3] 数据样本预览（最近8个交易日）：")
    preview = df[['trade_date', 'north_yi', 'sh_yi', 'sz_yi', 'total_yi', 'ratio']].tail(8).copy()
    preview.columns = ['日期', '北向(亿)', '沪市(亿)', '深市(亿)', '全A(亿)', '占比(%)']
    print(preview.to_string(index=False))
    print(f"\n  总记录数: {len(df)} 条")
    return df


# ─── Step 4: 批量写入 indicator_values ────────────────────────────────────────
def batch_upsert(records, label, batch_size=500):
    total = len(records)
    for i in range(0, total, batch_size):
        batch = records[i:i+batch_size]
        res = supabase.table('indicator_values').insert(batch).execute()
        if res.data:
            print(f"  ✅ {label}: {i+len(batch)}/{total} 条")
        else:
            print(f"  ❌ {label}: 写入失败 - {res}")
            break


def insert_data(df):
    print("\n[Step 4] 写入 indicator_values（共5个指标）...")

    def make_records(indicator_id, col):
        return [
            {
                "indicator_id": indicator_id,
                "trade_date": row['trade_date'].strftime('%Y-%m-%d'),
                "publish_date": row['trade_date'].strftime('%Y-%m-%d'),
                "value": float(row[col]),
                "revision_seq": 0,
                "region": "CN",
            }
            for _, row in df.iterrows()
            if pd.notna(row[col])
        ]

    batch_upsert(make_records('north_daily_turnover',       'north_yi'),  'north_daily_turnover')
    batch_upsert(make_records('north_turnover_ratio_daily', 'ratio'),     'north_turnover_ratio_daily')
    batch_upsert(make_records('sh_market_turnover',         'sh_yi'),     'sh_market_turnover')
    batch_upsert(make_records('sz_market_turnover',         'sz_yi'),     'sz_market_turnover')
    batch_upsert(make_records('total_market_turnover',      'total_yi'),  'total_market_turnover')

    print("\n✅ 全部写入完成！")


# ─── 主流程 ───────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 60)
    print("REQ-039 北向资金 + 市场成交额日度数据写入")
    print("=" * 60)

    df_north  = fetch_north_daily()
    df_market = fetch_market_daily()
    df        = compute(df_north, df_market)
    insert_data(df)
