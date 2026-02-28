#!/usr/bin/env python3
"""
collect_macro_global_v2.py
全球主要经济体宏观指标批量采集脚本（REQ-029）
数据源：IMF DataMapper API（免费，年度数据，覆盖 1980~2025）

覆盖国家/地区（24 个）：
  发达经济体：JP（日本）、KR（韩国）、DE（德国）、FR（法国）、IT（意大利）
              AU（澳大利亚）、CA（加拿大）
  东南亚：    SG（新加坡）、TH（泰国）、ID（印度尼西亚）、MY（马来西亚）
              VN（越南）、PH（菲律宾）
  非洲：      ZA（南非）、NG（尼日利亚）、EG（埃及）、ET（埃塞俄比亚）、KE（肯尼亚）
  南美：      BR（巴西）、AR（阿根廷）、MX（墨西哥）、CL（智利）、CO（哥伦比亚）、PE（秘鲁）

覆盖指标（5 个核心年度指标，与 TW 对齐）：
  - gdp_yoy              GDP 实际同比增速（%）
  - cpi_yoy              CPI 同比增速（%）
  - unemployment_rate    失业率（%）
  - current_account_gdp  经常账户/GDP（%）
  - govt_debt_gdp        政府债务/GDP（%）

【第一性原理】
  indicator_id 禁止使用地区前缀，地区信息由 region 字段承载。
  正确：id='gdp_yoy', region='JP'
  错误：id='jp_gdp_yoy', region='JP'

用法：
    python3 collect_macro_global_v2.py              # 增量采集（默认）
    python3 collect_macro_global_v2.py --full       # 全量回填（历史所有数据）
    python3 collect_macro_global_v2.py --dry-run    # 仅打印，不写入数据库
    python3 collect_macro_global_v2.py --region JP  # 仅采集指定国家
    python3 collect_macro_global_v2.py --indicator gdp_yoy  # 仅采集指定指标

依赖：pip install requests supabase
"""
import os
import sys
import argparse
import logging
import time
from datetime import date
import requests
from supabase import create_client, Client

# ── 配置 ──────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
IMF_BASE_URL = "https://www.imf.org/external/datamapper/api/v1"
MAX_ACTUAL_YEAR = date.today().year  # 不采集预测值

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger(__name__)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 国家/地区配置表 ────────────────────────────────────────────────────────────
# region_code: (imf_code, name_cn, group)
COUNTRIES = {
    # 发达经济体
    "JP": ("JPN", "日本",     "developed"),
    "KR": ("KOR", "韩国",     "developed"),
    "DE": ("DEU", "德国",     "developed"),
    "FR": ("FRA", "法国",     "developed"),
    "IT": ("ITA", "意大利",   "developed"),
    "AU": ("AUS", "澳大利亚", "developed"),
    "CA": ("CAN", "加拿大",   "developed"),
    # 东南亚
    "SG": ("SGP", "新加坡",   "southeast_asia"),
    "TH": ("THA", "泰国",     "southeast_asia"),
    "ID": ("IDN", "印度尼西亚","southeast_asia"),
    "MY": ("MYS", "马来西亚", "southeast_asia"),
    "VN": ("VNM", "越南",     "southeast_asia"),
    "PH": ("PHL", "菲律宾",   "southeast_asia"),
    # 非洲
    "ZA": ("ZAF", "南非",     "africa"),
    "NG": ("NGA", "尼日利亚", "africa"),
    "EG": ("EGY", "埃及",     "africa"),
    "ET": ("ETH", "埃塞俄比亚","africa"),
    "KE": ("KEN", "肯尼亚",   "africa"),
    # 南美
    "BR": ("BRA", "巴西",     "south_america"),
    "AR": ("ARG", "阿根廷",   "south_america"),
    "MX": ("MEX", "墨西哥",   "south_america"),
    "CL": ("CHL", "智利",     "south_america"),
    "CO": ("COL", "哥伦比亚", "south_america"),
    "PE": ("PER", "秘鲁",     "south_america"),
}

