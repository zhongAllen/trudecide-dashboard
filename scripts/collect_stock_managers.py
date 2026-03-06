#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-171: 上市公司管理层信息采集脚本
======================================
从 Tushare Pro 的 `stk_managers` 接口采集上市公司管理层信息，
并存入 `stock_company_managers` 表。

接口说明：
  - 接口名：stk_managers
  - 积分要求：2000 分
  - 单次最大：3000 条，需按股票逐个采集
  - 数据特点：含历史任职记录，同一人可有多条（不同任期）

更新策略：
  - UPSERT（ON CONFLICT ts_code, ann_date, name DO UPDATE）

四段式结构（REQ-078/079 规范）：
  1. 初始化上下文
  2. 获取采集目标
  3. 执行采集
  4. 记录结果

使用方法：
  python collect_stock_managers.py               # 全量采集
  python collect_stock_managers.py --dry-run     # 只打印，不写库
  python collect_stock_managers.py --limit 10    # 只采集前10只股票（测试用）

变更记录：
  v3.0 (REQ-171): 更新表名为 stock_company_managers，移除 title 字段
  v2.0 (REQ-161): 重构为四段式规范，使用 collect_helper + Supabase 客户端
  v1.0 (REQ-153): 初始版本（已废弃，使用 SQLAlchemy + TRUNCATE 策略）
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

# ── 常量 ──────────────────────────────────────────────────────────────────────
MODULE_NAME = "collect_stock_company_managers"
API_SLEEP   = 0.4    # 接口调用间隔（秒）
BATCH_SIZE  = 500    # 数据库写入批次大小

# Tushare 接口字段（与 stock_company_managers 表对应）
# 注意：Tushare 返回的 lev, title 字段不存入数据库（与主键冲突）
TS_FIELDS = "ts_code,ann_date,name,gender,edu,national,birthday,begin_date,end_date,resume"


# ── 客户端初始化 ───────────────────────────────────────────────────────────────
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


# ── 数据清洗 ───────────────────────────────────────────────────────────────────
def parse_date(val) -> str | None:
    """将 YYYYMMDD 格式转为 YYYY-MM-DD，无效值返回 None"""
    if not val or not isinstance(val, str):
        return None
    val = val.strip()
    if len(val) == 8 and val.isdigit():
        return f"{val[:4]}-{val[4:6]}-{val[6:]}"
    return None


def clean_row(row: dict) -> dict:
    """清洗单行数据：处理 NaN、日期格式转换"""
    cleaned = {}
    for key, val in row.items():
        if isinstance(val, float) and pd.isna(val):
            val = None
        if key in ("ann_date", "begin_date", "end_date"):
            val = parse_date(val)
        cleaned[key] = val
    cleaned["updated_at"] = date.today().isoformat()
    return cleaned


# ── 采集单只股票高管信息 ───────────────────────────────────────────────────────
def fetch_one(pro, ts_code: str) -> pd.DataFrame:
    """采集单只股票的高管信息，含一次重试"""
    for attempt in range(2):
        try:
            df = pro.stk_managers(ts_code=ts_code, fields=TS_FIELDS)
            return df
        except Exception as e:
            if attempt == 0:
                print(f"  [WARN] {ts_code} 失败: {e}，60s 后重试...", flush=True)
                time.sleep(60)
            else:
                print(f"  [ERROR] {ts_code} 重试失败: {e}", flush=True)
    return pd.DataFrame()


# ── 写入数据库 ─────────────────────────────────────────────────────────────────
def upsert_batch(sb, rows: list) -> int:
    """
    分批 UPSERT 到 stock_company_managers 表。
    CONFLICT_COLS: ['ts_code', 'ann_date', 'name']
    （与数据库 PRIMARY KEY 一致）
    """
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        sb.table("stock_company_managers").upsert(
            batch, on_conflict="ts_code,ann_date,name"
        ).execute()
        total += len(batch)
    return total


# ── 主采集流程 ─────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="上市公司管理层信息采集脚本 (REQ-171)")
    parser.add_argument("--limit", type=int, default=0,
                        help="限制采集股票数量（0=不限制，用于测试）")
    parser.add_argument("--dry-run", action="store_true",
                        help="只打印数据，不写入数据库")
    args = parser.parse_args()

    print("=" * 60)
    print("REQ-171: stock_company_managers 采集开始")
    print(f"  limit: {args.limit or '不限制'}  dry-run: {args.dry_run}")
    print("=" * 60)

    # ── 第一段：初始化上下文 ──
    context = CollectionContext(MODULE_NAME)

    try:
        # ── 第二段：获取采集目标 ──
        target = get_active_target(context.sb, MODULE_NAME)
        log_start(context, target)

        # ── 第三段：执行采集 ──
        pro, sb = make_clients()

        df_list = pro.stock_basic(exchange="", list_status="L", fields="ts_code")
        stock_list = df_list["ts_code"].tolist()
        if args.limit > 0:
            stock_list = stock_list[:args.limit]
        print(f"[INFO] 待采集股票数: {len(stock_list)}", flush=True)

        all_rows = []
        for idx, ts_code in enumerate(stock_list):
            df = fetch_one(pro, ts_code)
            if not df.empty:
                all_rows.extend([clean_row(r) for r in df.to_dict("records")])
            if (idx + 1) % 200 == 0:
                print(f"  [INFO] 已处理 {idx + 1}/{len(stock_list)}，"
                      f"累计 {len(all_rows)} 条", flush=True)
            time.sleep(API_SLEEP)

        print(f"\n[INFO] 合计 {len(all_rows)} 条高管记录", flush=True)

        if args.dry_run:
            print("\n[DRY-RUN] 前 3 条数据预览：")
            for r in all_rows[:3]:
                print(f"  {r['ts_code']} | {r.get('name')} | {r.get('edu')} | "
                      f"任职:{r.get('begin_date')} ~ {r.get('end_date') or '在任'}")
            print(f"[DRY-RUN] 共 {len(all_rows)} 条，不写入数据库")
            log_success(context, len(all_rows))
            return

        # ── 第四段：写入数据库 ──
        written = upsert_batch(sb, all_rows)
        print(f"\n✅ 写入完成，共 {written} 条记录", flush=True)
        log_success(context, written)

    except Exception as e:
        print(f"\n❌ 采集失败: {e}", flush=True)
        log_failure(context, e)
        sys.exit(1)

    print("\n🎉 REQ-171: stock_company_managers 采集完成")


if __name__ == "__main__":
    main()
