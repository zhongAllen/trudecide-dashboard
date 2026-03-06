#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-170: 上市公司公司画像数据采集脚本
======================================
从 Tushare Pro 的 `stock_basic` + `stock_company` 接口采集上市公司完整信息，
并存入 `stock_company_info` 表。

接口说明：
  - stock_basic: 股票基础信息（2000积分）
    - 字段: ts_code, symbol, name, fullname, enname, cnspell, area, industry,
            market, exchange, list_status, list_date, delist_date, is_hs,
            act_name, act_ent_type
  - stock_company: 公司工商信息（120积分）
    - 字段: com_name, com_id, exchange, chairman, manager, secretary,
            reg_capital, setup_date, province, city, introduction, website,
            email, office, employees, main_business, business_scope

更新策略：
  - UPSERT（ON CONFLICT ts_code DO UPDATE），保留最新值
  - 先采集 stock_basic 全量数据，再合并 stock_company 数据

四段式结构（REQ-078/079 规范）：
  1. 初始化上下文
  2. 获取采集目标
  3. 执行采集
  4. 记录结果

使用方法：
  python collect_stock_company_info.py              # 全量采集（默认）
  python collect_stock_company_info.py --dry-run    # 只打印，不写库
  python collect_stock_company_info.py --exchange SSE  # 只采集上交所

变更记录：
  v3.0 (REQ-170): 扩展采集 stock_basic 字段，完善公司画像数据
  v2.0 (REQ-160): 重构为四段式规范，使用 collect_helper + Supabase 客户端
  v1.0 (REQ-152): 初始版本（已废弃，使用 SQLAlchemy + 逐股采集，效率低）
