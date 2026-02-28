#!/usr/bin/env python3
"""
collect_macro_global_alignment.py  —  REQ-031
全球24国横向比较指标补充采集

核心原则：同一 indicator_id，不同 region，支持横向比较。
所有指标 ID 与中国（CN）保持一致，仅通过 region 字段区分地区。

新增指标：
  policy_rate  政策利率（基准利率）  WB FR.INR.LEND（贷款利率代理）
               注：WB 贷款利率是最广覆盖的免费年度利率数据
               CN 已有 lpr_1y（月度），policy_rate 为年度 WB 口径，便于横向比较
  fx_usd       本币兑美元汇率        WB PA.NUS.FCRF（年均汇率，本币/USD）
               单位统一为"1美元=X本币"，CN 为 CNY/USD
  m2_level     M2 货币供应量余额     WB FM.LBL.BMNY.CN（本币）
               注：DEU/FRA/ITA 无单独数据（欧元区统一统计），ETH 无数据
               CN 已有 m2_level（月度，亿元），此为年度 WB 口径

数据源：World Bank API（免费，无需 Key，年度 1980~2025）
覆盖：24国（JP/KR/DE/FR/IT/AU/CA/SG/TH/ID/MY/VN/PH/ZA/NG/EG/ET/KE/BR/AR/MX/CL/CO/PE）

用法：
  python3 collect_macro_global_alignment.py [--dry-run] [--full]
  python3 collect_macro_global_alignment.py --indicator policy_rate --region JP KR
"""

import os, sys, time, logging, argparse, requests
from datetime import datetime
from collections import defaultdict
from supabase import create_client

# ─── 日志 ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── 数据库 ──────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── 国家配置（ISO2 → WB ISO3 + 中文名）────────────────────────────────────
COUNTRIES = {
    "JP": {"name_cn": "日本",       "wb": "JPN"},
    "KR": {"name_cn": "韩国",       "wb": "KOR"},
    "DE": {"name_cn": "德国",       "wb": "DEU"},
    "FR": {"name_cn": "法国",       "wb": "FRA"},
    "IT": {"name_cn": "意大利",     "wb": "ITA"},
    "AU": {"name_cn": "澳大利亚",   "wb": "AUS"},
    "CA": {"name_cn": "加拿大",     "wb": "CAN"},
    "SG": {"name_cn": "新加坡",     "wb": "SGP"},
    "TH": {"name_cn": "泰国",       "wb": "THA"},
    "ID": {"name_cn": "印度尼西亚", "wb": "IDN"},
    "MY": {"name_cn": "马来西亚",   "wb": "MYS"},
    "VN": {"name_cn": "越南",       "wb": "VNM"},
    "PH": {"name_cn": "菲律宾",     "wb": "PHL"},
    "ZA": {"name_cn": "南非",       "wb": "ZAF"},
    "NG": {"name_cn": "尼日利亚",   "wb": "NGA"},
    "EG": {"name_cn": "埃及",       "wb": "EGY"},
    "ET": {"name_cn": "埃塞俄比亚", "wb": "ETH"},
    "KE": {"name_cn": "肯尼亚",     "wb": "KEN"},
    "BR": {"name_cn": "巴西",       "wb": "BRA"},
    "AR": {"name_cn": "阿根廷",     "wb": "ARG"},
    "MX": {"name_cn": "墨西哥",     "wb": "MEX"},
    "CL": {"name_cn": "智利",       "wb": "CHL"},
    "CO": {"name_cn": "哥伦比亚",   "wb": "COL"},
    "PE": {"name_cn": "秘鲁",       "wb": "PER"},
}

# ─── 指标配置 ─────────────────────────────────────────────────────────────────
# indicator_id 必须与 CN 已有指标保持一致（横向比较核心原则）
INDICATORS = {
    "policy_rate": {
        "wb_code":    "FR.INR.LEND",
        "name_cn":    "基准利率（贷款利率代理）",
        "unit":       "%",
        "frequency":  "annual",
        "category":   "macro",
        "value_type": "level",
        "note":       "WB 贷款利率（FR.INR.LEND），作为政策利率代理；CN 已有月度 lpr_1y，此为年度横向比较口径",
        "scale_note": "百分比，如 3.5 表示 3.5%",
    },
    "fx_usd": {
        "wb_code":    "PA.NUS.FCRF",
        "name_cn":    "本币兑美元汇率（年均）",
        "unit":       "本币/USD",
        "frequency":  "annual",
        "category":   "macro",
        "value_type": "level",
        "note":       "WB 官方汇率年均值（PA.NUS.FCRF），单位：1美元=X本币。CN 为 CNY/USD",
        "scale_note": "如 JP=151.37 表示 1 USD = 151.37 JPY",
    },
    "m2_level": {
        "wb_code":    "FM.LBL.BMNY.CN",
        "name_cn":    "M2 货币供应量余额（本币）",
        "unit":       "本币（原始单位）",
        "frequency":  "annual",
        "category":   "macro",
        "value_type": "level",
        "note":       "WB 广义货币供应量余额（FM.LBL.BMNY.CN），本币原始单位。CN 已有月度 m2_level（亿元），此为年度 WB 口径。注：DEU/FRA/ITA 无单独数据（欧元区统一统计）",
        "scale_note": "各国单位不同（如 JP 为日元，BR 为雷亚尔），横向比较需换算为 GDP 占比",
    },
}

