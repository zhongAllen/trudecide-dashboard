"""
CN 月度指标补录脚本（基于 Tushare）
=====================================
用途：补录 CPI/PPI/PMI/M2 在 2025-09 至今的缺失数据，
      同时修正 2025-08 CPI/PPI 的错误值（jin10 采集时混入了预告值）

数据来源：Tushare Pro API（cn_cpi / cn_ppi / cn_pmi / cn_m）
目标表：indicator_values（region='CN'）

日期规则（与现有数据保持一致，使用官方发布日）：
  - cpi_yoy / ppi_yoy：每月 10 日（YYYY-MM-10）
  - pmi_mfg / pmi_non_mfg：每月末（YYYY-MM-28/29/30/31，取当月最后一天）
  - m2_yoy：每月 15 日（YYYY-MM-15）

执行方式：python3 backfill_cn_monthly_tushare.py [--dry-run]
  --dry-run  只打印将要写入的数据，不实际写入数据库

注意：本脚本使用 upsert（on conflict do update），
      对已存在的记录会更新 value 和 collected_at，
      对不存在的记录会新增。
"""

import os
import sys
import time
import calendar
import argparse
from datetime import datetime, timezone
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN = "ed1c5e0fc8d80c3eea50dd0bd596565da471d13e103c1b3a086a0254"
# 也可以通过环境变量传入：export TUSHARE_TOKEN=xxx
TUSHARE_TOKEN = os.environ.get("TUSHARE_TOKEN", TUSHARE_TOKEN)

# 补录起始月份（含）：从 2025-01 开始，覆盖 jin10 全年错误数据
BACKFILL_START = "202501"
BACKFILL_END   = "202512"  # 截止到 2025-12（含）

# 各指标的 trade_date 日规则（每月第几天）
RELEASE_DAY = {
    "cpi_yoy":     10,
    "ppi_yoy":     10,
    "pmi_mfg":     -1,  # -1 表示月末最后一天
    "pmi_non_mfg": -1,
    "m2_yoy":      15,
}

# ── 工具函数 ─────────────────────────────────────────────────────────────────
def month_to_trade_date(month_str: str, day_rule: int) -> str:
    """
    将 Tushare 的 YYYYMM 格式转换为 YYYY-MM-DD 格式的 trade_date。
    day_rule: 正数=当月第几天，-1=当月最后一天
    """
    year  = int(month_str[:4])
    month = int(month_str[4:])
    if day_rule == -1:
        day = calendar.monthrange(year, month)[1]  # 当月最后一天
    else:
        day = day_rule
    return f"{year:04d}-{month:02d}-{day:02d}"


def upsert_rows(sb, rows: list[dict], dry_run: bool) -> int:
    """
    批量 upsert 到 indicator_values 表。
    主键冲突条件：(indicator_id, region, trade_date, revision_seq)
    """
    if dry_run:
        for r in rows:
            print(f"  [DRY-RUN] {r['indicator_id']} | {r['region']} | {r['trade_date']} | value={r['value']}")
        return len(rows)

    result = sb.table("indicator_values").upsert(
        rows,
        on_conflict="indicator_id,region,trade_date,revision_seq"
    ).execute()
    return len(result.data)


# ── 各指标采集逻辑 ────────────────────────────────────────────────────────────
def fetch_with_retry(func, max_retries=5, wait=10, **kwargs):
    """带重试的 Tushare API 调用，应对网络超时"""
    for attempt in range(1, max_retries + 1):
        try:
            return func(**kwargs)
        except Exception as e:
            if attempt == max_retries:
                raise
            print(f"  第 {attempt} 次失败（{e.__class__.__name__}），{wait}s 后重试...")
            time.sleep(wait)


def collect_cpi(pro, dry_run: bool, sb) -> dict:
    """采集 CPI 同比（cpi_yoy）"""
    print("\n[CPI] 采集中...")
    df = fetch_with_retry(pro.cn_cpi, start_m=BACKFILL_START, end_m=BACKFILL_END,
                          fields="month,nt_yoy")
    df = df[df["nt_yoy"].notna()].copy()
    print(f"  Tushare 返回 {len(df)} 条有效数据")
    print(df.to_string(index=False))

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for _, row in df.iterrows():
        trade_date = month_to_trade_date(row["month"], RELEASE_DAY["cpi_yoy"])
        rows.append({
            "indicator_id": "cpi_yoy",
            "region":       "CN",
            "trade_date":   trade_date,
            "publish_date": trade_date,
            "value":        float(row["nt_yoy"]),
            "revision_seq": 0,
            "collected_at": now,
        })

    written = upsert_rows(sb, rows, dry_run)
    return {"indicator": "cpi_yoy", "fetched": len(df), "written": written}


def collect_ppi(pro, dry_run: bool, sb) -> dict:
    """采集 PPI 同比（ppi_yoy）"""
    print("\n[PPI] 采集中...")
    df = fetch_with_retry(pro.cn_ppi, start_m=BACKFILL_START, end_m=BACKFILL_END,
                          fields="month,ppi_yoy")
    df = df[df["ppi_yoy"].notna()].copy()
    print(f"  Tushare 返回 {len(df)} 条有效数据")
    print(df.to_string(index=False))

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for _, row in df.iterrows():
        trade_date = month_to_trade_date(row["month"], RELEASE_DAY["ppi_yoy"])
        rows.append({
            "indicator_id": "ppi_yoy",
            "region":       "CN",
            "trade_date":   trade_date,
            "publish_date": trade_date,
            "value":        float(row["ppi_yoy"]),
            "revision_seq": 0,
            "collected_at": now,
        })

    written = upsert_rows(sb, rows, dry_run)
    return {"indicator": "ppi_yoy", "fetched": len(df), "written": written}


