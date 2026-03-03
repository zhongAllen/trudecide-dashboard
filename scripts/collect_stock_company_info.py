#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-152: 上市公司基本信息采集脚本
===================================
从 Tushare Pro 的 `stock_company` 接口采集公司基本信息，
并存入 `stock_company_info` 表。

- 全量采集，每日少量更新。
- 使用 collect_helper.py 公共库。
"""
import os
import sys
import argparse
from datetime import datetime
import pandas as pd
import tushare as ts
from sqlalchemy import create_engine

# --- 数据库与 Tushare 配置 ---
PG_URL = os.environ.get("DATABASE_URL")
TS_TOKEN = os.environ.get("TUSHARE_TOKEN")

# --- 辅助函数 ---
def init_clients():
    """初始化 Tushare 和数据库连接"""
    pro = ts.pro_api(TS_TOKEN)
    engine = create_engine(PG_URL)
    return pro, engine

def get_stock_list(pro):
    """获取当前所有A股列表"""
    df = pro.stock_basic(exchange='', list_status='L', fields='ts_code')
    return df['ts_code'].tolist()

# --- 主采集流程 ---
def collect_company_info(pro, stock_list: list):
    """采集所有股票的公司基本信息"""
    all_info = []
    print(f"[INFO] 开始采集 {len(stock_list)} 家公司的基本信息...")

    for idx, ts_code in enumerate(stock_list):
        try:
            df = pro.stock_company(ts_code=ts_code)
            if not df.empty:
                all_info.append(df.iloc[0].to_dict())
            
            if (idx + 1) % 100 == 0:
                print(f"  已处理 {idx + 1}/{len(stock_list)}...")

        except Exception as e:
            print(f"  ❌ [{ts_code}] 采集失败: {e}")
            # Tushare 积分限制，休眠后重试
            import time
            time.sleep(60)

    return pd.DataFrame(all_info)

# --- 主函数 ---
def main():
    parser = argparse.ArgumentParser(description="上市公司基本信息采集脚本 (REQ-152)")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    parser.add_argument("--limit", type=int, default=0, help="限制采集股票数量（用于测试，0=不限制）")
    args = parser.parse_args()

    print("=== stock_company_info 采集开始 ===")
    print(f"模式: 全量 | dry-run: {args.dry_run}")
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    pro, engine = init_clients()
    stock_list = get_stock_list(pro)

    if args.limit > 0:
        stock_list = stock_list[:args.limit]
        print(f"[TEST] 限制采集前 {args.limit} 只股票")

    try:
        df = collect_company_info(pro, stock_list)
        print(f"\n[INFO] 成功采集到 {len(df)} 条公司信息。")

        if not args.dry_run and not df.empty:
            # 选择并重命名字段以匹配数据库表
            cols_map = {
                'chairman': 'chairman',
                'manager': 'manager',
                'secretary': 'secretary',
                'reg_capital': 'reg_capital',
                'setup_date': 'setup_date',
                'province': 'province',
                'city': 'city',
                'introduction': 'introduction',
                'website': 'website',
                'email': 'email',
                'office': 'office',
                'employees': 'employees',
                'main_business': 'main_business',
                'business_scope': 'business_scope'
            }
            df_to_db = df[list(cols_map.keys())].copy()
            df_to_db.rename(columns=cols_map, inplace=True)
            df_to_db['ts_code'] = df['ts_code'] # 添加主键

            print("[INFO] 开始写入数据库...")
            df_to_db.to_sql('stock_company_info', engine, if_exists='append', index=False, method='multi')
            print("✅ 写入数据库成功！")

            # 使用 Supabase-py 的 upsert 功能会更健壮
            # from supabase import create_client
            # supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
            # records = df_to_db.to_dict('records')
            # supabase.table('stock_company_info').upsert(records).execute()

        elif args.dry_run:
            print("[DRY-RUN] 数据预览 (前5条):\n", df.head())

    except Exception as e:
        print(f"\n❌ 采集或写入异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
