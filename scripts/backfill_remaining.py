#!/usr/bin/env python3
"""
backfill_remaining.py
采集剩余宏观指标的历史数据并写入 Supabase indicator_values 表

指标清单（共 21 个新指标）：
  GDP 扩展（8个）: gdp_level, gdp_qoq, gdp_primary, gdp_primary_yoy,
                   gdp_secondary, gdp_secondary_yoy, gdp_tertiary, gdp_tertiary_yoy
  CPI 环比（1个）: cpi_mom
  M2 余额（1个）: m2_level
  社融存量同比（1个）: social_finance_yoy
  LPR 5年期（1个）: lpr_5y
  Shibor（2个）: shibor_on, shibor_1w
  国债收益率（2个）: cn_bond_10y（CN）, us_bond_10y（US）
  融资余额（2个）: margin_balance_sh, margin_balance_sz
  北向资金（1个）: north_net_flow
  市场估值（4个）: hs300_pe, hs300_pb, all_a_pe, all_a_pb
  失业率（1个）: unemployment_rate（尝试采集，失败则跳过）
"""

import os, sys, time, re, calendar
import requests
import pandas as pd
import akshare as ak

# ── 配置 ─────────────────────────────────────────────────────
SUPABASE_URL = "https://ozwgqdcqtkdprvhuacjk.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96d2dxZGNxdGtkcHJ2aHVhY2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyMjk4MCwiZXhwIjoyMDg0OTk4OTgwfQ.ZhG6Pqh3czUbiVRiuzEBWvJBbgHdwTYNPqZgzAAuOUM"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

DRY_RUN = "--dry-run" in sys.argv

# ── 工具函数 ──────────────────────────────────────────────────
def quarter_to_date(q_str: str) -> str:
    """'2024年第1-4季度' -> '2024-12-31'"""
    m = re.search(r'(\d{4})年.*?(\d+)季度', str(q_str))
    if not m:
        return None
    year, q = int(m.group(1)), int(m.group(2))
    quarter_end = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}
    return f"{year}-{quarter_end[q]}"

def month_to_date(m_str: str) -> str:
    """'2024年01月份' -> '2024-01-31'"""
    m = re.search(r'(\d{4})年(\d{2})月', str(m_str))
    if not m:
        return None
    year, month = int(m.group(1)), int(m.group(2))
    last_day = calendar.monthrange(year, month)[1]
    return f"{year}-{month:02d}-{last_day:02d}"

def make_row(indicator_id: str, trade_date: str, value, region: str = "CN") -> dict:
    if value is None:
        return None
    try:
        fval = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(fval):
        return None
    return {
        "indicator_id": indicator_id,
        "trade_date": trade_date,
        "publish_date": trade_date,
        "value": fval,
        "revision_seq": 0,
        "region": region,
    }

def upsert_rows(rows: list) -> int:
    if not rows or DRY_RUN:
        return len(rows)
    total = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i+500]
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/indicator_values",
            headers=HEADERS,
            json=batch,
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            print(f"    ⚠️  写入失败 HTTP {resp.status_code}: {resp.text[:200]}")
        else:
            total += len(batch)
    return total

# ── 各指标采集函数 ────────────────────────────────────────────

def collect_gdp_extended():
    """GDP 绝对值、季比、三大产业（8个指标）"""
    print("采集 GDP 扩展指标...")
    df = ak.macro_china_gdp()
    # GDP 接口没有季比列，需要计算
    # 列名：['季度','国内生产总值-绝对值','国内生产总值-同比增长','第一产业-绝对值','第一产业-同比增长',
    #        '第二产业-绝对值','第二产业-同比增长','第三产业-绝对值','第三产业-同比增长']
    col_map = {
        "gdp_level":           "国内生产总值-绝对值",
        "gdp_primary":         "第一产业-绝对值",
        "gdp_primary_yoy":     "第一产业-同比增长",
        "gdp_secondary":       "第二产业-绝对值",
        "gdp_secondary_yoy":   "第二产业-同比增长",
        "gdp_tertiary":        "第三产业-绝对值",
        "gdp_tertiary_yoy":    "第三产业-同比增长",
    }
    results = {}
    for iid, col in col_map.items():
        rows = []
        for _, r in df.iterrows():
            td = quarter_to_date(r["季度"])
            if not td:
                continue
            row = make_row(iid, td, r.get(col))
            if row:
                rows.append(row)
        cnt = upsert_rows(rows)
        results[iid] = (len(rows), cnt)
        print(f"  ✅ {iid}: {len(rows)} 条 -> 写入 {cnt}")
    return results

