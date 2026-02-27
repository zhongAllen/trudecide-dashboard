#!/usr/bin/env python3
"""
collect_macro_us.py
美国宏观指标数据采集脚本（REQ-027 Phase 1+2）

数据源：FRED（美联储经济数据，无需 API Key，公开 CSV 接口）
覆盖指标：20 个核心宏观指标，indicator_id 遵循无前缀规范，region=US

用法：
    python3 collect_macro_us.py              # 增量采集（默认）
    python3 collect_macro_us.py --full       # 全量回填（历史所有数据）
    python3 collect_macro_us.py --dry-run    # 仅打印，不写入数据库
    python3 collect_macro_us.py --indicator cpi_yoy  # 仅采集指定指标

指标列表（Phase 1 已有）：
    cpi_yoy            CPI 同比增速（%），月度，由 CPIAUCSL 计算 YoY
    unemployment_rate  失业率（%），月度，UNRATE
    gdp_yoy            GDP 实际增速（%），季度，A191RL1Q225SBEA（季度环比折年率）
    fed_funds_rate     联邦基金利率（%），月度，FEDFUNDS
    bond_10y           10年期国债收益率（%），日度，DGS10
    m2_yoy             M2 货币供应同比（%），月度，由 M2SL 计算 YoY
    retail_yoy         零售销售同比（%），月度，由 RSAFS 计算 YoY
    trade_balance      贸易差额（百万美元），月度，BOPGSTB
    pmi_mfg            ISM 制造业 PMI（点），月度，AKShare
    current_account_gdp 经常账户/GDP（%），年度，IMF DataMapper

指标列表（Phase 2 新增）：
    gdp_level          GDP 绝对值（十亿美元），季度，GDPC1（实际 GDP）
    gdp_qoq            GDP 实际环比增速（%），季度，A191RL1Q225SBEA（同 gdp_yoy 数据源）
    cpi_mom            CPI 环比增速（%），月度，由 CPIAUCSL 计算 MoM
    ppi_yoy            PPI 同比增速（%），月度，由 PPIACO 计算 YoY
    export_yoy         出口同比增速（%），月度，由 EXPGS 计算 YoY
    import_yoy         进口同比增速（%），月度，由 IMPGS 计算 YoY
    industrial_yoy     工业产出同比（%），月度，由 INDPRO 计算 YoY
    m2_level           M2 绝对值（十亿美元），月度，M2SL
    govt_debt_gdp      政府债务/GDP（%），年度，IMF DataMapper GGXWDG_NGDP
    pmi_non_mfg        ISM 服务业 PMI（点），月度，AKShare

注意事项：
    - FRED CSV 接口无需 API Key，但有频率限制（每分钟约 120 次）
    - cpi_yoy / m2_yoy / retail_yoy / ppi_yoy / export_yoy / import_yoy / industrial_yoy 均需计算 YoY
    - cpi_mom 需计算 MoM（环比）
    - gdp_qoq 与 gdp_yoy 使用同一 FRED 序列（A191RL1Q225SBEA），该序列本身就是季度环比折年率
    - gdp_level 使用 GDPC1（实际 GDP，2017 年不变价，十亿美元）
    - govt_debt_gdp 使用 IMF DataMapper GGXWDG_NGDP（一般政府债务/GDP）
"""

import os
import sys
import argparse
import logging
import time
from datetime import date
from io import StringIO
from typing import Optional

import pandas as pd
import requests
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

REGION = "US"
FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger(__name__)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ── 工具函数 ──────────────────────────────────────────────────────────────────

def fetch_fred(series_id: str, timeout: int = 15) -> Optional[pd.DataFrame]:
    """
    从 FRED 获取指定序列的 CSV 数据，返回 DataFrame(date, value)。
    date 列为 YYYY-MM-DD 字符串，value 列为 float，NaN 行已删除。
    """
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