def collect_pmi(pro, dry_run: bool, sb) -> dict:
    """
    采集 PMI（制造业 + 非制造业）
    Tushare cn_pmi 返回的列名是大写，如 PMI020100（制造业综合）、PMI020200（非制造业）
    """
    print("\n[PMI] 采集中...")
    df = fetch_with_retry(pro.cn_pmi, start_m=BACKFILL_START, end_m=BACKFILL_END)
    print(f"  Tushare 返回列: {list(df.columns)}")

    # 找制造业综合 PMI 列（PMI020100）和非制造业综合 PMI 列（PMI020200）
    # 列名可能是大写或小写，做兼容处理
    df.columns = [c.upper() for c in df.columns]
    mfg_col     = "PMI010000"  # 制造业综合 PMI（官方国家统计局）
    non_mfg_col = "PMI020100"  # 非制造业商务活动指数（官方，即非制造业 PMI）

    if mfg_col not in df.columns:
        print(f"  警告：找不到制造业 PMI 列 {mfg_col}，可用列: {list(df.columns)}")
    if non_mfg_col not in df.columns:
        print(f"  警告：找不到非制造业 PMI 列 {non_mfg_col}，可用列: {list(df.columns)}")

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    results = []

    for ind_id, col in [("pmi_mfg", mfg_col), ("pmi_non_mfg", non_mfg_col)]:
        if col not in df.columns:
            results.append({"indicator": ind_id, "fetched": 0, "written": 0, "error": f"列 {col} 不存在"})
            continue

        sub = df[["MONTH", col]].rename(columns={"MONTH": "month", col: "val"})
        sub = sub[sub["val"].notna()].copy()
        print(f"\n  [{ind_id}] {len(sub)} 条有效数据:")
        print(sub.to_string(index=False))

        ind_rows = []
        for _, row in sub.iterrows():
            trade_date = month_to_trade_date(str(row["month"]), RELEASE_DAY[ind_id])
            ind_rows.append({
                "indicator_id": ind_id,
                "region":       "CN",
                "trade_date":   trade_date,
                "publish_date": trade_date,
                "value":        float(row["val"]),
                "revision_seq": 0,
                "collected_at": now,
            })

        rows.extend(ind_rows)
        results.append({"indicator": ind_id, "fetched": len(sub), "written": len(ind_rows)})

    written = upsert_rows(sb, rows, dry_run)
    for r in results:
        r["written"] = r.get("written", 0)
    return results


def collect_m2(pro, dry_run: bool, sb) -> dict:
    """采集 M2 同比（m2_yoy）"""
    print("\n[M2] 采集中...")
    df = fetch_with_retry(pro.cn_m, start_m=BACKFILL_START, end_m=BACKFILL_END,
                         fields="month,m2_yoy")
    df = df[df["m2_yoy"].notna()].copy()
    print(f"  Tushare 返回 {len(df)} 条有效数据")
    print(df.to_string(index=False))

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for _, row in df.iterrows():
        trade_date = month_to_trade_date(row["month"], RELEASE_DAY["m2_yoy"])
        rows.append({
            "indicator_id": "m2_yoy",
            "region":       "CN",
            "trade_date":   trade_date,
            "publish_date": trade_date,
            "value":        float(row["m2_yoy"]),
            "revision_seq": 0,
            "collected_at": now,
        })

    written = upsert_rows(sb, rows, dry_run)
    return {"indicator": "m2_yoy", "fetched": len(df), "written": written}


# ── 主程序 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="CN 月度指标 Tushare 补录脚本")
    parser.add_argument("--dry-run", action="store_true",
                        help="只打印将要写入的数据，不实际写入数据库")
    args = parser.parse_args()

    if args.dry_run:
        print("=" * 60)
        print("【DRY-RUN 模式】只预览数据，不写入数据库")
        print("=" * 60)

    # 初始化 Tushare
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    print(f"Tushare 初始化完成，补录范围：{BACKFILL_START} ~ {BACKFILL_END}")

    # 初始化 Supabase
    sb = create_client(
        os.environ.get("SUPABASE_URL"),
        os.environ.get("SUPABASE_KEY")
    )

    summary = []

    # 1. CPI
    time.sleep(1)
    r = collect_cpi(pro, args.dry_run, sb)
    summary.append(r)

    # 2. PPI
    time.sleep(2)
    r = collect_ppi(pro, args.dry_run, sb)
    summary.append(r)

    # 3. PMI（制造业 + 非制造业）
    time.sleep(2)
    results = collect_pmi(pro, args.dry_run, sb)
    if isinstance(results, list):
        summary.extend(results)
    else:
        summary.append(results)

    # 4. M2
    time.sleep(2)
    r = collect_m2(pro, args.dry_run, sb)
    summary.append(r)

    # 汇总报告
    print("\n" + "=" * 60)
    print("【补录汇总报告】")
    print("=" * 60)
    total_written = 0
    for item in summary:
        if isinstance(item, dict):
            err = item.get("error", "")
            status = f"❌ {err}" if err else f"✅ 获取 {item.get('fetched',0)} 条，写入 {item.get('written',0)} 条"
            print(f"  {item.get('indicator','?'):20s} {status}")
            total_written += item.get("written", 0)
    print(f"\n  合计写入：{total_written} 条")
    if args.dry_run:
        print("\n  ⚠️  以上为预览，未实际写入。去掉 --dry-run 参数后重新执行即可写入。")


if __name__ == "__main__":
    main()
