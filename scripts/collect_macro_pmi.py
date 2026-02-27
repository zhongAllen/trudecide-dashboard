#!/usr/bin/env python3
"""
PMI 替代指标采集脚本（OECD 复合领先指标 / 商业信心指数）
数据源：OECD MEI_CLI 数据集 — 免费、官方、月度、稳定

指标映射：
  - pmi_mfg  (US)  = BCICP (Business Confidence, Manufacturing)
  - pmi_mfg  (EU)  = BCICP (Business Confidence, Manufacturing) from MEI_BTS_COS EA19
  - pmi_non_mfg (US) = CCICP (Consumer Confidence Composite)
  - pmi_non_mfg (EU) = BCICP (Business Confidence, Services/GTU) from MEI_BTS_COS EA19

量纲说明：
  - MEI_CLI 数据集：以 100 为中性（长期趋势），>100 为扩张，<100 为收缩
  - MEI_BTS_COS 数据集：以 0 为中性，>0 为扩张，<0 为收缩
  - 前端展示时需根据 source_name 字段区分量纲
"""

import os
import sys
import requests
import pandas as pd
from io import StringIO
from datetime import datetime
from supabase import create_client

# ─── Supabase 连接 ────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── 常量 ─────────────────────────────────────────────────────────────────────
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}

# OECD MEI_CLI 数据集（复合领先指标，量纲 100 为中性）
OECD_CLI_URL = (
    "https://stats.oecd.org/SDMX-JSON/data/MEI_CLI/"
    "{area}.LOLITOAA.M/OECD?startTime=1990-01&endTime=2026-12&contentType=csv"
)

# OECD MEI_BTS_COS 数据集（商业信心调查，量纲 0 为中性）
OECD_BTS_URL = (
    "https://stats.oecd.org/SDMX-JSON/data/MEI_BTS_COS/"
    "{area}.BSCICP02.M/OECD?startTime=1990-01&endTime=2026-12&contentType=csv"
)

# ─── 指标元数据 ───────────────────────────────────────────────────────────────
PMI_META = [
    {
        "id": "pmi_mfg",
        "region": "US",
        "name_cn": "美国制造业商业信心指数",
        "description_cn": "OECD 美国制造业商业信心综合指数（BCICP），100为中性，>100扩张，<100收缩",
        "category": "macro",
        "unit": "点",
        "source_name": "OECD MEI_CLI (BCICP)",
        "source_url": "https://stats.oecd.org",
        "credibility": "high",
        "frequency": "monthly",
        "value_type": "index",
    },
    {
        "id": "pmi_non_mfg",
        "region": "US",
        "name_cn": "美国消费者信心综合指数",
        "description_cn": "OECD 美国消费者信心综合指数（CCICP），100为中性，>100扩张，<100收缩，用作非制造业PMI替代",
        "category": "macro",
        "unit": "点",
        "source_name": "OECD MEI_CLI (CCICP)",
        "source_url": "https://stats.oecd.org",
        "credibility": "high",
        "frequency": "monthly",
        "value_type": "index",
    },
    {
        "id": "pmi_non_mfg",
        "region": "EU",
        "name_cn": "欧元区服务业商业信心指数",
        "description_cn": "OECD 欧元区服务业商业信心指数（BCICP GTU），0为中性，>0扩张，<0收缩，用作非制造业PMI替代",
        "category": "macro",
        "unit": "点",
        "source_name": "OECD MEI_BTS_COS (BCICP GTU)",
        "source_url": "https://stats.oecd.org",
        "credibility": "high",
        "frequency": "monthly",
        "value_type": "index",
    },
]

# ─── 指标采集配置 ─────────────────────────────────────────────────────────────
# (region, indicator_id, dataset, ref_area, measure, activity, description)
PMI_CONFIGS = [
    ("US", "pmi_mfg",     "CLI", "USA",  "BCICP", "_Z",  "美国制造业 BCI（MEI_CLI）"),
    ("US", "pmi_non_mfg", "CLI", "USA",  "CCICP", "_Z",  "美国消费者信心综合（MEI_CLI）"),
    ("EU", "pmi_mfg",     "BTS", "EA19", "BCICP", "C",   "欧元区制造业 BCI（MEI_BTS_COS）"),
    ("EU", "pmi_non_mfg", "BTS", "EA19", "BCICP", "GTU", "欧元区服务业 BCI（MEI_BTS_COS）"),
]


def ensure_indicator_meta():
    """确保 indicator_meta 表中存在 PMI 指标元数据"""
    print("检查并插入 PMI 指标元数据...")
    for meta in PMI_META:
        res = (
            supabase.table("indicator_meta")
            .select("id")
            .eq("id", meta["id"])
            .eq("region", meta["region"])
            .execute()
        )
        if not res.data:
            supabase.table("indicator_meta").insert(meta).execute()
            print(f"  ✅ 插入 {meta['region']}/{meta['id']}")
        else:
            # 更新 source_name（修正数据源描述）
            supabase.table("indicator_meta").update(
                {"source_name": meta["source_name"], "description_cn": meta["description_cn"]}
            ).eq("id", meta["id"]).eq("region", meta["region"]).execute()
            print(f"  ✓  更新 {meta['region']}/{meta['id']}")