"""
import os
import sys
import time
import argparse
from datetime import date

import pandas as pd
import tushare as ts
from supabase import create_client

# 将 scripts 目录加入路径，以便导入 collect_helper
sys.path.insert(0, os.path.dirname(__file__))
from collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure

# ── 常量 ──────────────────────────────────────────────────────────────────────
MODULE_NAME = "collect_stock_company_info"
EXCHANGES   = ["SSE", "SZSE", "BSE"]   # 上交所、深交所、北交所
API_SLEEP   = 0.5                       # 接口调用间隔（秒）

# Tushare 接口请求字段
# stock_basic 字段
TS_BASIC_FIELDS = (
    "ts_code,symbol,name,fullname,enname,cnspell,area,industry,"
    "market,exchange,list_status,list_date,delist_date,is_hs,"
    "act_name,act_ent_type"
)

# stock_company 字段
TS_COMPANY_FIELDS = (
    "ts_code,com_name,com_id,exchange,chairman,manager,secretary,"
    "reg_capital,setup_date,province,city,introduction,website,"
    "email,office,employees,main_business,business_scope"
)


# ── 客户端初始化 ───────────────────────────────────────────────────────────────
def make_clients():
    """初始化 Tushare Pro 和 Supabase 客户端"""
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
def clean_row(row: dict) -> dict:
    """清洗单行数据：处理 NaN、日期格式转换、数值类型保护"""
    cleaned = {}
    for key, val in row.items():
        # 处理 NaN
        if isinstance(val, float) and pd.isna(val):
            val = None
        # 日期字段: YYYYMMDD -> YYYY-MM-DD
        date_fields = ["setup_date", "list_date", "delist_date"]
        if key in date_fields and val and isinstance(val, str) and len(val) == 8:
            val = f"{val[:4]}-{val[4:6]}-{val[6:]}"
        # 数值类型保护
        if key == "reg_capital" and val is not None:
            try:
                val = float(val)
            except (ValueError, TypeError):
                val = None
        if key == "employees" and val is not None:
            try:
                val = int(val)
            except (ValueError, TypeError):
                val = None
        cleaned[key] = val
    cleaned["updated_at"] = date.today().isoformat()
    return cleaned


# ── 采集 stock_basic（全市场）───────────────────────────────────────────────────
def collect_stock_basic(pro) -> pd.DataFrame:
    """采集全市场股票基础信息"""
    print("  [INFO] 采集 stock_basic 全市场数据...", flush=True)
    for attempt in range(2):
        try:
            df = pro.stock_basic(exchange='', list_status='L', fields=TS_BASIC_FIELDS)
            print(f"  [INFO] stock_basic: {len(df)} 条", flush=True)
            return df
        except Exception as e:
            if attempt == 0:
                print(f"  [WARN] stock_basic 失败: {e}，60s 后重试...", flush=True)
                time.sleep(60)
            else:
                print(f"  [ERROR] stock_basic 重试失败: {e}", flush=True)
    return pd.DataFrame()


# ── 采集 stock_company（按交易所）───────────────────────────────────────────────
def collect_one_exchange(pro, exchange: str) -> pd.DataFrame:
    """采集单个交易所的公司工商信息，含一次重试"""
    print(f"  [INFO] 采集 {exchange} 交易所 stock_company...", flush=True)
    for attempt in range(2):
        try:
            df = pro.stock_company(exchange=exchange, fields=TS_COMPANY_FIELDS)
            print(f"  [INFO] {exchange}: {len(df)} 条", flush=True)
            return df
        except Exception as e:
            if attempt == 0:
                print(f"  [WARN] {exchange} 失败: {e}，60s 后重试...", flush=True)
                time.sleep(60)
            else:
                print(f"  [ERROR] {exchange} 重试失败: {e}", flush=True)
    return pd.DataFrame()


# ── 写入数据库 ─────────────────────────────────────────────────────────────────
def upsert_batch(sb, rows: list, batch_size: int = 500) -> int:
    """
    分批 UPSERT 到 stock_company_info 表。
    CONFLICT_COLS: ['ts_code']（与数据库 PRIMARY KEY 一致）
    """
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        sb.table("stock_company_info").upsert(
            batch, on_conflict="ts_code"
        ).execute()
        total += len(batch)
        print(f"  [DB] 已写入 {total}/{len(rows)} 条", flush=True)
    return total


# ── 主采集流程 ─────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="上市公司基本信息采集脚本 (REQ-160)")
    parser.add_argument("--exchange", choices=["SSE", "SZSE", "BSE", "all"],
                        default="all", help="采集指定交易所，默认全部")
    parser.add_argument("--dry-run", action="store_true",
                        help="只打印数据，不写入数据库")
    args = parser.parse_args()

    print("=" * 60)
    print("REQ-170: stock_company_info 采集开始")
    print(f"  交易所: {args.exchange}  dry-run: {args.dry_run}")
    print("=" * 60)

    # ── 第一段：初始化上下文 ──
    context = CollectionContext(MODULE_NAME)

    try:
        # ── 第二段：获取采集目标 ──
        target = get_active_target(context.sb, MODULE_NAME)
        log_start(context, target)

        # ── 第三段：执行采集 ──
        pro, sb = make_clients()

        # 1. 采集 stock_basic（全市场）
        df_basic = collect_stock_basic(pro)
        if df_basic.empty:
            raise ValueError("stock_basic 采集失败")
        time.sleep(API_SLEEP)

        # 2. 采集 stock_company（按交易所）
        exchanges_to_collect = EXCHANGES if args.exchange == "all" else [args.exchange]
        company_dfs = []
        for exchange in exchanges_to_collect:
            df = collect_one_exchange(pro, exchange)
            if not df.empty:
                company_dfs.append(df)
            time.sleep(API_SLEEP)

        if not company_dfs:
            raise ValueError("所有交易所 stock_company 均未获取到数据")

        df_company = pd.concat(company_dfs, ignore_index=True)
        print(f"\n[INFO] stock_basic: {len(df_basic)} 条, stock_company: {len(df_company)} 条", flush=True)

        # 3. 合并数据（以 stock_basic 为基准，左连接 stock_company）
        df_merged = df_basic.merge(df_company, on="ts_code", how="left", suffixes=("", "_company"))

        # 处理冲突字段（exchange 在两张表中都存在，优先使用 stock_company 的）
        if "exchange_company" in df_merged.columns:
            df_merged["exchange"] = df_merged["exchange_company"].fillna(df_merged["exchange"])
            df_merged = df_merged.drop(columns=["exchange_company"])

        print(f"[INFO] 合并后共 {len(df_merged)} 条记录", flush=True)

        # 清洗数据
        rows = [clean_row(row) for row in df_merged.to_dict("records")]

        if args.dry_run:
            print("\n[DRY-RUN] 前 3 条数据预览：")
            for r in rows[:3]:
                print(f"  {r['ts_code']} | {r.get('name')} | {r.get('com_name')} | "
                      f"行业:{r.get('industry')} | 董事长:{r.get('chairman')} | "
                      f"员工:{r.get('employees')} | 官网:{r.get('website')}")
            print(f"[DRY-RUN] 共 {len(rows)} 条，不写入数据库")
            log_success(context, len(rows))
            return

        # ── 第四段：写入数据库 ──
        written = upsert_batch(sb, rows)
        print(f"\n✅ 写入完成，共 {written} 条记录", flush=True)
        log_success(context, written)

    except Exception as e:
        print(f"\n❌ 采集失败: {e}", flush=True)
        log_failure(context, e)
        sys.exit(1)

    print("\n🎉 REQ-170: stock_company_info 采集完成")


if __name__ == "__main__":
    main()
