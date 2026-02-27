#!/usr/bin/env python3
"""
collect_macro_eu.py — 欧元区宏观指标采集脚本
============================================================
数据源策略：
  - ECB SDW API (data-api.ecb.europa.eu)：CPI、失业率、GDP、M2 YoY、10年债、ECB利率
  - FRED API (fred.stlouisfed.org)：ECB 利率补充、current_account_gdp（IMF）
  - IMF DataMapper API：current_account_gdp（年度）

indicator_id 命名规范（第一性原理）：
  ✅ 正确：cpi_yoy (region=EU)
  ❌ 错误：eu_cpi_yoy

运行方式：
  python3 collect_macro_eu.py --full          # 全量回填
  python3 collect_macro_eu.py                 # 增量（默认）
  python3 collect_macro_eu.py --dry-run       # 不写入数据库，仅打印
  python3 collect_macro_eu.py --indicator cpi_yoy  # 只采集单个指标

踩坑记录：
  1. ECB API 的 FM（利率）数据集 key 格式特殊，需用 FRED 的 ECBDFR/ECBMRRFR 替代
  2. ECB M2 的 BSI 数据集返回的是绝对值，需手动计算 YoY
  3. ECB GDP 数据集 MNA 返回的是指数，需手动计算 YoY
  4. 欧元区 region 统一用 'EU'（代表欧元区，非欧盟）
============================================================
"""

import os
import sys
import logging
import argparse
import requests
import pandas as pd
from io import StringIO
from datetime import datetime, timedelta
from supabase import create_client

# ── 日志配置 ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger(__name__)

# ── Supabase 连接 ─────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ozwgqdcqtkdprvhuacjk.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96d2dxZGNxdGtkcHJ2aHVhY2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyMjk4MCwiZXhwIjoyMDg0OTk4OTgwfQ.ZhG6Pqh3czUbiVRiuzEBWvJBbgHdwTYNPqZgzAAuOUM")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

REGION = "EU"
BATCH_SIZE = 500

# ── ECB API 基础 URL ──────────────────────────────────────
ECB_BASE = "https://data-api.ecb.europa.eu/service/data/{}/{}?format=csvdata"
FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"
IMF_BASE  = "https://www.imf.org/external/datamapper/api/v1/{}/{}"

