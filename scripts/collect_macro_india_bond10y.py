#!/usr/bin/env python3
"""
collect_macro_india_bond10y.py  —  REQ-034
两个任务合并：
  1. 印度（IN）全套 25 个宏观指标（与全球24国对齐）
  2. 全球主要国家/地区名义 10 年期国债收益率（bond_10y）
     - FRED OECD 系列：US/JP/DE/FR/IT/AU/CA/KR/MX/ZA/EU（月度，1960s~2026）
     - OECD API：IN/BR/CN 等 FRED 无数据的国家（年度/月度）
     - 注：bond_10y 与已有的 bond_10y_real（实际）并列，为名义收益率

数据源：
  印度：IMF DataMapper + World Bank（与全球24国脚本相同的指标集）
  bond_10y：FRED fredgraph.csv（OECD 长期利率系列，月度，无需 API Key）
"""

import os, sys, time, logging, argparse, requests, io, csv
from collections import defaultdict
from datetime import datetime
from supabase import create_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

IMF_BASE = "https://www.imf.org/external/datamapper/api/v1"
WB_BASE  = "https://api.worldbank.org/v2"
DATE_RANGE = "1960:2025"
PER_PAGE   = 1000

# ─── 印度指标配置（复用全球24国的25个指标集）─────────────────────────────────
# 来源：collect_macro_global_v2.py + collect_macro_global_wb.py + collect_macro_global_alignment.py + collect_macro_global_batch4.py
INDIA_INDICATORS = {
    # IMF DataMapper 年度指标
    "gdp_yoy":          {"source":"imf","imf_code":"NGDP_RPCH","name_cn":"GDP同比增速","unit":"%","freq":"annual","vtype":"yoy"},
    "gdp_level":        {"source":"imf","imf_code":"NGDPD",    "name_cn":"GDP总量（现价美元）","unit":"十亿美元","freq":"annual","vtype":"level"},
    "cpi_yoy":          {"source":"imf","imf_code":"PCPIPCH",  "name_cn":"CPI同比增速","unit":"%","freq":"annual","vtype":"yoy"},
    "unemployment_rate":{"source":"imf","imf_code":"LUR",      "name_cn":"失业率","unit":"%","freq":"annual","vtype":"level"},
    "current_account_gdp":{"source":"imf","imf_code":"BCA_NGDPD","name_cn":"经常账户/GDP","unit":"%","freq":"annual","vtype":"ratio"},
    "govt_debt_gdp":    {"source":"imf","imf_code":"GGXWDG_NGDP","name_cn":"政府债务/GDP","unit":"%","freq":"annual","vtype":"ratio"},
    "gdp_per_capita_ppp":{"source":"imf","imf_code":"PPPPC",   "name_cn":"人均GDP（PPP国际元）","unit":"国际元","freq":"annual","vtype":"level"},
    # World Bank 年度指标
    "gdp_secondary_yoy":{"source":"wb","wb_code":"NV.IND.TOTL.KD.ZG","name_cn":"第二产业增速","unit":"%","freq":"annual","vtype":"yoy"},
    "gdp_tertiary_yoy": {"source":"wb","wb_code":"NV.SRV.TOTL.KD.ZG","name_cn":"第三产业增速","unit":"%","freq":"annual","vtype":"yoy"},
    "industrial_yoy":   {"source":"wb","wb_code":"NV.IND.TOTL.KD.ZG","name_cn":"工业增加值增速","unit":"%","freq":"annual","vtype":"yoy"},
    "export_yoy":       {"source":"wb","wb_code":"NE.EXP.GNFS.KD.ZG","name_cn":"出口实际增速","unit":"%","freq":"annual","vtype":"yoy"},
    "import_yoy":       {"source":"wb","wb_code":"NE.IMP.GNFS.KD.ZG","name_cn":"进口实际增速","unit":"%","freq":"annual","vtype":"yoy"},
    "retail_yoy":       {"source":"wb","wb_code":"NE.CON.PRVT.KD.ZG","name_cn":"私人消费增速","unit":"%","freq":"annual","vtype":"yoy"},
    "fai_yoy":          {"source":"wb","wb_code":"NE.GDI.FTOT.KD.ZG","name_cn":"固定资本形成增速","unit":"%","freq":"annual","vtype":"yoy"},
    "gdp_per_capita":   {"source":"wb","wb_code":"NY.GDP.PCAP.CD",    "name_cn":"人均GDP（名义美元）","unit":"美元","freq":"annual","vtype":"level"},
    "gdp_deflator":     {"source":"wb","wb_code":"NY.GDP.DEFL.KD.ZG", "name_cn":"GDP平减指数同比","unit":"%","freq":"annual","vtype":"yoy"},
    "cpi_yoy_annual":   {"source":"wb","wb_code":"FP.CPI.TOTL.ZG",    "name_cn":"CPI同比（年度，WB口径）","unit":"%","freq":"annual","vtype":"yoy"},
    "m2_yoy":           {"source":"wb","wb_code":"FM.LBL.BMNY.ZG",    "name_cn":"M2同比增速","unit":"%","freq":"annual","vtype":"yoy"},
    "m2_level":         {"source":"wb","wb_code":"FM.LBL.BMNY.CN",    "name_cn":"M2余额","unit":"本币","freq":"annual","vtype":"level"},
    "policy_rate":      {"source":"wb","wb_code":"FR.INR.LEND",       "name_cn":"基准利率（贷款利率代理）","unit":"%","freq":"annual","vtype":"level"},
    "fx_usd":           {"source":"wb","wb_code":"PA.NUS.FCRF",       "name_cn":"本币兑美元汇率（年均）","unit":"本币/USD","freq":"annual","vtype":"level"},
    "savings_rate":     {"source":"wb","wb_code":"NY.GNS.ICTR.ZS",    "name_cn":"国民储蓄率（%GDP）","unit":"%","freq":"annual","vtype":"ratio"},
    "mfg_value_added_pct":{"source":"wb","wb_code":"NV.IND.MANF.ZS", "name_cn":"制造业增加值占GDP%","unit":"%","freq":"annual","vtype":"ratio"},
    "agri_value_added_pct":{"source":"wb","wb_code":"NV.AGR.TOTL.ZS","name_cn":"农业增加值占GDP%","unit":"%","freq":"annual","vtype":"ratio"},
    "population":       {"source":"wb","wb_code":"SP.POP.TOTL",       "name_cn":"总人口","unit":"人","freq":"annual","vtype":"level"},
}

