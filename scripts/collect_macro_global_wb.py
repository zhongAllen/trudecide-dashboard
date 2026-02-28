#!/usr/bin/env python3
"""
collect_macro_global_wb.py  —  REQ-030
通过 World Bank API 补充全球 24 国宏观指标，与中国指标对齐

新增指标（年度）：
  export_yoy         出口实际增速          NE.EXP.GNFS.KD.ZG
  import_yoy         进口实际增速          NE.IMP.GNFS.KD.ZG
  industrial_yoy     工业增加值增速         NV.IND.TOTL.KD.ZG
  retail_yoy         私人消费增速（近似零售）  NE.CON.PRVT.KD.ZG
  m2_yoy             M2 增速              FM.LBL.BMNY.ZG
  fai_yoy            固定资本形成增速        NE.GDI.FTOT.KD.ZG
  current_account    经常账户余额（美元）     BN.CAB.XOKA.CD
  gdp_level          GDP 现价（美元）       NY.GDP.MKTP.CD
  gdp_per_capita     人均 GDP（美元）       NY.GDP.PCAP.CD
  pmi_mfg            制造业 PMI（年度均值）   — 仅 WB 无，跳过
  bond_10y           10年期国债收益率        — WB 无，跳过（FRED 需 key）

已有指标（IMF 已采集，跳过）：
  gdp_yoy / cpi_yoy / unemployment_rate / current_account_gdp / govt_debt_gdp

用法：
  python3 collect_macro_global_wb.py [--dry-run] [--full] [--region JP] [--indicator export_yoy]
"""

import os, sys, time, logging, argparse, requests
from datetime import datetime
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

# ─── 国家配置 ─────────────────────────────────────────────────────────────────
COUNTRIES = {
    # 发达经济体
    "JP": {"name_cn": "日本",     "wb": "JPN"},
    "KR": {"name_cn": "韩国",     "wb": "KOR"},
    "DE": {"name_cn": "德国",     "wb": "DEU"},
    "FR": {"name_cn": "法国",     "wb": "FRA"},
    "IT": {"name_cn": "意大利",   "wb": "ITA"},
    "AU": {"name_cn": "澳大利亚", "wb": "AUS"},
    "CA": {"name_cn": "加拿大",   "wb": "CAN"},
    # 东南亚
    "SG": {"name_cn": "新加坡",   "wb": "SGP"},
    "TH": {"name_cn": "泰国",     "wb": "THA"},
    "ID": {"name_cn": "印度尼西亚","wb": "IDN"},
    "MY": {"name_cn": "马来西亚", "wb": "MYS"},
    "VN": {"name_cn": "越南",     "wb": "VNM"},
    "PH": {"name_cn": "菲律宾",   "wb": "PHL"},
    # 非洲
    "ZA": {"name_cn": "南非",     "wb": "ZAF"},
    "NG": {"name_cn": "尼日利亚", "wb": "NGA"},
    "EG": {"name_cn": "埃及",     "wb": "EGY"},
    "ET": {"name_cn": "埃塞俄比亚","wb": "ETH"},
    "KE": {"name_cn": "肯尼亚",   "wb": "KEN"},
    # 南美
    "BR": {"name_cn": "巴西",     "wb": "BRA"},
    "AR": {"name_cn": "阿根廷",   "wb": "ARG"},
    "MX": {"name_cn": "墨西哥",   "wb": "MEX"},
    "CL": {"name_cn": "智利",     "wb": "CHL"},
    "CO": {"name_cn": "哥伦比亚", "wb": "COL"},
    "PE": {"name_cn": "秘鲁",     "wb": "PER"},
}

