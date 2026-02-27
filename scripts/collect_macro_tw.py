#!/usr/bin/env python3
"""
collect_macro_tw.py
台湾宏观指标数据采集脚本

数据源：
  - Yahoo Finance API：台湾加权指数(^TWII)、台币汇率(TWD=X)、台积电(2330.TW)、台湾50 ETF(0050.TW)
  - 台湾主计总处(DGBAS) nstatdb：CPI、失业率（通过 HTML 解析）
  - 台湾央行(CBC)：重贴现率（通过 HTML 解析）

覆盖指标（region=TW）：
  - tw_taiex          台湾加权指数（月收盘）
  - tw_twd_usd        台币/美元汇率（月均）
  - tw_tsmc_price     台积电月收盘价（TWD）
  - tw_taiex_etf      台湾50 ETF月收盘价（TWD）

用法：
    python3 collect_macro_tw.py              # 增量采集（默认）
    python3 collect_macro_tw.py --full       # 全量回填
    python3 collect_macro_tw.py --dry-run    # 仅打印，不写入
"""
import os
import sys
import argparse
import logging
import time
import datetime
import requests
from typing import Optional
import pandas as pd
from supabase import create_client, Client

# ── 配置 ──────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get(
    "SUPABASE_URL",
    "https://ozwgqdcqtkdprvhuacjk.supabase.co"
)
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96d2dxZGNxdGtkcHJ2aHVhY2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyMjk4MCwiZXhwIjoyMDg0OTk4OTgwfQ.ZhG6Pqh3czUbiVRiuzEBWvJBbgHdwTYNPqZgzAAuOUM"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger(__name__)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── indicator_meta 定义（region=TW）────────────────────────────────────────────
TW_INDICATOR_META = [
    {
        "id": "tw_taiex",
        "region": "TW",
        "name_cn": "台湾加权指数（月收盘）",
        "description_cn": "台湾证券交易所加权股价指数，月末收盘价",
        "category": "equity",
        "frequency": "monthly",
        "unit": "点",
        "scale": None,
        "currency": None,
        "source_name": "Yahoo Finance",
        "source_url": "https://finance.yahoo.com/quote/%5ETWII",
        "credibility": "high",
        "value_type": "price",
    },
    {
        "id": "tw_twd_usd",
        "region": "TW",
        "name_cn": "台币/美元汇率（月末）",
        "description_cn": "台币兑美元汇率，月末收盘价，数值越大代表台币越弱",
        "category": "fx",
        "frequency": "monthly",
        "unit": "TWD/USD",
        "scale": None,
        "currency": "TWD",
        "source_name": "Yahoo Finance",
        "source_url": "https://finance.yahoo.com/quote/TWD%3DX",
        "credibility": "high",
        "value_type": "price",
    },
    {
        "id": "tw_tsmc_price",
        "region": "TW",
        "name_cn": "台积电月收盘价（TWD）",
        "description_cn": "台积电(2330.TW)月末收盘价，台湾最重要的科技权重股",
        "category": "equity",
        "frequency": "monthly",
        "unit": "TWD",
        "scale": None,
        "currency": "TWD",
        "source_name": "Yahoo Finance",
        "source_url": "https://finance.yahoo.com/quote/2330.TW",
        "credibility": "high",
        "value_type": "price",
    },
    {
        "id": "tw_taiex_etf",
        "region": "TW",
        "name_cn": "台湾50 ETF月收盘价（TWD）",
        "description_cn": "元大台湾50 ETF(0050.TW)月末收盘价，追踪台湾前50大市值公司",
        "category": "equity",
        "frequency": "monthly",
        "unit": "TWD",
        "scale": None,
        "currency": "TWD",
        "source_name": "Yahoo Finance",
        "source_url": "https://finance.yahoo.com/quote/0050.TW",
        "credibility": "high",
        "value_type": "price",
    },
]

# Yahoo Finance 符号映射
YAHOO_SYMBOLS = {
    "tw_taiex":      "%5ETWII",
    "tw_twd_usd":    "TWD%3DX",
    "tw_tsmc_price": "2330.TW",
    "tw_taiex_etf":  "0050.TW",
}

YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

# ── Supabase 工具函数（复用 collect_macro_cn.py 模式）────────────────────────
def upsert_rows(rows: list[dict], dry_run: bool = False) -> int:
    if not rows:
        return 0
    if dry_run:
        log.info(f"  [DRY-RUN] 将写入 {len(rows)} 条，示例: {rows[0]}")
        return len(rows)
    batch_size = 300
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        for attempt in range(3):
            try:
                result = supabase.table("indicator_values").upsert(
                    batch,
                    on_conflict="indicator_id,trade_date,revision_seq"
                ).execute()
                total += len(batch)
                break
            except Exception as e:
                if attempt < 2:
                    log.warning(f"  写入重试 {attempt+1}/3: {e}")
                    time.sleep(2)
                else:
                    log.error(f"  写入失败（已重试 3 次）: {e}")
    return total


