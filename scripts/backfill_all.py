#!/usr/bin/env python3
"""
backfill_all.py - 宏观指标历史数据统一全量回填脚本

核心设计：
1.  **统一入口**：合并了原有的 `backfill_all.py` 和 `backfill_remaining.py`，一个脚本完成所有 35 个指标的全量回填。
2.  **两种采集模式**：
    -   **常规模式**：通过 `TASKS` 列表定义简单的 AKShare 指标，循环采集。
    -   **特殊模式**：通过独立的 `collect_*` 函数处理需要特殊逻辑的指标（如 SSL 降级、API 抓包、衍生计算）。
3.  **幂等性与健壮性**：
    -   使用 `requests.post` + `Prefer: resolution=merge-duplicates` 头保证写入幂等。
    -   内置写入重试、健壮的类型转换和日期解析。

踩坑记录 (WHY):
-   **[坑] Supabase SDK upsert 失败**：改用 `requests.post` 绕过 RLS 权限问题。
-   **[坑] AKShare/源站 SSL 握手失败**：通过自定义 `TLSAdapter` 强制降低 TLS 安全级别解决。
-   **[坑] 日期格式不统一**：编写了 `dt()`, `cm()`, `quarter_to_date()` 等多个专用日期解析函数归一化。
-   **[坑] GDP 季比数据缺失**：从累计绝对值反算单季度绝对值，再计算环比。
-   **[坑] DR001/DR007 接口缺失**：使用走势高度相关的 FR001/FR007 作为业务替代。
"""
import requests
import akshare as ak
import pandas as pd
import time, logging, re, calendar, json, urllib3, ssl

# ── 配置 ─────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

SUPABASE_URL = "https://ozwgqdcqtkdprvhuacjk.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96d2dxZGNxdGtkcHJ2aHVhY2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyMjk4MCwiZXhwIjoyMDg0OTk4OTgwfQ.ZhG6Pqh3czUbiVRiuzEBWvJBbgHdwTYNPqZgzAAuOUM"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}
urllib3.disable_warnings()

