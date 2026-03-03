#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-162: 上市公司主营业务构成采集脚本
========================================
从 Tushare Pro 的 `fina_mainbz_vip` 接口采集主营业务构成，
并存入 `stock_main_business` 表。

接口说明：
  - 接口名：fina_mainbz_vip（5000分，按报告期全市场批量）
  - 数据特点：按报告期+产品/地区分类，每期多条记录
  - 报告期：每年 4 个季度（0331/0630/0930/1231）

更新策略：
  - UPSERT（ON CONFLICT ts_code, end_date, bz_type, bz_item DO UPDATE）
  - 采集时预计算 sales_pct（收入占比）和 profit_pct（利润占比）

四段式结构（REQ-078/079 规范）：
  1. 初始化上下文
  2. 获取采集目标
  3. 执行采集
  4. 记录结果

使用方法：
  python collect_stock_main_business.py                    # 增量（近2个报告期）
  python collect_stock_main_business.py --mode full        # 全量（近3年）
  python collect_stock_main_business.py --dry-run          # 只打印，不写库
  python collect_stock_main_business.py --period 20241231  # 指定单个报告期

变更记录：
  v2.0 (REQ-162): 重构为四段式规范，使用 collect_helper + Supabase 客户端
                  改为按报告期批量采集（fina_mainbz_vip），新增 sales_pct/profit_pct
  v1.0 (REQ-154): 初始版本（已废弃，按股票逐个采集，效率极低）
"""
import os
import sys
import time
import argparse
from datetime import date

import pandas as pd
import tushare as ts
from supabase import create_client

sys.path.insert(0, os.path.dirname(__file__))
from collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure

MODULE_NAME  = "collect_stock_main_business"
API_SLEEP    = 0.5
BATCH_SIZE   = 500
QUARTER_ENDS = ["0331", "0630", "0930", "1231"]
TS_FIELDS    = "ts_code,end_date,bz_item,bz_sales,bz_profit,bz_cost,curr_type,update_flag"


def make_clients():
    token = os.environ.get("TUSHARE_TOKEN")
    if not token:
        raise EnvironmentError("缺少 TUSHARE_TOKEN 环境变量")
    ts.set_token(token)
    pro = ts.pro_api()
    sb_url = os.environ.get("SUPABASE_URL")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
    if not sb_url or not sb_key:
        raise EnvironmentError("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY 环境变量")
    sb = create_client(sb_url, sb_key)
    return pro, sb


def gen_periods(mode, single_period):
    if single_period:
        return [single_period]
    today = date.today()
    periods = []
    if mode == "full":
        for year in range(today.year - 3, today.year + 1):
            for qe in QUARTER_ENDS:
                periods.append(f"{year}{qe}")
    else:
        for year in [today.year - 1, today.year]:
            for qe in QUARTER_ENDS:
                periods.append(f"{year}{qe}")
    today_str = today.strftime("%Y%m%d")
    periods = [p for p in periods if p <= today_str]
    return sorted(set(periods))


def parse_date(val):
    if not val or not isinstance(val, str):
        return None
    val = val.strip()
    if len(val) == 8 and val.isdigit():
        return f"{val[:4]}-{val[4:6]}-{val[6:]}"
    return None


def calc_pct(df):
    for col, pct_col in [("bz_sales", "sales_pct"), ("bz_profit", "profit_pct")]:
        total = df.groupby(["ts_code", "end_date", "bz_type"])[col].transform("sum")
        df[pct_col] = (df[col] / total * 100).round(2)
        df.loc[total <= 0, pct_col] = None
    return df


def clean_df(df, bz_type):
    df = df.copy()
    df["bz_type"] = bz_type
    df["end_date"] = df["end_date"].apply(parse_date)
    df = df[df["bz_item"].notna() & (df["bz_item"] != "")]
    for col in ["bz_sales", "bz_profit", "bz_cost"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = calc_pct(df)
    df["updated_at"] = date.today().isoformat()
    return df


def fetch_one_period(pro, period):
    all_parts = []
    for bz_type in ["P", "D"]:
        for attempt in range(2):
            try:
                df = pro.fina_mainbz_vip(period=period, type=bz_type, fields=TS_FIELDS)
                if not df.empty:
                    df_clean = clean_df(df, bz_type)
                    all_parts.append(df_clean)
                    print(f"  [INFO] {period} type={bz_type}: {len(df)} 条", flush=True)
                break
            except Exception as e:
                if attempt == 0:
                    print(f"  [WARN] {period}/{bz_type} 失败: {e}，60s 后重试...", flush=True)
                    time.sleep(60)
                else:
                    print(f"  [ERROR] {period}/{bz_type} 重试失败: {e}", flush=True)
        time.sleep(API_SLEEP)
    if not all_parts:
        return pd.DataFrame()
    return pd.concat(all_parts, ignore_index=True)


def upsert_batch(sb, rows):
    """
    CONFLICT_COLS: ['ts_code', 'end_date', 'bz_type', 'bz_item']
    与数据库 UNIQUE INDEX idx_stock_main_business_unique 一致
    """
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        clean_batch = [{k: (None if isinstance(v, float) and pd.isna(v) else v)
                        for k, v in row.items()} for row in batch]
        sb.table("stock_main_business").upsert(
            clean_batch, on_conflict="ts_code,end_date,bz_type,bz_item"
        ).execute()
        total += len(batch)
    return total

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

def main():
    parser = argparse.ArgumentParser(description="主营业务构成采集脚本 (REQ-162)")
    parser.add_argument("--mode", choices=["full", "incremental"], default="incremental")
    parser.add_argument("--period", default=None, help="指定单个报告期 YYYYMMDD")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("=" * 60)
    print("REQ-162: stock_main_business 采集开始")
    print(f"  mode: {args.mode}  period: {args.period or '自动'}  dry-run: {args.dry_run}")
    print("=" * 60)

    context = CollectionContext(MODULE_NAME)
    try:
        target = get_active_target(context.sb, MODULE_NAME)
        log_start(context, target)

        pro, sb = make_clients()
        periods = gen_periods(args.mode, args.period)
        print(f"[INFO] 待采集报告期: {len(periods)} 个，{periods[0]} ~ {periods[-1]}", flush=True)

        all_rows = []
        for period in periods:
            df = fetch_one_period(pro, period)
            if not df.empty:
                all_rows.extend(df.to_dict("records"))
            print(f"  [INFO] {period} 完成，累计 {len(all_rows)} 条", flush=True)

        print(f"\n[INFO] 合计 {len(all_rows)} 条主营业务记录", flush=True)

        if args.dry_run:
            print("\n[DRY-RUN] 前 3 条数据预览：")
            for r in all_rows[:3]:
                print(f"  {r.get('ts_code')} | {r.get('end_date')} | "
                      f"类型:{r.get('bz_type')} | {r.get('bz_item')} | "
                      f"收入占比:{r.get('sales_pct')}%")
            print(f"[DRY-RUN] 共 {len(all_rows)} 条，不写入数据库")
            log_success(context, len(all_rows))
            return

        written = upsert_batch(sb, all_rows)
        print(f"\n✅ 写入完成，共 {written} 条记录", flush=True)
        log_success(context, written)

    except Exception as e:
        print(f"\n❌ 采集失败: {e}", flush=True)
        log_failure(context, e)
        sys.exit(1)

    print("\n🎉 REQ-162: stock_main_business 采集完成")


if __name__ == "__main__":
    main()
