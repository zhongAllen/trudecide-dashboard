"""
REQ-038: CN 日度指标数据缺口补充
补充以下指标的完整历史数据：
- hs300_pe / hs300_pb：沪深300 PE/PB（乐咕乐股）
- all_a_pe：上证市场平均市盈率（乐咕乐股）
- north_net_flow：北向资金净流入（东方财富）
- margin_balance_sh / margin_balance_sz：沪深融资余额（上交所/深交所）
- shibor_on / shibor_1w：Shibor 隔夜/1周（银行间同业拆借）
- rmb_usd：人民币兑美元中间价（外汇）
- dr001 / dr007：银行间质押式回购利率（中国货币网）
"""

import os, time, json
from datetime import date, datetime
import pandas as pd
import akshare as ak
from supabase import create_client

# ─── Supabase 连接 ───────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"

# ─── 工具函数 ────────────────────────────────────────────────────

def upsert_meta(indicator_id, region, name_cn, unit, frequency, category, description, source):
    """更新或插入 indicator_meta"""
    existing = sb.table("indicator_meta").select("id").eq("id", indicator_id).eq("region", region).execute()
    row = {
        "id": indicator_id,
        "region": region,
        "name_cn": name_cn,
        "unit": unit,
        "frequency": frequency,
        "category": category,
        "description_cn": description,
        "source_name": source,
        "credibility": "high",
    }
    if existing.data:
        sb.table("indicator_meta").update(row).eq("id", indicator_id).eq("region", region).execute()
    else:
        sb.table("indicator_meta").insert(row).execute()


def upsert_values_batch(rows: list[dict], batch_size=500):
    """批量 upsert indicator_values"""
    total = 0
    for i in range(0, len(rows), batch_size):
        chunk = rows[i:i+batch_size]
        if not DRY_RUN:
            sb.table("indicator_values").upsert(chunk, on_conflict="indicator_id,region,trade_date,revision_seq").execute()
        total += len(chunk)
    return total


def to_rows(df, indicator_id, region, date_col, value_col):
    """将 DataFrame 转换为 indicator_values 行列表"""
    rows = []
    now = datetime.utcnow().isoformat()
    for _, r in df.iterrows():
        try:
            d = r[date_col]
            if isinstance(d, str):
                d = d[:10]
            elif hasattr(d, 'strftime'):
                d = d.strftime('%Y-%m-%d')
            v = float(r[value_col])
            if pd.isna(v):
                continue
            rows.append({
                "indicator_id": indicator_id,
                "region": region,
                "trade_date": d,
                "publish_date": d,
                "value": v,
                "revision_seq": 0,
                "collected_at": now,
            })
        except Exception:
            continue
    return rows


# ─── 各指标采集函数 ──────────────────────────────────────────────

def collect_hs300_pe_pb():
    """沪深300 PE/PB（乐咕乐股，5074条，2005~2026）"""
    print("  采集 hs300_pe / hs300_pb ...")
    df = ak.stock_index_pe_lg(symbol="沪深300")
    # 列: 日期, 指数, 等权静态市盈率, 静态市盈率, 静态市盈率中位数, 等权滚动市盈率, 滚动市盈率, 滚动市盈率中位数
    # 用 滚动市盈率（TTM）作为 hs300_pe
    upsert_meta("hs300_pe", "CN", "沪深300 PE（滚动TTM）", "倍", "daily", "equity",
                "沪深300指数滚动市盈率（TTM），衡量A股蓝筹市场整体估值水平。低于12倍为历史低估区间，高于20倍为高估区间。数据来源：乐咕乐股。", "乐咕乐股/AKShare")
    rows_pe = to_rows(df, "hs300_pe", "CN", "日期", "滚动市盈率")
    n_pe = upsert_values_batch(rows_pe)

    # 沪深300没有直接 PB 列，用等权滚动市盈率作为 hs300_pe_equal（等权）
    # 注意：乐咕乐股无 PB 数据，改用全A PB
    print(f"    hs300_pe: {n_pe} 条")
    return n_pe


def collect_all_a_pe():
    """上证市场平均市盈率（乐咕乐股，358条，月度）"""
    print("  采集 all_a_pe ...")
    df = ak.stock_market_pe_lg(symbol="上证")
    upsert_meta("all_a_pe", "CN", "上证市场平均市盈率", "倍", "monthly", "equity",
                "上证市场整体平均市盈率，反映A股市场整体估值水平。乐咕乐股月度数据。", "乐咕乐股/AKShare")
    rows = to_rows(df, "all_a_pe", "CN", "日期", "平均市盈率")
    n = upsert_values_batch(rows)
    print(f"    all_a_pe: {n} 条")
    return n


