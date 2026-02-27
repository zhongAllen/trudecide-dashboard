#!/usr/bin/env python3
"""
collect_macro_tw.py
台湾宏观指标数据采集脚本（REQ-026）
数据源：IMF DataMapper API（免费，年度数据，覆盖 1980~2025）

覆盖指标（indicator_id 严格遵循无前缀规范，region=TW）：
  - cpi_yoy              CPI 同比增速（%）
  - gdp_yoy              GDP 实际同比增速（%）
  - unemployment_rate    失业率（%）
  - current_account_gdp  经常账户/GDP（%）
  - govt_debt_gdp        政府债务/GDP（%）

【第一性原理】
  indicator_id 禁止使用地区前缀（如 tw_），地区信息由 region 字段承载。
  正确：id='cpi_yoy', region='TW'
  错误：id='tw_cpi_yoy', region='TW'

用法：
    python3 collect_macro_tw.py              # 增量采集（默认）
    python3 collect_macro_tw.py --full       # 全量回填（历史所有数据）
    python3 collect_macro_tw.py --dry-run    # 仅打印，不写入数据库

依赖：
    pip install requests supabase
"""

import os
import sys
import argparse
import logging
import time
from datetime import date
from typing import Optional
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

# IMF DataMapper API 基础 URL
IMF_BASE_URL = "https://www.imf.org/external/datamapper/api/v1"
# IMF 中台湾的国家代码
IMF_TW_CODE = "TWN"
# 数据截止年份（不采集预测值）
MAX_ACTUAL_YEAR = date.today().year

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger(__name__)

# ── Supabase 客户端 ────────────────────────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 台湾指标元数据定义 ─────────────────────────────────────────────────────────
# 严格遵循 indicator_id 无前缀规范（第一性原理）
TW_INDICATOR_META = [
    {
        "id": "cpi_yoy",
        "region": "TW",
        "name_cn": "台湾 CPI 同比增速",
        "description_cn": "台湾消费者物价指数同比变动率，衡量通货膨胀水平",
        "category": "macro",
        "frequency": "annual",
        "unit": "%",
        "value_type": "yoy",
        "source_name": "IMF DataMapper",
        "source_url": "https://www.imf.org/external/datamapper/PCPIPCH/TWN",
        "credibility": "high",
        "imf_code": "PCPIPCH",  # 仅用于采集，不写入数据库
    },
    {
        "id": "gdp_yoy",
        "region": "TW",
        "name_cn": "台湾 GDP 实际同比增速",
        "description_cn": "台湾实际 GDP 年度同比增速，衡量经济增长动能",
        "category": "macro",
        "frequency": "annual",
        "unit": "%",
        "value_type": "yoy",
        "source_name": "IMF DataMapper",
        "source_url": "https://www.imf.org/external/datamapper/NGDP_RPCH/TWN",
        "credibility": "high",
        "imf_code": "NGDP_RPCH",
    },
    {
        "id": "unemployment_rate",
        "region": "TW",
        "name_cn": "台湾失业率",
        "description_cn": "台湾年度失业率，衡量劳动力市场状况",
        "category": "macro",
        "frequency": "annual",
        "unit": "%",
        "value_type": "rate",
        "source_name": "IMF DataMapper",
        "source_url": "https://www.imf.org/external/datamapper/LUR/TWN",
        "credibility": "high",
        "imf_code": "LUR",
    },
    {
        "id": "current_account_gdp",
        "region": "TW",
        "name_cn": "台湾经常账户/GDP",
        "description_cn": "台湾经常账户余额占 GDP 比例，衡量对外经济平衡状况",
        "category": "macro",
        "frequency": "annual",
        "unit": "%",
        "value_type": "rate",
        "source_name": "IMF DataMapper",
        "source_url": "https://www.imf.org/external/datamapper/BCA_NGDPD/TWN",
        "credibility": "high",
        "imf_code": "BCA_NGDPD",
    },
    {
        "id": "govt_debt_gdp",
        "region": "TW",
        "name_cn": "台湾政府债务/GDP",
        "description_cn": "台湾政府总债务占 GDP 比例，衡量财政健康状况",
        "category": "macro",
        "frequency": "annual",
        "unit": "%",
        "value_type": "rate",
        "source_name": "IMF DataMapper",
        "source_url": "https://www.imf.org/external/datamapper/GGXWDG_NGDP/TWN",
        "credibility": "high",
        "imf_code": "GGXWDG_NGDP",
    },
]


