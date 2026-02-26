#!/usr/bin/env python3
"""
backfill_all.py - 一次性全量回填所有14个中国宏观指标到 Supabase
使用纯 requests，绕过 SDK 的 upsert 参数问题
"""
import requests
import akshare as ak
import pandas as pd
import time
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

SUPABASE_URL = "https://ozwgqdcqtkdprvhuacjk.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96d2dxZGNxdGtkcHJ2aHVhY2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyMjk4MCwiZXhwIjoyMDg0OTk4OTgwfQ.ZhG6Pqh3czUbiVRiuzEBWvJBbgHdwTYNPqZgzAAuOUM"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

def upsert(rows, batch_size=500):
    if not rows: return 0
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        for attempt in range(3):
            try:
                r = requests.post(f"{SUPABASE_URL}/rest/v1/indicator_values",
                    headers=HEADERS, json=batch, timeout=60)
                if r.status_code in (200, 201):
                    total += len(batch)
                    break
                else:
                    if attempt < 2:
                        time.sleep(2)
                    else:
                        log.error(f"  写入失败 {r.status_code}: {r.text[:150]}")
            except Exception as e:
                if attempt < 2: time.sleep(2)
                else: log.error(f"  写入异常: {e}")
    return total

def to_f(v):
    try:
        f = float(v)
        return None if pd.isna(f) else f
    except: return None

def dt(s):
    try: return pd.to_datetime(s).strftime("%Y-%m-%d")
    except: return None

def cm(s):
    s = str(s).strip()
    if "年" in s and "月" in s:
        try:
            y = s.split("年")[0]
            m = s.split("年")[1].replace("月份","").replace("月","")
            return f"{y}-{int(m):02d}-01"
        except: return None
    if len(s)==6 and s.isdigit(): return f"{s[:4]}-{s[4:6]}-01"
    if len(s)>=7 and s[4]=="-":
        p = s.split("-")
        if len(p)>=2: return f"{p[0]}-{int(p[1]):02d}-01"
    return None

def row(iid, td, v):
    return {"indicator_id": iid, "trade_date": td, "publish_date": td, "value": v, "revision_seq": 0}

results = {}

TASKS = [
    ("cn_cpi_yoy",        lambda: ak.macro_china_cpi_yearly(),           lambda df: [row("cn_cpi_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("cn_ppi_yoy",        lambda: ak.macro_china_ppi_yearly(),           lambda df: [row("cn_ppi_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("cn_gdp_yoy",        lambda: ak.macro_china_gdp_yearly(),           lambda df: [row("cn_gdp_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("cn_pmi_mfg",        lambda: ak.macro_china_pmi_yearly(),           lambda df: [row("cn_pmi_mfg", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("cn_pmi_service",    lambda: ak.macro_china_non_man_pmi(),          lambda df: [row("cn_pmi_service", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("cn_m2_yoy",         lambda: ak.macro_china_m2_yearly(),            lambda df: [row("cn_m2_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("cn_social_finance", lambda: ak.macro_china_shrzgm(),               lambda df: [row("cn_social_finance", cm(r["月份"]), to_f(r["社会融资规模增量"])) for _, r in df.iterrows() if cm(r["月份"]) and to_f(r["社会融资规模增量"]) is not None]),
    ("cn_new_loans",      lambda: ak.macro_rmb_loan(),                   lambda df: [row("cn_new_loans", cm(r["月份"]), to_f(r["新增人民币贷款-总额"])) for _, r in df.iterrows() if cm(r["月份"]) and to_f(r["新增人民币贷款-总额"]) is not None]),
    ("cn_export_yoy",     lambda: ak.macro_china_exports_yoy(),          lambda df: [row("cn_export_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("cn_import_yoy",     lambda: ak.macro_china_imports_yoy(),          lambda df: [row("cn_import_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("cn_industrial_yoy", lambda: ak.macro_china_industrial_production_yoy(), lambda df: [row("cn_industrial_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("cn_retail_yoy",     lambda: ak.macro_china_consumer_goods_retail(), lambda df: [row("cn_retail_yoy", cm(r["月份"]), to_f(r["同比增长"])) for _, r in df.iterrows() if cm(r["月份"]) and to_f(r["同比增长"]) is not None]),
    ("cn_fai_yoy",        lambda: ak.macro_china_gdzctz(),               lambda df: [row("cn_fai_yoy", cm(r["月份"]), to_f(r["同比增长"])) for _, r in df.iterrows() if cm(r["月份"]) and to_f(r["同比增长"]) is not None]),
    ("cn_lpr_1y",         lambda: ak.macro_china_lpr(),                  lambda df: [row("cn_lpr_1y", dt(r["TRADE_DATE"]), to_f(r["LPR1Y"])) for _, r in df.iterrows() if dt(r["TRADE_DATE"]) and to_f(r["LPR1Y"]) is not None]),
]

for iid, fetch_fn, parse_fn in TASKS:
    log.info(f"采集 {iid} ...")
    try:
        df = fetch_fn()
        rows_data = parse_fn(df)
        w = upsert(rows_data)
        results[iid] = (len(rows_data), w)
        status = "✅" if w > 0 else "❌"
        log.info(f"  {status} {iid}: {len(rows_data)} 条 -> 写入 {w}")
    except Exception as e:
        log.error(f"  ❌ {iid} 失败: {e}")
        results[iid] = (0, 0)

print("\n=== 最终汇总 ===")
tf = tw = 0
for iid, (f, w) in results.items():
    s = "✅" if w > 0 else "❌"
    print(f"  {s} {iid:<25} 获取 {f:>4}  写入 {w:>4}")
    tf += f; tw += w
print(f"\n  合计: 获取 {tf}，写入 {tw}")