# ─── 指标配置 ─────────────────────────────────────────────────────────────────
# 对应中国指标 ID → WB 指标代码
INDICATORS = {
    "export_yoy": {
        "wb_code":   "NE.EXP.GNFS.KD.ZG",
        "name_cn":   "出口实际增速",
        "unit":      "%",
        "frequency": "annual",
        "category":  "macro",
        "note":      "出口商品和服务实际增速（WB）",
    },
    "import_yoy": {
        "wb_code":   "NE.IMP.GNFS.KD.ZG",
        "name_cn":   "进口实际增速",
        "unit":      "%",
        "frequency": "annual",
        "category":  "macro",
        "note":      "进口商品和服务实际增速（WB）",
    },
    "industrial_yoy": {
        "wb_code":   "NV.IND.TOTL.KD.ZG",
        "name_cn":   "工业增加值增速",
        "unit":      "%",
        "frequency": "annual",
        "category":  "macro",
        "note":      "工业部门增加值实际增速（WB）",
    },
    "retail_yoy": {
        "wb_code":   "NE.CON.PRVT.KD.ZG",
        "name_cn":   "私人消费增速",
        "unit":      "%",
        "frequency": "annual",
        "category":  "macro",
        "note":      "家庭最终消费支出实际增速（WB，近似零售）",
    },
    "m2_yoy": {
        "wb_code":   "FM.LBL.BMNY.ZG",
        "name_cn":   "M2同比增速",
        "unit":      "%",
        "frequency": "annual",
        "category":  "macro",
        "note":      "广义货币供应量年增速（WB）",
    },
    "fai_yoy": {
        "wb_code":   "NE.GDI.FTOT.KD.ZG",
        "name_cn":   "固定资本形成增速",
        "unit":      "%",
        "frequency": "annual",
        "category":  "macro",
        "note":      "固定资本形成总额实际增速（WB，近似固定资产投资）",
    },
    "gdp_level": {
        "wb_code":   "NY.GDP.MKTP.CD",
        "name_cn":   "GDP总量（现价美元）",
        "unit":      "亿美元",
        "frequency": "annual",
        "category":  "macro",
        "note":      "GDP现价美元（WB），除以1e8转为亿美元",
        "scale":     1e8,   # 除以该值
    },
    "gdp_per_capita": {
        "wb_code":   "NY.GDP.PCAP.CD",
        "name_cn":   "人均GDP（美元）",
        "unit":      "美元",
        "frequency": "annual",
        "category":  "macro",
        "note":      "人均GDP现价美元（WB）",
    },
    "gdp_secondary_yoy": {
        "wb_code":   "NV.IND.TOTL.KD.ZG",   # 同 industrial_yoy，工业=第二产业
        "name_cn":   "第二产业增速",
        "unit":      "%",
        "frequency": "annual",
        "category":  "macro",
        "note":      "工业部门（第二产业）实际增速（WB）",
    },
    "gdp_tertiary_yoy": {
        "wb_code":   "NV.SRV.TOTL.KD.ZG",
        "name_cn":   "第三产业增速",
        "unit":      "%",
        "frequency": "annual",
        "category":  "macro",
        "note":      "服务业（第三产业）实际增速（WB）",
    },
}

WB_BASE = "https://api.worldbank.org/v2"
DATE_RANGE = "1980:2025"
PER_PAGE = 1000


# ─── 工具函数 ─────────────────────────────────────────────────────────────────
def fetch_wb_indicator(wb_code: str, country_codes: list[str]) -> dict:
    """
    批量获取 WB 指标数据，返回 {(iso2, year): value}
    country_codes: WB ISO3 代码列表
    """
    iso3_str = ";".join(country_codes)
    url = f"{WB_BASE}/country/{iso3_str}/indicator/{wb_code}?format=json&per_page={PER_PAGE}&date={DATE_RANGE}"
    
    all_records = {}
    page = 1
    while True:
        paged_url = f"{url}&page={page}"
        try:
            r = requests.get(paged_url, timeout=30)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            log.warning(f"  WB API 请求失败: {e}")
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
                all_records[(iso3, year)] = float(rec["value"])
        
        total_pages = meta.get("pages", 1)
        if page >= total_pages:
            break
        page += 1
        time.sleep(0.2)
    
    return all_records


def upsert_meta(region: str, indicator_id: str, meta: dict, dry_run: bool):
    row = {
        "id":             indicator_id,
        "region":         region,
        "name_cn":        meta["name_cn"],
        "unit":           meta["unit"],
        "frequency":      meta["frequency"],
        "category":       meta["category"],
        "value_type":     "yoy" if "yoy" in indicator_id else "level",
        "source_name":    "World Bank",
        "source_url":     f"https://data.worldbank.org/indicator/{meta['wb_code']}",
        "description_cn": meta.get("note", ""),
        "credibility":    "high",
    }
    if dry_run:
        log.info(f"  [DRY-RUN] upsert meta: id={indicator_id}, region={region}")
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


