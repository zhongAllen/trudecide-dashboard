#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-163: 上市公司股东户数采集脚本
====================================
从 Tushare Pro 的 `stk_holdernumber` 接口采集股东户数，
并存入 `stock_holder_number` 表。

接口说明：
  - 接口名：stk_holdernumber
  - 积分要求：600 分
  - 单次最大：3000 条，需按股票逐个采集
  - 数据特点：不定期公布，约每季度一次

更新策略：
  - UPSERT（ON CONFLICT ts_code, end_date DO UPDATE）

四段式结构（REQ-078/079 规范）：
  1. 初始化上下文
  2. 获取采集目标
  3. 执行采集
  4. 记录结果

使用方法：
  python collect_stock_holder_number.py                # 增量（近1年）
  python collect_stock_holder_number.py --mode full    # 全量（近5年）
  python collect_stock_holder_number.py --dry-run      # 只打印，不写库
  python collect_stock_holder_number.py --limit 10     # 只采集前10只股票（测试）

变更记录：
  v2.0 (REQ-163): 重构为四段式规范，使用 collect_helper + Supabase 客户端
  v1.0 (REQ-157): 初始版本（已废弃，使用 SQLAlchemy）
"""
import os
import sys
import time
import argparse
from datetime import date, timedelta

import pandas as pd
import tushare as ts
from supabase import create_client

sys.path.insert(0, os.path.dirname(__file__))
from collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure

MODULE_NAME = "collect_stock_holder_number"
API_SLEEP   = 0.4
BATCH_SIZE  = 500
TS_FIELDS   = "ts_code,ann_date,end_date,holder_num"


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


def parse_date(val):
    if not val or not isinstance(val, str):
        return None
    val = val.strip()
    if len(val) == 8 and val.isdigit():
        return f"{val[:4]}-{val[4:6]}-{val[6:]}"
    return None


def clean_row(row):
    cleaned = {}
    for key, val in row.items():
        if isinstance(val, float) and pd.isna(val):
            val = None
        if key in ("ann_date", "end_date"):
            val = parse_date(val)
        if key == "holder_num" and val is not None:
            try:
                val = int(val)
            except (ValueError, TypeError):
                val = None
        cleaned[key] = val
    cleaned["updated_at"] = date.today().isoformat()
    return cleaned


def fetch_one(pro, ts_code, start_date, end_date):
    for attempt in range(2):
        try:
            df = pro.stk_holdernumber(ts_code=ts_code, start_date=start_date,
                                       end_date=end_date, fields=TS_FIELDS)
            return df
        except Exception as e:
            if attempt == 0:
                print(f"  [WARN] {ts_code} 失败: {e}，60s 后重试...", flush=True)
                time.sleep(60)
            else:
                print(f"  [ERROR] {ts_code} 重试失败: {e}", flush=True)
    return pd.DataFrame()


def upsert_batch(sb, rows):
    """
    CONFLICT_COLS: ['ts_code', 'end_date']
    与数据库 UNIQUE INDEX idx_stock_holder_number_unique 一致
    """
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        sb.table("stock_holder_number").upsert(
            batch, on_conflict="ts_code,end_date"
        ).execute()
        total += len(batch)
    return total


def main():
    parser = argparse.ArgumentParser(description="股东户数采集脚本 (REQ-163)")
    parser.add_argument("--mode", choices=["full", "incremental"], default="incremental")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("=" * 60)
    print("REQ-163: stock_holder_number 采集开始")
    print(f"  mode: {args.mode}  limit: {args.limit or '不限制'}  dry-run: {args.dry_run}")
    print("=" * 60)

    context = CollectionContext(MODULE_NAME)
    try:
        target = get_active_target(context.sb, MODULE_NAME)
        log_start(context, target)

        pro, sb = make_clients()
        df_list = pro.stock_basic(exchange="", list_status="L", fields="ts_code")
        stock_list = df_list["ts_code"].tolist()
        if args.limit > 0:
            stock_list = stock_list[:args.limit]
        print(f"[INFO] 待采集股票数: {len(stock_list)}", flush=True)

        end_date_str = date.today().strftime("%Y%m%d")
        if args.mode == "full":
            start_date_str = (date.today() - timedelta(days=5 * 365)).strftime("%Y%m%d")
        else:
            start_date_str = (date.today() - timedelta(days=365)).strftime("%Y%m%d")

        all_rows = []
        for idx, ts_code in enumerate(stock_list):
            df = fetch_one(pro, ts_code, start_date_str, end_date_str)
            if not df.empty:
                all_rows.extend([clean_row(r) for r in df.to_dict("records")])
            if (idx + 1) % 200 == 0:
                print(f"  [INFO] 已处理 {idx + 1}/{len(stock_list)}，累计 {len(all_rows)} 条", flush=True)
            time.sleep(API_SLEEP)

        print(f"\n[INFO] 合计 {len(all_rows)} 条股东户数记录", flush=True)

        if args.dry_run:
            print("\n[DRY-RUN] 前 3 条数据预览：")
            for r in all_rows[:3]:
                print(f"  {r['ts_code']} | 截止:{r.get('end_date')} | 户数:{r.get('holder_num')}")
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

    print("\n🎉 REQ-163: stock_holder_number 采集完成")


if __name__ == "__main__":
    main()