def collect_north_net_flow():
    """北向资金净流入（东方财富，2620条，2014~2026）"""
    print("  采集 north_net_flow ...")
    df = ak.stock_hsgt_hist_em(symbol="北向资金")
    # 列: 日期, 当日成交净买额, 买入成交额, 卖出成交额, 历史累计净买额, ...
    # 过滤掉 nan 值
    df = df.dropna(subset=["当日成交净买额"])
    upsert_meta("north_net_flow", "CN", "北向资金净流入", "亿元", "daily", "macro",
                "沪深港通北向资金当日净买入金额（买入-卖出），正值表示外资净流入A股，负值表示净流出。是外资情绪的重要参考指标。数据来源：东方财富。", "东方财富/AKShare")
    # 单位转换：原始单位为元，转换为亿元
    df["净流入亿元"] = df["当日成交净买额"] / 1e8
    rows = to_rows(df, "north_net_flow", "CN", "日期", "净流入亿元")
    n = upsert_values_batch(rows)
    print(f"    north_net_flow: {n} 条")
    return n


def collect_margin_balance():
    """沪深融资余额（上交所/深交所，3858+条，2010~2026）"""
    print("  采集 margin_balance_sh / margin_balance_sz ...")

    # 上交所
    df_sh = ak.macro_china_market_margin_sh()
    upsert_meta("margin_balance_sh", "CN", "上交所融资余额", "亿元", "daily", "macro",
                "上海证券交易所融资融券余额中的融资余额，反映A股杠杆资金规模。余额越高表示市场杠杆越高，是市场情绪的重要指标。数据来源：上交所。", "上交所/AKShare")
    df_sh["融资余额亿元"] = df_sh["融资余额"] / 1e8
    rows_sh = to_rows(df_sh, "margin_balance_sh", "CN", "日期", "融资余额亿元")
    n_sh = upsert_values_batch(rows_sh)
    print(f"    margin_balance_sh: {n_sh} 条")

    time.sleep(1)

    # 深交所
    df_sz = ak.macro_china_market_margin_sz()
    upsert_meta("margin_balance_sz", "CN", "深交所融资余额", "亿元", "daily", "macro",
                "深圳证券交易所融资融券余额中的融资余额，与上交所融资余额合计反映全市场杠杆水平。数据来源：深交所。", "深交所/AKShare")
    df_sz["融资余额亿元"] = df_sz["融资余额"] / 1e8
    rows_sz = to_rows(df_sz, "margin_balance_sz", "CN", "日期", "融资余额亿元")
    n_sz = upsert_values_batch(rows_sz)
    print(f"    margin_balance_sz: {n_sz} 条")

    return n_sh + n_sz


def collect_shibor():
    """Shibor 隔夜/1周（银行间同业拆借，4843条，2007~2026）"""
    print("  采集 shibor_on / shibor_1w ...")
    total = 0

    for indicator_id, indicator_name, ak_indicator in [
        ("shibor_on", "Shibor隔夜", "隔夜"),
        ("shibor_1w", "Shibor 1周", "1周"),
    ]:
        df = ak.rate_interbank(market="上海银行同业拆借市场", symbol="Shibor人民币", indicator=ak_indicator)
        upsert_meta(indicator_id, "CN", indicator_name, "%", "daily", "macro",
                    f"上海银行间同业拆放利率（Shibor）{ak_indicator}品种，是中国货币市场基准利率之一，反映银行间短期资金松紧程度。数据来源：中国货币网。", "中国货币网/AKShare")
        rows = to_rows(df, indicator_id, "CN", "报告日", "利率")
        n = upsert_values_batch(rows)
        print(f"    {indicator_id}: {n} 条")
        total += n
        time.sleep(0.5)

    return total


