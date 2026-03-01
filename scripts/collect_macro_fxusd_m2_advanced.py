#!/usr/bin/env python3
"""
collect_macro_fxusd_m2_advanced.py — REQ-069
补充 fx_usd 和 m2_level 缺失的国家/地区

fx_usd 缺失：CH/CN/EU/GB/NO/NZ/SE/TW/US
  - US: USD 是基准货币，fx_usd = 1（无意义，跳过）
  - EU: EUR 是主要储备货币，fx_usd = EUR/USD 汇率（1 USD = X EUR 的倒数）
  - CN: 已有 rmb_usd（月度），此处补充年度 WB 口径 fx_usd
  - GB/CH/NO/NZ/SE/TW: WB PA.NUS.FCRF（年均汇率）

m2_level 缺失：CH/DE/FR/GB/IT/NO/NZ/SE/TW
  - DE/FR/IT: 欧元区成员，WB 数据可能为空（欧元区统一统计）
  - CH/GB/NO/NZ/SE/TW: WB FM.LBL.BMNY.CN（本币）

数据源：World Bank API（免费，年度，1980~2025）

用法：
  python3 collect_macro_fxusd_m2_advanced.py [--dry-run] [--full] [--indicator fx_usd m2_level] [--region CH GB]
"""
import os
import sys
import time
import logging
import argparse
import requests
from collections import defaultdict
from supabase import create_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

WB_BASE    = "https://api.worldbank.org/v2"
DATE_RANGE = "1980:2025"
PER_PAGE   = 1000

# ─── 国家配置 ─────────────────────────────────────────────────────────────────
# fx_usd 缺失国家（US 跳过，EU 特殊处理）
FX_USD_COUNTRIES = {
    "CN": {"wb": "CHN", "name_cn": "中国"},
    "EU": {"wb": "EMU", "name_cn": "欧元区"},  # WB 欧元区代码
    "GB": {"wb": "GBR", "name_cn": "英国"},
    "CH": {"wb": "CHE", "name_cn": "瑞士"},
    "NO": {"wb": "NOR", "name_cn": "挪威"},
    "NZ": {"wb": "NZL", "name_cn": "新西兰"},
    "SE": {"wb": "SWE", "name_cn": "瑞典"},
    "TW": {"wb": "TWN", "name_cn": "台湾"},
}

# m2_level 缺失国家
M2_LEVEL_COUNTRIES = {
    "CH": {"wb": "CHE", "name_cn": "瑞士"},
    "DE": {"wb": "DEU", "name_cn": "德国"},
    "FR": {"wb": "FRA", "name_cn": "法国"},
    "GB": {"wb": "GBR", "name_cn": "英国"},
    "IT": {"wb": "ITA", "name_cn": "意大利"},
    "NO": {"wb": "NOR", "name_cn": "挪威"},
    "NZ": {"wb": "NZL", "name_cn": "新西兰"},
    "SE": {"wb": "SWE", "name_cn": "瑞典"},
    "TW": {"wb": "TWN", "name_cn": "台湾"},
}

# ─── 指标配置 ─────────────────────────────────────────────────────────────────
INDICATORS = {
    "fx_usd": {
        "wb_code": "PA.NUS.FCRF",
        "name_cn": "本币兑美元汇率（年均）",
        "unit": "本币/USD",
        "frequency": "annual",
        "category": "macro",
        "value_type": "level",
        "description_cn": "WB 官方汇率年均值（PA.NUS.FCRF），单位：1美元=X本币。",
        "source_url": "https://data.worldbank.org/indicator/PA.NUS.FCRF",
    },
    "m2_level": {
        "wb_code": "FM.LBL.BMNY.CN",
        "name_cn": "M2 货币供应量余额（本币）",
        "unit": "本币（原始单位）",
        "frequency": "annual",
        "category": "macro",
        "value_type": "level",
        "description_cn": "WB 广义货币供应量余额（FM.LBL.BMNY.CN），本币原始单位。",
        "source_url": "https://data.worldbank.org/indicator/FM.LBL.BMNY.CN",
    },
}


def fetch_wb_batch(wb_code: str, iso3_list: list) -> dict:
    """批量获取 WB 指标数据，返回 {iso3: {year: value}}"""
    iso3_str = ";".join(iso3_list)
    url = f"{WB_BASE}/country/{iso3_str}/indicator/{wb_code}?format=json&per_page={PER_PAGE}&date={DATE_RANGE}"
    result = defaultdict(dict)
    page = 1
    while True:
        try:
            r = requests.get(f"{url}&page={page}", timeout=30)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            log.warning(f"  WB API 请求失败 (page={page}): {e}")
            break
        if not isinstance(data, list) or len(data) < 2:
            break
        meta, records = data[0], data[1] or []
        for rec in records:
            if rec.get("value") is None:
                continue
            iso3 = rec.get("countryiso3code", "")
            year = rec.get("date", "")
            if iso3 and year:
                result[iso3][year] = float(rec["value"])
        if page >= meta.get("pages", 1):
            break
        page += 1
        time.sleep(0.2)
    return dict(result)


