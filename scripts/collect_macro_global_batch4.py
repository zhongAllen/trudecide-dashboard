#!/usr/bin/env python3
"""
collect_macro_global_batch4.py  —  REQ-033
全球24国补充指标采集（第四批）

核心原则：同一 indicator_id，不同 region，支持横向比较。

新增指标（与中国对齐）：
  gdp_per_capita_ppp  人均 GDP（PPP 国际元）  IMF PPPPC
                      注：比名义人均 GDP 更适合跨国生活水平比较（消除价格差异）
  savings_rate        国民储蓄率（%GDP）  WB NY.GNS.ICTR.ZS
                      注：对应 CN 的社会融资/投资分析，反映经济体的储蓄倾向
  mfg_value_added_pct 制造业增加值占GDP%  WB NV.IND.MANF.ZS
                      注：对应 CN 的 gdp_secondary_yoy，反映工业化程度，与 ppi_yoy 相关
  agri_value_added_pct 农业增加值占GDP%  WB NV.AGR.TOTL.ZS
                      注：对应 CN 的 gdp_primary_yoy，反映农业依赖度
  population          总人口  WB SP.POP.TOTL
                      注：基础统计指标，用于计算人均 GDP、人均贸易额等

注意：
  - pmi_mfg/pmi_non_mfg：IMF/WB 均无 PMI 数据，PMI 由 S&P Global/Markit 私有，需付费
  - ppi_yoy：WB/IMF 均无全球 PPI 数据，已用 gdp_deflator 作为替代
  - bond_10y（名义）：IMF DataMapper 无名义国债收益率，已用 bond_10y_real（实际）替代
  - lpr/shibor/dr：中国特有货币政策工具，无全球等价指标
  - 北向资金/融资余额/hs300_pe：中国 A 股特有，无全球等价指标

数据源：
  gdp_per_capita_ppp:  IMF DataMapper PPPPC（免费，年度，覆盖 228 国，1980~2030）
  savings_rate:        World Bank NY.GNS.ICTR.ZS（免费，年度，覆盖 ~170 国）
  mfg_value_added_pct: World Bank NV.IND.MANF.ZS（免费，年度，覆盖 ~180 国）
  agri_value_added_pct:World Bank NV.AGR.TOTL.ZS（免费，年度，覆盖 ~180 国）
  population:          World Bank SP.POP.TOTL（免费，年度，覆盖 ~217 国）

覆盖：24国 + CN/US/EU 基准
"""

import os, sys, time, logging, argparse, requests
from collections import defaultdict
from supabase import create_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# ─── 国家配置 ─────────────────────────────────────────────────────────────────
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
    # 横向比较基准
    "CN": {"name_cn": "中国",       "wb": "CHN", "imf": "CHN"},
    "US": {"name_cn": "美国",       "wb": "USA", "imf": "USA"},
}

# ─── 指标配置 ─────────────────────────────────────────────────────────────────
INDICATORS = {
    "gdp_per_capita_ppp": {
        "source": "imf",
        "imf_code": "PPPPC",
        "name_cn": "人均 GDP（PPP 国际元）",
        "unit": "国际元",
        "frequency": "annual",
        "category": "macro",
        "value_type": "level",
        "note": "IMF DataMapper PPPPC，按购买力平价（PPP）调整的人均 GDP，消除价格差异，适合跨国生活水平比较。覆盖 228 国，1980~2030。",
    },
    "savings_rate": {
        "source": "wb",
        "wb_code": "NY.GNS.ICTR.ZS",
        "name_cn": "国民储蓄率（%GDP）",
        "unit": "%",
        "frequency": "annual",
        "category": "macro",
        "value_type": "ratio",
        "note": "WB NY.GNS.ICTR.ZS，国民总储蓄占 GDP 百分比。反映经济体的储蓄倾向，与投资率、经常账户差额密切相关。",
    },
    "mfg_value_added_pct": {
        "source": "wb",
        "wb_code": "NV.IND.MANF.ZS",
        "name_cn": "制造业增加值占GDP%",
        "unit": "%",
        "frequency": "annual",
        "category": "macro",
        "value_type": "ratio",
        "note": "WB NV.IND.MANF.ZS，制造业增加值占 GDP 百分比。反映工业化程度，与 ppi_yoy 正相关，是判断制造业大国的关键指标。",
    },
    "agri_value_added_pct": {
        "source": "wb",
        "wb_code": "NV.AGR.TOTL.ZS",
        "name_cn": "农业增加值占GDP%",
        "unit": "%",
        "frequency": "annual",
        "category": "macro",
        "value_type": "ratio",
        "note": "WB NV.AGR.TOTL.ZS，农业增加值占 GDP 百分比。对应 CN 的 gdp_primary_yoy，反映农业依赖度，在新兴市场分析中尤为重要。",
    },
    "population": {
        "source": "wb",
        "wb_code": "SP.POP.TOTL",
        "name_cn": "总人口",
        "unit": "人",
        "frequency": "annual",
        "category": "macro",
        "value_type": "level",
        "note": "WB SP.POP.TOTL，年末总人口。基础统计指标，用于计算人均 GDP、人均贸易额、劳动力规模等派生指标。",
    },
}

IMF_BASE = "https://www.imf.org/external/datamapper/api/v1"
WB_BASE  = "https://api.worldbank.org/v2"
DATE_RANGE = "1980:2025"
PER_PAGE   = 1000


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",   action="store_true")
    parser.add_argument("--full",      action="store_true")
    parser.add_argument("--region",    nargs="+")
    parser.add_argument("--indicator", nargs="+")
    args = parser.parse_args()

    target_regions    = args.region    or list(COUNTRIES.keys())
    target_indicators = args.indicator or list(INDICATORS.keys())

    log.info("=" * 70)
    log.info("全球宏观补充指标采集 —— REQ-033（第四批）")
    log.info(f"  模式: {'全量' if args.full else '增量'} | DRY-RUN: {args.dry_run}")
    log.info(f"  国家: {target_regions}")
    log.info(f"  指标: {target_indicators}")
    log.info("=" * 70)

    # 预拉取 IMF 数据
    imf_cache = {}
    for ind_id in target_indicators:
        meta = INDICATORS.get(ind_id, {})
        if meta.get("source") == "imf":
            log.info(f"  预拉取 IMF {meta['imf_code']}...")
            imf_cache[ind_id] = fetch_imf_all(meta["imf_code"])
            log.info(f"  覆盖 {len(imf_cache[ind_id])} 个国家")

    # 预拉取 WB 数据
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

            if meta["source"] == "imf":
                iso3 = COUNTRIES[region]["imf"]
                country_data = {str(y): v for y, v in imf_cache.get(ind_id, {}).get(iso3, {}).items()}
            else:
                iso3 = COUNTRIES[region]["wb"]
                country_data = wb_cache.get(ind_id, {}).get(iso3, {})

            if not country_data:
                log.info(f"  {region}({name_cn}) {ind_id}: 无数据")
                continue

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