# ─── bond_10y 名义收益率配置（FRED OECD 月度系列）────────────────────────────
# 系列格式说明：
#   - OECD 成员国：IRLTLT01{CC}M156N（CC 为 ISO2 大写），覆盖 US/JP/DE/FR/IT/AU/CA/KR/MX/ZA/EU/GB/CH/SE/NO/NZ
#   - US 使用 DGS10（日度，更完整）
#   - IN：INDIRLTLT01STM（OECD 合作国，月度，2011-12~至今）
#   - BR：INTGSTBRM193N（IMF IFS 系列，月度，1996~至今）
#   - CO：COLIRLTLT01STM（OECD 成员，月度，2003~至今）
#   - CL：IRLTLT01CLM156N（OECD 成员，月度）
#
# ⚠️  以下国家 FRED 无数据（非 OECD 成员，IRLTLT01 系列不存在）：
#   SG/TH/MY/ID/PH/PE — 已探索 FRED/IMF IFS/BIS/各国央行 API，均无法获取
#   状态：BLOCKED（REQ-034 v3.0，2026-03-02）
BOND10Y_FRED = {
    # ── 发达市场（OECD 成员，IRLTLT01 系列）──
    "US": "DGS10",              # 日度，1962~至今
    "JP": "IRLTLT01JPM156N",   # 月度，1989~至今
    "DE": "IRLTLT01DEM156N",   # 月度，1956~至今
    "FR": "IRLTLT01FRM156N",   # 月度，1960~至今
    "IT": "IRLTLT01ITM156N",   # 月度，1991~至今
    "AU": "IRLTLT01AUM156N",   # 月度，1969~至今
    "CA": "IRLTLT01CAM156N",   # 月度，1955~至今
    "KR": "IRLTLT01KRM156N",   # 月度，2000~至今
    "MX": "IRLTLT01MXM156N",   # 月度，2001~至今
    "ZA": "IRLTLT01ZAM156N",   # 月度，1957~至今
    "EU": "IRLTLT01EZM156N",   # 月度，1970~至今
    "GB": "IRLTLT01GBM156N",   # 月度，1960~至今
    "CH": "IRLTLT01CHM156N",   # 月度，1955~至今
    "SE": "IRLTLT01SEM156N",   # 月度，1986~至今
    "NO": "IRLTLT01NOM156N",   # 月度，1985~至今
    "NZ": "IRLTLT01NZM156N",   # 月度，1970~至今
    "CL": "IRLTLT01CLM156N",   # 月度，2004~至今
    # ── 新兴市场（有效系列，已验证）──
    "IN": "INDIRLTLT01STM",    # 印度，月度，2011-12~至今，OECD 合作国
    "BR": "INTGSTBRM193N",     # 巴西，月度，1996~至今，IMF IFS 系列
    "CO": "COLIRLTLT01STM",    # 哥伦比亚，月度，2003~至今，OECD 成员
    # ── 以下国家 FRED 无数据，已标注 BLOCKED ──
    # "SG": None,  # 新加坡 — MAS API/FRED 均无法获取，待解决
    # "TH": None,  # 泰国   — BOT API 需要爬虫，待解决
    # "MY": None,  # 马来西亚 — BNM API 需要爬虫，待解决
    # "ID": None,  # 印尼   — BI 官网无公开 API，待解决
    # "PH": None,  # 菲律宾 — BSP API 需要爬虫，待解决
    # "PE": None,  # 秘鲁   — BCRP API 需要爬虫，待解决
}


