#!/usr/bin/env python3
"""
collect_macro_policy_rate_advanced.py — REQ-069
补充 policy_rate 缺失的发达国家/地区（CH/CN/DE/FR/GB/NO/NZ/SE/TW/US）

数据源：
  - US:  FRED FEDFUNDS（联邦基金利率，月度）
  - GB:  FRED BOEBR（英国央行基准利率，月度）
  - CH:  FRED IRSTCI01CHM156N（瑞士央行利率，月度）
  - NO:  FRED IRSTCI01NOM156N（挪威央行利率，月度）
  - NZ:  FRED IRSTCI01NZM156N（新西兰央行利率，月度）
  - SE:  FRED IRSTCI01SEM156N（瑞典央行利率，月度）
  - DE:  FRED ECBDFR（ECB 存款便利利率，日度，欧元区成员）
  - FR:  FRED ECBDFR（ECB 存款便利利率，日度，欧元区成员）
  - CN:  WB FR.INR.LEND（贷款利率代理，年度）
  - TW:  WB FR.INR.LEND（贷款利率代理，年度）

注：DE/FR 属于欧元区，其 policy_rate 与 EU 相同（ECB 利率）
    US 已有 fed_funds_rate（月度），此处新增 policy_rate 以支持横向比较

用法：
  python3 collect_macro_policy_rate_advanced.py [--dry-run] [--full] [--region US GB CH]
"""
import os
import sys
import time
import logging
import argparse
import requests
import pandas as pd
from io import StringIO
from supabase import create_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"
WB_BASE   = "https://api.worldbank.org/v2"

# ─── 国家配置 ─────────────────────────────────────────────────────────────────
FRED_CONFIGS = {
    "US": {
        "fred_series": "FEDFUNDS",
        "name_cn": "美国联邦基金利率",
        "description_cn": "美国联邦基金利率，美联储货币政策基准利率（月度均值）",
        "frequency": "monthly",
        "source_url": "https://fred.stlouisfed.org/series/FEDFUNDS",
    },
    "GB": {
        "fred_series": "IRSTCI01GBM156N",
        "name_cn": "英国央行短期利率",
        "description_cn": "英国央行短期利率（OECD 口径），作为政策利率代理",
        "frequency": "monthly",
        "source_url": "https://fred.stlouisfed.org/series/IRSTCI01GBM156N",
    },
    "CH": {
        "fred_series": "IRSTCI01CHM156N",
        "name_cn": "瑞士央行短期利率",
        "description_cn": "瑞士央行短期利率（OECD 口径），作为政策利率代理",
        "frequency": "monthly",
        "source_url": "https://fred.stlouisfed.org/series/IRSTCI01CHM156N",
    },
    "NO": {
        "fred_series": "IRSTCI01NOM156N",
        "name_cn": "挪威央行短期利率",
        "description_cn": "挪威央行短期利率（OECD 口径），作为政策利率代理",
        "frequency": "monthly",
        "source_url": "https://fred.stlouisfed.org/series/IRSTCI01NOM156N",
    },
    "NZ": {
        "fred_series": "IRSTCI01NZM156N",
        "name_cn": "新西兰央行短期利率",
        "description_cn": "新西兰央行短期利率（OECD 口径），作为政策利率代理",
        "frequency": "monthly",
        "source_url": "https://fred.stlouisfed.org/series/IRSTCI01NZM156N",
    },
    "SE": {
        "fred_series": "IRSTCI01SEM156N",
        "name_cn": "瑞典央行短期利率",
        "description_cn": "瑞典央行短期利率（OECD 口径），作为政策利率代理",
        "frequency": "monthly",
        "source_url": "https://fred.stlouisfed.org/series/IRSTCI01SEM156N",
    },
    "DE": {
        "fred_series": "ECBDFR",
        "name_cn": "德国政策利率（ECB 存款便利利率）",
        "description_cn": "德国作为欧元区成员，使用欧洲央行存款便利利率（Deposit Facility Rate）",
        "frequency": "daily",
        "source_url": "https://fred.stlouisfed.org/series/ECBDFR",
    },
    "FR": {
        "fred_series": "ECBDFR",
        "name_cn": "法国政策利率（ECB 存款便利利率）",
        "description_cn": "法国作为欧元区成员，使用欧洲央行存款便利利率（Deposit Facility Rate）",
        "frequency": "daily",
        "source_url": "https://fred.stlouisfed.org/series/ECBDFR",
    },
}

# WB 口径的 policy_rate（贷款利率代理）
WB_CONFIGS = {
    "CN": {"wb": "CHN", "name_cn": "中国贷款利率（WB 口径）"},
    "TW": {"wb": "TWN", "name_cn": "台湾贷款利率（WB 口径）"},
}


def fetch_fred(series_id: str):
    """从 FRED 获取 CSV 数据，返回 DataFrame(date, value)"""
    url = FRED_BASE.format(series_id)
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        df = pd.read_csv(StringIO(r.text))
        df.columns = ["date", "value"]
        df["value"] = pd.to_numeric(df["value"], errors="coerce")
        df = df.dropna(subset=["value"])
        df["date"] = df["date"].astype(str)
        log.info(f"  FRED {series_id}: {len(df)} 条记录")
        return df
    except Exception as e:
        log.error(f"  FRED {series_id} 获取失败: {e}")
        return None


