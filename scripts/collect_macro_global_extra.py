#!/usr/bin/env python3
"""
collect_macro_global_extra.py  —  REQ-032
全球24国补充指标采集（第三批）

核心原则：同一 indicator_id，不同 region，支持横向比较。

新增指标：
  bond_10y_real   实际长期政府债券收益率（通胀调整后）  IMF DataMapper rltir
                  注：这是 IMF 发布的实际（real）收益率，非名义收益率
                  CN 已有 bond_10y（名义），此为实际收益率，便于跨国横向比较
  gdp_deflator    GDP 平减指数同比（近似 PPI，广义价格水平）  WB NY.GDP.DEFL.KD.ZG
                  注：WB 无全球 PPI 数据，GDP 平减指数是最广覆盖的价格指标
                  可与 CN 的 ppi_yoy 结合使用（ppi_yoy 反映工业价格，gdp_deflator 反映全经济价格）
  cpi_yoy_annual  CPI 同比（年度，WB 口径）  WB FP.CPI.TOTL.ZG
                  注：CN 已有月度 cpi_yoy（AKShare），此为年度 WB 口径，便于横向比较
                  indicator_id 使用 cpi_yoy_annual 以区分月度和年度口径

数据源：
  bond_10y_real: IMF DataMapper（免费，年度，覆盖 75 国）
  gdp_deflator:  World Bank API（免费，年度，覆盖 ~180 国）
  cpi_yoy_annual: World Bank API（免费，年度，覆盖 ~180 国）

覆盖：24国（JP/KR/DE/FR/IT/AU/CA/SG/TH/ID/MY/VN/PH/ZA/NG/EG/ET/KE/BR/AR/MX/CL/CO/PE）
      + CN/US/EU（横向比较基准）

用法：
  python3 collect_macro_global_extra.py [--dry-run] [--full]
  python3 collect_macro_global_extra.py --indicator bond_10y_real --region JP KR
"""

import os, sys, time, logging, argparse, requests
from collections import defaultdict
from supabase import create_client

# ─── 日志 ─────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── 数据库 ───────────────────────────────────────────────────────────────────
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# ─── 国家配置 ─────────────────────────────────────────────────────────────────
# iso2 → {name_cn, wb: WB ISO3, imf: IMF ISO3}
COUNTRIES = {
    "JP": {"name_cn": "日本",       "wb": "JPN", "imf": "JPN"},
    "KR": {"name_cn": "韩国",       "wb": "KOR", "imf": "KOR"},
    "DE": {"name_cn": "德国",       "wb": "DEU", "imf": "DEU"},
    "FR": {"name_cn": "法国",       "wb": "FRA", "imf": "FRA"},
    "IT": {"name_cn": "意大利",     "wb": "ITA", "imf": "ITA"},
    "AU": {"name_cn": "澳大利亚",   "wb": "AUS", "imf": "AUS"},
    "CA": {"name_cn": "加拿大",     "wb": "CAN", "imf": "CAN"},
    "SG": {"name_cn": "新加坡",     "wb": "SGP", "imf": "SGP"},
    "TH": {"name_cn": "泰国",       "wb": "THA", "imf": "THA"},
    "ID": {"name_cn": "印度尼西亚", "wb": "IDN", "imf": "IDN"},
    "MY": {"name_cn": "马来西亚",   "wb": "MYS", "imf": "MYS"},
    "VN": {"name_cn": "越南",       "wb": "VNM", "imf": "VNM"},
    "PH": {"name_cn": "菲律宾",     "wb": "PHL", "imf": "PHL"},
    "ZA": {"name_cn": "南非",       "wb": "ZAF", "imf": "ZAF"},
    "NG": {"name_cn": "尼日利亚",   "wb": "NGA", "imf": "NGA"},
    "EG": {"name_cn": "埃及",       "wb": "EGY", "imf": "EGY"},
    "ET": {"name_cn": "埃塞俄比亚", "wb": "ETH", "imf": "ETH"},
    "KE": {"name_cn": "肯尼亚",     "wb": "KEN", "imf": "KEN"},
    "BR": {"name_cn": "巴西",       "wb": "BRA", "imf": "BRA"},
    "AR": {"name_cn": "阿根廷",     "wb": "ARG", "imf": "ARG"},
    "MX": {"name_cn": "墨西哥",     "wb": "MEX", "imf": "MEX"},
    "CL": {"name_cn": "智利",       "wb": "CHL", "imf": "CHL"},
    "CO": {"name_cn": "哥伦比亚",   "wb": "COL", "imf": "COL"},
    "PE": {"name_cn": "秘鲁",       "wb": "PER", "imf": "PER"},
    # 横向比较基准国
    "CN": {"name_cn": "中国",       "wb": "CHN", "imf": "CHN"},
    "US": {"name_cn": "美国",       "wb": "USA", "imf": "USA"},
}

