#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-153: 上市公司高管信息采集脚本
===================================
从 Tushare Pro 的 `stk_managers` 接口采集高管信息，
并存入 `stock_managers` 表。

- 全量采集，按季度更新。
"""
import os
import argparse
from datetime import datetime
import pandas as pd
import tushare as ts
from sqlalchemy import create_engine, text

# --- 数据库与 Tushare 配置 ---
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
def collect_managers(pro, stock_list: list):
    all_managers = []
    print(f"[INFO] 开始采集 {len(stock_list)} 家公司的高管信息...")

    for idx, ts_code in enumerate(stock_list):
        try:
            df = pro.stk_managers(ts_code=ts_code)
            if not df.empty:
                all_managers.append(df)
            
            if (idx + 1) % 100 == 0:
                print(f"  已处理 {idx + 1}/{len(stock_list)}...")

        except Exception as e:
            print(f"  ❌ [{ts_code}] 采集失败: {e}")
            import time
            time.sleep(60)

    if not all_managers:
        return pd.DataFrame()
        
    return pd.concat(all_managers, ignore_index=True)

# --- 主函数 ---
def main():
    parser = argparse.ArgumentParser(description="上市公司高管信息采集脚本 (REQ-153)")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    parser.add_argument("--limit", type=int, default=0, help="限制采集股票数量")
    args = parser.parse_args()

    print("=== stock_managers 采集开始 ===")
    pro, engine = init_clients()
    stock_list = get_stock_list(pro)

    if args.limit > 0:
        stock_list = stock_list[:args.limit]

    try:
        df = collect_managers(pro, stock_list)
        print(f"\n[INFO] 成功采集到 {len(df)} 条高管信息。")

        if not args.dry_run and not df.empty:
            # 使用 to_sql 的 'replace' 模式需要先清空表，更安全的方式是 upsert
            # 这里我们用一个更简单的 truncate + append 策略
            print("[INFO] 开始写入数据库 (TRUNCATE + INSERT)...")
            with engine.connect() as conn:
                conn.execute(text("TRUNCATE TABLE stock_managers RESTART IDENTITY;"))
                df.to_sql('stock_managers', conn, if_exists='append', index=False, method='multi')
                conn.commit()
            print("✅ 写入数据库成功！")

        elif args.dry_run:
            print("[DRY-RUN] 数据预览 (前5条):\n", df.head())

    except Exception as e:
        print(f"\n❌ 采集或写入异常: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