def calc_yoy(df: pd.DataFrame, freq: str = "M") -> pd.DataFrame:
    """
    计算同比增速（YoY）。
    freq: 'M'=月度（12期前），'Q'=季度（4期前）
    返回 DataFrame(date, value)，value 为 YoY %。
    """
    df = df.copy().sort_values("date").reset_index(drop=True)
    shift = 12 if freq == "M" else 4
    df["prev"] = df["value"].shift(shift)
    df["yoy"] = (df["value"] - df["prev"]) / df["prev"].abs() * 100
    df = df.dropna(subset=["yoy"])
    df["value"] = df["yoy"].round(2)
    return df[["date", "value"]]


def calc_mom(df: pd.DataFrame) -> pd.DataFrame:
    """
    计算环比增速（MoM）。
    返回 DataFrame(date, value)，value 为 MoM %。
    """
    df = df.copy().sort_values("date").reset_index(drop=True)
    df["prev"] = df["value"].shift(1)
    df["mom"] = (df["value"] - df["prev"]) / df["prev"].abs() * 100
    df = df.dropna(subset=["mom"])
    df["value"] = df["mom"].round(2)
    return df[["date", "value"]]


def upsert_rows(rows: list[dict], dry_run: bool = False) -> int:
    """批量 upsert 到 indicator_values，返回写入条数。内置重试机制。"""
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
                    on_conflict="indicator_id,region,trade_date,revision_seq"
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


def get_existing_dates(indicator_id: str, region: str) -> set:
    """查询已有的 trade_date 集合，用于增量判断。"""
    try:
        result = supabase.table("indicator_values") \
            .select("trade_date") \
            .eq("indicator_id", indicator_id) \
            .eq("region", region) \
            .execute()
        return {r["trade_date"] for r in result.data}
    except Exception:
        return set()


def upsert_meta(indicator_id: str, meta: dict, dry_run: bool = False):
    """注册指标元数据（如不存在则插入，已存在则跳过）。"""
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


def make_rows(df: pd.DataFrame, indicator_id: str, existing: set, full: bool) -> list[dict]:
    """将 DataFrame(date, value) 转为 indicator_values 行列表。"""
    rows = []
    for _, r in df.iterrows():
        trade_date = str(r["date"])[:10]
        value = float(r["value"]) if pd.notna(r["value"]) else None
        if value is None:
            continue
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": indicator_id,
            "region": REGION,
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })
    return rows


def fetch_imf(indicator_code: str, country_code: str, timeout: int = 15) -> Optional[dict]:
    """
    从 IMF DataMapper API 获取年度数据。
    返回 {year_str: value} 字典，如失败返回 None。
    """
    url = f"https://www.imf.org/external/datamapper/api/v1/{indicator_code}/{country_code}"
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        data = r.json()
        return data.get("values", {}).get(indicator_code, {}).get(country_code, {})
    except Exception as e:
        log.error(f"  IMF {indicator_code}/{country_code} 获取失败: {e}")
        return None


# ── Phase 1 指标采集函数 ───────────────────────────────────────────────────────

