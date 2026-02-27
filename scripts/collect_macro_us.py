#!/usr/bin/env python3
"""
collect_macro_us.py
美国宏观指标数据采集脚本（REQ-027 Phase 1）

数据源：FRED（美联储经济数据，无需 API Key，公开 CSV 接口）
覆盖指标：10 个核心宏观指标，indicator_id 遵循无前缀规范，region=US

用法：
    python3 collect_macro_us.py              # 增量采集（默认）
    python3 collect_macro_us.py --full       # 全量回填（历史所有数据）
    python3 collect_macro_us.py --dry-run    # 仅打印，不写入数据库
    python3 collect_macro_us.py --indicator cpi_yoy  # 仅采集指定指标

指标列表：
    cpi_yoy            CPI 同比增速（%），月度，由 CPIAUCSL 计算 YoY
    unemployment_rate  失业率（%），月度，UNRATE
    gdp_yoy            GDP 实际增速（%），季度，A191RL1Q225SBEA
    fed_funds_rate     联邦基金利率（%），月度，FEDFUNDS
    bond_10y           10年期国债收益率（%），日度，DGS10（与 CN 共用同名指标）
    m2_yoy             M2 货币供应同比（%），月度，由 M2SL 计算 YoY
    retail_yoy         零售销售同比（%），月度，由 RSAFS 计算 YoY
    trade_balance      贸易差额（百万美元），月度，BOPGSTB
    pmi_mfg            ISM 制造业 PMI（点），月度（注：FRED 无直接 PMI，用 AKShare 补充）
    current_account_gdp 经常账户/GDP（%），季度，由 NETFI 与 GDP 计算

注意事项：
    - FRED CSV 接口无需 API Key，但有频率限制（每分钟约 120 次）
    - cpi_yoy / m2_yoy / retail_yoy 均为原始指数，需计算 YoY（同比）
    - bond_10y 为日度数据，与 CN 共用 indicator_id，通过 region=US 区分
    - pmi_mfg 使用 AKShare 的 macro_usa_ism_pmi，如超时则跳过
    - current_account_gdp 用 NETFI（净国际投资头寸）近似，精度有限
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

def fetch_fred(series_id: str, timeout: int = 10) -> Optional[pd.DataFrame]:
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


# ── 各指标采集函数 ─────────────────────────────────────────────────────────────

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
    数据源：FRED A191RL1Q225SBEA（实际 GDP 季度环比折年率）
    注：FRED 提供的是季度环比折年率，非同比，但为全球最权威的美国 GDP 数据
    """
    log.info("采集 gdp_yoy (US) ...")
    upsert_meta("gdp_yoy", {
        "name_cn": "美国GDP实际增速",
        "description_cn": "美国实际GDP季度环比折年率（SAAR），BEA公布",
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
    注：与 CN 共用 indicator_id=bond_10y，通过 region=US 区分
    """
    log.info("采集 bond_10y (US) ...")
    # bond_10y(US) 的元数据在历史迁移时已存在，此处仅更新 source 信息
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
    注：FRED 无直接 PMI 序列，使用 AKShare 补充；如 AKShare 超时，此指标跳过
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
        signal.alarm(15)  # 15秒超时

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
    current_account_gdp: 经常账户/GDP（%），季度
    数据源：IMF DataMapper API（BCAR 指标，美国）
    注：FRED 的 NETFI 是净国际投资头寸，与经常账户不同；改用 IMF 数据更准确
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
    try:
        url = "https://www.imf.org/external/datamapper/api/v1/BCA_NGDPD/USA"
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        values = data.get("values", {}).get("BCA_NGDPD", {}).get("USA", {})
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
    except Exception as e:
        log.error(f"  current_account_gdp IMF 获取失败: {e}")
        return 0


# ── 指标注册表 ─────────────────────────────────────────────────────────────────
COLLECTORS = {
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
}


# ── 主函数 ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="美国宏观指标采集脚本（REQ-027 Phase 1）")
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