# ─── 指标配置 ─────────────────────────────────────────────────────────────────
INDICATORS = {
    "bond_10y_real": {
        "source": "imf",
        "imf_code": "rltir",
        "name_cn": "实际长期政府债券收益率",
        "unit": "%",
        "frequency": "annual",
        "category": "macro",
        "value_type": "level",
        "note": "IMF DataMapper rltir，通胀调整后的实际长期政府债券收益率（年度）。与名义收益率 bond_10y 区分，便于跨国横向比较真实融资成本。",
    },
    "gdp_deflator": {
        "source": "wb",
        "wb_code": "NY.GDP.DEFL.KD.ZG",
        "name_cn": "GDP 平减指数同比（广义价格水平）",
        "unit": "%",
        "frequency": "annual",
        "category": "macro",
        "value_type": "yoy",
        "note": "WB GDP 平减指数同比增速（NY.GDP.DEFL.KD.ZG），是覆盖全经济的价格水平指标，可作为 PPI 的广义替代（WB 无全球 PPI 数据）。",
    },
    "cpi_yoy_annual": {
        "source": "wb",
        "wb_code": "FP.CPI.TOTL.ZG",
        "name_cn": "CPI 同比（年度，WB 口径）",
        "unit": "%",
        "frequency": "annual",
        "category": "macro",
        "value_type": "yoy",
        "note": "WB CPI 通胀率年度数据（FP.CPI.TOTL.ZG）。CN 已有月度 cpi_yoy（AKShare），此为年度 WB 口径，便于全球横向比较。",
    },
}

IMF_BASE = "https://www.imf.org/external/datamapper/api/v1"
WB_BASE  = "https://api.worldbank.org/v2"
DATE_RANGE = "1980:2025"
PER_PAGE   = 1000