def fetch_oecd_data(dataset: str, ref_area: str) -> pd.DataFrame:
    """从 OECD 获取指定数据集和地区的数据"""
    if dataset == "CLI":
        url = OECD_CLI_URL.format(area=ref_area)
    else:
        url = OECD_BTS_URL.format(area=ref_area)
    print(f"  Fetching OECD {dataset} for {ref_area}...")
    r = requests.get(url, headers=HEADERS, timeout=90)
    r.raise_for_status()
    return pd.read_csv(StringIO(r.text))


def parse_data(df: pd.DataFrame, ref_area: str, measure: str, activity: str) -> pd.DataFrame:
    """解析 OECD 数据，提取月度时间序列"""
    mask_area = df["REF_AREA"] == ref_area
    mask_measure = df["MEASURE"] == measure
    mask_activity = df["ACTIVITY"] == activity

    df_filtered = df[mask_area & mask_measure & mask_activity][
        ["TIME_PERIOD", "OBS_VALUE"]
    ].copy()

    df_filtered["OBS_VALUE"] = pd.to_numeric(df_filtered["OBS_VALUE"], errors="coerce")
    df_filtered = df_filtered.dropna()

    # 只保留月度数据（格式 YYYY-MM）
    mask_monthly = df_filtered["TIME_PERIOD"].str.match(r"^\d{4}-\d{2}$", na=False)
    return df_filtered[mask_monthly].sort_values("TIME_PERIOD").reset_index(drop=True)


def upsert_data(region: str, indicator_id: str, df: pd.DataFrame) -> int:
    """将数据写入 indicator_values 表（upsert）"""
    if df.empty:
        return 0

    now = datetime.utcnow().isoformat()
    records = []
    for _, row in df.iterrows():
        date_str = row["TIME_PERIOD"] + "-01"
        records.append(
            {
                "indicator_id": indicator_id,
                "region": region,
                "trade_date": date_str,
                "publish_date": date_str,
                "value": round(float(row["OBS_VALUE"]), 4),
                "revision_seq": 0,
                "collected_at": now,
            }
        )

    batch_size = 500
    total = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        supabase.table("indicator_values").upsert(
            batch, on_conflict="indicator_id,region,trade_date,revision_seq"
        ).execute()
        total += len(batch)

    return total


def collect_pmi():
    """主采集函数"""
    print("=" * 60)
    print("PMI 替代指标采集（OECD BCI/CCI）")
    print(f"运行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # 0. 确保元数据存在
    ensure_indicator_meta()

    # 缓存 OECD 数据（避免重复请求）
    oecd_cache: dict[str, pd.DataFrame] = {}

    total_written = 0

    for region, indicator_name, dataset, ref_area, measure, activity, desc in PMI_CONFIGS:
        print(f"\n[{region}] {indicator_name} ({desc})")

        # 1. 获取 OECD 数据（使用缓存）
        cache_key = f"{dataset}_{ref_area}"
        if cache_key not in oecd_cache:
            try:
                oecd_cache[cache_key] = fetch_oecd_data(dataset, ref_area)
            except Exception as e:
                print(f"  ❌ OECD 数据获取失败: {e}")
                continue

        df_raw = oecd_cache[cache_key]

        # 2. 解析数据
        df_parsed = parse_data(df_raw, ref_area, measure, activity)
        print(f"  解析到 {len(df_parsed)} 条月度数据")
        if df_parsed.empty:
            print(f"  ⚠️  无数据，跳过")
            continue
        print(f"  范围: {df_parsed['TIME_PERIOD'].min()} ~ {df_parsed['TIME_PERIOD'].max()}")
        print(f"  最新值: {df_parsed.iloc[-1]['OBS_VALUE']:.4f}")

        # 3. 写入数据库
        written = upsert_data(region, indicator_name, df_parsed)
        print(f"  ✅ 写入 {written} 条")
        total_written += written

    print(f"\n{'=' * 60}")
    print(f"采集完成，共写入 {total_written} 条")
    print("=" * 60)


if __name__ == "__main__":
    # 支持命令行参数：python collect_macro_pmi.py [region] [indicator]
    if len(sys.argv) >= 3:
        target_region = sys.argv[1].upper()
        target_indicator = sys.argv[2].lower()
        PMI_CONFIGS = [
            c for c in PMI_CONFIGS
            if c[0] == target_region and c[1] == target_indicator
        ]
        if not PMI_CONFIGS:
            print(f"未找到配置: {target_region}/{target_indicator}")
            sys.exit(1)
    elif len(sys.argv) == 2:
        target_region = sys.argv[1].upper()
        PMI_CONFIGS = [c for c in PMI_CONFIGS if c[0] == target_region]

    collect_pmi()
