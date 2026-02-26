#!/usr/bin/env python3
"""
backfill_all.py - 宏观指标历史数据全量回填脚本（第一批14个）

核心设计：
1.  **原子化任务**：每个指标是一个独立的 (fetch, parse) 元组，方便增删改查。
2.  **纯 requests 写入**：绕过 Supabase Python SDK 的 upsert 问题，直接用 POST + Prefer 头。
3.  **幂等性**：`Prefer: resolution=merge-duplicates` 保证重复执行不产生重复数据。
4.  **健壮性**：写入失败自动重试3次，日期和数值解析有完整的异常处理。

踩坑记录 (WHY):
-   **[坑] Supabase SDK upsert 失败**
    -   **现象**: `supabase.table(...).upsert(...)` 报 RLS (Row-Level Security) 权限错误。
    -   **原因**: upsert 操作在数据库层面需要同时有 INSERT 和 UPDATE 权限。初版 RLS 策略只给了 INSERT，导致 upsert 被拒。
    -   **解决方案**: 
        1.  修改 RLS 策略，为 `service_role` 赋予 `ALL` (INSERT, UPDATE, DELETE) 权限。
        2.  为避免 SDK 复杂的参数拼接（`on_conflict`, `columns` 等）再次触发 RLS 检查，脚本直接改用更底层的 `requests.post`，只用 `Prefer: resolution=merge-duplicates` 头，最稳定可靠。

-   **[坑] AKShare 接口 SSL 握手失败**
    -   **现象**: 某些 AKShare 接口（如 `macro_china_shrzgm`）在沙箱环境中报 `SSLV3_ALERT_HANDSHAKE_FAILURE`。
    -   **原因**: 目标服务器（如商务部 `data.mofcom.gov.cn`）使用老旧的 TLS 协议，而沙箱环境的 OpenSSL 默认安全级别较高，无法完成握手。
    -   **解决方案**: 见 `backfill_remaining.py`，通过自定义 `TLSAdapter` 强制降低 TLS 安全级别 (`SECLEVEL=1`) 解决。

-   **[坑] 日期格式不统一**
    -   **现象**: AKShare 不同接口返回的日期格式五花八门（`YYYY-MM-DD`, `YYYYMM`, `YYYY年MM月份`, `YYYY年第N季度`）。
    -   **原因**: 数据源不同，无统一规范。
    -   **解决方案**: 编写了 `dt()` (datetime), `cm()` (chinamonth), `quarter_to_date()` 等多个专用日期解析函数，做归一化处理。
"""
import requests
import akshare as ak
import pandas as pd
import time, logging, re, calendar

# ── 配置 ─────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

SUPABASE_URL = "https://ozwgqdcqtkdprvhuacjk.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96d2dxZGNxdGtkcHJ2aHVhY2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyMjk4MCwiZXhwIjoyMDg0OTk4OTgwfQ.ZhG6Pqh3czUbiVRiuzEBWvJBbgHdwTYNPqZgzAAuOUM"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates", # 核心：保证幂等性
}

# ── 工具函数 ──────────────────────────────────────────────────
def upsert(rows, batch_size=500):
    """分批、重试写入 Supabase"""
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
                    if attempt < 2: time.sleep(2)
                    else: log.error(f"  写入失败 {r.status_code}: {r.text[:150]}")
            except Exception as e:
                if attempt < 2: time.sleep(2)
                else: log.error(f"  写入异常: {e}")
    return total

def to_f(v):
    """健壮的 float 转换"""
    try:
        f = float(v)
        return None if pd.isna(f) else f
    except: return None

def dt(s):
    """健壮的 YYYY-MM-DD 解析"""
    try: return pd.to_datetime(s).strftime("%Y-%m-%d")
    except: return None

def cm(s):
    """健壮的中文月份解析（YYYY年MM月, YYYYMM）"""
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

def row(iid, td, v, region="CN"):
    """构造标准记录"""
    return {"indicator_id": iid, "trade_date": td, "publish_date": td, "value": v, "revision_seq": 0, "region": region}

# ── 任务定义 ──────────────────────────────────────────────────
# [注] 此处 ID 均为迁移前的 cn_ 前缀，实际已在数据库中重命名
TASKS = [
    ("cpi_yoy",        lambda: ak.macro_china_cpi_yearly(),           lambda df: [row("cpi_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("ppi_yoy",        lambda: ak.macro_china_ppi_yearly(),           lambda df: [row("ppi_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("gdp_yoy",        lambda: ak.macro_china_gdp_yearly(),           lambda df: [row("gdp_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("pmi_mfg",        lambda: ak.macro_china_pmi_yearly(),           lambda df: [row("pmi_mfg", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("pmi_non_mfg",    lambda: ak.macro_china_non_man_pmi(),          lambda df: [row("pmi_non_mfg", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("m2_yoy",         lambda: ak.macro_china_m2_yearly(),            lambda df: [row("m2_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("new_loans",      lambda: ak.macro_rmb_loan(),                   lambda df: [row("new_loans", cm(r["月份"]), to_f(r["新增人民币贷款-总额"])) for _, r in df.iterrows() if cm(r["月份"]) and to_f(r["新增人民币贷款-总额"]) is not None]),
    ("export_yoy",     lambda: ak.macro_china_exports_yoy(),          lambda df: [row("export_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("import_yoy",     lambda: ak.macro_china_imports_yoy(),          lambda df: [row("import_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("industrial_yoy", lambda: ak.macro_china_industrial_production_yoy(), lambda df: [row("industrial_yoy", dt(r["日期"]), to_f(r["今值"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["今值"]) is not None]),
    ("retail_yoy",     lambda: ak.macro_china_consumer_goods_retail(), lambda df: [row("retail_yoy", cm(r["月份"]), to_f(r["同比增长"])) for _, r in df.iterrows() if cm(r["月份"]) and to_f(r["同比增长"]) is not None]),
    ("fai_yoy",        lambda: ak.macro_china_gdzctz(),               lambda df: [row("fai_yoy", cm(r["月份"]), to_f(r["同比增长"])) for _, r in df.iterrows() if cm(r["月份"]) and to_f(r["同比增长"]) is not None]),
    ("lpr_1y",         lambda: ak.macro_china_lpr(),                  lambda df: [row("lpr_1y", dt(r["TRADE_DATE"]), to_f(r["LPR1Y"])) for _, r in df.iterrows() if dt(r["TRADE_DATE"]) and to_f(r["LPR1Y"]) is not None]),
]

# ── 主流程 ──────────────────────────────────────────────────
if __name__ == "__main__":
    results = {}
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
