#!/usr/bin/env python3
"""
update_cn_monthly_2025.py
CN 月度宏观指标增量更新脚本（使用无前缀 indicator_id + region='CN' 格式）

目标指标：
  cpi_yoy, ppi_yoy, pmi_mfg, pmi_non_mfg, m2_yoy,
  export_yoy, import_yoy, industrial_yoy

用法：
    python3 update_cn_monthly_2025.py              # 增量更新（默认）
    python3 update_cn_monthly_2025.py --full       # 全量回填
    python3 update_cn_monthly_2025.py --dry-run    # 仅打印，不写入
"""

import os
import sys
import argparse
import logging
import time
from typing import Optional
import pandas as pd
import akshare as ak
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger(__name__)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def to_float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if pd.isna(f) else f
    except (TypeError, ValueError):
        return None


def parse_date_str(s: str) -> Optional[str]:
    try:
        return pd.to_datetime(s).strftime("%Y-%m-%d")
    except Exception:
        return None


def parse_cn_month(s: str) -> Optional[str]:
    s = str(s).strip()
    if "年" in s and "月" in s:
        try:
            year = s.split("年")[0]
            month = s.split("年")[1].replace("月份", "").replace("月", "")
            return f"{year}-{int(month):02d}-01"
        except Exception:
            return None
    if len(s) == 6 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-01"
    if len(s) >= 7 and s[4] == "-":
        parts = s.split("-")
        if len(parts) >= 2:
            return f"{parts[0]}-{int(parts[1]):02d}-01"
    return None


def get_existing_dates(indicator_id: str, region: str = "CN") -> set:
    try:
        result = supabase.table("indicator_values") \
            .select("trade_date") \
            .eq("indicator_id", indicator_id) \
            .eq("region", region) \
            .execute()
        return {r["trade_date"] for r in result.data}
    except Exception as e:
        log.warning(f"查询已有日期失败: {e}")
        return set()


def upsert_rows(rows: list, dry_run: bool = False) -> int:
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
                supabase.table("indicator_values").upsert(
                    batch,
                    on_conflict="indicator_id,trade_date,revision_seq,region"
                ).execute()
                total += len(batch)
                break
            except Exception as e:
                if attempt < 2:
                    log.warning(f"  写入重试 {attempt+1}/3: {e}")
                    time.sleep(2)
                else:
                    log.error(f"  写入失败: {e}")
    return total


def make_row(indicator_id: str, trade_date: str, value: float, region: str = "CN") -> dict:
    return {
        "indicator_id": indicator_id,
        "region": region,
        "trade_date": trade_date,
        "publish_date": trade_date,
        "value": value,
        "revision_seq": 0,
    }


# ── 各指标采集函数 ─────────────────────────────────────────────────────────────

def collect_cpi_yoy(full: bool, existing: set) -> list:
    log.info("采集 cpi_yoy (CN) ...")
    df = ak.macro_china_cpi_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append(make_row("cpi_yoy", trade_date, value))
    return rows


def collect_ppi_yoy(full: bool, existing: set) -> list:
    log.info("采集 ppi_yoy (CN) ...")
    df = ak.macro_china_ppi_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append(make_row("ppi_yoy", trade_date, value))
    return rows


def collect_pmi_mfg(full: bool, existing: set) -> list:
    log.info("采集 pmi_mfg (CN) ...")
    df = ak.macro_china_pmi_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append(make_row("pmi_mfg", trade_date, value))
    return rows


def collect_pmi_non_mfg(full: bool, existing: set) -> list:
    log.info("采集 pmi_non_mfg (CN) ...")
    df = ak.macro_china_non_man_pmi()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append(make_row("pmi_non_mfg", trade_date, value))
    return rows


def collect_m2_yoy(full: bool, existing: set) -> list:
    log.info("采集 m2_yoy (CN) ...")
    df = ak.macro_china_m2_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append(make_row("m2_yoy", trade_date, value))
    return rows


def collect_export_yoy(full: bool, existing: set) -> list:
    log.info("采集 export_yoy (CN) ...")
    df = ak.macro_china_exports_yoy()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append(make_row("export_yoy", trade_date, value))
    return rows


def collect_import_yoy(full: bool, existing: set) -> list:
    log.info("采集 import_yoy (CN) ...")
    df = ak.macro_china_imports_yoy()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append(make_row("import_yoy", trade_date, value))
    return rows


def collect_industrial_yoy(full: bool, existing: set) -> list:
    log.info("采集 industrial_yoy (CN) ...")
    df = ak.macro_china_industrial_production_yoy()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append(make_row("industrial_yoy", trade_date, value))
    return rows


# ── 指标注册表 ─────────────────────────────────────────────────────────────────
COLLECTORS = {
    "cpi_yoy":        collect_cpi_yoy,
    "ppi_yoy":        collect_ppi_yoy,
    "pmi_mfg":        collect_pmi_mfg,
    "pmi_non_mfg":    collect_pmi_non_mfg,
    "m2_yoy":         collect_m2_yoy,
    "export_yoy":     collect_export_yoy,
    "import_yoy":     collect_import_yoy,
    "industrial_yoy": collect_industrial_yoy,
}


def main():
    parser = argparse.ArgumentParser(description="CN 月度宏观指标增量更新")
    parser.add_argument("--full", action="store_true", help="全量回填历史数据")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写入数据库")
    parser.add_argument("--indicator", type=str, default=None,
                        help="仅采集指定指标，如 --indicator cpi_yoy")
    args = parser.parse_args()

    mode = "全量回填" if args.full else "增量采集"
    log.info(f"=== CN 月度指标更新开始（{mode}）===")
    if args.dry_run:
        log.info(">>> DRY-RUN 模式，不写入数据库 <<<")

    targets = COLLECTORS
    if args.indicator:
        if args.indicator not in COLLECTORS:
            log.error(f"未知指标: {args.indicator}，可选: {list(COLLECTORS.keys())}")
            sys.exit(1)
        targets = {args.indicator: COLLECTORS[args.indicator]}

    summary = {}
    for indicator_id, collector_fn in targets.items():
        try:
            existing = set() if args.full else get_existing_dates(indicator_id)
            rows = collector_fn(full=args.full, existing=existing)
            written = upsert_rows(rows, dry_run=args.dry_run)
            summary[indicator_id] = {"fetched": len(rows), "written": written, "status": "OK"}
            log.info(f"  {indicator_id}: 获取 {len(rows)} 条新数据，写入 {written} 条")
        except Exception as e:
            summary[indicator_id] = {"fetched": 0, "written": 0, "status": f"FAIL: {e}"}
            log.error(f"  {indicator_id}: 采集失败 - {e}")

    log.info("\n=== 采集汇总 ===")
    total_written = 0
    for iid, s in summary.items():
        status_icon = "✅" if s["status"] == "OK" else "❌"
        log.info(f"  {status_icon} {iid}: 写入 {s['written']} 条  ({s['status']})")
        total_written += s["written"]
    log.info(f"\n合计写入: {total_written} 条")
    log.info("=== 采集完成 ===")


if __name__ == "__main__":
    main()