# ─── 工具函数 ─────────────────────────────────────────────────────────────────
def fetch_imf_all(imf_code: str) -> dict:
    """获取 IMF DataMapper 某指标的全部国家数据，返回 {iso3: {year: value}}"""
    url = f"{IMF_BASE}/{imf_code}"
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
        return data.get("values", {}).get(imf_code, {})
    except Exception as e:
        log.warning(f"IMF API 请求失败 ({imf_code}): {e}")
        return {}


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
            log.warning(f"WB API 请求失败 (page={page}): {e}")
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
    source_url = (
        f"https://www.imf.org/external/datamapper/{meta.get('imf_code', '')}"
        if meta["source"] == "imf"
        else f"https://data.worldbank.org/indicator/{meta.get('wb_code', '')}"
    )
    row = {
        "id":             indicator_id,
        "region":         region,
        "name_cn":        meta["name_cn"],
        "unit":           meta["unit"],
        "frequency":      meta["frequency"],
        "category":       meta["category"],
        "value_type":     meta["value_type"],
        "source_name":    "IMF DataMapper" if meta["source"] == "imf" else "World Bank",
        "source_url":     source_url,
        "description_cn": meta.get("note", ""),
        "credibility":    "high",
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
    BATCH = 200
    total = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        supabase.table("indicator_values").upsert(
            batch, on_conflict="indicator_id,region,trade_date,revision_seq"
        ).execute()
        total += len(batch)
    return total


# ─── 主流程 ───────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",   action="store_true")
    parser.add_argument("--full",      action="store_true", help="全量覆盖（默认增量）")
    parser.add_argument("--region",    nargs="+")
    parser.add_argument("--indicator", nargs="+")
    args = parser.parse_args()

    target_regions    = args.region    or list(COUNTRIES.keys())
    target_indicators = args.indicator or list(INDICATORS.keys())

    log.info("=" * 70)
    log.info("全球宏观补充指标采集 —— REQ-032")
    log.info(f"  模式: {'全量' if args.full else '增量'} | DRY-RUN: {args.dry_run}")
    log.info(f"  国家: {target_regions}")
    log.info(f"  指标: {target_indicators}")
    log.info("=" * 70)

    # 预先拉取所有 IMF 数据（一次请求）
    imf_cache = {}
    for ind_id in target_indicators:
        meta = INDICATORS.get(ind_id, {})
        if meta.get("source") == "imf":
            log.info(f"  预拉取 IMF {meta['imf_code']}...")
            imf_cache[ind_id] = fetch_imf_all(meta["imf_code"])
            log.info(f"  覆盖 {len(imf_cache[ind_id])} 个国家")

    # 预先拉取所有 WB 数据（按指标批量）
    wb_cache = {}
    wb_iso3_list = [COUNTRIES[r]["wb"] for r in target_regions if r in COUNTRIES]
    for ind_id in target_indicators:
        meta = INDICATORS.get(ind_id, {})
        if meta.get("source") == "wb":
            log.info(f"  预拉取 WB {meta['wb_code']}...")
            wb_cache[ind_id] = fetch_wb_batch(meta["wb_code"], wb_iso3_list)
            total = sum(len(v) for v in wb_cache[ind_id].values())
            log.info(f"  覆盖 {len(wb_cache[ind_id])} 个国家，共 {total} 条")

    summary = {}

    for ind_id in target_indicators:
        if ind_id not in INDICATORS:
            log.warning(f"未知指标: {ind_id}，跳过")
            continue
        meta = INDICATORS[ind_id]
        log.info(f"\n[指标] {ind_id} — {meta['name_cn']}")

        for region in target_regions:
            if region not in COUNTRIES:
                continue
            name_cn = COUNTRIES[region]["name_cn"]

            # 获取该国数据
            if meta["source"] == "imf":
                iso3 = COUNTRIES[region]["imf"]
                country_data_raw = imf_cache.get(ind_id, {}).get(iso3, {})
                # IMF 返回 {year_str: value}，year_str 可能是 "2024"
                country_data = {str(y): v for y, v in country_data_raw.items()}
            else:
                iso3 = COUNTRIES[region]["wb"]
                country_data = wb_cache.get(ind_id, {}).get(iso3, {})
                # WB 返回 {year_str: value}

            if not country_data:
                log.info(f"  {region}({name_cn}) {ind_id}: 无数据")
                continue

            # 增量模式：查已有日期
            if not args.full:
                existing_res = supabase.table("indicator_values").select("trade_date") \
                    .eq("indicator_id", ind_id).eq("region", region).execute()
                existing = {r["trade_date"] for r in existing_res.data}
            else:
                existing = set()

            rows = []
            for year, val in sorted(country_data.items()):
                trade_date = f"{year}-01-01"
                if trade_date in existing:
                    continue
                rows.append({
                    "indicator_id": ind_id,
                    "region":       region,
                    "trade_date":   trade_date,
                    "publish_date": trade_date,
                    "value":        round(float(val), 6),
                    "revision_seq": 0,
                })

            if not rows:
                log.info(f"  {region}({name_cn}) {ind_id}: 无新增（已有 {len(existing)} 条）")
                continue

            upsert_meta(region, ind_id, meta, args.dry_run)
            written = upsert_values(rows, args.dry_run)
            log.info(f"  {region}({name_cn}) {ind_id}: 写入 {written} 条 / {len(country_data)} 年可用")

            if region not in summary:
                summary[region] = {}
            summary[region][ind_id] = written

        time.sleep(0.3)

    # 汇总
    log.info("\n" + "=" * 70)
    log.info("采集汇总：")
    total_all = 0
    for region in target_regions:
        if region not in summary:
            continue
        counts    = summary[region]
        total     = sum(counts.values())
        total_all += total
        detail    = " | ".join(f"{k}:{v}" for k, v in counts.items())
        name_cn   = COUNTRIES.get(region, {}).get("name_cn", region)
        log.info(f"  {region}({name_cn}): 共 {total} 条  [{detail}]")
    log.info(f"\n全部合计写入: {total_all} 条")
    log.info("=" * 70)


if __name__ == "__main__":
    main()
