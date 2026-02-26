#!/usr/bin/env python3
"""
collect_macro_cn.py
中国宏观指标数据采集脚本
覆盖 indicator_meta 中全部 14 个 CN 指标，写入 indicator_values 表

用法：
    python3 collect_macro_cn.py              # 增量采集（默认）
    python3 collect_macro_cn.py --full       # 全量回填（历史所有数据）
    python3 collect_macro_cn.py --dry-run    # 仅打印，不写入数据库

依赖：
    pip install akshare requests pandas
"""

import os
import sys
import argparse
import logging
import time
from datetime import date, datetime
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

# ── Supabase SDK 客户端 ─────────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def upsert_rows(rows: list[dict], dry_run: bool = False) -> int:
    """批量 upsert 到 indicator_values，返回写入条数。内置重试机制。"""
    if not rows:
        return 0
    if dry_run:
        log.info(f"  [DRY-RUN] 将写入 {len(rows)} 条，示例: {rows[0]}")
        return len(rows)

    # 分批写入，每批 300 条
    batch_size = 300
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        for attempt in range(3):  # 最多重试 3 次
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
    """查询已有的 trade_date 集合，用于增量判断。"""
    try:
        result = supabase.table("indicator_values") \
            .select("trade_date") \
            .eq("indicator_id", indicator_id) \
            .execute()
        return {r["trade_date"] for r in result.data}
    except Exception:
        return set()


# ── 日期解析工具 ───────────────────────────────────────────────────────────────
def parse_cn_month(s: str) -> Optional[str]:
    """
    将各种中文/数字月份格式转为 YYYY-MM-01 字符串。
    支持：'2025年12月份'、'202512'、'2025-12'、'2025-12-01' 等
    """
    s = str(s).strip()
    # 格式：2025年12月份 / 2025年12月
    if "年" in s and "月" in s:
        try:
            year = s.split("年")[0]
            month = s.split("年")[1].replace("月份", "").replace("月", "")
            return f"{year}-{int(month):02d}-01"
        except Exception:
            return None
    # 格式：202512（6位数字）
    if len(s) == 6 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-01"
    # 格式：2025-12 / 2025-12-01
    if len(s) >= 7 and s[4] == "-":
        parts = s.split("-")
        if len(parts) >= 2:
            return f"{parts[0]}-{int(parts[1]):02d}-01"
    return None


def parse_date_str(s: str) -> Optional[str]:
    """将 '2025-07-09' 等字符串转为 YYYY-MM-DD，无效返回 None。"""
    try:
        return pd.to_datetime(s).strftime("%Y-%m-%d")
    except Exception:
        return None


def to_float(v) -> Optional[float]:
    """安全转 float，NaN/None 返回 None。"""
    try:
        f = float(v)
        return None if pd.isna(f) else f
    except (TypeError, ValueError):
        return None


# ── 各指标采集函数 ─────────────────────────────────────────────────────────────
import akshare as ak