# ── IMF 指标代码映射 ───────────────────────────────────────────────────────────
# indicator_id: (imf_code, name_cn_template, unit, value_type, description_template)
IMF_INDICATORS = {
    "gdp_yoy": (
        "NGDP_RPCH",
        "{country} GDP 实际同比增速",
        "%", "yoy",
        "{country}国内生产总值实际同比增长率（经通胀调整）"
    ),
    "cpi_yoy": (
        "PCPIPCH",
        "{country} CPI 同比增速",
        "%", "yoy",
        "{country}消费者物价指数同比变动率，衡量通货膨胀水平"
    ),
    "unemployment_rate": (
        "LUR",
        "{country} 失业率",
        "%", "rate",
        "{country}劳动力市场失业率，占劳动力总数的百分比"
    ),
    "current_account_gdp": (
        "BCA_NGDPD",
        "{country} 经常账户/GDP",
        "%", "rate",
        "{country}经常账户余额占 GDP 的比重，正值为顺差，负值为逆差"
    ),
    "govt_debt_gdp": (
        "GGXWDG_NGDP",
        "{country} 政府债务/GDP",
        "%", "rate",
        "{country}一般政府总债务占 GDP 的百分比"
    ),
}

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def upsert_rows(rows: list, dry_run: bool = False) -> int:
    """分批 upsert indicator_values，返回写入条数。"""
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


def upsert_meta(meta: dict, dry_run: bool = False) -> None:
    """写入或更新 indicator_meta 表。"""
    if dry_run:
        log.info(f"  [DRY-RUN] upsert meta: id={meta['id']}, region={meta['region']}")
        return
    try:
        supabase.table("indicator_meta").upsert(
            meta, on_conflict="id,region"
        ).execute()
    except Exception as e:
        log.error(f"  indicator_meta upsert 失败 ({meta['id']}/{meta['region']}): {e}")


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


def fetch_imf_batch(imf_code: str, imf_country_codes: list) -> dict:
    """
    批量从 IMF DataMapper API 获取多国数据。
    返回 {imf_country_code: {year_str: value}} 字典。
    """
    codes_str = ",".join(imf_country_codes)
    url = f"{IMF_BASE_URL}/{imf_code}/{codes_str}"
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=30)
            r.raise_for_status()
            data = r.json()
            raw = data.get("values", {}).get(imf_code, {})
            # 过滤预测值
            result = {}
            for country_code, vals in raw.items():
                actual = {
                    year: float(val)
                    for year, val in vals.items()
                    if val is not None and int(year) <= MAX_ACTUAL_YEAR
                }
                result[country_code] = actual
            return result
        except Exception as e:
            if attempt < 2:
                log.warning(f"  IMF API 重试 {attempt+1}/3 ({imf_code}): {e}")
                time.sleep(3)
            else:
                log.error(f"  IMF API 请求失败 ({imf_code}): {e}")
                return {}
    return {}