def fetch_wb_single(wb_code: str, iso3: str) -> dict:
    """获取 WB 单国数据，返回 {year: value}"""
    url = f"{WB_BASE}/country/{iso3}/indicator/{wb_code}?format=json&per_page=100&date=1980:2025"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        data = r.json()
        if not isinstance(data, list) or len(data) < 2:
            return {}
        result = {}
        for rec in (data[1] or []):
            if rec.get("value") is not None:
                result[rec["date"]] = float(rec["value"])
        return result
    except Exception as e:
        log.error(f"  WB {wb_code}/{iso3} 获取失败: {e}")
        return {}


def upsert_meta(region: str, meta: dict, dry_run: bool):
    row = {
        "id": "policy_rate",
        "region": region,
        "name_cn": meta["name_cn"],
        "description_cn": meta.get("description_cn", ""),
        "category": "macro",
        "unit": "%",
        "frequency": meta.get("frequency", "monthly"),
        "value_type": "rate",
        "source_name": meta.get("source_name", "FRED"),
        "source_url": meta.get("source_url", ""),
        "credibility": "high",
    }
    if dry_run:
        log.info(f"  [DRY-RUN] upsert meta: policy_rate / {region}")
        return
    supabase.table("indicator_meta").upsert(row, on_conflict="id,region").execute()


def upsert_values(rows: list, dry_run: bool) -> int:
    if not rows:
        return 0
    if dry_run:
        log.info(f"  [DRY-RUN] 将写入 {len(rows)} 条，示例: {rows[0]}")
        return len(rows)
    BATCH = 500
    total = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        supabase.table("indicator_values").upsert(
            batch, on_conflict="indicator_id,region,trade_date,revision_seq"
        ).execute()
        total += len(batch)
    return total


def get_existing(region: str) -> set:
    all_dates = []
    offset = 0
    while True:
        r = supabase.table("indicator_values").select("trade_date") \
            .eq("indicator_id", "policy_rate").eq("region", region) \
            .range(offset, offset + 999).execute()
        if not r.data:
            break
        all_dates.extend(d["trade_date"] for d in r.data)
        if len(r.data) < 1000:
            break
        offset += 1000
    return set(all_dates)


def collect_fred_region(region: str, cfg: dict, full: bool, dry_run: bool) -> int:
    """采集 FRED 数据源的 policy_rate"""
    log.info(f"采集 policy_rate ({region}) from FRED {cfg['fred_series']} ...")
    df = fetch_fred(cfg["fred_series"])
    if df is None:
        return 0

    existing = set() if full else get_existing(region)
    rows = []
    for _, row in df.iterrows():
        date_str = str(row["date"])
        if date_str in existing:
            continue
        rows.append({
            "indicator_id": "policy_rate",
            "region": region,
            "trade_date": date_str,
            "publish_date": date_str,
            "value": round(float(row["value"]), 4),
            "revision_seq": 0,
        })

    if rows:
        upsert_meta(region, {**cfg, "source_name": "FRED"}, dry_run)
        written = upsert_values(rows, dry_run)
        log.info(f"  {region} policy_rate: 写入 {written} 条")
        return written
    else:
        log.info(f"  {region} policy_rate: 无新增（已有 {len(existing)} 条）")
        return 0


def collect_wb_region(region: str, cfg: dict, full: bool, dry_run: bool) -> int:
    """采集 WB 数据源的 policy_rate（贷款利率代理）"""
    log.info(f"采集 policy_rate ({region}) from WB FR.INR.LEND ...")
    data = fetch_wb_single("FR.INR.LEND", cfg["wb"])
    if not data:
        log.warning(f"  {region}: WB 无数据")
        return 0

    existing = set() if full else get_existing(region)
    rows = []
    for year, val in sorted(data.items()):
        trade_date = f"{year}-01-01"
        if trade_date in existing:
            continue
        rows.append({
            "indicator_id": "policy_rate",
            "region": region,
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": round(val, 4),
            "revision_seq": 0,
        })

    if rows:
        upsert_meta(region, {
            "name_cn": cfg["name_cn"],
            "description_cn": f"{cfg['name_cn']}（WB FR.INR.LEND 贷款利率代理，年度）",
            "frequency": "annual",
            "source_name": "World Bank",
            "source_url": "https://data.worldbank.org/indicator/FR.INR.LEND",
        }, dry_run)
        written = upsert_values(rows, dry_run)
        log.info(f"  {region} policy_rate: 写入 {written} 条")
        return written
    else:
        log.info(f"  {region} policy_rate: 无新增（已有 {len(existing)} 条）")
        return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--full",    action="store_true")
    parser.add_argument("--region",  nargs="+", help="指定 region，如 US GB CH")
    args = parser.parse_args()

    all_regions = list(FRED_CONFIGS.keys()) + list(WB_CONFIGS.keys())
    target_regions = args.region or all_regions

    log.info("=" * 60)
    log.info("policy_rate 补全采集 — REQ-069")
    log.info(f"  模式: {'全量' if args.full else '增量'} | DRY-RUN: {args.dry_run}")
    log.info(f"  目标: {target_regions}")
    log.info("=" * 60)

    total = 0
    for region in target_regions:
        if region in FRED_CONFIGS:
            total += collect_fred_region(region, FRED_CONFIGS[region], args.full, args.dry_run)
            time.sleep(0.5)
        elif region in WB_CONFIGS:
            total += collect_wb_region(region, WB_CONFIGS[region], args.full, args.dry_run)
            time.sleep(0.3)
        else:
            log.warning(f"未知 region: {region}，跳过")

    log.info(f"\n合计写入: {total} 条")


if __name__ == "__main__":
    main()
