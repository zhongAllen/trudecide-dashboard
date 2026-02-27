#!/usr/bin/env python3
"""
collect_macro_eu.py — 欧元区宏观指标采集脚本（REQ-027 Phase 1+2）
============================================================
数据源策略：
  - ECB SDW API (data-api.ecb.europa.eu)：CPI、失业率、GDP、M2、10年债、ECB利率
  - FRED API (fred.stlouisfed.org)：贸易、出口、进口
  - IMF DataMapper API：govt_debt_gdp（年度）

indicator_id 命名规范（第一性原理）：
  ✅ 正确：cpi_yoy (region=EU)
  ❌ 错误：eu_cpi_yoy

运行方式：
  python3 collect_macro_eu.py --full          # 全量回填
  python3 collect_macro_eu.py                 # 增量（默认）
  python3 collect_macro_eu.py --dry-run       # 不写入数据库，仅打印
  python3 collect_macro_eu.py --indicator cpi_yoy  # 只采集单个指标

指标列表（Phase 1 已有）：
  cpi_yoy            HICP 同比增速（%），月度，ECB ICP M.U2.N.000000.4.ANR
  unemployment_rate  失业率（%），月度，ECB LFSI M.I8.S.UNEHRT.TOTAL0.15_74.T
  gdp_yoy            GDP 实际同比增速（%），季度，ECB MNA Q.Y.I8.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.LR.GY（计算 YoY）
  policy_rate        ECB 存款便利利率（%），日度，FRED ECBDFR
  bond_10y           10年期国债收益率（%），月度，ECB YC B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y
  m2_yoy             M2 同比增速（%），月度，ECB BSI M.U2.Y.V.M20.X.1.U2.2300.Z01.E（计算 YoY）
  current_account_gdp 经常账户/GDP（%），季度，FRED BPBLTT01EZQ188S
  pmi_mfg            制造业 PMI（点），月度，S&P Global 商业数据（暂跳过）

指标列表（Phase 2 新增）：
  gdp_level          GDP 绝对值（百万欧元），季度，ECB MNA Q.Y.I8.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.V.N
  gdp_qoq            GDP 实际环比增速（%），季度，ECB MNA Q.Y.I8.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.LR.GY
  cpi_mom            CPI 环比增速（%），月度，ECB ICP M.U2.N.000000.4.INX（计算 MoM）
  ppi_yoy            PPI 同比增速（%），月度，ECB STS M.I8.N.PRIN.NS0080.4.000（计算 YoY）
  industrial_yoy     工业产出同比（%），月度，ECB STS M.I8.W.PROD.NS0020.4.ANR（直接 YoY）
  retail_yoy         零售销售同比（%），月度，ECB STS M.I8.Y.TOVT.NS4703.4.000（计算 YoY）
  export_yoy         出口同比增速（%），季度，FRED XTEXVA01EZQ667S（计算 YoY）
  import_yoy         进口同比增速（%），季度，FRED XTIMVA01EZQ667S（计算 YoY）
  trade_balance      贸易差额（美元），月度，FRED XTNTVA01EZM667S（净出口）
  m2_level           M2 绝对值（百万欧元），月度，ECB BSI M.U2.Y.V.M20.X.1.U2.2300.Z01.E
  govt_debt_gdp      政府债务/GDP（%），年度，IMF DataMapper GGXWDG_NGDP/EURO

踩坑记录：
  1. ECB API 的 FM（利率）数据集 key 格式特殊，需用 FRED 的 ECBDFR/ECBMRRFR 替代
  2. ECB M2 的 BSI 数据集返回的是绝对值，需手动计算 YoY
  3. ECB GDP 数据集 MNA 返回的是指数，需手动计算 YoY
  4. 欧元区 region 统一用 'EU'（代表欧元区，非欧盟）
  5. ECB STS 数据集的 key 格式：FREQ.REF_AREA.ADJUSTMENT.STS_CONCEPT.STS_CLASS.STS_INSTITUTION.STS_SUFFIX
     - REF_AREA: I8=欧元区（20国），U2=欧元区（旧）
     - ADJUSTMENT: N=未调整，Y=季调，W=工作日调整
     - STS_SUFFIX: 000=指数，PER=环比，ANR=同比
  6. ECB STS RRSA（零售）和 PIIG（PPI）在当前 API 不可用，使用 PRIN（工业品生产者价格）替代 PPI
  7. ECB STS TOVT（贸易量）NS4703 用于零售销售代理指标
  8. FRED XTNTVA01EZM667S 是净出口（出口-进口），可作为贸易差额代理
  9. IMF DataMapper 欧元区代码为 EURO（非 EU 或 U2）
============================================================
"""