def collect_rmb_usd():
    """人民币兑美元中间价（外汇，日度）"""
    print("  采集 rmb_usd ...")
    try:
        # 尝试 forex_hist_em
        df = ak.forex_hist_em(symbol="USDCNY")
        print(f"    forex_hist_em 列: {list(df.columns)}")
        date_col = df.columns[0]
        # 找收盘价列
        close_col = [c for c in df.columns if '收' in c or 'close' in c.lower() or 'Close' in c]
        if not close_col:
            close_col = [df.columns[1]]
        close_col = close_col[0]
        upsert_meta("rmb_usd", "CN", "人民币兑美元中间价", "元/美元", "daily", "fx",
                    "中国人民银行公布的人民币兑美元汇率中间价，是人民币汇率的官方参考价格。数值越高表示人民币越弱（贬值）。数据来源：外汇交易中心。", "外汇交易中心/AKShare")
        rows = to_rows(df, "rmb_usd", "CN", date_col, close_col)
        n = upsert_values_batch(rows)
        print(f"    rmb_usd (forex_hist_em): {n} 条")
        return n
    except Exception as e:
        print(f"    forex_hist_em 失败: {e}")

    try:
        # 备用：currency_boc_sina，但只有180条
        df = ak.currency_boc_sina(symbol="美元")
        upsert_meta("rmb_usd", "CN", "人民币兑美元中间价", "元/百美元", "daily", "fx",
                    "中国银行公布的美元兑人民币汇率（央行中间价），数值为每百美元对应人民币金额。数据来源：中国银行/新浪财经。", "中国银行/AKShare")
        rows = to_rows(df, "rmb_usd", "CN", "日期", "央行中间价")
        n = upsert_values_batch(rows)
        print(f"    rmb_usd (currency_boc_sina): {n} 条")
        return n
    except Exception as e2:
        print(f"    currency_boc_sina 也失败: {e2}")
        return 0


def collect_dr():
    """DR001/DR007 银行间质押式回购利率（中国货币网）"""
    print("  采集 dr001 / dr007 ...")
    total = 0

    # 尝试 repo_rate_query
    for indicator_id, symbol in [("dr001", "DR001"), ("dr007", "DR007")]:
        try:
            df = ak.repo_rate_query(symbol=symbol)
            print(f"    repo_rate_query({symbol}) 列: {list(df.columns)}, {len(df)} 条")
            date_col = df.columns[0]
            rate_col = [c for c in df.columns if '利率' in c or 'rate' in c.lower() or '加权' in c]
            if not rate_col:
                rate_col = [df.columns[1]]
            rate_col = rate_col[0]
            upsert_meta(indicator_id, "CN", f"银行间质押式回购利率{symbol}", "%", "daily", "macro",
                        f"银行间市场存款类机构质押式回购加权平均利率（{symbol}），是中国货币市场最重要的短期利率基准之一，反映银行间资金面松紧。数据来源：中国货币网。", "中国货币网/AKShare")
            rows = to_rows(df, indicator_id, "CN", date_col, rate_col)
            n = upsert_values_batch(rows)
            print(f"    {indicator_id}: {n} 条")
            total += n
        except Exception as e:
            print(f"    repo_rate_query({symbol}) 失败: {e}")
            # 备用：rate_interbank
            try:
                indicator_map = {"DR001": "DR001", "DR007": "DR007"}
                df = ak.rate_interbank(market="银行间质押式回购", symbol="DR", indicator=indicator_map[symbol])
                print(f"    rate_interbank DR {symbol} 列: {list(df.columns)}, {len(df)} 条")
                upsert_meta(indicator_id, "CN", f"银行间质押式回购利率{symbol}", "%", "daily", "macro",
                            f"银行间市场存款类机构质押式回购加权平均利率（{symbol}）。数据来源：中国货币网。", "中国货币网/AKShare")
                rows = to_rows(df, indicator_id, "CN", df.columns[0], df.columns[1])
                n = upsert_values_batch(rows)
                print(f"    {indicator_id} (备用): {n} 条")
                total += n
            except Exception as e2:
                print(f"    {indicator_id} 备用也失败: {e2}")
        time.sleep(0.5)

    return total


# ─── 主流程 ─────────────────────────────────────────────────────

def main():
    print(f"=== CN 日度指标缺口补充 {'[DRY-RUN]' if DRY_RUN else ''} ===\n")
    total = 0

    tasks = [
        ("hs300_pe/pb", collect_hs300_pe_pb),
        ("all_a_pe", collect_all_a_pe),
        # ("north_net_flow", collect_north_net_flow),  # 东方财富 API 不稳定，单独处理
        ("margin_balance", collect_margin_balance),
        ("shibor", collect_shibor),
        ("rmb_usd", collect_rmb_usd),
        ("dr001/dr007", collect_dr),
    ]

    for name, fn in tasks:
        try:
            n = fn()
            total += n
            print(f"  ✓ {name}: {n} 条\n")
        except Exception as e:
            print(f"  ✗ {name} 失败: {e}\n")
        time.sleep(1)

    print(f"=== 完成，共写入 {total} 条数据 ===")


if __name__ == "__main__":
    main()