def fetch_imf_country(imf_code: str, iso3: str) -> dict:
    """获取 IMF 某指标某国数据，返回 {year_str: value}"""
    url = f"{IMF_BASE}/{imf_code}"
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
        return data.get("values", {}).get(imf_code, {}).get(iso3, {})
    except Exception as e:
        log.warning(f"IMF {imf_code}/{iso3}: {e}")
        return {}


def fetch_wb_country(wb_code: str, iso3: str, retries=3) -> dict:
    """获取 WB 某指标某国数据，返回 {year_str: value}"""
    url = f"{WB_BASE}/country/{iso3}/indicator/{wb_code}?format=json&per_page={PER_PAGE}&date={DATE_RANGE}"
    result = {}
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list) and len(data) > 1 and data[1]:
                for rec in data[1]:
                    if rec.get("value") is not None:
                        result[rec["date"]] = float(rec["value"])
            return result
        except Exception as e:
            log.warning(f"WB {wb_code}/{iso3} attempt {attempt+1}: {e}")
            time.sleep(2)
    return result


def fetch_fred_csv(series_id: str) -> list:
    """从 FRED 获取 CSV 数据，返回 [(date_str, value_float), ...]"""
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        # 验证是否是真正的 CSV（不是 HTML）
        if r.text.strip().startswith('<') or 'DOCTYPE' in r.text[:100]:
            log.warning(f"FRED {series_id}: 返回了 HTML，不是 CSV（系列可能不存在）")
            return []
        rows = []
        reader = csv.reader(io.StringIO(r.text))
        next(reader, None)  # 跳过标题行
        for row in reader:
            if len(row) >= 2 and row[1].strip() not in ('.', ''):
                try:
                    rows.append((row[0], float(row[1])))
                except ValueError:
                    pass
        return rows
    except Exception as e:
        log.warning(f"FRED {series_id}: {e}")
        return []


def upsert_meta(region: str, indicator_id: str, name_cn: str, unit: str,
                freq: str, vtype: str, source_name: str, source_url: str,
                desc: str, dry_run: bool):
    row = {
        "id":             indicator_id,
        "region":         region,
        "name_cn":        name_cn,
        "unit":           unit,
        "frequency":      freq,
        "category":       "macro",
        "value_type":     vtype,
        "source_name":    source_name,
        "source_url":     source_url,
        "description_cn": desc,
        "credibility":    "high",
    }
    if dry_run:
        log.info(f"  [DRY-RUN] meta: {indicator_id}/{region}")
        return
    supabase.table("indicator_meta").upsert(row, on_conflict="id,region").execute()


def upsert_values(rows: list, dry_run: bool) -> int:
    if not rows:
        return 0
    if dry_run:
        log.info(f"  [DRY-RUN] 将写入 {len(rows)} 条，示例: {rows[0]}")
        return len(rows)
    BATCH = 300
    total = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        supabase.table("indicator_values").upsert(
            batch, on_conflict="indicator_id,region,trade_date,revision_seq"
        ).execute()
        total += len(batch)
    return total