WB_BASE = "https://api.worldbank.org/v2"
DATE_RANGE = "1980:2025"
PER_PAGE = 1000


# ─── 工具函数 ─────────────────────────────────────────────────────────────────
def fetch_wb_batch(wb_code: str, iso3_list: list[str]) -> dict:
    """
    批量获取 WB 指标数据
    返回 {iso3: {year: value}}
    """
    iso3_str = ";".join(iso3_list)
    url = f"{WB_BASE}/country/{iso3_str}/indicator/{wb_code}?format=json&per_page={PER_PAGE}&date={DATE_RANGE}"
    
    result = defaultdict(dict)
    page = 1
    while True:
        paged_url = f"{url}&page={page}"
        try:
            r = requests.get(paged_url, timeout=30)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            log.warning(f"  WB API 请求失败 (page={page}): {e}")
            break
        
        if not isinstance(data, list) or len(data) < 2:
            break
        
        meta = data[0]
        records = data[1] or []
        
        for rec in records:
            if rec.get("value") is None:
                continue
            iso3 = rec.get("countryiso3code", "")
            year = rec.get("date", "")
            if iso3 and year:
                result[iso3][year] = float(rec["value"])
        
        total_pages = meta.get("pages", 1)
        if page >= total_pages:
            break
        page += 1
        time.sleep(0.2)
    
    return dict(result)


def upsert_meta(region: str, indicator_id: str, meta: dict, dry_run: bool):
    row = {
        "id":             indicator_id,
        "region":         region,
        "name_cn":        meta["name_cn"],
        "unit":           meta["unit"],
        "frequency":      meta["frequency"],
        "category":       meta["category"],
        "value_type":     meta["value_type"],
        "source_name":    "World Bank",
        "source_url":     f"https://data.worldbank.org/indicator/{meta['wb_code']}",
        "description_cn": meta.get("note", ""),
        "credibility":    "high",
    }
    if dry_run:
        log.info(f"  [DRY-RUN] upsert meta: {indicator_id} / {region}")
        return
    supabase.table("indicator_meta").upsert(row, on_conflict="id,region").execute()


def upsert_values(rows: list[dict], dry_run: bool) -> int:
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
            batch,
            on_conflict="indicator_id,region,trade_date,revision_seq"
        ).execute()
        total += len(batch)
    return total


# ─── 主流程 ───────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",   action="store_true", help="不写入数据库")
    parser.add_argument("--full",      action="store_true", help="全量覆盖（默认增量）")
    parser.add_argument("--region",    nargs="+",           help="只采集指定 region，如 JP KR")
    parser.add_argument("--indicator", nargs="+",           help="只采集指定指标，如 fx_usd")
    args = parser.parse_args()

    target_regions    = args.region    or list(COUNTRIES.keys())
    target_indicators = args.indicator or list(INDICATORS.keys())

    log.info("=" * 70)
    log.info("全球宏观横向比较指标采集 —— REQ-031")
    log.info(f"  模式: {'全量' if args.full else '增量'} | DRY-RUN: {args.dry_run}")
    log.info(f"  国家: {target_regions}")
    log.info(f"  指标: {target_indicators}")
    log.info("=" * 70)

    # 构建 iso3 列表
    iso2_to_iso3 = {r: COUNTRIES[r]["wb"] for r in target_regions if r in COUNTRIES}
    iso3_to_iso2 = {v: k for k, v in iso2_to_iso3.items()}
    wb_iso3_list = list(iso2_to_iso3.values())

    summary = {}

    for ind_id in target_indicators:
        if ind_id not in INDICATORS:
            log.warning(f"未知指标: {ind_id}，跳过")
            continue

        ind_meta = INDICATORS[ind_id]
        wb_code  = ind_meta["wb_code"]

        log.info(f"\n[指标] {ind_id} (WB: {wb_code}) — {ind_meta['name_cn']}")

        # 批量拉取所有国家数据
        raw = fetch_wb_batch(wb_code, wb_iso3_list)
        log.info(f"  WB API 返回 {sum(len(v) for v in raw.values())} 条原始记录，覆盖 {len(raw)} 个国家")

        for region in target_regions:
            if region not in COUNTRIES:
                continue
            iso3     = COUNTRIES[region]["wb"]
            name_cn  = COUNTRIES[region]["name_cn"]
            country_data = raw.get(iso3, {})

            if not country_data:
                log.info(f"  {region}({name_cn}) {ind_id}: 无数据（WB 未覆盖）")
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
                    "indicator_id":  ind_id,
                    "region":        region,
                    "trade_date":    trade_date,
                    "publish_date":  trade_date,
                    "value":         round(val, 6),
                    "revision_seq":  0,
                })

            if not rows:
                log.info(f"  {region}({name_cn}) {ind_id}: 无新增（已有 {len(existing)} 条）")
                continue

            upsert_meta(region, ind_id, ind_meta, args.dry_run)
            written = upsert_values(rows, args.dry_run)
            log.info(f"  {region}({name_cn}) {ind_id}: 写入 {written} 条 / {len(country_data)} 年可用")

            if region not in summary:
                summary[region] = {}
            summary[region][ind_id] = written

        time.sleep(0.5)

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