import os
import sys
import logging
import argparse
import time
import requests
import pandas as pd
from io import StringIO
from typing import Optional
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

# ── API 基础 URL ──────────────────────────────────────────
ECB_BASE = "https://data-api.ecb.europa.eu/service/data/{}/{}?format=csvdata"
FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"
IMF_BASE  = "https://www.imf.org/external/datamapper/api/v1/{}/{}"


# ── 工具函数 ──────────────────────────────────────────────
def get_existing_dates(indicator_id: str) -> set:
    """获取数据库中已有的日期集合（增量采集用）"""
    r = supabase.table("indicator_values") \
        .select("trade_date") \
        .eq("indicator_id", indicator_id) \
        .eq("region", REGION) \
        .execute()
    return {row["trade_date"][:10] for row in r.data}


def upsert_meta_dict(indicator_id: str, meta: dict, dry_run: bool = False):
    """注册或更新指标元数据（直接传入 dict）"""
    if dry_run:
        log.info(f"  [DRY-RUN] 注册元数据: {indicator_id} (region={REGION})")
        return
    try:
        supabase.table("indicator_meta").upsert(
            {**meta, "id": indicator_id, "region": REGION},
            on_conflict="id,region"
        ).execute()
    except Exception as e:
        log.warning(f"  元数据注册失败 {indicator_id}: {e}")


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
        for attempt in range(3):
            try:
                supabase.table("indicator_values").upsert(
                    batch,
                    on_conflict="indicator_id,region,trade_date,revision_seq"
                ).execute()
                written += len(batch)
                break
            except Exception as e:
                if attempt < 2:
                    log.warning(f"  写入重试 {attempt+1}/3: {e}")
                    time.sleep(2)
                else:
                    log.error(f"  写入失败（已重试 3 次）: {e}")
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


def fetch_ecb(dataset: str, key: str, timeout: int = 15) -> Optional[pd.DataFrame]:
    """从 ECB SDW API 获取数据，返回 DataFrame(TIME_PERIOD, OBS_VALUE)"""
    url = ECB_BASE.format(dataset, key)
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        df = pd.read_csv(StringIO(r.text))
        if "OBS_VALUE" not in df.columns:
            log.error(f"  ECB {dataset}/{key}: 无 OBS_VALUE 列")
            return None
        df = df[["TIME_PERIOD", "OBS_VALUE"]].dropna()
        df["OBS_VALUE"] = pd.to_numeric(df["OBS_VALUE"], errors="coerce")
        df = df.dropna(subset=["OBS_VALUE"])
        return df
    except Exception as e:
        log.error(f"  ECB {dataset}/{key} 获取失败: {e}")
        return None


def fetch_fred(series_id: str, timeout: int = 15) -> Optional[pd.DataFrame]:
    """从 FRED 获取数据，返回 DataFrame(date, value)"""
    url = FRED_BASE.format(series_id)
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        df = pd.read_csv(StringIO(r.text))
        df.columns = ["date", "value"]
        df["value"] = pd.to_numeric(df["value"], errors="coerce")
        df = df.dropna(subset=["value"]).reset_index(drop=True)
        return df
    except Exception as e:
        log.error(f"  FRED {series_id} 获取失败: {e}")
        return None


def fetch_imf(indicator_code: str, country_code: str, timeout: int = 15) -> Optional[dict]:
    """从 IMF DataMapper API 获取年度数据，返回 {year_str: value} 字典"""
    url = IMF_BASE.format(indicator_code, country_code)
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        data = r.json()
        return data.get("values", {}).get(indicator_code, {}).get(country_code, {})
    except Exception as e:
        log.error(f"  IMF {indicator_code}/{country_code} 获取失败: {e}")
        return None


