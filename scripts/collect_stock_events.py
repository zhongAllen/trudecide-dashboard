#!/usr/bin/env python3
"""
REQ-063: 个股事件层数据采集脚本
采集三类数据：
  1. stock_holders     - 前十大流通股东（top10_floatholders）
  2. stock_pledge      - 股权质押统计（pledge_stat）
  3. stock_holder_trade - 重要股东增减持（stk_holdertrade）

数据范围：近 3 年（START_DATE 至今）
运行方式：
  python3 collect_stock_events.py --mode full        # 全量（近3年，所有股票）
  python3 collect_stock_events.py --mode incremental # 增量（最近一个季度）
  python3 collect_stock_events.py --dry-run          # 不写库，仅打印

踩坑记录：
  - Tushare top10_floatholders 不返回 holder_type_desc 字段（数据库字段留 NULL 即可）
  - pledge_stat 返回全历史数据，需要按 end_date >= start_date 过滤
  - stk_holdertrade 可以按 ts_code + start_date/end_date 查询
  - Tushare 积分限制：每分钟约 200 次调用，需要 sleep 控制频率
  - stock_holders 的 CONFLICT_COLS 需要与数据库实际 UNIQUE 约束一致
"""

import os
import sys
import time
import argparse
from datetime import datetime, date, timedelta
import math
import tushare as ts
from supabase import create_client

# ── 配置 ──────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_KEY", ""))
TUSHARE_TOKEN = os.environ.get("TUSHARE_TOKEN", "")

# 采集起始日期（近3年）
START_DATE = (date.today() - timedelta(days=3 * 365)).strftime("%Y%m%d")
END_DATE = date.today().strftime("%Y%m%d")

# 批量写入大小
BATCH_SIZE = 500

# API 调用间隔（秒），避免触发 Tushare 频率限制
API_SLEEP = 0.15   # 每次调用后等待 150ms，约 6.7 次/秒

# 模块名（对应 collect_target 表）
MODULE_NAME = "stock_events"

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_clients():
    """初始化 Tushare 和 Supabase 客户端"""
    if not TUSHARE_TOKEN:
        raise ValueError("TUSHARE_TOKEN 环境变量未设置")
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL / SUPABASE_KEY 环境变量未设置")
    pro = ts.pro_api(TUSHARE_TOKEN)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    return pro, sb


def get_stock_list(sb) -> list:
    """从 stock_meta 获取所有在市股票代码列表"""
    # 分页获取所有活跃股票
    all_codes = []
    offset = 0
    page_size = 1000
    while True:
        r = sb.table("stock_meta").select("ts_code").eq("is_active", True).range(offset, offset + page_size - 1).execute()
        all_codes.extend([row["ts_code"] for row in r.data])
        if len(r.data) < page_size:
            break
        offset += page_size
    print(f"[INFO] 共获取 {len(all_codes)} 只活跃股票")
    return all_codes


def upsert_batch(sb, table: str, rows: list, conflict_cols: list) -> int:
    """分批 upsert，避免单次请求过大"""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        sb.table(table).upsert(batch, on_conflict=",".join(conflict_cols)).execute()
        total += len(batch)
    return total



def safe_float(val):
    """安全转换为 float，None/NaN/Inf 均返回 None（JSON 不支持 NaN/Inf）"""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (ValueError, TypeError):
        return None


def safe_int(val):
    """安全转换为 int，None/NaN 均返回 None"""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return int(f)
    except (ValueError, TypeError):
        return None


def retry_call(func, max_retries=3, **kwargs):
    """带重试的 Tushare API 调用"""
    for attempt in range(max_retries):
        try:
            result = func(**kwargs)
            return result
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                print(f"  [RETRY] {func.__name__} 失败 ({e})，{wait}s 后重试...")
                time.sleep(wait)
            else:
                raise