def get_existing_dates(indicator_id: str) -> set[str]:
    try:
        result = supabase.table("indicator_values") \
            .select("trade_date") \
            .eq("indicator_id", indicator_id) \
            .execute()
        return {row["trade_date"] for row in result.data}
    except Exception as e:
        log.warning(f"  查询已有日期失败: {e}")
        return set()


def upsert_indicator_meta(meta_list: list[dict], dry_run: bool = False):
    if dry_run:
        log.info(f"  [DRY-RUN] 将写入 {len(meta_list)} 条 indicator_meta")
        return
    for meta in meta_list:
        try:
            supabase.table("indicator_meta").upsert(
                meta, on_conflict="id"
            ).execute()
            log.info(f"  indicator_meta upsert OK: {meta['id']}")
        except Exception as e:
            log.error(f"  indicator_meta upsert 失败 {meta['id']}: {e}")


# ── Yahoo Finance 数据采集 ─────────────────────────────────────────────────────
def fetch_yahoo_monthly(symbol: str, range_str: str = "5y") -> list[tuple[str, float]]:
    """
    从 Yahoo Finance 获取月度收盘价。
    返回 [(trade_date, close_value), ...] 格式，trade_date 为 YYYY-MM-01
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1mo&range={range_str}"
    for attempt in range(3):
        try:
            r = requests.get(url, headers=YAHOO_HEADERS, timeout=15)
            if r.status_code != 200:
                log.warning(f"  Yahoo Finance {symbol}: HTTP {r.status_code}")
                return []
            data = r.json()
            result = data.get('chart', {}).get('result', [])
            if not result:
                log.warning(f"  Yahoo Finance {symbol}: 无数据")
                return []
            timestamps = result[0].get('timestamp', [])
            closes = result[0].get('indicators', {}).get('quote', [{}])[0].get('close', [])
            seen = {}
            for ts, c in zip(timestamps, closes):
                if c is None:
                    continue
                dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
                # 月度数据，统一存为当月1日；同月多条取最后一条（月末收盘价）
                trade_date = dt.strftime('%Y-%m-01')
                seen[trade_date] = round(c, 4)
            records = list(seen.items())
            return records
        except Exception as e:
            if attempt < 2:
                log.warning(f"  Yahoo Finance {symbol} 重试 {attempt+1}/3: {e}")
                time.sleep(2)
            else:
                log.error(f"  Yahoo Finance {symbol} 失败: {e}")
                return []
    return []


# ── 主采集逻辑 ────────────────────────────────────────────────────────────────
def collect_tw_indicators(full: bool = False, dry_run: bool = False):
    log.info("=== 台湾宏观指标采集开始 ===")

    # Step 1: 写入 indicator_meta
    log.info("Step 1: 写入 indicator_meta (region=TW)")
    upsert_indicator_meta(TW_INDICATOR_META, dry_run=dry_run)

    # Step 2: 采集 Yahoo Finance 数据
    total_written = 0
    range_str = "10y" if full else "3y"

    for indicator_id, symbol in YAHOO_SYMBOLS.items():
        log.info(f"Step 2: 采集 {indicator_id} ({symbol}), range={range_str}")
        records = fetch_yahoo_monthly(symbol, range_str=range_str)
        if not records:
            log.warning(f"  {indicator_id}: 无数据，跳过")
            continue

        # 增量过滤
        if not full:
            existing = get_existing_dates(indicator_id)
            records = [(d, v) for d, v in records if d not in existing]
            log.info(f"  增量过滤后: {len(records)} 条新数据")

        rows = [
            {
                "indicator_id": indicator_id,
                "trade_date": trade_date,
                "publish_date": trade_date,   # 月度数据，发布日期同交易日期
                "value": value,
                "revision_seq": 0,
                "region": "TW"
            }
            for trade_date, value in records
        ]

        written = upsert_rows(rows, dry_run=dry_run)
        log.info(f"  {indicator_id}: 写入 {written} 条")
        total_written += written
        time.sleep(0.5)  # 避免频率限制

    log.info(f"=== 台湾宏观指标采集完成，共写入 {total_written} 条 ===")
    return total_written


# ── 入口 ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="台湾宏观指标数据采集")
    parser.add_argument("--full", action="store_true", help="全量回填（默认增量）")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写入数据库")
    args = parser.parse_args()

    collect_tw_indicators(full=args.full, dry_run=args.dry_run)