# ── 指标元数据定义 ────────────────────────────────────────
INDICATOR_META = {
    "cpi_yoy": {
        "name_cn": "欧元区CPI同比增速(HICP)",
        "description_cn": "欧元区调和消费者价格指数同比变动率，ECB通胀目标锚定指标",
        "category": "macro",
        "frequency": "monthly",
        "unit": "%",
        "value_type": "yoy",
        "source_name": "ECB SDW",
        "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    },
    "unemployment_rate": {
        "name_cn": "欧元区失业率",
        "description_cn": "欧元区季节调整失业率（15-74岁劳动年龄人口）",
        "category": "macro",
        "frequency": "monthly",
        "unit": "%",
        "value_type": "rate",
        "source_name": "ECB SDW",
        "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    },
    "gdp_yoy": {
        "name_cn": "欧元区GDP实际同比增速",
        "description_cn": "欧元区实际GDP季度同比增速，衡量经济增长动能",
        "category": "macro",
        "frequency": "quarterly",
        "unit": "%",
        "value_type": "yoy",
        "source_name": "ECB SDW",
        "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    },
    "policy_rate": {
        "name_cn": "ECB存款便利利率",
        "description_cn": "欧洲央行存款便利利率（Deposit Facility Rate），欧元区货币政策基准利率",
        "category": "macro",
        "frequency": "daily",
        "unit": "%",
        "value_type": "rate",
        "source_name": "FRED/ECB",
        "source_url": "https://fred.stlouisfed.org",
        "credibility": "high",
    },
    "bond_10y": {
        "name_cn": "欧元区10年期国债收益率",
        "description_cn": "欧元区AAA级政府债券10年期到期收益率（ECB合成指标）",
        "category": "macro",
        "frequency": "monthly",
        "unit": "%",
        "value_type": "rate",
        "source_name": "ECB SDW",
        "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    },
    "m2_yoy": {
        "name_cn": "欧元区M2同比增速",
        "description_cn": "欧元区广义货币供应量M2同比变动率",
        "category": "macro",
        "frequency": "monthly",
        "unit": "%",
        "value_type": "yoy",
        "source_name": "ECB SDW",
        "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    },
    "current_account_gdp": {
        "name_cn": "欧元区经常账户/GDP",
        "description_cn": "欧元区经常账户余额占GDP比例，衡量对外经济平衡",
        "category": "macro",
        "frequency": "annual",
        "unit": "%",
        "value_type": "rate",
        "source_name": "IMF DataMapper",
        "source_url": "https://www.imf.org/external/datamapper",
        "credibility": "high",
    },
    "pmi_mfg": {
        "name_cn": "欧元区制造业PMI",
        "description_cn": "欧元区制造业采购经理人指数，50为荣枯分界线",
        "category": "macro",
        "frequency": "monthly",
        "unit": "点",
        "value_type": "index",
        "source_name": "ECB SDW / S&P Global",
        "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    },
}


# ── 工具函数 ──────────────────────────────────────────────
def get_existing_dates(indicator_id: str) -> set:
    """获取数据库中已有的日期集合（增量采集用）"""
    r = supabase.table("indicator_values") \
        .select("trade_date") \
        .eq("indicator_id", indicator_id) \
        .eq("region", REGION) \
        .execute()
    return {row["trade_date"][:10] for row in r.data}


def upsert_meta(indicator_id: str, dry_run: bool = False):
    """注册或更新指标元数据"""
    meta = INDICATOR_META[indicator_id].copy()
    meta["id"] = indicator_id
    meta["region"] = REGION
    if dry_run:
        log.info(f"  [DRY-RUN] 注册元数据: {indicator_id} (region={REGION})")
        return
    supabase.table("indicator_meta").upsert(meta, on_conflict="id,region").execute()


def upsert_values(rows: list, dry_run: bool = False) -> int:
    """批量写入时序数据"""
    if not rows:
        return 0
    if dry_run:
        log.info(f"  [DRY-RUN] 将写入 {len(rows)} 条，示例: {rows[0]}")
        return len(rows)
    written = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        supabase.table("indicator_values").upsert(
            batch,
            on_conflict="indicator_id,region,trade_date,revision_seq"
        ).execute()
        written += len(batch)
    return written


def build_row(indicator_id: str, date_str: str, value: float) -> dict:
    return {
        "indicator_id": indicator_id,
        "region": REGION,
        "trade_date": date_str,
        "publish_date": date_str,
        "value": round(float(value), 4),
        "revision_seq": 0,
    }


# ── 各指标采集函数 ────────────────────────────────────────

def fetch_cpi_yoy(existing: set) -> list:
    """ECB HICP 同比增速（月度，%）"""
    url = ECB_BASE.format("ICP", "M.U2.N.000000.4.ANR")
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    df = pd.read_csv(StringIO(r.text))
    df = df[["TIME_PERIOD", "OBS_VALUE"]].dropna()
    df["date"] = df["TIME_PERIOD"].astype(str) + "-01"
    rows = []
    for _, row in df.iterrows():
        if row["date"] not in existing:
            try:
                rows.append(build_row("cpi_yoy", row["date"], row["OBS_VALUE"]))
            except (ValueError, TypeError):
                pass
    return rows


def fetch_unemployment_rate(existing: set) -> list:
    """ECB 失业率（月度，%）"""
    # LFSI 数据集：欧元区（I8=欧元区19国）失业率
    url = ECB_BASE.format("LFSI", "M.I8.S.UNEHRT.TOTAL0.15_74.T")
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    df = pd.read_csv(StringIO(r.text))
    df = df[["TIME_PERIOD", "OBS_VALUE"]].dropna()
    df["date"] = df["TIME_PERIOD"].astype(str) + "-01"
    rows = []
    for _, row in df.iterrows():
        if row["date"] not in existing:
            try:
                rows.append(build_row("unemployment_rate", row["date"], row["OBS_VALUE"]))
            except (ValueError, TypeError):
                pass
    return rows


def fetch_gdp_yoy(existing: set) -> list:
    """ECB GDP 同比增速（季度，%）- 通过 MNA 数据集计算 YoY"""
    # 获取欧元区 GDP 实际量指数（季度）
    url = ECB_BASE.format("MNA", "Q.Y.I8.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.LR.GY")
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    df = pd.read_csv(StringIO(r.text))
    df = df[["TIME_PERIOD", "OBS_VALUE"]].dropna()
    # 季度转日期：2024-Q1 → 2024-01-01
    def quarter_to_date(q_str):
        year, q = q_str.split("-Q")
        month = (int(q) - 1) * 3 + 1
        return f"{year}-{month:02d}-01"
    df["date"] = df["TIME_PERIOD"].apply(quarter_to_date)
    df["value"] = pd.to_numeric(df["OBS_VALUE"], errors="coerce")
    df = df.dropna(subset=["value"]).sort_values("date")
    # 计算 YoY（4期前）
    df["yoy"] = df["value"].pct_change(4) * 100
    df = df.dropna(subset=["yoy"])
    rows = []
    for _, row in df.iterrows():
        if row["date"] not in existing:
            rows.append(build_row("gdp_yoy", row["date"], row["yoy"]))
    return rows


def fetch_policy_rate(existing: set) -> list:
    """ECB 存款便利利率（日度，%）- 通过 FRED 获取"""
    url = FRED_BASE.format("ECBDFR")
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    df = pd.read_csv(StringIO(r.text))
    df.columns = ["date", "value"]
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"])
    rows = []
    for _, row in df.iterrows():
        if row["date"] not in existing:
            rows.append(build_row("policy_rate", row["date"], row["value"]))
    return rows


def fetch_bond_10y(existing: set) -> list:
    """欧元区 AAA 级政府债券 10 年期收益率（月度，%）
    
    注意：ECB YC 数据集的 TIME_PERIOD 是日期格式（如 2004-09-06），
    不是月份格式，需直接使用，不能拼接 -01。
    """
    url = ECB_BASE.format("YC", "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y")
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    df = pd.read_csv(StringIO(r.text))
    df = df[["TIME_PERIOD", "OBS_VALUE"]].dropna()
    # TIME_PERIOD 已经是完整日期格式（YYYY-MM-DD），直接使用
    df["date"] = df["TIME_PERIOD"].astype(str)
    rows = []
    for _, row in df.iterrows():
        if row["date"] not in existing:
            try:
                rows.append(build_row("bond_10y", row["date"], row["OBS_VALUE"]))
            except (ValueError, TypeError):
                pass
    return rows


def fetch_m2_yoy(existing: set) -> list:
    """欧元区 M2 同比增速（月度，%）- ECB BSI 数据集"""
    # 获取 M2 绝对值，手动计算 YoY
    url = ECB_BASE.format("BSI", "M.U2.Y.V.M20.X.1.U2.2300.Z01.E")
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    df = pd.read_csv(StringIO(r.text))
    df = df[["TIME_PERIOD", "OBS_VALUE"]].dropna()
    df["date"] = df["TIME_PERIOD"].astype(str) + "-01"
    df["value"] = pd.to_numeric(df["OBS_VALUE"], errors="coerce")
    df = df.dropna(subset=["value"]).sort_values("date")
    df["yoy"] = df["value"].pct_change(12) * 100
    df = df.dropna(subset=["yoy"])
    rows = []
    for _, row in df.iterrows():
        if row["date"] not in existing:
            rows.append(build_row("m2_yoy", row["date"], row["yoy"]))
    return rows


def fetch_current_account_gdp(existing: set) -> list:
    """欧元区经常账户/GDP（季度，%）- FRED BPCAEU
    
    注意：IMF DataMapper 不包含欧元区整体数据，
    改用 FRED 的 BPCAEU（欧元区经常账户占 GDP 比例）指标
    """
    # BPBLTT01EZQ188S = 欧元区经常账户/GDP（季度，%）
    url = FRED_BASE.format("BPBLTT01EZQ188S")
    r = requests.get(url, timeout=15)
    if r.status_code != 200:
        log.warning("  current_account_gdp: FRED 接口不可用，跳过")
        return []
    df = pd.read_csv(StringIO(r.text))
    df.columns = ["date", "value"]
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"])
    rows = []
    for _, row in df.iterrows():
        if row["date"] not in existing:
            rows.append(build_row("current_account_gdp", row["date"], row["value"]))
    return rows


def fetch_pmi_mfg(existing: set) -> list:
    """欧元区制造业 PMI（月度）- ECB SDW SPMI 数据集
    
    注意：FRED 和 ECB 均无免费公开的欧元区 PMI 数据，
    PMI 数据属于 S&P Global 商业数据，需要付费订阅。
    此处返回空列表，在 REQ-027 第二阶段再考虑其他数据源。
    """
    log.warning("  pmi_mfg (EU): PMI 属于 S&P Global 商业数据，暂无免费公开 API，跳过")
    return []


# ── 指标采集映射 ──────────────────────────────────────────
FETCH_FUNCS = {
    "cpi_yoy":            fetch_cpi_yoy,
    "unemployment_rate":  fetch_unemployment_rate,
    "gdp_yoy":            fetch_gdp_yoy,
    "policy_rate":        fetch_policy_rate,
    "bond_10y":           fetch_bond_10y,
    "m2_yoy":             fetch_m2_yoy,
    "current_account_gdp": fetch_current_account_gdp,
    "pmi_mfg":            fetch_pmi_mfg,
}


# ── 主函数 ────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="欧元区宏观数据采集脚本")
    parser.add_argument("--full",       action="store_true", help="全量回填（忽略已有数据）")
    parser.add_argument("--dry-run",    action="store_true", help="不写入数据库，仅打印")
    parser.add_argument("--indicator",  type=str, default=None, help="只采集指定指标")
    args = parser.parse_args()

    mode = "全量回填" if args.full else "增量采集"
    log.info(f"=== 欧元区宏观指标采集开始（{mode}，region={REGION}）===")
    if args.dry_run:
        log.info(">>> DRY-RUN 模式，不写入数据库 <<<")

    targets = [args.indicator] if args.indicator else list(FETCH_FUNCS.keys())
    summary = {}

    for ind_id in targets:
        if ind_id not in FETCH_FUNCS:
            log.warning(f"未知指标: {ind_id}，跳过")
            continue
        log.info(f"采集 {ind_id} ({REGION}) ...")
        try:
            upsert_meta(ind_id, dry_run=args.dry_run)
            existing = set() if args.full else get_existing_dates(ind_id)
            rows = FETCH_FUNCS[ind_id](existing)
            count = upsert_values(rows, dry_run=args.dry_run)
            log.info(f"  {ind_id}: 写入 {count} 条")
            summary[ind_id] = {"status": "ok", "count": count}
        except Exception as e:
            log.error(f"  {ind_id}: 采集失败 — {e}")
            summary[ind_id] = {"status": "error", "error": str(e)}

    log.info("\n=== 采集汇总 ===")
    total = 0
    for ind_id, result in summary.items():
        if result["status"] == "ok":
            log.info(f"  ✅ {ind_id}: 写入 {result['count']} 条")
            total += result["count"]
        else:
            log.error(f"  ❌ {ind_id}: {result['error']}")
    log.info(f"\n合计写入: {total} 条")
    log.info("=== 采集完成 ===")


if __name__ == "__main__":
    main()