def get_existing_dates(indicator_id: str, region: str) -> set:
    result = supabase.table("indicator_values").select("trade_date") \
        .eq("indicator_id", indicator_id).eq("region", region).execute()
    return {r["trade_date"] for r in result.data}


# ─── 主流程 ───────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",    action="store_true", help="不写入数据库")
    parser.add_argument("--full",       action="store_true", help="全量采集（覆盖已有数据）")
    parser.add_argument("--region",     nargs="+",           help="只采集指定 region，如 JP KR")
    parser.add_argument("--indicator",  nargs="+",           help="只采集指定指标，如 export_yoy")
    args = parser.parse_args()

    target_regions = args.region or list(COUNTRIES.keys())
    target_indicators = args.indicator or list(INDICATORS.keys())

    log.info("=" * 70)
    log.info("全球宏观数据补充采集（WB）—— REQ-030")
    log.info(f"  模式: {'全量' if args.full else '增量'} | DRY-RUN: {args.dry_run}")
    log.info(f"  国家: {target_regions}")
    log.info(f"  指标: {target_indicators}")
    log.info("=" * 70)

    # 构建 iso2→iso3 映射（仅目标国家）
    iso2_to_iso3 = {r: COUNTRIES[r]["wb"] for r in target_regions if r in COUNTRIES}
    iso3_to_iso2 = {v: k for k, v in iso2_to_iso3.items()}
    wb_country_codes = list(iso2_to_iso3.values())

    summary = {}  # region → {indicator_id: count}

    for ind_id in target_indicators:
        if ind_id not in INDICATORS:
            log.warning(f"未知指标: {ind_id}，跳过")
            continue
        
        ind_meta = INDICATORS[ind_id]
        wb_code = ind_meta["wb_code"]
        scale = ind_meta.get("scale", None)
        
        log.info(f"\n[指标] {ind_id} (WB: {wb_code})")
        
        # 批量获取所有国家数据
        raw = fetch_wb_indicator(wb_code, wb_country_codes)
        log.info(f"  WB API 返回 {len(raw)} 条原始记录")
        
        # 按国家分组处理
        for region in target_regions:
            if region not in COUNTRIES:
                continue
            iso3 = COUNTRIES[region]["wb"]
            name_cn = COUNTRIES[region]["name_cn"]
            
            # 过滤该国数据
            country_data = {year: val for (c, year), val in raw.items() if c == iso3}
            if not country_data:
                log.info(f"  {region}({name_cn}) {ind_id}: 无数据")
                continue
            
            # 增量模式：排除已有日期
            if not args.full:
                existing = get_existing_dates(ind_id, region)
            else:
                existing = set()
            
            # 构建写入行
            rows = []
            for year, val in sorted(country_data.items()):
                trade_date = f"{year}-01-01"
                if trade_date in existing:
                    continue
                
                # 单位换算
                write_val = val / scale if scale else val
                write_val = round(write_val, 4)
                
                rows.append({
                    "indicator_id":  ind_id,
                    "region":        region,
                    "trade_date":    trade_date,
                    "publish_date":  trade_date,
                    "value":         write_val,
                    "revision_seq":  0,
                })
            
            if not rows:
                log.info(f"  {region}({name_cn}) {ind_id}: 无新增数据（已有 {len(existing)} 条）")
                continue
            
            # 写入 meta
            upsert_meta(region, ind_id, ind_meta, args.dry_run)
            
            # 写入 values
            written = upsert_values(rows, args.dry_run)
            log.info(f"  {region}({name_cn}) {ind_id}: 写入 {written} 条 / {len(country_data)} 年可用")
            
            if region not in summary:
                summary[region] = {}
            summary[region][ind_id] = written
        
        time.sleep(0.5)  # 避免 WB API 限速

    # 汇总
    log.info("\n" + "=" * 70)
    log.info("采集汇总：")
    total_all = 0
    for region in target_regions:
        if region not in summary:
            continue
        counts = summary[region]
        total = sum(counts.values())
        total_all += total
        detail = " | ".join(f"{k}:{v}" for k, v in counts.items())
        name_cn = COUNTRIES.get(region, {}).get("name_cn", region)
        log.info(f"  {region}({name_cn}): 共 {total} 条  [{detail}]")
    log.info(f"\n全部合计写入: {total_all} 条")
    log.info("=" * 70)


if __name__ == "__main__":
    main()