def collect_cpi_yoy(full: bool, existing: set) -> list[dict]:
    """cn_cpi_yoy: CPI 同比增速（%），月度，发布日即为 trade_date"""
    log.info("采集 cn_cpi_yoy ...")
    df = ak.macro_china_cpi_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_cpi_yoy",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_ppi_yoy(full: bool, existing: set) -> list[dict]:
    """cn_ppi_yoy: PPI 同比增速（%），月度"""
    log.info("采集 cn_ppi_yoy ...")
    df = ak.macro_china_ppi_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_ppi_yoy",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_gdp_yoy(full: bool, existing: set) -> list[dict]:
    """cn_gdp_yoy: GDP 同比增速（%），季度，日期为发布日"""
    log.info("采集 cn_gdp_yoy ...")
    df = ak.macro_china_gdp_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_gdp_yoy",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_pmi_mfg(full: bool, existing: set) -> list[dict]:
    """cn_pmi_mfg: 官方制造业 PMI（点），月度"""
    log.info("采集 cn_pmi_mfg ...")
    df = ak.macro_china_pmi_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_pmi_mfg",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_pmi_service(full: bool, existing: set) -> list[dict]:
    """cn_pmi_service: 官方非制造业 PMI（点），月度"""
    log.info("采集 cn_pmi_service ...")
    df = ak.macro_china_non_man_pmi()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_pmi_service",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_m2_yoy(full: bool, existing: set) -> list[dict]:
    """cn_m2_yoy: M2 货币供应同比（%），月度"""
    log.info("采集 cn_m2_yoy ...")
    df = ak.macro_china_m2_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_m2_yoy",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_social_finance(full: bool, existing: set) -> list[dict]:
    """
    cn_social_finance: 社会融资规模增量（亿元），月度
    数据源：macro_china_shrzgm，月份格式 YYYYMM
    trade_date 取当月最后一天（用月份+01作为 trade_date，语义为"当月数据"）
    """
    log.info("采集 cn_social_finance ...")
    df = ak.macro_china_shrzgm()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_cn_month(r["月份"])
        value = to_float(r["社会融资规模增量"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_social_finance",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_new_loans(full: bool, existing: set) -> list[dict]:
    """
    cn_new_loans: 新增人民币贷款（亿元），月度
    数据源：macro_rmb_loan，月份格式 YYYY-MM
    """
    log.info("采集 cn_new_loans ...")
    df = ak.macro_rmb_loan()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_cn_month(r["月份"])
        value = to_float(r["新增人民币贷款-总额"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_new_loans",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_export_yoy(full: bool, existing: set) -> list[dict]:
    """cn_export_yoy: 出口金额同比（%，以美元计），月度"""
    log.info("采集 cn_export_yoy ...")
    df = ak.macro_china_exports_yoy()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_export_yoy",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_import_yoy(full: bool, existing: set) -> list[dict]:
    """cn_import_yoy: 进口金额同比（%，以美元计），月度"""
    log.info("采集 cn_import_yoy ...")
    df = ak.macro_china_imports_yoy()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_import_yoy",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_industrial_yoy(full: bool, existing: set) -> list[dict]:
    """cn_industrial_yoy: 规模以上工业增加值同比（%），月度"""
    log.info("采集 cn_industrial_yoy ...")
    df = ak.macro_china_industrial_production_yoy()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["日期"])
        value = to_float(r["今值"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_industrial_yoy",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_retail_yoy(full: bool, existing: set) -> list[dict]:
    """
    cn_retail_yoy: 社会消费品零售总额同比（%），月度
    数据源：macro_china_consumer_goods_retail，月份格式 '2025年12月份'
    取"同比增长"字段
    """
    log.info("采集 cn_retail_yoy ...")
    df = ak.macro_china_consumer_goods_retail()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_cn_month(r["月份"])
        value = to_float(r["同比增长"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_retail_yoy",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_fai_yoy(full: bool, existing: set) -> list[dict]:
    """
    cn_fai_yoy: 固定资产投资同比（%），月度（累计同比）
    数据源：macro_china_gdzctz，月份格式 '2025年12月份'
    取"同比增长"字段（累计同比）
    """
    log.info("采集 cn_fai_yoy ...")
    df = ak.macro_china_gdzctz()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_cn_month(r["月份"])
        value = to_float(r["同比增长"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_fai_yoy",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def collect_lpr_1y(full: bool, existing: set) -> list[dict]:
    """
    cn_lpr_1y: 1年期贷款市场报价利率（%），月度
    数据源：macro_china_lpr，日期格式 YYYY-MM-DD
    """
    log.info("采集 cn_lpr_1y ...")
    df = ak.macro_china_lpr()
    rows = []
    for _, r in df.iterrows():
        trade_date = parse_date_str(r["TRADE_DATE"])
        value = to_float(r["LPR1Y"])
        if not trade_date or value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "cn_lpr_1y",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


# ── 指标注册表 ─────────────────────────────────────────────────────────────────
COLLECTORS = {
    "cn_cpi_yoy":        collect_cpi_yoy,
    "cn_ppi_yoy":        collect_ppi_yoy,
    "cn_gdp_yoy":        collect_gdp_yoy,
    "cn_pmi_mfg":        collect_pmi_mfg,
    "cn_pmi_service":    collect_pmi_service,
    "cn_m2_yoy":         collect_m2_yoy,
    "cn_social_finance": collect_social_finance,
    "cn_new_loans":      collect_new_loans,
    "cn_export_yoy":     collect_export_yoy,
    "cn_import_yoy":     collect_import_yoy,
    "cn_industrial_yoy": collect_industrial_yoy,
    "cn_retail_yoy":     collect_retail_yoy,
    "cn_fai_yoy":        collect_fai_yoy,
    "cn_lpr_1y":         collect_lpr_1y,
}


# ── 主函数 ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="中国宏观指标采集脚本")
    parser.add_argument("--full", action="store_true", help="全量回填历史数据")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写入数据库")
    parser.add_argument("--indicator", type=str, default=None,
                        help="仅采集指定指标，如 --indicator cn_cpi_yoy")
    args = parser.parse_args()

    mode = "全量回填" if args.full else "增量采集"
    log.info(f"=== 中国宏观指标采集开始（{mode}）===")
    if args.dry_run:
        log.info(">>> DRY-RUN 模式，不写入数据库 <<<")

    # 确定采集范围
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
            summary[indicator_id] = {"fetched": len(rows), "written": written, "status": "✅"}
            log.info(f"  {indicator_id}: 获取 {len(rows)} 条，写入 {written} 条")
        except Exception as e:
            summary[indicator_id] = {"fetched": 0, "written": 0, "status": f"❌ {e}"}
            log.error(f"  {indicator_id}: 采集失败 - {e}")

    # 汇总报告
    log.info("\n=== 采集汇总 ===")
    total_written = 0
    for iid, s in summary.items():
        log.info(f"  {s['status']} {iid}: 写入 {s['written']} 条")
        total_written += s["written"]
    log.info(f"\n合计写入: {total_written} 条")
    log.info("=== 采集完成 ===")


if __name__ == "__main__":
    main()
