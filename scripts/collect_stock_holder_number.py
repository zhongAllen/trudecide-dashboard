#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-157: 上市公司股东户数采集脚本
===================================
从 Tushare Pro 的 `stk_holdernumber` 接口采集股东户数，
并存入 `stock_holder_number` 表。

- 按季度更新。
"""
import os
import argparse
from datetime import date, timedelta
import pandas as pd
import tushare as ts
from sqlalchemy import create_engine

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
def collect_holder_number(pro, stock_list: list, start_date: str, end_date: str):
    all_data = []
    print(f"[INFO] 开始采集 {len(stock_list)} 家公司的股东户数...")
    print(f"[INFO] 截止日期范围: {start_date} -> {end_date}")

    for idx, ts_code in enumerate(stock_list):
        try:
            df = pro.stk_holdernumber(ts_code=ts_code, start_date=start_date, end_date=end_date)
            if not df.empty:
                all_data.append(df)

            if (idx + 1) % 100 == 0:
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
    parser = argparse.ArgumentParser(description="股东户数采集脚本 (REQ-157)")
    parser.add_argument("--mode", choices=['full', 'incremental'], default='incremental', help="full=近5年, incremental=近1年")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    parser.add_argument("--limit", type=int, default=0, help="限制采集股票数量")
    args = parser.parse_args()

    print("=== stock_holder_number 采集开始 ===")
    pro, engine = init_clients()
    stock_list = get_stock_list(pro)

    if args.limit > 0:
        stock_list = stock_list[:args.limit]

    # 时间范围
    end_date = date.today().strftime('%Y%m%d')
    if args.mode == 'full':
        start_date = (date.today() - timedelta(days=5*365)).strftime('%Y%m%d')
    else:
        start_date = (date.today() - timedelta(days=365)).strftime('%Y%m%d')

    try:
        df = collect_holder_number(pro, stock_list, start_date, end_date)
        print(f"\n[INFO] 成功采集到 {len(df)} 条股东户数数据。")

        if not args.dry_run and not df.empty:
            print("[INFO] 开始写入数据库 (UPSERT)...")
            from supabase import create_client
            supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
            records = df.to_dict('records')
            supabase.table('stock_holder_number').upsert(records, on_conflict='ts_code,end_date').execute()
            print("✅ 写入数据库成功！")

        elif args.dry_run:
            print("[DRY-RUN] 数据预览 (前5条):\n", df.head())

    except Exception as e:
        print(f"\n❌ 采集或写入异常: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