def collect_cpi_mom():
    """CPI 环比（来自 macro_china_cpi 接口）"""
    print("采集 cpi_mom ...")
    df = ak.macro_china_cpi()
    # 列名：['月份','全国-当月','全国-同比增长','全国-环比增长',...]
    rows = []
    for _, r in df.iterrows():
        td = month_to_date(str(r["月份"]))
        if not td:
            continue
        row = make_row("cpi_mom", td, r.get("全国-环比增长"))
        if row:
            rows.append(row)
    cnt = upsert_rows(rows)
    print(f"  ✅ cpi_mom: {len(rows)} 条 -> 写入 {cnt}")
    return {"cpi_mom": (len(rows), cnt)}

def collect_m2_level():
    """M2 余额绝对值"""
    print("采集 m2_level ...")
    df = ak.macro_china_money_supply()
    rows = []
    for _, r in df.iterrows():
        td = month_to_date(str(r["月份"]))
        if not td:
            continue
        row = make_row("m2_level", td, r.get("货币和准货币(M2)-数量(亿元)"))
        if row:
            rows.append(row)
    cnt = upsert_rows(rows)
    print(f"  ✅ m2_level: {len(rows)} 条 -> 写入 {cnt}")
    return {"m2_level": (len(rows), cnt)}

def collect_social_finance():
    """社融增量（商务部数据，单位：亿元）"""
    import ssl
    print("采集 social_finance ...")

    class TLSAdapter(requests.adapters.HTTPAdapter):
        def init_poolmanager(self, *args, **kwargs):
            ctx = ssl.create_default_context()
            ctx.set_ciphers('DEFAULT@SECLEVEL=1')
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            kwargs['ssl_context'] = ctx
            return super().init_poolmanager(*args, **kwargs)

    sess = requests.Session()
    sess.mount("https://", TLSAdapter())
    url = "https://data.mofcom.gov.cn/datamofcom/front/gnmy/shrzgmQuery"
    r = sess.post(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
    raw = r.json()
    rows = []
    for item in raw:
        date_str = str(item["date"])
        trade_date = f"{date_str[:4]}-{date_str[4:6]}-01"
        value = float(item["tiosfs"]) if item.get("tiosfs") is not None else None
        if value is None:
            continue
        rows.append({
            "indicator_id": "social_finance",
            "trade_date": trade_date,
            "publish_date": trade_date,
            "value": value,
            "revision_seq": 0,
            "region": "CN"
        })
    cnt = upsert_rows(rows)
    print(f"  ✅ social_finance: {len(rows)} 条 -> 写入 {cnt}")
    return {"social_finance": (len(rows), cnt)}

def collect_social_finance_yoy():
    """社融存量同比（当月同比增长）"""
    print("采集 social_finance_yoy ...")
    df = ak.macro_china_new_financial_credit()
    rows = []
    for _, r in df.iterrows():
        td = month_to_date(str(r["月份"]))
        if not td:
            continue
        row = make_row("social_finance_yoy", td, r.get("当月-同比增长"))
        if row:
            rows.append(row)
    cnt = upsert_rows(rows)
    print(f"  ✅ social_finance_yoy: {len(rows)} 条 -> 写入 {cnt}")
    return {"social_finance_yoy": (len(rows), cnt)}

def collect_lpr_5y():
    """LPR 5年期（2019年后才有数据）"""
    print("采集 lpr_5y ...")
    df = ak.macro_china_lpr()
    df_valid = df[df["LPR5Y"].notna()].copy()
    rows = []
    for _, r in df_valid.iterrows():
        td = str(r["TRADE_DATE"])[:10]
        row = make_row("lpr_5y", td, r.get("LPR5Y"))
        if row:
            rows.append(row)
    cnt = upsert_rows(rows)
    print(f"  ✅ lpr_5y: {len(rows)} 条 -> 写入 {cnt}")
    return {"lpr_5y": (len(rows), cnt)}

def collect_shibor():
    """Shibor 隔夜（shibor_on）和 1周（shibor_1w）"""
    print("采集 shibor_on / shibor_1w ...")
    df = ak.macro_china_shibor_all()
    rows_on, rows_1w = [], []
    for _, r in df.iterrows():
        td = str(r["日期"])[:10]
        row_on = make_row("shibor_on", td, r.get("O/N-定价"))
        row_1w = make_row("shibor_1w", td, r.get("1W-定价"))
        if row_on:
            rows_on.append(row_on)
        if row_1w:
            rows_1w.append(row_1w)
    cnt_on = upsert_rows(rows_on)
    cnt_1w = upsert_rows(rows_1w)
    print(f"  ✅ shibor_on: {len(rows_on)} 条 -> 写入 {cnt_on}")
    print(f"  ✅ shibor_1w: {len(rows_1w)} 条 -> 写入 {cnt_1w}")
    return {"shibor_on": (len(rows_on), cnt_on), "shibor_1w": (len(rows_1w), cnt_1w)}

def collect_bond_yield():
    """中国10年期国债收益率（CN）和美国10年期（US）"""
    print("采集 cn_bond_10y / us_bond_10y ...")
    df = ak.bond_zh_us_rate()
    rows_cn, rows_us = [], []
    for _, r in df.iterrows():
        td = str(r["日期"])[:10]
        row_cn = make_row("cn_bond_10y", td, r.get("中国国债收益率10年"), region="CN")
        row_us = make_row("us_bond_10y", td, r.get("美国国债收益率10年"), region="US")
        if row_cn:
            rows_cn.append(row_cn)
        if row_us:
            rows_us.append(row_us)
    cnt_cn = upsert_rows(rows_cn)
    cnt_us = upsert_rows(rows_us)
    print(f"  ✅ cn_bond_10y: {len(rows_cn)} 条 -> 写入 {cnt_cn}")
    print(f"  ✅ us_bond_10y: {len(rows_us)} 条 -> 写入 {cnt_us}")
    return {"cn_bond_10y": (len(rows_cn), cnt_cn), "us_bond_10y": (len(rows_us), cnt_us)}

def collect_margin():
    """上海融资余额（margin_balance_sh）和深圳融资余额（margin_balance_sz）"""
    print("采集 margin_balance_sh ...")
    df_sh = ak.macro_china_market_margin_sh()
    # 列名：['日期','融资买入额','融资余额','融券卖出量','融券余量','融券余额','融资融券余额']
    rows_sh = []
    for _, r in df_sh.iterrows():
        td = str(r["日期"])[:10]
        row = make_row("margin_balance_sh", td, r.get("融资余额"))
        if row:
            rows_sh.append(row)
    cnt_sh = upsert_rows(rows_sh)
    print(f"  ✅ margin_balance_sh: {len(rows_sh)} 条 -> 写入 {cnt_sh}")

    print("采集 margin_balance_sz ...")
    df_sz = ak.macro_china_market_margin_sz()
    rows_sz = []
    for _, r in df_sz.iterrows():
        td = str(r["日期"])[:10]
        row = make_row("margin_balance_sz", td, r.get("融资余额"))
        if row:
            rows_sz.append(row)
    cnt_sz = upsert_rows(rows_sz)
    print(f"  ✅ margin_balance_sz: {len(rows_sz)} 条 -> 写入 {cnt_sz}")
    return {
        "margin_balance_sh": (len(rows_sh), cnt_sh),
        "margin_balance_sz": (len(rows_sz), cnt_sz),
    }

def collect_north_flow():
    """北向资金净流入（north_net_flow）"""
    print("采集 north_net_flow（数据量大，请稍候）...")
    df = ak.stock_hsgt_hist_em(symbol="北向资金")
    # 查看实际列名
    print(f"  列名: {df.columns.tolist()[:6]}")
    rows = []
    # 找净买入额字段
    net_col = None
    for col in ["当日净买额", "净买入额", "净流入", "净额"]:
        if col in df.columns:
            net_col = col
            break
    if net_col is None:
        # 打印前几列帮助诊断
        print(f"  ⚠️ 未找到净买入额字段，可用列: {df.columns.tolist()}")
        return {"north_net_flow": (0, 0)}
    for _, r in df.iterrows():
        td = str(r.get("日期", r.iloc[0]))[:10]
        row = make_row("north_net_flow", td, r.get(net_col))
        if row:
            rows.append(row)
    cnt = upsert_rows(rows)
    print(f"  ✅ north_net_flow: {len(rows)} 条 -> 写入 {cnt}")
    return {"north_net_flow": (len(rows), cnt)}

def collect_market_valuation():
    """市场估值：沪深300 PE/PB，全A PE"""
    results = {}

    # 沪深300 PE/PB
    print("采集 hs300_pe / hs300_pb ...")
    df300 = ak.stock_index_pe_lg(symbol="沪深300")
    # 列名：['日期','指数','等权静态市盈率','静态市盈率','静态市盈率中位数','等权滚动市盈率','滚动市盈率','滚动市盈率中位数']
    rows_pe, rows_pb = [], []
    for _, r in df300.iterrows():
        td = str(r["日期"])[:10]
        # 用滚动市盈率（TTM PE）
        row_pe = make_row("hs300_pe", td, r.get("滚动市盈率"))
        if row_pe:
            rows_pe.append(row_pe)
        # PB 不在此接口，暂跳过（需要另找）
    cnt_pe = upsert_rows(rows_pe)
    print(f"  ✅ hs300_pe: {len(rows_pe)} 条 -> 写入 {cnt_pe}")
    results["hs300_pe"] = (len(rows_pe), cnt_pe)

    # 全A PE（上证平均市盈率作为代理）
    print("采集 all_a_pe ...")
    df_sh = ak.stock_market_pe_lg(symbol="上证")
    # 列名：['日期','指数','平均市盈率']
    rows_all_pe = []
    for _, r in df_sh.iterrows():
        td = str(r["日期"])[:10]
        row = make_row("all_a_pe", td, r.get("平均市盈率"))
        if row:
            rows_all_pe.append(row)
    cnt_all_pe = upsert_rows(rows_all_pe)
    print(f"  ✅ all_a_pe: {len(rows_all_pe)} 条 -> 写入 {cnt_all_pe}")
    results["all_a_pe"] = (len(rows_all_pe), cnt_all_pe)

    return results

def collect_unemployment():
    """城镇调查失业率（网络较慢，加超时保护）"""
    print("采集 unemployment_rate ...")
    try:
        import signal
        def handler(signum, frame):
            raise TimeoutError("接口超时")
        signal.signal(signal.SIGALRM, handler)
        signal.alarm(60)  # 60秒超时
        df = ak.macro_china_urban_unemployment()
        signal.alarm(0)
        print(f"  列名: {df.columns.tolist()}")
        rows = []
        for _, r in df.iterrows():
            td = None
            for col in ["日期", "月份", "时间"]:
                if col in df.columns:
                    raw = str(r[col])
                    td = month_to_date(raw) or raw[:10]
                    break
            if not td:
                td = str(r.iloc[0])[:10]
            val = None
            for col in ["数据", "失业率", "城镇调查失业率", "今值"]:
                if col in df.columns:
                    val = r.get(col)
                    break
            if val is None:
                val = r.iloc[1]
            row = make_row("unemployment_rate", td, val)
            if row:
                rows.append(row)
        cnt = upsert_rows(rows)
        print(f"  ✅ unemployment_rate: {len(rows)} 条 -> 写入 {cnt}")
        return {"unemployment_rate": (len(rows), cnt)}
    except Exception as e:
        print(f"  ⚠️  unemployment_rate 采集失败（跳过）: {e}")
        return {"unemployment_rate": (0, 0)}

# ── 主流程 ────────────────────────────────────────────────────
if __name__ == "__main__":
    if DRY_RUN:
        print("=== DRY RUN 模式（不写入数据库）===\n")
    else:
        print("=== 开始采集剩余宏观指标 ===\n")

    all_results = {}
    start = time.time()

    # 按耗时从短到长
    all_results.update(collect_cpi_mom())
    all_results.update(collect_m2_level())
    all_results.update(collect_social_finance())
    all_results.update(collect_social_finance_yoy())
    all_results.update(collect_lpr_5y())
    all_results.update(collect_gdp_extended())
    all_results.update(collect_shibor())
    all_results.update(collect_bond_yield())
    all_results.update(collect_margin())
    all_results.update(collect_market_valuation())
    all_results.update(collect_north_flow())
    all_results.update(collect_unemployment())

    elapsed = time.time() - start
    print(f"\n=== 最终汇总（耗时 {elapsed:.0f}s）===")
    total_fetched = total_written = 0
    for iid, (fetched, written) in sorted(all_results.items()):
        status = "✅" if written > 0 or DRY_RUN else "❌"
        print(f"  {status} {iid:<35} 获取 {fetched:>5}  写入 {written:>5}")
        total_fetched += fetched
        total_written += written
    print(f"  合计: 获取 {total_fetched}，写入 {total_written}")
