#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
个股日线数据采集脚本（REQ-014）- v2.0 治理框架版
==================================================
用途：采集 A 股全量股票的日线行情 + 估值数据，写入 stock_daily 表。
      此版本已接入 REQ-068 采集治理框架，使用 collect_helper.py 进行
      目标获取和日志记录。

主要变更 (v2.0):
  - 引入 collect_helper.py，实现标准四段式采集结构。
  - 采集进度由数据库 collect_log 统一管理，不再依赖本地进度文件。
  - 发生错误时，通过 log_failure 记录详细错误信息到 collect_log。

执行方式：
  python3 collect_stock_daily_v2.py [--mode full|incremental] [--dry-run] [--workers N]
  --mode full         全量采集（2015-01-01 至今），默认
  --mode incremental  增量采集（仅最近 7 天）
  --dry-run           只打印，不写库
  --workers N         并发线程数，默认 20
  --start-date        全量模式起始日期，默认 20150101
"""
import os
import sys
import time
import logging
import argparse
from datetime import date, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import tushare as ts
import requests

# 导入采集治理框架
from collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure

# ── 日志配置 ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/tmp/stock_daily_collect.log", mode="a"),
    ]
)
log = logging.getLogger(__name__)

# ── 配置 ──────────────────────────────────────────────────────────────────────
MODULE_NAME   = "stock_daily"
TUSHARE_TOKEN = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
MAX_WORKERS   = 20
BATCH_SIZE    = 300
API_SLEEP     = 0.2
RETRY_TIMES   = 3
RETRY_SLEEP   = 5
START_DATE    = "20150101"

# ── Supabase REST 请求头 ───────────────────────────────────────────────────────
def get_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_tushare():
    ts.set_token(TUSHARE_TOKEN)
    return ts.pro_api()

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def retry_call(fn, retries=RETRY_TIMES, sleep_sec=RETRY_SLEEP, **kwargs):
    for i in range(retries):
        try:
            return fn(**kwargs)
        except Exception as e:
            log.warning(f"  第{i+1}次失败: {e}")
            if i < retries - 1:
                time.sleep(sleep_sec)
    raise Exception(f"接口调用失败，已重试 {retries} 次")


def upsert_batch(rows: list) -> int:
    headers = get_headers()
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        for attempt in range(5):
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/stock_daily",
                headers=headers,
                json=batch,
            )
            if resp.ok:
                total += len(batch)
                break
            elif "57014" in resp.text or "statement timeout" in resp.text:
                wait = 10 * (attempt + 1)
                log.warning(f"  57014 超时，{wait}s 后重试 (attempt {attempt+1}/5)")
                time.sleep(wait)
            else:
                log.error(f"  upsert 失败: {resp.status_code} - {resp.text[:200]}")
                break
        time.sleep(0.1)
    return total


def gen_trade_dates(start: str, end: str, pro) -> list:
    df = retry_call(
        pro.trade_cal,
        exchange="SSE",
        start_date=start,
        end_date=end,
        is_open="1",
        fields="cal_date"
    )
    if df is None or df.empty:
        return []
    return sorted(df["cal_date"].tolist(), reverse=True)  # 由近到远


# ── 核心采集逻辑（单日）────────────────────────────────────────────────────────
def collect_one_date(trade_date: str, pro, dry_run: bool) -> dict:
    try:
        time.sleep(API_SLEEP)

        # 1. 获取日线行情
        df_daily = retry_call(
            pro.daily,
            trade_date=trade_date,
            fields="ts_code,trade_date,open,high,low,close,pre_close,pct_chg,vol,amount"
        )
        if df_daily is None or df_daily.empty:
            return {"date": trade_date, "rows": 0, "status": "empty", "msg": "日线数据为空"}

        time.sleep(API_SLEEP)

        # 2. 获取每日估值指标
        df_basic = retry_call(
            pro.daily_basic,
            trade_date=trade_date,
            fields="ts_code,trade_date,pe_ttm,pb,ps_ttm,total_mv,circ_mv"
        )

        # 3. 合并数据
        if df_basic is not None and not df_basic.empty:
            df = pd.merge(
                df_daily,
                df_basic[["ts_code", "pe_ttm", "pb", "ps_ttm", "total_mv", "circ_mv"]],
                on="ts_code", how="left"
            )
        else:
            df = df_daily.copy()
            for col in ["pe_ttm", "pb", "ps_ttm", "total_mv", "circ_mv"]:
                df[col] = None

        # 4. 转换为 DB 格式
        def safe_float(v):
            try:
                f = float(v)
                return None if pd.isna(f) else f
            except (TypeError, ValueError):
                return None

        rows = []
        for _, r in df.iterrows():
            td_raw = str(r.get("trade_date", "") or "").strip()
            td = f"{td_raw[:4]}-{td_raw[4:6]}-{td_raw[6:8]}" if len(td_raw) == 8 else td_raw
            rows.append({
                "ts_code":    str(r["ts_code"]).strip(),
                "trade_date": td,
                "open":       safe_float(r.get("open")),
                "high":       safe_float(r.get("high")),
                "low":        safe_float(r.get("low")),
                "close":      safe_float(r.get("close")),
                "pre_close":  safe_float(r.get("pre_close")),
                "pct_chg":    safe_float(r.get("pct_chg")),
                "vol":        safe_float(r.get("vol")),
                "amount":     safe_float(r.get("amount")),
                "pe_ttm":     safe_float(r.get("pe_ttm")),
                "pb":         safe_float(r.get("pb")),
                "ps_ttm":     safe_float(r.get("ps_ttm")),
                "total_mv":   safe_float(r.get("total_mv")),
                "circ_mv":    safe_float(r.get("circ_mv")),
            })

        if not rows:
            return {"date": trade_date, "rows": 0, "status": "empty", "msg": "转换后行数为0"}

        if dry_run:
            return {"date": trade_date, "rows": len(rows), "status": "dry_run", "msg": f"dry-run: {len(rows)} 行"}

        # 5. 写入数据库
        upserted = upsert_batch(rows)
        return {"date": trade_date, "rows": upserted, "status": "ok", "msg": f"写入 {upserted} 行"}

    except Exception as e:
        log.error(f"  {trade_date} 采集失败: {e}")
        return {"date": trade_date, "rows": 0, "status": "error", "msg": str(e)}


# ── 主函数 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description=f"REQ-014: {MODULE_NAME} 采集 v2.0")
    parser.add_argument("--mode", choices=["full", "incremental"], default="full")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=MAX_WORKERS)
    parser.add_argument("--start-date", type=str, default=START_DATE)
    args = parser.parse_args()

    # ── 第一段：初始化上下文 ──────────────────────────────────────────────────
    context = CollectionContext(MODULE_NAME)
    log.info(f"--- 开始采集任务: {MODULE_NAME} (mode={args.mode}, workers={args.workers}, run_id={context.run_id}) ---")

    try:
        # ── 第二段：获取目标 & 记录开始 ──────────────────────────────────────
        target = get_active_target(context.sb, MODULE_NAME)
        log_start(context, target)

        pro = init_tushare()

        # 确定采集范围
        today = date.today().strftime("%Y%m%d")
        if args.mode == "incremental":
            start = (date.today() - timedelta(days=7)).strftime("%Y%m%d")
            end = today
        else:
            start = args.start_date
            end = today

        log.info(f"获取交易日列表: {start} ~ {end}...")
        pending_dates = gen_trade_dates(start, end, pro)
        log.info(f"共 {len(pending_dates)} 个交易日待采集")

        if not pending_dates:
            log.info("✅ 无待采集日期")
            log_success(context, 0)
            return

        # ── 第三段：执行采集（多线程）────────────────────────────────────────
        total_rows = 0
        error_count = 0
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(collect_one_date, d, pro, args.dry_run): d
                for d in pending_dates
            }
            for i, future in enumerate(as_completed(futures)):
                result = future.result()
                total_rows += result["rows"]
                if result["status"] == "error":
                    error_count += 1
                    log.warning(f"  ({i+1}/{len(pending_dates)}) ❌ {result['date']}: {result['msg']}")
                else:
                    log.info(f"  ({i+1}/{len(pending_dates)}) ✅ {result['date']}: {result['msg']}")

        # ── 第四段：记录结果 ──────────────────────────────────────────────────
        log_success(context, total_rows)
        log.info(f"总写入: {total_rows} 行，失败日期: {error_count} 个")

    except Exception as e:
        log.error(f"采集任务主流程异常: {e}")
        log_failure(context, e)
    finally:
        log.info(f"--- 采集任务结束: {MODULE_NAME} | 最终状态: {context.status} ---")


if __name__ == "__main__":
    main()