# ── 采集：前十大流通股东 ──────────────────────────────────────────────────────
def collect_holders_for_stock(pro, ts_code: str, start_date: str, end_date: str) -> list:
    """采集单只股票的前十大流通股东数据
    
    注意：Tushare top10_floatholders 不返回 rank 字段，需要按 end_date 分组自动生成。
    PK = (ts_code, end_date, holder_type, rank)
    """
    time.sleep(API_SLEEP)
    df = retry_call(pro.top10_floatholders, ts_code=ts_code, start_date=start_date, end_date=end_date)
    if df is None or df.empty:
        return []
    
    rows = []
    # 按 end_date 分组，在每个报告期内按 holder_type 分别编号
    for end_date_val, group in df.groupby("end_date", sort=False):
        rank_counter = {}  # 每种 holder_type 内的排名计数器
        for _, row in group.iterrows():
            holder_type_val = row.get("holder_type") or None
            if holder_type_val is None:
                continue
            rank_counter[holder_type_val] = rank_counter.get(holder_type_val, 0) + 1
            rank_val = rank_counter[holder_type_val]
            rows.append({
                "ts_code": row.get("ts_code"),
                "ann_date": row.get("ann_date") or None,
                "end_date": end_date_val,
                "holder_type": holder_type_val,
                "rank": rank_val,
                "holder_name": row.get("holder_name") or None,
                "hold_amount": safe_float(row.get("hold_amount")),
                "hold_ratio": safe_float(row.get("hold_ratio")),
                "hold_float_ratio": safe_float(row.get("hold_float_ratio")),
                "hold_change": safe_float(row.get("hold_change")),
                # holder_type_desc 字段 API 不返回，留 NULL
            })
    return rows

# ── 采集：股权质押统计 ────────────────────────────────────────────────────────
def collect_pledge_for_stock(pro, ts_code: str, start_date: str) -> list:
    """采集单只股票的股权质押统计数据（API 返回全历史，按日期过滤）"""
    time.sleep(API_SLEEP)
    df = retry_call(pro.pledge_stat, ts_code=ts_code)
    if df is None or df.empty:
        return []

    # 过滤近3年数据（end_date 格式为 YYYYMMDD）
    df = df[df["end_date"] >= start_date]

    # 去重：pledge_stat 可能包含重复的 (ts_code, end_date)，保留第一条
    df = df.drop_duplicates(subset=["ts_code", "end_date"], keep="first")
    
    rows = []
    for _, row in df.iterrows():
        rows.append({
            "ts_code": row.get("ts_code"),
            "end_date": row.get("end_date"),
            "pledge_count": safe_int(row.get("pledge_count")),
            "unrest_pledge": safe_float(row.get("unrest_pledge")),
            "rest_pledge": safe_float(row.get("rest_pledge")),
            "total_share": safe_float(row.get("total_share")),
            "pledge_ratio": safe_float(row.get("pledge_ratio")),
        })
    return rows


# ── 采集：重要股东增减持 ──────────────────────────────────────────────────────
def collect_holder_trade_for_stock(pro, ts_code: str, start_date: str, end_date: str) -> list:
    """采集单只股票的重要股东增减持数据"""
    time.sleep(API_SLEEP)
    df = retry_call(pro.stk_holdertrade, ts_code=ts_code, start_date=start_date, end_date=end_date)
    if df is None or df.empty:
        return []
    
    # 去重：stk_holdertrade 可能包含重复的 (ts_code, ann_date, holder_name)，保留第一条
    df = df.drop_duplicates(subset=["ts_code", "ann_date", "holder_name"], keep="first")
    
    rows = []
    for _, row in df.iterrows():
        rows.append({
            "ts_code": row.get("ts_code"),
            "ann_date": row.get("ann_date") or None,
            "holder_name": row.get("holder_name") or None,
            "holder_type": row.get("holder_type") or None,
            "in_de": row.get("in_de") or None,
            "change_vol": safe_float(row.get("change_vol")),
            "change_ratio": safe_float(row.get("change_ratio")),
            "after_share": safe_float(row.get("after_share")),
            "after_ratio": safe_float(row.get("after_ratio")),
            "avg_price": safe_float(row.get("avg_price")),
            "total_share": safe_float(row.get("total_share")),
        })
    return rows