def quarter_to_date(q_str: str) -> str:
    """将 '2024-Q1' 转为 '2024-01-01'"""
    year, q = q_str.split("-Q")
    month = (int(q) - 1) * 3 + 1
    return f"{year}-{month:02d}-01"


def calc_yoy_ecb(df: pd.DataFrame, freq: str = "M") -> pd.DataFrame:
    """计算 ECB 数据的同比增速（YoY）"""
    df = df.copy().sort_values("TIME_PERIOD").reset_index(drop=True)
    shift = 12 if freq == "M" else 4
    df["prev"] = df["OBS_VALUE"].shift(shift)
    df["yoy"] = (df["OBS_VALUE"] - df["prev"]) / df["prev"].abs() * 100
    df = df.dropna(subset=["yoy"])
    df["OBS_VALUE"] = df["yoy"].round(2)
    return df[["TIME_PERIOD", "OBS_VALUE"]]


def calc_mom_ecb(df: pd.DataFrame) -> pd.DataFrame:
    """计算 ECB 数据的环比增速（MoM）"""
    df = df.copy().sort_values("TIME_PERIOD").reset_index(drop=True)
    df["prev"] = df["OBS_VALUE"].shift(1)
    df["mom"] = (df["OBS_VALUE"] - df["prev"]) / df["prev"].abs() * 100
    df = df.dropna(subset=["mom"])
    df["OBS_VALUE"] = df["mom"].round(4)
    return df[["TIME_PERIOD", "OBS_VALUE"]]


def calc_yoy_fred(df: pd.DataFrame, freq: str = "Q") -> pd.DataFrame:
    """计算 FRED 数据的同比增速（YoY）"""
    df = df.copy().sort_values("date").reset_index(drop=True)
    shift = 4 if freq == "Q" else 12
    df["prev"] = df["value"].shift(shift)
    df["yoy"] = (df["value"] - df["prev"]) / df["prev"].abs() * 100
    df = df.dropna(subset=["yoy"])
    df["value"] = df["yoy"].round(2)
    return df[["date", "value"]]


# ── Phase 1 指标采集函数 ───────────────────────────────────