def collect_india(dry_run: bool, full: bool):
    """采集印度全套 25 个指标"""
    log.info("\n" + "=" * 70)
    log.info("任务 1：印度（IN）全套指标采集")
    log.info("=" * 70)

    region = "IN"
    imf_iso3 = "IND"
    wb_iso3  = "IND"

    # 预拉取 IMF 数据（批量）
    imf_cache = {}
    for ind_id, meta in INDIA_INDICATORS.items():
        if meta["source"] == "imf":
            if meta["imf_code"] not in imf_cache:
                log.info(f"  预拉取 IMF {meta['imf_code']}...")
                url = f"{IMF_BASE}/{meta['imf_code']}"
                r = requests.get(url, timeout=20)
                all_vals = r.json().get("values", {}).get(meta["imf_code"], {})
                imf_cache[meta["imf_code"]] = all_vals.get(imf_iso3, {})
                log.info(f"    IND: {len(imf_cache[meta['imf_code']])} 年")
            time.sleep(0.3)

    total_written = 0
    for ind_id, meta in INDIA_INDICATORS.items():
        if meta["source"] == "imf":
            country_data = {str(y): v for y, v in imf_cache.get(meta["imf_code"], {}).items()}
            source_name = "IMF DataMapper"
            source_url  = f"https://www.imf.org/external/datamapper/{meta['imf_code']}"
        else:
            log.info(f"  WB {meta['wb_code']} / IND ...")
            country_data = fetch_wb_country(meta["wb_code"], wb_iso3)
            source_name = "World Bank"
            source_url  = f"https://data.worldbank.org/indicator/{meta['wb_code']}"
            time.sleep(0.3)

        if not country_data:
            log.info(f"  {ind_id}: 无数据")
            continue

        if not full:
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
            log.info(f"  {ind_id}: 无新增（已有 {len(existing)} 条）")
            continue

        upsert_meta(region, ind_id, meta["name_cn"], meta["unit"],
                    meta["freq"], meta["vtype"], source_name, source_url,
                    f"印度 {meta['name_cn']}，来源：{source_name}", dry_run)
        written = upsert_values(rows, dry_run)
        log.info(f"  ✓ {ind_id}: 写入 {written} 条")
        total_written += written

    log.info(f"\n印度合计写入: {total_written} 条")
    return total_written


def collect_bond10y(dry_run: bool, full: bool):
    """采集全球主要国家名义 10 年期国债收益率"""
    log.info("\n" + "=" * 70)
    log.info("任务 2：全球 bond_10y 名义收益率采集（FRED）")
    log.info("=" * 70)

    indicator_id = "bond_10y"
    total_written = 0

    for region, series_id in BOND10Y_FRED.items():
        log.info(f"  {region} ({series_id})...")
        rows_raw = fetch_fred_csv(series_id)
        if not rows_raw:
            log.info(f"  {region}: 无数据（FRED 系列 {series_id} 不可用）")
            continue

        if not full:
            existing_res = supabase.table("indicator_values").select("trade_date") \
                .eq("indicator_id", indicator_id).eq("region", region).execute()
            existing = {r["trade_date"] for r in existing_res.data}
        else:
            existing = set()

        rows = []
        for date_str, val in rows_raw:
            if date_str in existing:
                continue
            rows.append({
                "indicator_id": indicator_id,
                "region":       region,
                "trade_date":   date_str,
                "publish_date": date_str,
                "value":        round(val, 6),
                "revision_seq": 0,
            })

        if not rows:
            log.info(f"  {region}: 无新增（已有 {len(existing)} 条）")
            continue

        freq = "daily" if series_id == "DGS10" else "monthly"
        upsert_meta(
            region, indicator_id,
            "10年期国债收益率（名义）", "%", freq, "level",
            "FRED / OECD",
            f"https://fred.stlouisfed.org/series/{series_id}",
            f"{region} 名义10年期国债收益率，来源 FRED（{series_id}）。"
            f"{'美国为日度数据（DGS10）' if series_id=='DGS10' else '其余为OECD月度系列（IRLTLT01系列）'}",
            dry_run
        )
        written = upsert_values(rows, dry_run)
        log.info(f"  ✓ {region}: 写入 {written} 条（共 {len(rows_raw)} 条可用）")
        total_written += written
        time.sleep(0.3)

    log.info(f"\nbond_10y 合计写入: {total_written} 条")
    return total_written


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",   action="store_true")
    parser.add_argument("--full",      action="store_true", help="强制全量写入（覆盖已有数据）")
    parser.add_argument("--task",      choices=["india", "bond10y", "all"], default="all")
    args = parser.parse_args()

    log.info("=" * 70)
    log.info("REQ-034：印度全套指标 + 全球 bond_10y 名义收益率采集")
    log.info(f"  模式: {'全量' if args.full else '增量'} | DRY-RUN: {args.dry_run} | 任务: {args.task}")
    log.info("=" * 70)

    total = 0
    if args.task in ("india", "all"):
        total += collect_india(args.dry_run, args.full)
    if args.task in ("bond10y", "all"):
        total += collect_bond10y(args.dry_run, args.full)

    log.info(f"\n{'='*70}")
    log.info(f"全部合计写入: {total} 条")
    log.info(f"{'='*70}")


if __name__ == "__main__":
    main()