# ── 主采集流程 ────────────────────────────────────────────────────────────────
def collect_all(pro, sb, stock_list: list, start_date: str, end_date: str, dry_run: bool = False) -> dict:
    """
    对所有股票采集三类事件数据
    返回统计信息
    """
    total_holders = 0
    total_pledge = 0
    total_trades = 0
    error_count = 0

    print(f"\n[INFO] 开始采集 {len(stock_list)} 只股票的事件层数据...")
    print(f"[INFO] 时间范围: {start_date} → {end_date}")
    print(f"[INFO] dry_run: {dry_run}\n")

    # 分批处理，每批 100 只股票后打印进度
    batch_holders = []
    batch_pledge = []
    batch_trades = []

    for idx, ts_code in enumerate(stock_list):
        try:
            # 1. 前十大流通股东
            holders = collect_holders_for_stock(pro, ts_code, start_date, end_date)
            batch_holders.extend(holders)

            # 2. 股权质押
            pledge = collect_pledge_for_stock(pro, ts_code, start_date)
            batch_pledge.extend(pledge)

            # 3. 增减持
            trades = collect_holder_trade_for_stock(pro, ts_code, start_date, end_date)
            batch_trades.extend(trades)

        except Exception as e:
            error_count += 1
            print(f"  ❌ [{ts_code}] 采集失败: {e}")

        # 每 100 只批量写库
        if (idx + 1) % 100 == 0 or idx == len(stock_list) - 1:
            progress = f"[{idx + 1}/{len(stock_list)}]"
            print(f"  {progress} 股东:{len(batch_holders)} 质押:{len(batch_pledge)} 增减持:{len(batch_trades)}")

            if not dry_run:
                if batch_holders:
                    upsert_batch(sb, "stock_holders", batch_holders,
                                 ["ts_code", "end_date", "holder_type", "rank"])
                    total_holders += len(batch_holders)
                    batch_holders = []

                if batch_pledge:
                    upsert_batch(sb, "stock_pledge", batch_pledge,
                                 ["ts_code", "end_date"])
                    total_pledge += len(batch_pledge)
                    batch_pledge = []

                if batch_trades:
                    upsert_batch(sb, "stock_holder_trade", batch_trades,
                                 ["ts_code", "ann_date", "holder_name"])
                    total_trades += len(batch_trades)
                    batch_trades = []
            else:
                total_holders += len(batch_holders)
                total_pledge += len(batch_pledge)
                total_trades += len(batch_trades)
                batch_holders = []
                batch_pledge = []
                batch_trades = []

    return {
        "holders": total_holders,
        "pledge": total_pledge,
        "trades": total_trades,
        "errors": error_count,
        "total": total_holders + total_pledge + total_trades,
    }


# ── 主函数 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="个股事件层数据采集脚本 (REQ-063)")
    parser.add_argument("--mode", choices=["full", "incremental"], default="full",
                        help="full=全量(近3年), incremental=近一个季度")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    parser.add_argument("--limit", type=int, default=0,
                        help="限制采集股票数量（用于测试，0=不限制）")
    args = parser.parse_args()

    print(f"=== stock_events 采集开始 ===")
    print(f"模式: {args.mode} | dry-run: {args.dry_run}")
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    pro, sb = init_clients()

    # 确定时间范围
    if args.mode == "incremental":
        # 增量：最近一个季度
        start_date = (date.today() - timedelta(days=120)).strftime("%Y%m%d")
    else:
        # 全量：近3年
        start_date = START_DATE
    end_date = END_DATE

    print(f"时间范围: {start_date} → {end_date}")

    # 获取股票列表
    stock_list = get_stock_list(sb)
    if args.limit > 0:
        stock_list = stock_list[:args.limit]
        print(f"[TEST] 限制采集前 {args.limit} 只股票")

    # 执行采集
    try:
        stats = collect_all(pro, sb, stock_list, start_date, end_date, dry_run=args.dry_run)

        print(f"\n=== 采集完成 ===")
        print(f"前十大流通股东: {stats['holders']} 条")
        print(f"股权质押统计:   {stats['pledge']} 条")
        print(f"重要股东增减持: {stats['trades']} 条")
        print(f"采集失败股票:   {stats['errors']} 只")
        print(f"总写入行数:     {stats['total']} 条")

        if not args.dry_run:
            # 验证数据库
            r1 = sb.table("stock_holders").select("ts_code", count="exact").execute()
            r2 = sb.table("stock_pledge").select("ts_code", count="exact").execute()
            r3 = sb.table("stock_holder_trade").select("ts_code", count="exact").execute()
            print(f"\n数据库验证:")
            print(f"  stock_holders:      {r1.count} 条")
            print(f"  stock_pledge:       {r2.count} 条")
            print(f"  stock_holder_trade: {r3.count} 条")

    except Exception as e:
        print(f"\n❌ 采集异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