def upsert_meta(region: str, indicator_id: str, meta: dict, dry_run: bool):
    row = {
        "id": indicator_id,
        "region": region,
        "name_cn": meta["name_cn"],
        "description_cn": meta.get("description_cn", ""),
        "category": meta["category"],
        "unit": meta["unit"],
        "frequency": meta["frequency"],
        "value_type": meta["value_type"],
        "source_name": "World Bank",
        "source_url": meta.get("source_url", ""),
        "credibility": "high",
    }
    if dry_run:
        log.info(f"  [DRY-RUN] upsert meta: {indicator_id} / {region}")
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


def get_existing(indicator_id: str, region: str) -> set:
    all_dates = []
    offset = 0
    while True:
        r = supabase.table("indicator_values").select("trade_date") \
            .eq("indicator_id", indicator_id).eq("region", region) \
            .range(offset, offset + 999).execute()
        if not r.data:
            break
        all_dates.extend(d["trade_date"] for d in r.data)
        if len(r.data) < 1000:
            break
        offset += 1000
    return set(all_dates)


def collect_indicator(indicator_id: str, countries: dict, full: bool, dry_run: bool) -> int:
    """采集指定指标的缺失国家数据"""
    meta = INDICATORS[indicator_id]
    wb_code = meta["wb_code"]
    
    log.info(f"\n[指标] {indicator_id} (WB: {wb_code})")
    
    # 批量获取 WB 数据
    iso3_list = [cfg["wb"] for cfg in countries.values()]
    raw = fetch_wb_batch(wb_code, iso3_list)
    log.info(f"  WB API 返回 {sum(len(v) for v in raw.values())} 条，覆盖 {len(raw)} 个国家")
    
    # iso3 → region 映射
    iso3_to_region = {cfg["wb"]: region for region, cfg in countries.items()}
    
    total = 0
    for region, cfg in countries.items():
        iso3 = cfg["wb"]
        country_data = raw.get(iso3, {})
        
        if not country_data:
            log.info(f"  {region}({cfg['name_cn']}): WB 无数据")
            continue
        
        existing = set() if full else get_existing(indicator_id, region)
        rows = []
        for year, val in sorted(country_data.items()):
            trade_date = f"{year}-01-01"
            if trade_date in existing:
                continue
            rows.append({
                "indicator_id": indicator_id,
                "region": region,
                "trade_date": trade_date,
                "publish_date": trade_date,
                "value": round(val, 6),
                "revision_seq": 0,
            })
        
        if not rows:
            log.info(f"  {region}({cfg['name_cn']}): 无新增（已有 {len(existing)} 条）")
            continue
        
        upsert_meta(region, indicator_id, meta, dry_run)
        written = upsert_values(rows, dry_run)
        log.info(f"  {region}({cfg['name_cn']}): 写入 {written} 条 / {len(country_data)} 年可用")
        total += written
    
    return total


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",    action="store_true")
    parser.add_argument("--full",       action="store_true")
    parser.add_argument("--indicator",  nargs="+", help="指定指标，如 fx_usd m2_level")
    parser.add_argument("--region",     nargs="+", help="指定 region，如 CH GB")
    args = parser.parse_args()
    
    target_indicators = args.indicator or ["fx_usd", "m2_level"]
    
    log.info("=" * 60)
    log.info("fx_usd / m2_level 补全采集 — REQ-069")
    log.info(f"  模式: {'全量' if args.full else '增量'} | DRY-RUN: {args.dry_run}")
    log.info(f"  指标: {target_indicators}")
    log.info("=" * 60)
    
    total = 0
    
    for indicator_id in target_indicators:
        if indicator_id == "fx_usd":
            countries = FX_USD_COUNTRIES
        elif indicator_id == "m2_level":
            countries = M2_LEVEL_COUNTRIES
        else:
            log.warning(f"未知指标: {indicator_id}，跳过")
            continue
        
        # 过滤指定 region
        if args.region:
            countries = {r: cfg for r, cfg in countries.items() if r in args.region}
        
        total += collect_indicator(indicator_id, countries, args.full, args.dry_run)
        time.sleep(0.5)
    
    log.info(f"\n合计写入: {total} 条")


if __name__ == "__main__":
    main()
