#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-154: 上市公司主营业务构成采集脚本
=======================================
从 Tushare Pro 的 `fina_mainbz_vip` 接口采集主营业务构成，
并存入 `stock_main_business` 表。

- 按财报季（季度）更新。
"""
import os
import argparse
from datetime import datetime, date, timedelta
import pandas as pd
import tushare as ts
from sqlalchemy import create_engine, text

# --- 配置 ---
PG_URL = os.environ.get("DATABASE_URL")
TS_TOKEN = os.environ.get("TUSHARE_TOKEN")

# --- 辅助函数 ---
def init_clients():
    pro = ts.pro_api(TS_TOKEN)
    engine = create_engine(PG_URL)
    return pro, engine

def get_stock_list(pro):
    df = pro.stock_basic(exchange='', list_status='L', fields='ts_code')
    return df['ts_code'].tolist()

# --- 主采集流程 ---
def collect_main_business(pro, stock_list: list, start_date: str, end_date: str):
    all_data = []
    print(f"[INFO] 开始采集 {len(stock_list)} 家公司的主营业务构成...")
    print(f"[INFO] 报告期范围: {start_date} -> {end_date}")

    for idx, ts_code in enumerate(stock_list):
        try:
            # 按产品
            df_p = pro.fina_mainbz_vip(ts_code=ts_code, type='P', start_date=start_date, end_date=end_date)
            if not df_p.empty:
                df_p['bz_type'] = 'P'
                all_data.append(df_p)
            # 按地区
            df_d = pro.fina_mainbz_vip(ts_code=ts_code, type='D', start_date=start_date, end_date=end_date)
            if not df_d.empty:
                df_d['bz_type'] = 'D'
                all_data.append(df_d)

            if (idx + 1) % 50 == 0:
                print(f"  已处理 {idx + 1}/{len(stock_list)}...")

        except Exception as e:
            print(f"  ❌ [{ts_code}] 采集失败: {e}")
            import time
            time.sleep(60)

    if not all_data:
        return pd.DataFrame()

    return pd.concat(all_data, ignore_index=True)

# --- 主函数 ---
def main():
    parser = argparse.ArgumentParser(description="主营业务构成采集脚本 (REQ-154)")
    parser.add_argument("--mode", choices=['full', 'incremental'], default='incremental', help="full=近3年, incremental=近1年")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    parser.add_argument("--limit", type=int, default=0, help="限制采集股票数量")
    args = parser.parse_args()

    print("=== stock_main_business 采集开始 ===")
    pro, engine = init_clients()
    stock_list = get_stock_list(pro)

    if args.limit > 0:
        stock_list = stock_list[:args.limit]

    # 时间范围
    end_date = date.today().strftime('%Y%m%d')
    if args.mode == 'full':
        start_date = (date.today() - timedelta(days=3*365)).strftime('%Y%m%d')
    else:
        start_date = (date.today() - timedelta(days=365)).strftime('%Y%m%d')

    try:
        df = collect_main_business(pro, stock_list, start_date, end_date)
        print(f"\n[INFO] 成功采集到 {len(df)} 条主营业务数据。")

        if not args.dry_run and not df.empty:
            # 字段映射和重命名
            cols_map = {
                'end_date': 'end_date',
                'bz_item': 'bz_item',
                'bz_sales': 'bz_sales',
                'bz_profit': 'bz_profit',
                'bz_cost': 'bz_cost',
                'bz_type': 'bz_type',
                'curr_type': 'curr_type'
            }
            # 计算比例
            df['sales_ratio'] = df.groupby(['ts_code', 'end_date', 'bz_type'])['bz_sales'].transform(lambda x: (x / x.sum() * 100).round(2))
            df['profit_ratio'] = df.groupby(['ts_code', 'end_date', 'bz_type'])['bz_profit'].transform(lambda x: (x / x.sum() * 100).round(2))
            df['cost_ratio'] = df.groupby(['ts_code', 'end_date', 'bz_type'])['bz_cost'].transform(lambda x: (x / x.sum() * 100).round(2))
            cols_map.update({'sales_ratio': 'sales_ratio', 'profit_ratio': 'profit_ratio', 'cost_ratio': 'cost_ratio'})

            df_to_db = df[list(cols_map.keys())].copy()
            df_to_db.rename(columns=cols_map, inplace=True)
            df_to_db['ts_code'] = df['ts_code']

            print("[INFO] 开始写入数据库 (UPSERT)...")
            # 使用更健壮的 upsert 逻辑
            from supabase import create_client
            supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
            records = df_to_db.to_dict('records')
            supabase.table('stock_main_business').upsert(records, on_conflict='ts_code,end_date,bz_type,bz_item').execute()
            print("✅ 写入数据库成功！")

        elif args.dry_run:
            print("[DRY-RUN] 数据预览 (前5条):\n", df.head())

    except Exception as e:
        print(f"\n❌ 采集或写入异常: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