# ── 主采集逻辑 ─────────────────────────────────────────────────────────────────
def collect_all(target_regions: list, target_indicators: list, full: bool, dry_run: bool) -> dict:
    """
    按指标批量采集所有目标国家数据（每个指标一次 API 请求，高效）。
    返回 {region: {indicator_id: written_count}} 汇总。
    """
    summary = {r: {} for r in target_regions}

    for indicator_id in target_indicators:
        imf_code, name_tpl, unit, value_type, desc_tpl = IMF_INDICATORS[indicator_id]
        log.info(f"\n[指标] {indicator_id} (IMF: {imf_code})")

        # 收集目标国家的 IMF 代码
        imf_codes = [COUNTRIES[r][0] for r in target_regions]

        # 批量拉取 IMF 数据
        batch_data = fetch_imf_batch(imf_code, imf_codes)
        if not batch_data:
            log.warning(f"  {indicator_id}: IMF 返回空数据，跳过所有国家")
            for r in target_regions:
                summary[r][indicator_id] = 0
            continue

        # 逐国处理
        for region in target_regions:
            imf_country_code, country_name, _ = COUNTRIES[region]
            country_data = batch_data.get(imf_country_code, {})

            if not country_data:
                log.warning(f"  {region}({imf_country_code}) {indicator_id}: 无数据")
                summary[region][indicator_id] = 0
                continue

            # 写入 indicator_meta
            upsert_meta({
                "id": indicator_id,
                "region": region,
                "name_cn": name_tpl.replace("{country}", country_name),
                "description_cn": desc_tpl.replace("{country}", country_name),
                "category": "macro",
                "frequency": "annual",
                "unit": unit,
                "value_type": value_type,
                "source_name": "IMF DataMapper",
                "source_url": f"https://www.imf.org/external/datamapper/{imf_code}/{imf_country_code}",
                "credibility": "high",
            }, dry_run)

            # 构建时序数据行
            existing = set() if full else get_existing_dates(indicator_id, region)
            rows = []
            for year_str, value in country_data.items():
                trade_date = f"{year_str}-01-01"
                if not full and trade_date in existing:
                    continue
                rows.append({
                    "indicator_id": indicator_id,
                    "region": region,
                    "trade_date": trade_date,
                    "publish_date": trade_date,
                    "value": round(value, 4),
                    "revision_seq": 0,
                })

            written = upsert_rows(rows, dry_run)
            summary[region][indicator_id] = written
            log.info(f"  {region}({country_name}) {indicator_id}: 写入 {written} 条 / {len(country_data)} 年可用")

    return summary


# ── 主函数 ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="全球主要经济体宏观数据采集（REQ-029，IMF DataMapper）"
    )
    parser.add_argument("--full", action="store_true", help="全量回填历史数据")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写入数据库")
    parser.add_argument(
        "--region", type=str, default=None,
        help=f"仅采集指定国家，如 --region JP。可选: {list(COUNTRIES.keys())}"
    )
    parser.add_argument(
        "--indicator", type=str, default=None,
        help=f"仅采集指定指标，如 --indicator gdp_yoy。可选: {list(IMF_INDICATORS.keys())}"
    )
    args = parser.parse_args()

    # 确定目标范围
    if args.region:
        if args.region not in COUNTRIES:
            log.error(f"未知国家代码: {args.region}，可选: {list(COUNTRIES.keys())}")
            sys.exit(1)
        target_regions = [args.region]
    else:
        target_regions = list(COUNTRIES.keys())

    if args.indicator:
        if args.indicator not in IMF_INDICATORS:
            log.error(f"未知指标: {args.indicator}，可选: {list(IMF_INDICATORS.keys())}")
            sys.exit(1)
        target_indicators = [args.indicator]
    else:
        target_indicators = list(IMF_INDICATORS.keys())

    mode = "全量回填" if args.full else "增量采集"
    log.info("=" * 70)
    log.info(f"全球宏观数据采集开始（REQ-029）")
    log.info(f"  模式: {mode} | DRY-RUN: {args.dry_run}")
    log.info(f"  国家: {target_regions}")
    log.info(f"  指标: {target_indicators}")
    log.info("=" * 70)

    summary = collect_all(target_regions, target_indicators, args.full, args.dry_run)

    # 汇总报告
    log.info("\n" + "=" * 70)
    log.info("采集汇总：")
    total_written = 0
    for region in target_regions:
        country_name = COUNTRIES[region][1]
        region_total = sum(summary[region].values())
        total_written += region_total
        details = " | ".join(f"{ind}:{cnt}" for ind, cnt in summary[region].items())
        log.info(f"  {region}({country_name}): 共 {region_total} 条  [{details}]")
    log.info(f"\n全部合计写入: {total_written} 条")
    log.info("=" * 70)


if __name__ == "__main__":
    main()