def collect_cpi_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """cpi_yoy: HICP 同比增速（%），月度，ECB ICP"""
    log.info("采集 cpi_yoy (EU) ...")
    upsert_meta_dict("cpi_yoy", {
        "name_cn": "欧元区CPI同比增速(HICP)",
        "description_cn": "欧元区调和消费者价格指数同比变动率，ECB通胀目标锚定指标",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    df = fetch_ecb("ICP", "M.U2.N.000000.4.ANR")
    if df is None:
        return 0
    rows = []
    for _, row in df.iterrows():
        date_str = str(row["TIME_PERIOD"]) + "-01"
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("cpi_yoy", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_unemployment_rate(full: bool, existing: set, dry_run: bool) -> int:
    """unemployment_rate: 失业率（%），月度，ECB LFSI"""
    log.info("采集 unemployment_rate (EU) ...")
    upsert_meta_dict("unemployment_rate", {
        "name_cn": "欧元区失业率",
        "description_cn": "欧元区季节调整失业率（15-74岁劳动年龄人口）",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "rate",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    df = fetch_ecb("LFSI", "M.I8.S.UNEHRT.TOTAL0.15_74.T")
    if df is None:
        return 0
    rows = []
    for _, row in df.iterrows():
        date_str = str(row["TIME_PERIOD"]) + "-01"
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("unemployment_rate", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_gdp_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """gdp_yoy: GDP 实际同比增速（%），季度，ECB MNA（计算 YoY）"""
    log.info("采集 gdp_yoy (EU) ...")
    upsert_meta_dict("gdp_yoy", {
        "name_cn": "欧元区GDP实际同比增速",
        "description_cn": "欧元区实际GDP季度同比增速，衡量经济增长动能",
        "category": "macro", "frequency": "quarterly",
        "unit": "%", "value_type": "yoy",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    df = fetch_ecb("MNA", "Q.Y.I8.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.LR.GY")
    if df is None:
        return 0
    df["date"] = df["TIME_PERIOD"].apply(quarter_to_date)
    df["value"] = pd.to_numeric(df["OBS_VALUE"], errors="coerce")
    df = df.dropna(subset=["value"]).sort_values("date")
    df["yoy"] = df["value"].pct_change(4) * 100
    df = df.dropna(subset=["yoy"])
    rows = []
    for _, row in df.iterrows():
        if not full and row["date"] in existing:
            continue
        rows.append(build_row("gdp_yoy", row["date"], row["yoy"]))
    return upsert_values(rows, dry_run)


def collect_policy_rate(full: bool, existing: set, dry_run: bool) -> int:
    """policy_rate: ECB 存款便利利率（%），日度，FRED ECBDFR"""
    log.info("采集 policy_rate (EU) ...")
    upsert_meta_dict("policy_rate", {
        "name_cn": "ECB存款便利利率",
        "description_cn": "欧洲央行存款便利利率（Deposit Facility Rate），欧元区货币政策基准利率",
        "category": "macro", "frequency": "daily",
        "unit": "%", "value_type": "rate",
        "source_name": "FRED/ECB", "source_url": "https://fred.stlouisfed.org/series/ECBDFR",
        "credibility": "high",
    }, dry_run)
    df = fetch_fred("ECBDFR")
    if df is None:
        return 0
    rows = []
    for _, row in df.iterrows():
        if not full and row["date"] in existing:
            continue
        rows.append(build_row("policy_rate", row["date"], row["value"]))
    return upsert_values(rows, dry_run)


def collect_bond_10y(full: bool, existing: set, dry_run: bool) -> int:
    """bond_10y: 欧元区 AAA 级政府债券 10 年期收益率（%），月度，ECB YC"""
    log.info("采集 bond_10y (EU) ...")
    upsert_meta_dict("bond_10y", {
        "name_cn": "欧元区10年期国债收益率",
        "description_cn": "欧元区AAA级政府债券10年期到期收益率（ECB合成指标）",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "rate",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    df = fetch_ecb("YC", "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y")
    if df is None:
        return 0
    rows = []
    for _, row in df.iterrows():
        date_str = str(row["TIME_PERIOD"])
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("bond_10y", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_m2_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """m2_yoy: M2 同比增速（%），月度，ECB BSI（计算 YoY）"""
    log.info("采集 m2_yoy (EU) ...")
    upsert_meta_dict("m2_yoy", {
        "name_cn": "欧元区M2同比增速",
        "description_cn": "欧元区广义货币供应量M2同比变动率",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    df = fetch_ecb("BSI", "M.U2.Y.V.M20.X.1.U2.2300.Z01.E")
    if df is None:
        return 0
    df["date"] = df["TIME_PERIOD"].astype(str) + "-01"
    df["value"] = pd.to_numeric(df["OBS_VALUE"], errors="coerce")
    df = df.dropna(subset=["value"]).sort_values("date")
    df["yoy"] = df["value"].pct_change(12) * 100
    df = df.dropna(subset=["yoy"])
    rows = []
    for _, row in df.iterrows():
        if not full and row["date"] in existing:
            continue
        rows.append(build_row("m2_yoy", row["date"], row["yoy"]))
    return upsert_values(rows, dry_run)


def collect_current_account_gdp(full: bool, existing: set, dry_run: bool) -> int:
    """current_account_gdp: 经常账户/GDP（%），季度，FRED BPBLTT01EZQ188S"""
    log.info("采集 current_account_gdp (EU) ...")
    upsert_meta_dict("current_account_gdp", {
        "name_cn": "欧元区经常账户/GDP",
        "description_cn": "欧元区经常账户余额占GDP比例，衡量对外经济平衡",
        "category": "macro", "frequency": "quarterly",
        "unit": "%", "value_type": "rate",
        "source_name": "FRED/ECB", "source_url": "https://fred.stlouisfed.org/series/BPBLTT01EZQ188S",
        "credibility": "high",
    }, dry_run)
    df = fetch_fred("BPBLTT01EZQ188S")
    if df is None:
        log.warning("  current_account_gdp: FRED 接口不可用，跳过")
        return 0
    rows = []
    for _, row in df.iterrows():
        if not full and row["date"] in existing:
            continue
        rows.append(build_row("current_account_gdp", row["date"], row["value"]))
    return upsert_values(rows, dry_run)


def collect_pmi_mfg(full: bool, existing: set, dry_run: bool) -> int:
    """pmi_mfg: 制造业 PMI（点），月度，S&P Global 商业数据（暂跳过）"""
    log.warning("  pmi_mfg (EU): PMI 属于 S&P Global 商业数据，暂无免费公开 API，跳过")
    return 0


# ── Phase 2 新增指标采集函数 ───────────────────────────────

def collect_gdp_level(full: bool, existing: set, dry_run: bool) -> int:
    """gdp_level: GDP 绝对值（百万欧元），季度，ECB MNA"""
    log.info("采集 gdp_level (EU) ...")
    upsert_meta_dict("gdp_level", {
        "name_cn": "欧元区名义GDP",
        "description_cn": "欧元区名义GDP绝对值（百万欧元），季度，ECB/Eurostat公布",
        "category": "macro", "frequency": "quarterly",
        "unit": "百万欧元", "value_type": "level",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    df = fetch_ecb("MNA", "Q.Y.I8.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.V.N")
    if df is None:
        return 0
    rows = []
    for _, row in df.iterrows():
        date_str = quarter_to_date(str(row["TIME_PERIOD"]))
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("gdp_level", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_gdp_qoq(full: bool, existing: set, dry_run: bool) -> int:
    """gdp_qoq: GDP 实际环比增速（%），季度，ECB MNA（直接使用 LR.GY 序列）"""
    log.info("采集 gdp_qoq (EU) ...")
    upsert_meta_dict("gdp_qoq", {
        "name_cn": "欧元区GDP实际环比增速",
        "description_cn": "欧元区实际GDP季度环比增速（%），ECB/Eurostat公布",
        "category": "macro", "frequency": "quarterly",
        "unit": "%", "value_type": "qoq",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    # ECB MNA LR.GY 序列是季度环比增速（Chain-linked volumes, growth rate）
    df = fetch_ecb("MNA", "Q.Y.I8.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.LR.GY")
    if df is None:
        return 0
    rows = []
    for _, row in df.iterrows():
        date_str = quarter_to_date(str(row["TIME_PERIOD"]))
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("gdp_qoq", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_cpi_mom(full: bool, existing: set, dry_run: bool) -> int:
    """cpi_mom: CPI 环比增速（%），月度，ECB ICP INX（计算 MoM）"""
    log.info("采集 cpi_mom (EU) ...")
    upsert_meta_dict("cpi_mom", {
        "name_cn": "欧元区CPI环比增速(HICP)",
        "description_cn": "欧元区调和消费者价格指数环比变动率（%），由 HICP 指数计算",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "mom",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    df = fetch_ecb("ICP", "M.U2.N.000000.4.INX")
    if df is None:
        return 0
    df = calc_mom_ecb(df)
    rows = []
    for _, row in df.iterrows():
        date_str = str(row["TIME_PERIOD"]) + "-01"
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("cpi_mom", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_ppi_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """ppi_yoy: 工业品生产者价格同比（%），月度，ECB STS PRIN（计算 YoY）"""
    log.info("采集 ppi_yoy (EU) ...")
    upsert_meta_dict("ppi_yoy", {
        "name_cn": "欧元区PPI同比增速",
        "description_cn": "欧元区工业品生产者价格指数同比增速（%），ECB STS PRIN NS0080",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    df = fetch_ecb("STS", "M.I8.N.PRIN.NS0080.4.000")
    if df is None:
        return 0
    df = calc_yoy_ecb(df, freq="M")
    rows = []
    for _, row in df.iterrows():
        date_str = str(row["TIME_PERIOD"]) + "-01"
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("ppi_yoy", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_industrial_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """industrial_yoy: 工业产出同比（%），月度，ECB STS PROD ANR（直接同比）"""
    log.info("采集 industrial_yoy (EU) ...")
    upsert_meta_dict("industrial_yoy", {
        "name_cn": "欧元区工业产出同比",
        "description_cn": "欧元区工业生产指数同比增速（%），月度，ECB STS PROD NS0020",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    # M.I8.W.PROD.NS0020.4.ANR 直接是同比增速（ANR=Annual Rate）
    df = fetch_ecb("STS", "M.I8.W.PROD.NS0020.4.ANR")
    if df is None:
        return 0
    rows = []
    for _, row in df.iterrows():
        date_str = str(row["TIME_PERIOD"]) + "-01"
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("industrial_yoy", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_retail_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """retail_yoy: 零售销售同比（%），月度，ECB STS TOVT NS4703（计算 YoY）"""
    log.info("采集 retail_yoy (EU) ...")
    upsert_meta_dict("retail_yoy", {
        "name_cn": "欧元区零售销售同比",
        "description_cn": "欧元区零售销售量指数同比增速（%），ECB STS TOVT NS4703（食品饮料类）",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "medium",
    }, dry_run)
    df = fetch_ecb("STS", "M.I8.Y.TOVT.NS4703.4.000")
    if df is None:
        return 0
    df = calc_yoy_ecb(df, freq="M")
    rows = []
    for _, row in df.iterrows():
        date_str = str(row["TIME_PERIOD"]) + "-01"
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("retail_yoy", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_export_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """export_yoy: 出口同比增速（%），季度，FRED XTEXVA01EZQ667S（计算 YoY）"""
    log.info("采集 export_yoy (EU) ...")
    upsert_meta_dict("export_yoy", {
        "name_cn": "欧元区出口同比增速",
        "description_cn": "欧元区商品与服务出口同比增速（%），季度，OECD/FRED数据",
        "category": "macro", "frequency": "quarterly",
        "unit": "%", "value_type": "yoy",
        "source_name": "FRED/OECD", "source_url": "https://fred.stlouisfed.org/series/XTEXVA01EZQ667S",
        "credibility": "high",
    }, dry_run)
    df = fetch_fred("XTEXVA01EZQ667S")
    if df is None:
        return 0
    df = calc_yoy_fred(df, freq="Q")
    rows = []
    for _, row in df.iterrows():
        if not full and row["date"] in existing:
            continue
        rows.append(build_row("export_yoy", row["date"], row["value"]))
    return upsert_values(rows, dry_run)


def collect_import_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """import_yoy: 进口同比增速（%），季度，FRED XTIMVA01EZQ667S（计算 YoY）"""
    log.info("采集 import_yoy (EU) ...")
    upsert_meta_dict("import_yoy", {
        "name_cn": "欧元区进口同比增速",
        "description_cn": "欧元区商品与服务进口同比增速（%），季度，OECD/FRED数据",
        "category": "macro", "frequency": "quarterly",
        "unit": "%", "value_type": "yoy",
        "source_name": "FRED/OECD", "source_url": "https://fred.stlouisfed.org/series/XTIMVA01EZQ667S",
        "credibility": "high",
    }, dry_run)
    df = fetch_fred("XTIMVA01EZQ667S")
    if df is None:
        return 0
    df = calc_yoy_fred(df, freq="Q")
    rows = []
    for _, row in df.iterrows():
        if not full and row["date"] in existing:
            continue
        rows.append(build_row("import_yoy", row["date"], row["value"]))
    return upsert_values(rows, dry_run)


def collect_trade_balance(full: bool, existing: set, dry_run: bool) -> int:
    """trade_balance: 净出口（美元），月度，FRED XTNTVA01EZM667S"""
    log.info("采集 trade_balance (EU) ...")
    upsert_meta_dict("trade_balance", {
        "name_cn": "欧元区净出口",
        "description_cn": "欧元区商品与服务净出口（出口-进口，美元），月度，OECD/FRED数据",
        "category": "macro", "frequency": "monthly",
        "unit": "美元", "value_type": "level",
        "source_name": "FRED/OECD", "source_url": "https://fred.stlouisfed.org/series/XTNTVA01EZM667S",
        "credibility": "high",
    }, dry_run)
    df = fetch_fred("XTNTVA01EZM667S")
    if df is None:
        return 0
    rows = []
    for _, row in df.iterrows():
        if not full and row["date"] in existing:
            continue
        rows.append(build_row("trade_balance", row["date"], row["value"]))
    return upsert_values(rows, dry_run)


def collect_m2_level(full: bool, existing: set, dry_run: bool) -> int:
    """m2_level: M2 绝对值（百万欧元），月度，ECB BSI"""
    log.info("采集 m2_level (EU) ...")
    upsert_meta_dict("m2_level", {
        "name_cn": "欧元区M2货币供应量",
        "description_cn": "欧元区广义货币供应量M2绝对值（百万欧元），月度",
        "category": "macro", "frequency": "monthly",
        "unit": "百万欧元", "value_type": "level",
        "source_name": "ECB SDW", "source_url": "https://data-api.ecb.europa.eu",
        "credibility": "high",
    }, dry_run)
    df = fetch_ecb("BSI", "M.U2.Y.V.M20.X.1.U2.2300.Z01.E")
    if df is None:
        return 0
    rows = []
    for _, row in df.iterrows():
        date_str = str(row["TIME_PERIOD"]) + "-01"
        if not full and date_str in existing:
            continue
        try:
            rows.append(build_row("m2_level", date_str, row["OBS_VALUE"]))
        except (ValueError, TypeError):
            pass
    return upsert_values(rows, dry_run)


def collect_govt_debt_gdp(full: bool, existing: set, dry_run: bool) -> int:
    """govt_debt_gdp: 政府债务/GDP（%），年度，IMF DataMapper GGXWDG_NGDP/EURO"""
    log.info("采集 govt_debt_gdp (EU) ...")
    upsert_meta_dict("govt_debt_gdp", {
        "name_cn": "欧元区政府债务/GDP",
        "description_cn": "欧元区一般政府总债务占GDP比重（%），IMF数据，年度",
        "category": "macro", "frequency": "annual",
        "unit": "%", "value_type": "rate",
        "source_name": "IMF DataMapper", "source_url": "https://www.imf.org/external/datamapper/",
        "credibility": "high",
    }, dry_run)
    values = fetch_imf("GGXWDG_NGDP", "EURO")
    if values is None:
        return 0
    rows = []
    for year_str, val in values.items():
        if val is None:
            continue
        trade_date = f"{year_str}-01-01"
        if not full and trade_date in existing:
            continue
        rows.append(build_row("govt_debt_gdp", trade_date, float(val)))
    return upsert_values(rows, dry_run)


# ── 指标采集映射 ──────────────────────────────────────────
FETCH_FUNCS = {
    # Phase 1（已有）
    "cpi_yoy":             collect_cpi_yoy,
    "unemployment_rate":   collect_unemployment_rate,
    "gdp_yoy":             collect_gdp_yoy,
    "policy_rate":         collect_policy_rate,
    "bond_10y":            collect_bond_10y,
    "m2_yoy":              collect_m2_yoy,
    "current_account_gdp": collect_current_account_gdp,
    "pmi_mfg":             collect_pmi_mfg,
    # Phase 2（新增）
    "gdp_level":           collect_gdp_level,
    "gdp_qoq":             collect_gdp_qoq,
    "cpi_mom":             collect_cpi_mom,
    "ppi_yoy":             collect_ppi_yoy,
    "industrial_yoy":      collect_industrial_yoy,
    "retail_yoy":          collect_retail_yoy,
    "export_yoy":          collect_export_yoy,
    "import_yoy":          collect_import_yoy,
    "trade_balance":       collect_trade_balance,
    "m2_level":            collect_m2_level,
    "govt_debt_gdp":       collect_govt_debt_gdp,
}


# ── 主函数 ────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="欧元区宏观数据采集脚本（REQ-027 Phase 1+2）")
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
            existing = set() if args.full else get_existing_dates(ind_id)
            count = FETCH_FUNCS[ind_id](full=args.full, existing=existing, dry_run=args.dry_run)
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
