#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
东方财富研报采集脚本 (REQ-076) - v2.0 治理框架版
================================================
用途：采集东方财富研报中心的个股/行业/宏观研报，写入 reports 宽表。
      此版本已接入 REQ-068 采集治理框架，使用 collect_helper.py 进行
      目标获取和日志记录。

执行方式：
  python3 collect_reports_eastmoney_v2.py [--mode full|incremental] [--dry-run] [--limit N] [--workers N]
  --mode full         全量采集（2025-01-01 至今），默认
  --mode incremental  增量采集（仅最近7天）
  --dry-run           只打印，不写库
  --limit N           限制每种类型采集条数（测试用，如 --limit 5）
  --workers N         并发线程数，默认 8

四段式结构：
  1. 初始化上下文: `CollectionContext`
  2. 获取目标/记录开始: `get_active_target`, `log_start`
  3. 执行采集: `do_collection` (多线程核心逻辑)
  4. 记录结果: `log_success` / `log_failure`
"""
import os
import sys
import time
import argparse
import threading
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from supabase import Client

# 导入采集治理框架
from collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure

# ── 配置 ─────────────────────────────────────────────────────────────────────
MODULE_NAME     = "reports_eastmoney"
API_SLEEP       = 0.2
RETRY_TIMES     = 3
RETRY_SLEEP     = 3
FULL_START_DATE = "2025-01-01"
DEFAULT_WORKERS = 8

QTYPE_MAP = {0: "stock", 1: "industry", 2: "macro"}
MARKET_MAP = {"SHANGHAI": "SH", "SHENZHEN": "SZ", "SH": "SH", "SZ": "SZ", "1": "SH", "0": "SZ"}

# ── 工具函数 (无业务逻辑，保持不变) ───────────────────────────────────────────
EMONEY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://data.eastmoney.com/report/",
    "Accept": "text/javascript, application/javascript, */*",
}

def retry_get(url, params, retries=RETRY_TIMES, sleep_sec=RETRY_SLEEP):
    import json as json_lib
    for i in range(retries):
        try:
            resp = requests.get(url, params=params, headers=EMONEY_HEADERS, timeout=15)
            resp.raise_for_status()
            text = resp.text.strip()
            if text.startswith("datatable(") and text.endswith(")"):
                text = text[len("datatable("):-1]
            return json_lib.loads(text)
        except Exception as e:
            if i < retries - 1:
                time.sleep(sleep_sec)
    return None

def to_ts_code(stock_code: str, market: str):
    if not stock_code: return None
    suffix = MARKET_MAP.get(str(market).upper())
    return f"{stock_code}.{suffix}" if suffix else None

def parse_date(date_str: str):
    if not date_str: return None
    s = str(date_str).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-": return s[:10]
    if s.startswith("/Date("):
        try:
            ts_ms = int(s[6:s.index(")")])
            return datetime.fromtimestamp(ts_ms / 1000).strftime("%Y-%m-%d")
        except Exception: return None
    if len(s) == 8 and s.isdigit(): return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return None

def parse_item(item: dict, qtype: int):
    info_code = item.get("infoCode") or item.get("reportCode")
    if not info_code: return None
    title = (item.get("title") or "").strip()
    pub_date = parse_date(item.get("publishDate") or item.get("tradeDate") or "")
    if not title or not pub_date: return None

    report_type = QTYPE_MAP.get(qtype, "stock")
    ts_code, stock_name = (None, None)
    if report_type == "stock":
        ts_code = to_ts_code(item.get("stockCode") or item.get("secuCode") or "", item.get("market") or item.get("marketCode") or "")
        stock_name = item.get("stockName") or item.get("secuName")

    target_price, page_count = (None, None)
    try: target_price = float(item.get("indvAimPriceT") or item.get("targetPrice"))
    except (ValueError, TypeError, AttributeError): pass
    try: page_count = int(item.get("attachPages") or item.get("pageCount"))
    except (ValueError, TypeError, AttributeError): pass

    return {
        "report_id": f"eastmoney-{info_code}", "source": "eastmoney", "report_type": report_type,
        "publish_date": pub_date, "title": title,
        "org_name": (item.get("orgSName") or item.get("orgName") or "").strip() or None,
        "author": (item.get("researcher") or item.get("author") or "").strip() or None,
        "ts_code": ts_code, "stock_name": stock_name, "industry_name": item.get("industryName") or item.get("indvInduName"),
        "rating": item.get("emRatingName") or item.get("ratingName"), "target_price": target_price,
        "pdf_url": f"https://pdf.dfcfw.com/pdf/H3_{info_code}_1.pdf", "page_count": page_count,
    }

def generate_month_ranges(start_date: str, end_date: str):
    ranges, current = ([], datetime.strptime(start_date, "%Y-%m-%d").date())
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    while current <= end:
        month_end = min(current + relativedelta(months=1) - timedelta(days=1), end)
        ranges.append((current.strftime("%Y-%m-%d"), month_end.strftime("%Y-%m-%d")))
        current += relativedelta(months=1)
    return ranges

# ── 核心采集逻辑 (被 main 调用) ───────────────────────────────────────────────

def fetch_and_upsert_month(sb_client: Client, qtype: int, start_date: str, end_date: str, dry_run: bool, lock: threading.Lock, total_counter: dict):
    """线程池工作单元：采集指定月份区间的所有研报并写入数据库"""
    url, page, page_size, written_in_thread = ("https://reportapi.eastmoney.com/report/list", 1, 100, 0)
    total_pages = 0

    while True:
        params = {
            "cb": "datatable", "industryCode": "*", "pageSize": page_size, "industry": "*",
            "rating": "*", "ratingChange": "*", "beginTime": start_date, "endTime": end_date,
            "pageNo": page, "fields": "", "qType": qtype, "orgCode": "", "code": "*",
            "_": int(time.time() * 1000),
        }
        data = retry_get(url, params)
        if not data or not isinstance(data.get("data"), list) or not data["data"]:
            break

        total_pages = data.get("TotalPage") or 0
        rows = [r for item in data["data"] if (r := parse_item(item, qtype))]

        if rows:
            if not dry_run:
                try:
                    sb_client.table("reports").upsert(rows, on_conflict="report_id").execute()
                    written_in_thread += len(rows)
                except Exception as e:
                    print(f"[DB ERROR] {start_date}~{end_date} 写入失败: {e}", file=sys.stderr)
            else:
                written_in_thread += len(rows)

        with lock:
            total_counter["count"] += len(rows)

        if page >= total_pages and total_pages > 0: break
        page += 1
        time.sleep(API_SLEEP)

    return written_in_thread

def do_collection(context: CollectionContext, args: argparse.Namespace):
    """四段式结构中的“执行采集”环节"""
    end_date = date.today().strftime("%Y-%m-%d")
    start_date = (date.today() - timedelta(days=7)).strftime("%Y-%m-%d") if args.mode == "incremental" else FULL_START_DATE

    print(f"采集模式: {args.mode} | workers: {args.workers} | dry-run: {args.dry_run} | limit: {args.limit}")
    print(f"时间范围: {start_date} ~ {end_date}")

    grand_total = 0
    grand_start = time.time()
    lock = threading.Lock()
    total_counter = {"count": 0}

    for qtype in [0, 1, 2]:  # 0:个股, 1:行业, 2:宏观
        type_name = QTYPE_MAP.get(qtype, "unknown")
        print(f"\n--- 开始采集 [{type_name}] (qType={qtype}) ---")
        month_ranges = generate_month_ranges(start_date, end_date)

        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(fetch_and_upsert_month, context.sb, qtype, s, e, args.dry_run, lock, total_counter): (s, e)
                for s, e in month_ranges
            }
            for future in as_completed(futures):
                s, e = futures[future]
                try:
                    written = future.result()
                    elapsed = time.time() - grand_start
                    speed = total_counter["count"] / elapsed if elapsed > 0 else 0
                    cnt = total_counter["count"]
                    print(f"  ✅ {s}~{e}: {written} 条 | 累计 {cnt} 条 | 速度 {speed:.0f} 条/秒")
                except Exception as exc:
                    print(f"  ❌ {s}~{e}: 失败 - {exc}")

                if args.limit and total_counter["count"] >= args.limit:
                    print(f"  已达到 limit={args.limit}，停止")
                    for f in futures: f.cancel()
                    break
        grand_total = total_counter["count"]

    elapsed = time.time() - grand_start
    print(f"\n--- 采集完毕 ---")
    print(f"总计: {grand_total} 条，耗时 {elapsed:.1f}s，平均速度 {grand_total/elapsed:.0f} 条/秒")
    return grand_total

# ── 入口 (四段式结构) ──────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="东方财富研报采集脚本 (REQ-076) v2.0 治理框架版")
    parser.add_argument("--mode", choices=["full", "incremental"], default="full")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    args = parser.parse_args()

    # 1. 初始化上下文
    context = CollectionContext(MODULE_NAME)
    print(f"--- 开始采集任务: {context.module} (Run ID: {context.run_id}) ---")

    try:
        # 2. 获取目标 & 记录开始
        target = get_active_target(context.sb, MODULE_NAME)
        log_start(context, target)

        # 3. 执行核心采集逻辑
        actual_count = do_collection(context, args)

        # 4. 记录成功
        log_success(context, actual_count)

    except Exception as e:
        # 4. 记录失败
        print(f"❌ 采集任务主流程失败: {e}", file=sys.stderr)
        log_failure(context, e)

    finally:
        # 任务结束
        print(f"--- 采集任务结束: {context.module} | 最终状态: {context.status} ---")

if __name__ == "__main__":
    main()