# ── 工具函数 ───────────────────────────────────────────────────────────────────
def upsert_rows(rows: list, dry_run: bool = False) -> int:
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


def upsert_indicator_meta(meta_list: list, dry_run: bool = False) -> None:
    """写入或更新 indicator_meta 表（排除 imf_code 字段）。"""
    for meta in meta_list:
        db_meta = {k: v for k, v in meta.items() if k != "imf_code"}
        if dry_run:
            log.info(f"  [DRY-RUN] upsert indicator_meta: id={db_meta['id']}, region={db_meta['region']}")
            continue
        try:
            supabase.table("indicator_meta").upsert(
                db_meta,
                on_conflict="id,region"
            ).execute()
            log.info(f"  indicator_meta upserted: id={db_meta['id']}, region={db_meta['region']}")
        except Exception as e:
            log.error(f"  indicator_meta upsert 失败 ({db_meta['id']}): {e}")


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


def fetch_imf_data(imf_code: str, country_code: str = "TWN") -> dict:
    """
    从 IMF DataMapper API 获取指定指标的年度数据。
    返回 {year_str: value} 字典，仅包含实际数据（不含预测值）。
    """
    url = f"{IMF_BASE_URL}/{imf_code}/{country_code}"
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=15)
            r.raise_for_status()
            data = r.json()
            values = data.get("values", {}).get(imf_code, {}).get(country_code, {})
            # 过滤掉预测年份（> MAX_ACTUAL_YEAR）
            actual = {
                year: float(val)
                for year, val in values.items()
                if int(year) <= MAX_ACTUAL_YEAR and val is not None
            }
            return actual
        except Exception as e:
            if attempt < 2:
                log.warning(f"  IMF API 重试 {attempt+1}/3 ({imf_code}): {e}")
                time.sleep(3)
            else:
                log.error(f"  IMF API 请求失败 ({imf_code}): {e}")
                return {}
    return {}


# ── 主采集逻辑 ─────────────────────────────────────────────────────────────────
def collect_tw_indicator(meta: dict, full: bool, dry_run: bool) -> int:
    """
    采集单个台湾指标的年度数据。
    年度数据的 trade_date 格式为 YYYY-01-01（年份首日）。
    """
    indicator_id = meta["id"]
    region = meta["region"]
    imf_code = meta["imf_code"]

    log.info(f"采集 {indicator_id} (region={region}, imf_code={imf_code}) ...")

    existing = set() if full else get_existing_dates(indicator_id, region)

    imf_data = fetch_imf_data(imf_code, IMF_TW_CODE)
    if not imf_data:
        log.warning(f"  {indicator_id}: IMF 返回空数据，跳过")
        return 0

    rows = []
    for year_str, value in imf_data.items():
        trade_date = f"{year_str}-01-01"
        if not full and trade_date in existing:
            continue
        rows.append({
            "indicator_id": indicator_id,
            "region": region,
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
        })

    written = upsert_rows(rows, dry_run)
    log.info(f"  {indicator_id}: 写入 {written} 条（共 {len(imf_data)} 年可用数据）")
    return written


def main():
    parser = argparse.ArgumentParser(description="台湾宏观数据采集（IMF DataMapper API）")
    parser.add_argument("--full", action="store_true", help="全量回填（历史所有数据）")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写入数据库")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info(f"台湾宏观数据采集开始 | mode={'full' if args.full else 'incremental'} | dry_run={args.dry_run}")
    log.info("=" * 60)

    # Step 1: 写入/更新 indicator_meta
    log.info("Step 1: 同步 indicator_meta ...")
    upsert_indicator_meta(TW_INDICATOR_META, args.dry_run)

    # Step 2: 采集各指标时序数据
    log.info("Step 2: 采集时序数据 ...")
    total_written = 0
    for meta in TW_INDICATOR_META:
        written = collect_tw_indicator(meta, args.full, args.dry_run)
        total_written += written

    log.info("=" * 60)
    log.info(f"台湾宏观数据采集完成 | 共写入 {total_written} 条")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