def collect_cpi_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """
    cpi_yoy: CPI 同比增速（%），月度
    数据源：FRED CPIAUCSL（CPI 指数），计算 YoY
    """
    log.info("采集 cpi_yoy (US) ...")
    upsert_meta("cpi_yoy", {
        "name_cn": "美国CPI同比增速",
        "description_cn": "美国消费者价格指数同比增速，衡量通货膨胀水平",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "FRED/BLS", "source_url": "https://fred.stlouisfed.org/series/CPIAUCSL",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("CPIAUCSL")
    if df is None:
        return 0
    df = calc_yoy(df, freq="M")
    rows = make_rows(df, "cpi_yoy", existing, full)
    return upsert_rows(rows, dry_run)


def collect_unemployment_rate(full: bool, existing: set, dry_run: bool) -> int:
    """
    unemployment_rate: 失业率（%），月度
    数据源：FRED UNRATE
    """
    log.info("采集 unemployment_rate (US) ...")
    upsert_meta("unemployment_rate", {
        "name_cn": "美国失业率",
        "description_cn": "美国劳工统计局公布的失业率，月度数据",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "rate",
        "source_name": "FRED/BLS", "source_url": "https://fred.stlouisfed.org/series/UNRATE",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("UNRATE")
    if df is None:
        return 0
    rows = make_rows(df, "unemployment_rate", existing, full)
    return upsert_rows(rows, dry_run)


def collect_gdp_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """
    gdp_yoy: GDP 实际增速（%），季度
    数据源：FRED A191RL1Q225SBEA（实际 GDP 季度环比折年率，SAAR）
    注：美国 GDP 惯用季度环比折年率，与中国的同比口径不同，已在元数据中说明
    """
    log.info("采集 gdp_yoy (US) ...")
    upsert_meta("gdp_yoy", {
        "name_cn": "美国GDP实际增速",
        "description_cn": "美国实际GDP季度环比折年率（SAAR），BEA公布。注：美国惯用环比折年率，非同比",
        "category": "macro", "frequency": "quarterly",
        "unit": "%", "value_type": "qoq_annualized",
        "source_name": "FRED/BEA", "source_url": "https://fred.stlouisfed.org/series/A191RL1Q225SBEA",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("A191RL1Q225SBEA")
    if df is None:
        return 0
    rows = make_rows(df, "gdp_yoy", existing, full)
    return upsert_rows(rows, dry_run)


def collect_fed_funds_rate(full: bool, existing: set, dry_run: bool) -> int:
    """
    fed_funds_rate: 联邦基金利率（%），月度
    数据源：FRED FEDFUNDS
    注：美国政策利率使用 fed_funds_rate 而非通用的 policy_rate，以保留语义精确性
    """
    log.info("采集 fed_funds_rate (US) ...")
    upsert_meta("fed_funds_rate", {
        "name_cn": "美国联邦基金利率",
        "description_cn": "美联储联邦基金有效利率（月均值），货币政策核心指标",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "rate",
        "source_name": "FRED/FRB", "source_url": "https://fred.stlouisfed.org/series/FEDFUNDS",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("FEDFUNDS")
    if df is None:
        return 0
    rows = make_rows(df, "fed_funds_rate", existing, full)
    return upsert_rows(rows, dry_run)


def collect_bond_10y(full: bool, existing: set, dry_run: bool) -> int:
    """
    bond_10y: 10年期国债收益率（%），日度
    数据源：FRED DGS10
    注：与 CN/EU 共用 indicator_id=bond_10y，通过 region=US 区分
    """
    log.info("采集 bond_10y (US) ...")
    upsert_meta("bond_10y", {
        "name_cn": "美国10年期国债收益率",
        "description_cn": "美国10年期国债到期收益率，全球无风险利率基准",
        "category": "macro", "frequency": "daily",
        "unit": "%", "value_type": "rate",
        "source_name": "FRED/FRB", "source_url": "https://fred.stlouisfed.org/series/DGS10",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("DGS10")
    if df is None:
        return 0
    rows = make_rows(df, "bond_10y", existing, full)
    return upsert_rows(rows, dry_run)


def collect_m2_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """
    m2_yoy: M2 货币供应同比（%），月度
    数据源：FRED M2SL，计算 YoY
    """
    log.info("采集 m2_yoy (US) ...")
    upsert_meta("m2_yoy", {
        "name_cn": "美国M2货币供应同比",
        "description_cn": "美国M2货币供应量同比增速（%），月度",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "FRED/FRB", "source_url": "https://fred.stlouisfed.org/series/M2SL",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("M2SL")
    if df is None:
        return 0
    df = calc_yoy(df, freq="M")
    rows = make_rows(df, "m2_yoy", existing, full)
    return upsert_rows(rows, dry_run)


def collect_retail_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """
    retail_yoy: 零售销售同比（%），月度
    数据源：FRED RSAFS（零售销售额，百万美元），计算 YoY
    """
    log.info("采集 retail_yoy (US) ...")
    upsert_meta("retail_yoy", {
        "name_cn": "美国零售销售同比",
        "description_cn": "美国零售及食品服务销售额同比增速（%），月度",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "FRED/Census", "source_url": "https://fred.stlouisfed.org/series/RSAFS",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("RSAFS")
    if df is None:
        return 0
    df = calc_yoy(df, freq="M")
    rows = make_rows(df, "retail_yoy", existing, full)
    return upsert_rows(rows, dry_run)


def collect_trade_balance(full: bool, existing: set, dry_run: bool) -> int:
    """
    trade_balance: 贸易差额（百万美元），月度
    数据源：FRED BOPGSTB
    """
    log.info("采集 trade_balance (US) ...")
    upsert_meta("trade_balance", {
        "name_cn": "美国贸易差额",
        "description_cn": "美国商品与服务贸易差额（百万美元），月度，负值为逆差",
        "category": "macro", "frequency": "monthly",
        "unit": "百万美元", "value_type": "level",
        "source_name": "FRED/BEA", "source_url": "https://fred.stlouisfed.org/series/BOPGSTB",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("BOPGSTB")
    if df is None:
        return 0
    rows = make_rows(df, "trade_balance", existing, full)
    return upsert_rows(rows, dry_run)


def collect_pmi_mfg(full: bool, existing: set, dry_run: bool) -> int:
    """
    pmi_mfg: ISM 制造业 PMI（点），月度
    数据源：AKShare macro_usa_ism_pmi（超时则跳过）
    注：FRED 无直接 PMI 序列；如 AKShare 超时，此指标跳过
    """
    log.info("采集 pmi_mfg (US) ...")
    upsert_meta("pmi_mfg", {
        "name_cn": "美国ISM制造业PMI",
        "description_cn": "美国供应管理协会（ISM）制造业采购经理人指数，50以上为扩张",
        "category": "macro", "frequency": "monthly",
        "unit": "点", "value_type": "index",
        "source_name": "AKShare/ISM", "source_url": "https://www.ismworld.org/",
        "credibility": "high"
    }, dry_run)
    try:
        import signal

        def _timeout_handler(signum, frame):
            raise TimeoutError("AKShare 超时")

        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(15)

        import akshare as ak
        df_raw = ak.macro_usa_ism_pmi()
        signal.alarm(0)

        rows = []
        for _, r in df_raw.iterrows():
            try:
                trade_date = pd.to_datetime(r["时间"]).strftime("%Y-%m-%d")
                value = float(r["现值"]) if pd.notna(r["现值"]) else None
                if value is None:
                    continue
                if not full and trade_date in existing:
                    continue
                rows.append({
                    "indicator_id": "pmi_mfg",
                    "region": REGION,
                    "trade_date": trade_date,
                    "publish_date": trade_date,
                    "value": value,
                    "revision_seq": 0,
                })
            except Exception:
                continue
        return upsert_rows(rows, dry_run)
    except (TimeoutError, Exception) as e:
        log.warning(f"  pmi_mfg AKShare 超时或失败，跳过: {e}")
        return 0


def collect_current_account_gdp(full: bool, existing: set, dry_run: bool) -> int:
    """
    current_account_gdp: 经常账户/GDP（%），年度
    数据源：IMF DataMapper BCA_NGDPD（经常账户余额/GDP）
    """
    log.info("采集 current_account_gdp (US) ...")
    upsert_meta("current_account_gdp", {
        "name_cn": "美国经常账户/GDP",
        "description_cn": "美国经常账户余额占GDP比重（%），IMF数据，年度",
        "category": "macro", "frequency": "annual",
        "unit": "%", "value_type": "rate",
        "source_name": "IMF DataMapper", "source_url": "https://www.imf.org/external/datamapper/",
        "credibility": "high"
    }, dry_run)
    values = fetch_imf("BCA_NGDPD", "USA")
    if values is None:
        return 0
    rows = []
    for year_str, val in values.items():
        if val is None:
            continue
        trade_date = f"{year_str}-01-01"
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "current_account_gdp",
            "region": REGION,
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": round(float(val), 4),
            "revision_seq": 0,
        })
    return upsert_rows(rows, dry_run)


# ── Phase 2 新增指标采集函数 ───────────────────────────────────────────────────

def collect_gdp_level(full: bool, existing: set, dry_run: bool) -> int:
    """
    gdp_level: GDP 绝对值（十亿美元，2017年不变价），季度
    数据源：FRED GDPC1（实际 GDP，季度，十亿美元）
    """
    log.info("采集 gdp_level (US) ...")
    upsert_meta("gdp_level", {
        "name_cn": "美国实际GDP",
        "description_cn": "美国实际GDP绝对值（十亿美元，2017年不变价），季度，BEA公布",
        "category": "macro", "frequency": "quarterly",
        "unit": "十亿美元", "value_type": "level",
        "source_name": "FRED/BEA", "source_url": "https://fred.stlouisfed.org/series/GDPC1",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("GDPC1")
    if df is None:
        return 0
    rows = make_rows(df, "gdp_level", existing, full)
    return upsert_rows(rows, dry_run)


def collect_gdp_qoq(full: bool, existing: set, dry_run: bool) -> int:
    """
    gdp_qoq: GDP 实际环比增速（%），季度
    数据源：FRED A191RL1Q225SBEA（与 gdp_yoy 同一序列，均为季度环比折年率）
    注：美国 GDP 统计惯用季度环比折年率（SAAR），gdp_yoy 和 gdp_qoq 使用同一数据源
    """
    log.info("采集 gdp_qoq (US) ...")
    upsert_meta("gdp_qoq", {
        "name_cn": "美国GDP实际环比增速",
        "description_cn": "美国实际GDP季度环比折年率（SAAR），与 gdp_yoy 同源，BEA公布",
        "category": "macro", "frequency": "quarterly",
        "unit": "%", "value_type": "qoq_annualized",
        "source_name": "FRED/BEA", "source_url": "https://fred.stlouisfed.org/series/A191RL1Q225SBEA",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("A191RL1Q225SBEA")
    if df is None:
        return 0
    rows = make_rows(df, "gdp_qoq", existing, full)
    return upsert_rows(rows, dry_run)


def collect_cpi_mom(full: bool, existing: set, dry_run: bool) -> int:
    """
    cpi_mom: CPI 环比增速（%），月度
    数据源：FRED CPIAUCSL（CPI 指数），计算 MoM
    """
    log.info("采集 cpi_mom (US) ...")
    upsert_meta("cpi_mom", {
        "name_cn": "美国CPI环比增速",
        "description_cn": "美国消费者价格指数环比增速（%），月度，由 CPIAUCSL 计算",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "mom",
        "source_name": "FRED/BLS", "source_url": "https://fred.stlouisfed.org/series/CPIAUCSL",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("CPIAUCSL")
    if df is None:
        return 0
    df = calc_mom(df)
    rows = make_rows(df, "cpi_mom", existing, full)
    return upsert_rows(rows, dry_run)


def collect_ppi_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """
    ppi_yoy: PPI 同比增速（%），月度
    数据源：FRED PPIACO（生产者价格指数，所有商品），计算 YoY
    """
    log.info("采集 ppi_yoy (US) ...")
    upsert_meta("ppi_yoy", {
        "name_cn": "美国PPI同比增速",
        "description_cn": "美国生产者价格指数（所有商品）同比增速（%），月度",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "FRED/BLS", "source_url": "https://fred.stlouisfed.org/series/PPIACO",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("PPIACO")
    if df is None:
        return 0
    df = calc_yoy(df, freq="M")
    rows = make_rows(df, "ppi_yoy", existing, full)
    return upsert_rows(rows, dry_run)


def collect_export_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """
    export_yoy: 出口同比增速（%），月度
    数据源：FRED BOPGEXP（月度商品出口，百万美元），计算 YoY
    """
    log.info("采集 export_yoy (US) ...")
    upsert_meta("export_yoy", {
        "name_cn": "美国出口同比增速",
        "description_cn": "美国商品出口同比增速（%），月度，由 BOPGEXP 计算",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "FRED/BEA", "source_url": "https://fred.stlouisfed.org/series/BOPGEXP",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("BOPGEXP")
    if df is None:
        return 0
    df = calc_yoy(df, freq="M")
    rows = make_rows(df, "export_yoy", existing, full)
    return upsert_rows(rows, dry_run)


def collect_import_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """
    import_yoy: 进口同比增速（%），月度
    数据源：FRED BOPGIMP（月度商品进口，百万美元），计算 YoY
    """
    log.info("采集 import_yoy (US) ...")
    upsert_meta("import_yoy", {
        "name_cn": "美国进口同比增速",
        "description_cn": "美国商品进口同比增速（%），月度，由 BOPGIMP 计算",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "FRED/BEA", "source_url": "https://fred.stlouisfed.org/series/BOPGIMP",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("BOPGIMP")
    if df is None:
        return 0
    df = calc_yoy(df, freq="M")
    rows = make_rows(df, "import_yoy", existing, full)
    return upsert_rows(rows, dry_run)


def collect_industrial_yoy(full: bool, existing: set, dry_run: bool) -> int:
    """
    industrial_yoy: 工业产出同比（%），月度
    数据源：FRED INDPRO（工业生产指数），计算 YoY
    """
    log.info("采集 industrial_yoy (US) ...")
    upsert_meta("industrial_yoy", {
        "name_cn": "美国工业产出同比",
        "description_cn": "美国工业生产指数同比增速（%），月度，美联储公布",
        "category": "macro", "frequency": "monthly",
        "unit": "%", "value_type": "yoy",
        "source_name": "FRED/FRB", "source_url": "https://fred.stlouisfed.org/series/INDPRO",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("INDPRO")
    if df is None:
        return 0
    df = calc_yoy(df, freq="M")
    rows = make_rows(df, "industrial_yoy", existing, full)
    return upsert_rows(rows, dry_run)


def collect_m2_level(full: bool, existing: set, dry_run: bool) -> int:
    """
    m2_level: M2 绝对值（十亿美元），月度
    数据源：FRED M2SL（M2 货币供应量，十亿美元）
    """
    log.info("采集 m2_level (US) ...")
    upsert_meta("m2_level", {
        "name_cn": "美国M2货币供应量",
        "description_cn": "美国M2货币供应量绝对值（十亿美元），月度",
        "category": "macro", "frequency": "monthly",
        "unit": "十亿美元", "value_type": "level",
        "source_name": "FRED/FRB", "source_url": "https://fred.stlouisfed.org/series/M2SL",
        "credibility": "high"
    }, dry_run)
    df = fetch_fred("M2SL")
    if df is None:
        return 0
    rows = make_rows(df, "m2_level", existing, full)
    return upsert_rows(rows, dry_run)


def collect_govt_debt_gdp(full: bool, existing: set, dry_run: bool) -> int:
    """
    govt_debt_gdp: 政府债务/GDP（%），年度
    数据源：IMF DataMapper GGXWDG_NGDP（一般政府总债务/GDP）
    """
    log.info("采集 govt_debt_gdp (US) ...")
    upsert_meta("govt_debt_gdp", {
        "name_cn": "美国政府债务/GDP",
        "description_cn": "美国一般政府总债务占GDP比重（%），IMF数据，年度",
        "category": "macro", "frequency": "annual",
        "unit": "%", "value_type": "rate",
        "source_name": "IMF DataMapper", "source_url": "https://www.imf.org/external/datamapper/",
        "credibility": "high"
    }, dry_run)
    values = fetch_imf("GGXWDG_NGDP", "USA")
    if values is None:
        return 0
    rows = []
    for year_str, val in values.items():
        if val is None:
            continue
        trade_date = f"{year_str}-01-01"
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": "govt_debt_gdp",
            "region": REGION,
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": round(float(val), 4),
            "revision_seq": 0,
        })
    return upsert_rows(rows, dry_run)


def collect_pmi_non_mfg(full: bool, existing: set, dry_run: bool) -> int:
    """
    pmi_non_mfg: ISM 服务业 PMI（点），月度
    数据源：AKShare macro_usa_services_pmi（超时则跳过）
    注：FRED 无直接服务业 PMI 序列；如 AKShare 超时，此指标跳过
    """
    log.info("采集 pmi_non_mfg (US) ...")
    upsert_meta("pmi_non_mfg", {
        "name_cn": "美国ISM服务业PMI",
        "description_cn": "美国供应管理协会（ISM）服务业采购经理人指数，50以上为扩张",
        "category": "macro", "frequency": "monthly",
        "unit": "点", "value_type": "index",
        "source_name": "AKShare/ISM", "source_url": "https://www.ismworld.org/",
        "credibility": "high"
    }, dry_run)
    try:
        import signal

        def _timeout_handler(signum, frame):
            raise TimeoutError("AKShare 超时")

        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(15)

        import akshare as ak
        # AKShare 服务业 PMI 接口
        df_raw = ak.macro_usa_services_pmi()
        signal.alarm(0)

        rows = []
        for _, r in df_raw.iterrows():
            try:
                trade_date = pd.to_datetime(r["时间"]).strftime("%Y-%m-%d")
                value = float(r["现值"]) if pd.notna(r["现值"]) else None
                if value is None:
                    continue
                if not full and trade_date in existing:
                    continue
                rows.append({
                    "indicator_id": "pmi_non_mfg",
                    "region": REGION,
                    "trade_date": trade_date,
                    "publish_date": trade_date,
                    "value": value,
                    "revision_seq": 0,
                })
            except Exception:
                continue
        return upsert_rows(rows, dry_run)
    except (TimeoutError, Exception) as e:
        log.warning(f"  pmi_non_mfg AKShare 超时或失败，跳过: {e}")
        return 0


# ── 指标注册表 ─────────────────────────────────────────────────────────────────
COLLECTORS = {
    # Phase 1（已有）
    "cpi_yoy":             collect_cpi_yoy,
    "unemployment_rate":   collect_unemployment_rate,
    "gdp_yoy":             collect_gdp_yoy,
    "fed_funds_rate":      collect_fed_funds_rate,
    "bond_10y":            collect_bond_10y,
    "m2_yoy":              collect_m2_yoy,
    "retail_yoy":          collect_retail_yoy,
    "trade_balance":       collect_trade_balance,
    "pmi_mfg":             collect_pmi_mfg,
    "current_account_gdp": collect_current_account_gdp,
    # Phase 2（新增）
    "gdp_level":           collect_gdp_level,
    "gdp_qoq":             collect_gdp_qoq,
    "cpi_mom":             collect_cpi_mom,
    "ppi_yoy":             collect_ppi_yoy,
    "export_yoy":          collect_export_yoy,
    "import_yoy":          collect_import_yoy,
    "industrial_yoy":      collect_industrial_yoy,
    "m2_level":            collect_m2_level,
    "govt_debt_gdp":       collect_govt_debt_gdp,
    "pmi_non_mfg":         collect_pmi_non_mfg,
}


# ── 主函数 ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="美国宏观指标采集脚本（REQ-027 Phase 1+2）")
    parser.add_argument("--full", action="store_true", help="全量回填历史数据")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写入数据库")
    parser.add_argument("--indicator", type=str, default=None,
                        help="仅采集指定指标，如 --indicator cpi_yoy")
    args = parser.parse_args()

    mode = "全量回填" if args.full else "增量采集"
    log.info(f"=== 美国宏观指标采集开始（{mode}，region={REGION}）===")
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
            existing = set() if args.full else get_existing_dates(indicator_id, REGION)
            written = collector_fn(full=args.full, existing=existing, dry_run=args.dry_run)
            summary[indicator_id] = {"written": written, "status": "✅"}
            log.info(f"  {indicator_id}: 写入 {written} 条")
        except Exception as e:
            summary[indicator_id] = {"written": 0, "status": f"❌ {e}"}
            log.error(f"  {indicator_id}: 采集失败 - {e}")

    log.info("\n=== 采集汇总 ===")
    total_written = 0
    for iid, s in summary.items():
        log.info(f"  {s['status']} {iid}: 写入 {s['written']} 条")
        total_written += s["written"]
    log.info(f"\n合计写入: {total_written} 条")
    log.info("=== 采集完成 ===")


if __name__ == "__main__":
    main()