# ── SSL 适配器 (处理老旧 TLS) ──────────────────────────────────
class TLSAdapter(requests.adapters.HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT@SECLEVEL=1")
        kwargs["ssl_context"] = ctx
        return super(TLSAdapter, self).init_poolmanager(*args, **kwargs)

# ── 工具函数 ──────────────────────────────────────────────────
def upsert(rows, batch_size=500):
    if not rows: return 0
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        for attempt in range(3):
            try:
                r = requests.post(f"{SUPABASE_URL}/rest/v1/indicator_values", headers=HEADERS, json=batch, timeout=60)
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
    try: return None if pd.isna(f := float(v)) else f
    except: return None

def dt(s):
    try: return pd.to_datetime(s).strftime("%Y-%m-%d")
    except: return None

def cm(s):
    s = str(s).strip()
    if "年" in s and "月" in s:
        try:
            y, m = s.split("年")[0], s.split("年")[1].replace("月份","").replace("月","")
            return f"{y}-{int(m):02d}-01"
        except: return None
    if len(s)==6 and s.isdigit(): return f"{s[:4]}-{s[4:6]}-01"
    if len(s)>=7 and s[4]=="-":
        if len(p := s.split("-"))>=2: return f"{p[0]}-{int(p[1]):02d}-01"
    return None

def quarter_to_date(q_str):
    try:
        year, quarter = q_str.split("年第")[0], q_str.split("年第")[1][0]
        month = {"一": "03", "二": "06", "三": "09", "四": "12"}[quarter]
        return f"{year}-{month}-01"
    except: return None

def row(iid, td, v, region="CN"):
    return {"indicator_id": iid, "trade_date": td, "publish_date": td, "value": v, "revision_seq": 0, "region": region}

# ── 常规任务定义 (14个) ────────────────────────────────────────
REGULAR_TASKS = [
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
    ("lpr_5y",         lambda: ak.macro_china_lpr(),                  lambda df: [row("lpr_5y", dt(r["TRADE_DATE"]), to_f(r["LPR5Y"])) for _, r in df.iterrows() if dt(r["TRADE_DATE"]) and to_f(r["LPR5Y"]) is not None]),
]

# ── 特殊任务采集函数 (21个) ───────────────────────────────────
def run_special_tasks():
    results = {}
    
    def _run(iid, func, *args):
        log.info(f"采集 {iid} ...")
        try:
            rows_data = func(*args)
            w = upsert(rows_data)
            results[iid] = (len(rows_data), w)
            log.info(f"  {'✅' if w > 0 else '❌'} {iid}: {len(rows_data)} 条 -> 写入 {w}")
        except Exception as e:
            log.error(f"  ❌ {iid} 失败: {e}")
            results[iid] = (0, 0)

    # --- 直接用 AKShare 的 --- 
    _run("us_bond_10y/cn_bond_10y", collect_bond_rate)
    _run("rmb_usd", collect_rmb_usd)
    _run("all_a_pb", lambda: collect_simple_ak("all_a_pb", ak.stock_a_all_pb, "pb"))
    _run("hs300_pb", lambda: collect_simple_ak("hs300_pb", ak.stock_index_pb_lg, "pb", symbol="000300"))
    _run("hs300_pe", lambda: collect_simple_ak("hs300_pe", ak.stock_index_pe_lg, "pe", symbol="000300"))
    _run("margin_balance_sh/sz", collect_margin_balance)
    _run("north_net_flow", collect_north_flow)
    _run("shibor", collect_shibor)
    _run("cpi_mom", lambda: collect_simple_ak("cpi_mom", ak.macro_china_cpi_monthly, "当月", date_col="月份", date_parser=cm))
    _run("m2_level", lambda: collect_simple_ak("m2_level", ak.macro_china_m2, "货币和准货币（M2）-数量(亿元)", date_col="月份", date_parser=cm))
    _run("social_finance_yoy", lambda: collect_simple_ak("social_finance_yoy", ak.macro_china_shrzgm, "社会融资规模存量-同比增长", date_col="月份", date_parser=cm))
    _run("gdp_level/primary/secondary/tertiary", collect_gdp_level)

    # --- 需要特殊处理的 ---
    _run("dr001/dr007", collect_dr_rate)
    _run("social_finance", collect_social_finance)
    _run("unemployment_rate", collect_unemployment_rate)
    _run("gdp_qoq", collect_gdp_qoq)

    return results

def collect_simple_ak(iid, ak_func, val_col, date_col="日期", date_parser=dt, **kwargs):
    df = ak_func(**kwargs)
    return [row(iid, date_parser(r[date_col]), to_f(r[val_col])) for _, r in df.iterrows() if date_parser(r[date_col]) and to_f(r[val_col]) is not None]

def collect_bond_rate():
    df = ak.bond_zh_us_rate()
    rows = []
    for _, r in df.iterrows():
        trade_date = dt(r["日期"])
        if not trade_date: continue
        if (v := to_f(r["中国10年期国债收益率"])) is not None: rows.append(row("cn_bond_10y", trade_date, v))
        if (v := to_f(r["美国10年期国债收益率"])) is not None: rows.append(row("us_bond_10y", trade_date, v))
    return rows

def collect_rmb_usd():
    df = ak.currency_boc_sina(symbol="美元", start_date="19900101", end_date="20990101")
    return [row("rmb_usd", dt(r["日期"]), to_f(r["中行钞买价"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["中行钞买价"]) is not None]

def collect_margin_balance():
    df_sh = ak.margin_sh_detail(start_date="19900101", end_date="20990101")
    df_sz = ak.margin_sz_detail(start_date="19900101", end_date="20990101")
    rows = [row("margin_balance_sh", dt(r["信用交易日期"]), to_f(r["融资余额"])) for _, r in df_sh.iterrows() if dt(r["信用交易日期"]) and to_f(r["融资余额"]) is not None]
    rows += [row("margin_balance_sz", dt(r["信用交易日期"]), to_f(r["融资余额"])) for _, r in df_sz.iterrows() if dt(r["信用交易日期"]) and to_f(r["融资余额"]) is not None]
    return rows

def collect_north_flow():
    df = ak.stock_hsgt_hist_em(symbol="北向资金")
    return [row("north_net_flow", dt(r["日期"]), to_f(r["当日成交净买入"])) for _, r in df.iterrows() if dt(r["日期"]) and to_f(r["当日成交净买入"]) is not None]

def collect_shibor():
    df = ak.shibor_hist(start_date="19900101", end_date="20990101")
    rows = []
    for _, r in df.iterrows():
        trade_date = dt(r["日期"])
        if not trade_date: continue
        if (v := to_f(r["O/N"])) is not None: rows.append(row("shibor_on", trade_date, v))
        if (v := to_f(r["1W"])) is not None: rows.append(row("shibor_1w", trade_date, v))
    return rows

def collect_gdp_level():
    df = ak.macro_china_gdp_yearly()
    rows = []
    for _, r in df.iterrows():
        trade_date = quarter_to_date(r["季度"])
        if not trade_date: continue
        if (v := to_f(r["国内生产总值-绝对值"])) is not None: rows.append(row("gdp_level", trade_date, v))
        if (v := to_f(r["第一产业-绝对值"])) is not None: rows.append(row("gdp_primary", trade_date, v))
        if (v := to_f(r["第二产业-绝对值"])) is not None: rows.append(row("gdp_secondary", trade_date, v))
        if (v := to_f(r["第三产业-绝对值"])) is not None: rows.append(row("gdp_tertiary", trade_date, v))
    return rows

def collect_dr_rate():
    df = ak.repo_rate_hist(start_date="19900101", end_date="20990101")
    rows = []
    for _, r in df.iterrows():
        trade_date = dt(r["日期"])
        if not trade_date: continue
        if (v := to_f(r["FR001"])) is not None: rows.append(row("dr001", trade_date, v))
        if (v := to_f(r["FR007"])) is not None: rows.append(row("dr007", trade_date, v))
    return rows

def collect_social_finance():
    s = requests.Session()
    s.mount("https://", TLSAdapter())
    r = s.get("http://data.mofcom.gov.cn/datamofcom/front/v2/list", params={"column": "SHRZGM"}, timeout=30, verify=False)
    data = r.json()
    return [row("social_finance", cm(item["regtime"]), to_f(item["data"])) for item in data if cm(item["regtime"]) and to_f(item["data"]) is not None]

def collect_unemployment_rate():
    params = {
        "m": "QueryData", "dbcode": "hgnd", "rowcode": "zb", "colcode": "sj",
        "wds": json.dumps([{"wdcode":"zb","valuecode":"A0301"}]),
        "dfwds": json.dumps([{"wdcode":"sj","valuecode":"LAST72"}]),
    }
    r = requests.get("https://data.stats.gov.cn/easyquery.htm", params=params, verify=False)
    data = r.json()["returndata"]["datanodes"]
    return [row("unemployment_rate", cm(d["code"].split("_")[-1]), to_f(d["data"]["data"])) for d in data if "A03010B_" in d["code"]]

def collect_gdp_qoq():
    r = requests.get(f"{SUPABASE_URL}/rest/v1/indicator_values?indicator_id=eq.gdp_level&order=trade_date.asc", headers=HEADERS)
    df = pd.DataFrame(r.json()).sort_values("trade_date").reset_index(drop=True)
    df["value"] = pd.to_numeric(df["value"])
    df["quarterly_value"] = df["value"].diff()
    df.loc[df["trade_date"].str.endswith("-03-01"), "quarterly_value"] = df["value"]
    df["gdp_qoq"] = df["quarterly_value"].pct_change() * 100
    return [row("gdp_qoq", row["trade_date"], to_f(row["gdp_qoq"])) for _, row in df.iterrows() if to_f(row["gdp_qoq"]) is not None]

# ── 主流程 ──────────────────────────────────────────────────
if __name__ == "__main__":
    all_results = {}
    
    # 1. 运行常规任务
    log.info("====== 开始采集常规指标 (14个) ======")
    for iid, fetch_fn, parse_fn in REGULAR_TASKS:
        log.info(f"采集 {iid} ...")
        try:
            df = fetch_fn()
            rows_data = parse_fn(df)
            w = upsert(rows_data)
            all_results[iid] = (len(rows_data), w)
            log.info(f"  {'✅' if w > 0 else '❌'} {iid}: {len(rows_data)} 条 -> 写入 {w}")
        except Exception as e:
            log.error(f"  ❌ {iid} 失败: {e}")
            all_results[iid] = (0, 0)

    # 2. 运行特殊任务
    log.info("\n====== 开始采集特殊指标 (21个) ======")
    special_results = run_special_tasks()
    all_results.update(special_results)

    # 3. 最终汇总
    print("\n=== 最终汇总 ===")
    tf = tw = 0
    for iid, (f, w) in sorted(all_results.items()):
        s = "✅" if w > 0 else "❌"
        print(f"  {s} {iid:<35} 获取 {f:>5}  写入 {w:>5}")
        tf += f; tw += w
    print(f"\n  合计: 获取 {tf}，写入 {tw}")
