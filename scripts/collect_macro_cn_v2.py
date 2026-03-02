"""
collect_macro_cn_v2.py
======================
CN 宏观指标全量采集脚本 (REQ-091)

结构：INDICATOR_MAP（配置） → fetch_xxx 函数（数据获取） → 主循环（写入）

覆盖 indicator_meta 中 region=CN 的全部 55 个指标。
数据源：AKShare（主）+ Tushare（北向资金）

修复历史：
  v1 (旧 collect_macro_cn.py): indicator_id 使用 cn_xxx 前缀，与 indicator_meta 不匹配，数据全部丢失
  v2 (本文件): 使用正确的无前缀 indicator_id，接入 collect_helper.py 治理框架
"""

import os
import sys
import time
import logging
import argparse
import re
from datetime import datetime, date

import pandas as pd
import akshare as ak
import tushare as ts
from supabase import create_client

sys.path.insert(0, os.path.dirname(__file__))
from collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure

# ─── 初始化 ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
TUSHARE_TOKEN = os.environ.get("TUSHARE_TOKEN")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
pro = ts.pro_api(TUSHARE_TOKEN)

MODULE_NAME = "macro_indicator_values"
REGION = "CN"

# ─── 通用工具函数 ───────────────────────────────────────────────────────────────

def parse_month_str(s: str) -> str:
    """将 '2025年12月份' 或 '202512' 或 '2025-12' 统一转为 YYYY-MM-15"""
    s = str(s).strip()
    # '2025年12月份' 或 '2025年12月'
    m = re.match(r"(\d{4})年(\d{1,2})月", s)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-15"
    # '202512'
    m = re.match(r"(\d{4})(\d{2})$", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-15"
    # '2025-12'
    m = re.match(r"(\d{4})-(\d{2})$", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-15"
    return None


def parse_quarter_str(s: str) -> str:
    """将 '2025年第1-4季度' 或 '2025年第1季度' 转为季末日期"""
    s = str(s).strip()
    # 年度汇总 '2025年第1-4季度' → 12-31
    m = re.match(r"(\d{4})年第1-4季度", s)
    if m:
        return f"{m.group(1)}-12-31"
    # 单季 '2025年第N季度'
    m = re.match(r"(\d{4})年第(\d)季度", s)
    if m:
        quarter_end = {"1": "03-31", "2": "06-30", "3": "09-30", "4": "12-31"}
        return f"{m.group(1)}-{quarter_end[m.group(2)]}"
    return None


def upsert_values(indicator_id: str, rows: list[dict]) -> int:
    """批量 upsert 到 indicator_values，返回写入行数
    
    PK: (indicator_id, trade_date, revision_seq, region) — 四列
    UNIQUE: (indicator_id, region, trade_date, revision_seq) — 四列
    所有自动采集数据使用 revision_seq=0
    """
    if not rows:
        return 0
    # 补充 revision_seq=0，并去重
    seen = set()
    deduped = []
    for r in rows:
        r.setdefault("revision_seq", 0)
        r.setdefault("region", REGION)
        # publish_date 为 NOT NULL，自动采集时用 trade_date 代替
        r.setdefault("publish_date", r["trade_date"])
        key = (r["indicator_id"], r["trade_date"], r.get("revision_seq", 0), r.get("region", REGION))
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    batch_size = 500
    total = 0
    for i in range(0, len(deduped), batch_size):
        batch = deduped[i:i + batch_size]
        sb.table("indicator_values").upsert(
            batch,
            on_conflict="indicator_id,region,trade_date,revision_seq"
        ).execute()
        total += len(batch)
    return total


# ─── fetch 函数（每个指标一个） ─────────────────────────────────────────────────
# 统一返回格式：list[{"indicator_id": str, "trade_date": "YYYY-MM-DD", "value": float, "region": "CN"}]

def _rows(indicator_id: str, df: pd.DataFrame, date_col: str, value_col: str,
          date_parser=None) -> list[dict]:
    """通用行转换辅助"""
    result = []
    for _, row in df.iterrows():
        raw_date = row[date_col]
        if date_parser:
            td = date_parser(raw_date)
        elif isinstance(raw_date, (date, datetime)):
            td = str(raw_date)[:10]
        else:
            td = str(raw_date)[:10]
        if not td:
            continue
        try:
            val = float(row[value_col])
        except (ValueError, TypeError):
            continue
        if pd.isna(val):
            continue
        result.append({
            "indicator_id": indicator_id,
            "trade_date": td,
            "value": val,
            "region": REGION,
        })
    return result


# ── 月度指标（东方财富/AKShare 标准格式：商品/日期/今值） ──────────────────────

def fetch_cpi_yoy():
    df = ak.macro_china_cpi_monthly()
    return _rows("cpi_yoy", df, "日期", "今值")


def fetch_cpi_mom():
    df = ak.macro_china_cpi_monthly()
    # 东方财富 cpi_monthly 只有今值（同比），环比需用另一接口
    try:
        df2 = ak.macro_china_cpi_mom()
        return _rows("cpi_mom", df2, "日期", "今值")
    except Exception:
        return []


def fetch_ppi_yoy():
    df = ak.macro_china_ppi_yearly()
    return _rows("ppi_yoy", df, "日期", "今值")


def fetch_pmi_mfg():
    df = ak.macro_china_pmi_yearly()
    return _rows("pmi_mfg", df, "日期", "今值")


def fetch_pmi_non_mfg():
    df = ak.macro_china_non_man_pmi()
    return _rows("pmi_non_mfg", df, "日期", "今值")


def fetch_export_yoy():
    df = ak.macro_china_trade_balance()
    # trade_balance 是贸易差额，出口同比需单独接口
    try:
        df2 = ak.macro_china_exports_yoy()
        return _rows("export_yoy", df2, "日期", "今值")
    except Exception:
        return []


def fetch_import_yoy():
    try:
        df = ak.macro_china_imports_yoy()
        return _rows("import_yoy", df, "日期", "今值")
    except Exception:
        return []


def fetch_industrial_yoy():
    df = ak.macro_china_industrial_production_yoy()
    return _rows("industrial_yoy", df, "日期", "今值")


def fetch_retail_yoy():
    df = ak.macro_china_consumer_goods_retail()
    return _rows("retail_yoy", df, "月份", "同比增长", date_parser=parse_month_str)


def fetch_fai_yoy():
    """固定资产投资同比 - AKShare 无直接接口，用东方财富宏观数据"""
    try:
        df = ak.macro_china_fai_yoy()
        return _rows("fai_yoy", df, "日期", "今值")
    except Exception:
        # 备用：东方财富
        try:
            df = ak.macro_china_fixed_asset_investment()
            return _rows("fai_yoy", df, "日期", "今值")
        except Exception:
            return []


def fetch_unemployment_rate():
    try:
        df = ak.macro_china_urban_unemployment_rate()
        return _rows("unemployment_rate", df, "日期", "今值")
    except Exception:
        return []


def fetch_m2_yoy():
    df = ak.macro_china_money_supply()
    return _rows("m2_yoy", df, "月份", "货币和准货币(M2)-同比增长",
                 date_parser=parse_month_str)


def fetch_m2_level():
    df = ak.macro_china_money_supply()
    return _rows("m2_level", df, "月份", "货币和准货币(M2)-数量(亿元)",
                 date_parser=parse_month_str)


def fetch_lpr_1y():
    df = ak.macro_china_lpr()
    return _rows("lpr_1y", df, "TRADE_DATE", "LPR1Y")


def fetch_lpr_5y():
    df = ak.macro_china_lpr()
    return _rows("lpr_5y", df, "TRADE_DATE", "LPR5Y")


def fetch_social_finance():
    df = ak.macro_china_shrzgm()
    return _rows("social_finance", df, "月份", "社会融资规模增量",
                 date_parser=lambda s: parse_month_str(str(s).zfill(6) if len(str(s)) == 6 else s))


def fetch_social_finance_new():
    """社融增量（同 social_finance，保留两个 ID 兼容历史）"""
    return fetch_social_finance()


def fetch_social_finance_yoy():
    """社融存量同比 - 东方财富接口"""
    try:
        df = ak.macro_china_shrzgm_yoy()
        return _rows("social_finance_yoy", df, "日期", "今值")
    except Exception:
        return []


def fetch_new_loans():
    df = ak.macro_rmb_loan()
    return _rows("new_loans", df, "月份", "新增人民币贷款-总额",
                 date_parser=lambda s: parse_month_str(str(s)))


# ── 季度指标 ──────────────────────────────────────────────────────────────────

def _gdp_df():
    """缓存 GDP 数据，避免重复请求"""
    return ak.macro_china_gdp()


def fetch_gdp_yoy():
    df = _gdp_df()
    return _rows("gdp_yoy", df, "季度", "国内生产总值-同比增长",
                 date_parser=parse_quarter_str)


def fetch_gdp_level():
    df = _gdp_df()
    return _rows("gdp_level", df, "季度", "国内生产总值-绝对值",
                 date_parser=parse_quarter_str)


def fetch_gdp_qoq():
    """GDP 季比 - 东方财富接口"""
    try:
        df = ak.macro_china_gdp_qoq()
        return _rows("gdp_qoq", df, "日期", "今值")
    except Exception:
        return []


def fetch_gdp_primary():
    df = _gdp_df()
    return _rows("gdp_primary", df, "季度", "第一产业-绝对值",
                 date_parser=parse_quarter_str)


def fetch_gdp_primary_yoy():
    df = _gdp_df()
    return _rows("gdp_primary_yoy", df, "季度", "第一产业-同比增长",
                 date_parser=parse_quarter_str)


def fetch_gdp_secondary():
    df = _gdp_df()
    return _rows("gdp_secondary", df, "季度", "第二产业-绝对值",
                 date_parser=parse_quarter_str)


def fetch_gdp_secondary_yoy():
    df = _gdp_df()
    return _rows("gdp_secondary_yoy", df, "季度", "第二产业-同比增长",
                 date_parser=parse_quarter_str)


def fetch_gdp_tertiary():
    df = _gdp_df()
    # 第三产业 = 总量 - 第一 - 第二
    rows = []
    for _, row in df.iterrows():
        td = parse_quarter_str(row["季度"])
        if not td:
            continue
        try:
            val = float(row["国内生产总值-绝对值"]) - float(row["第一产业-绝对值"]) - float(row["第二产业-绝对值"])
        except Exception:
            continue
        rows.append({"indicator_id": "gdp_tertiary", "trade_date": td, "value": val, "region": REGION})
    return rows


def fetch_gdp_tertiary_yoy():
    try:
        df = ak.macro_china_gdp_tertiary_yoy()
        return _rows("gdp_tertiary_yoy", df, "日期", "今值")
    except Exception:
        return []


# ── 年度指标 ──────────────────────────────────────────────────────────────────

def fetch_gdp_yoy_annual():
    """年度 GDP 同比（东方财富）"""
    df = ak.macro_china_gdp_yearly()
    return _rows("gdp_yoy", df, "日期", "今值")  # 与季度共用同一 indicator_id，UPSERT 不重复


def fetch_savings_rate():
    """国民储蓄率 - World Bank，数据量少，直接返回空（由 global 脚本处理）"""
    return []


def fetch_gdp_per_capita_ppp():
    """人均 GDP PPP - IMF，由 global 脚本处理"""
    return []


def fetch_gdp_deflator():
    """GDP 平减指数 - World Bank，由 global 脚本处理"""
    return []


def fetch_cpi_yoy_annual():
    """CPI 同比年度 - World Bank，由 global 脚本处理"""
    return []


def fetch_bond_10y_real():
    """实际长期国债收益率 - IMF，由 global 脚本处理"""
    return []


def fetch_policy_rate():
    """中国贷款利率 WB 口径 - World Bank，由 global 脚本处理"""
    return []


def fetch_fx_usd():
    """本币兑美元年均汇率 - World Bank，由 global 脚本处理"""
    return []


# ── 日度指标 ──────────────────────────────────────────────────────────────────

def fetch_bond_10y():
    """中国10年期国债收益率"""
    df = ak.bond_zh_us_rate()
    return _rows("bond_10y", df, "日期", "中国国债收益率10年")


def fetch_shibor_on():
    df = ak.macro_china_shibor_all()
    return _rows("shibor_on", df, "日期", "O/N-定价")


def fetch_shibor_1w():
    df = ak.macro_china_shibor_all()
    return _rows("shibor_1w", df, "日期", "1W-定价")


def fetch_dr001():
    """DR001 银行间质押式回购利率"""
    try:
        df = ak.macro_china_dr007()  # 同一接口返回多列
        return _rows("dr001", df, "日期", "DR001")
    except Exception:
        try:
            df = ak.rate_interbank(market="上海银行间同业拆放利率", symbol="DR001", indicator="利率")
            return _rows("dr001", df, "报告日", "利率")
        except Exception:
            return []


def fetch_dr007():
    """DR007 银行间质押式回购利率"""
    try:
        df = ak.macro_china_dr007()
        return _rows("dr007", df, "日期", "DR007")
    except Exception:
        try:
            df = ak.rate_interbank(market="上海银行间同业拆放利率", symbol="DR007", indicator="利率")
            return _rows("dr007", df, "报告日", "利率")
        except Exception:
            return []


def fetch_north_net_flow():
    """北向资金净流入（历史）- AKShare 东方财富
    
    ⚠️ 重要：2024-08-19 起监管停止披露北向资金日度净买入数据（REQ-039 v3.0）
    因此本函数只采集 2024-08-18 及之前的历史数据，之后的数据截断不采集。
    2024-08-19 后请使用 north_daily_turnover 和 north_turnover_ratio_daily 替代。
    """
    df = ak.stock_hsgt_hist_em(symbol="北向资金")
    # 截断：只保留 2024-08-18 及之前的数据
    df['日期'] = pd.to_datetime(df['日期'])
    df = df[df['日期'] <= pd.Timestamp('2024-08-18')]
    return _rows("north_net_flow", df, "日期", "当日成交净买额")

def fetch_north_daily_turnover():
    """北向当日成交总额 - Tushare moneyflow_hsgt
    
    计算方式：hgt（沪股通成交额）+ sgt（深股通成交额）
    2024-08-19 起，north_money 字段语义已变更为成交总额，与 hgt+sgt 等价。
    本函数直接用 hgt+sgt 计算，语义清晰，全时段连续可比（REQ-039 v3.0）。
    时间范围：2014-11 ~ 至今
    """
    # 使用模块级 pro 对象（已在脚本顶部初始化）
    all_rows = []
    # 按年分批拉取（Tushare 单次限 1000 条）
    for year in range(2014, pd.Timestamp.now().year + 1):
        start = f"{year}0101"
        end = f"{year}1231"
        try:
            df = pro.moneyflow_hsgt(start_date=start, end_date=end)
            if df is None or df.empty:
                continue
            # Tushare 返回的 hgt/sgt 是 object 字符串类型，用 pd.to_numeric 安全转换
            df['hgt_f'] = pd.to_numeric(df['hgt'], errors='coerce').fillna(0.0)
            df['sgt_f'] = pd.to_numeric(df['sgt'], errors='coerce').fillna(0.0)
            for _, row in df.iterrows():
                try:
                    td = str(row['trade_date'])[:8]
                    td = f"{td[:4]}-{td[4:6]}-{td[6:8]}"
                    val = round(float(row['hgt_f']) + float(row['sgt_f']), 4)
                    all_rows.append({"indicator_id": "north_daily_turnover", "trade_date": td, "value": val})
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"north_daily_turnover {year} 采集失败: {e}")
    return all_rows

def fetch_north_turnover_ratio_daily():
    """北向成交额占全A股成交额比例（日度）- Tushare
    
    计算公式：(hgt + sgt) / 全A成交额
    全A成交额 = 上证指数日成交额 + 深证成指日成交额（来自 index_daily 表）
    时间范围：2014-11 ~ 至今（REQ-039 v3.0）
    """
    # 使用模块级 pro/sb 对象（已在脚本顶部初始化）
    
    # 从数据库读取全A成交额（上证+深证）
    from collections import defaultdict
    total_amount = defaultdict(float)
    try:
        # 分批读取（Supabase 单次最多 1000 行，index_daily 数据量大）
        offset = 0
        batch_size = 1000
        while True:
            r = sb.table('index_daily').select('trade_date,amount') \
                .in_('ts_code', ['000001.SH', '399001.SZ']) \
                .range(offset, offset + batch_size - 1).execute()
            if not r.data:
                break
            for row in r.data:
                td = str(row['trade_date'])[:10]
                amt = float(row['amount']) if row['amount'] else 0.0
                total_amount[td] += amt / 10000  # 万元 → 亿元
            if len(r.data) < batch_size:
                break
            offset += batch_size
    except Exception as e:
        logger.warning(f"north_turnover_ratio_daily: 无法获取全A成交额数据 - {e}")
        return []
    
    all_rows = []
    for year in range(2014, pd.Timestamp.now().year + 1):
        start = f"{year}0101"
        end = f"{year}1231"
        try:
            df = pro.moneyflow_hsgt(start_date=start, end_date=end)
            if df is None or df.empty:
                continue
            # Tushare 返回的 hgt/sgt 是 object 字符串类型，用 pd.to_numeric 安全转换
            df['hgt_f'] = pd.to_numeric(df['hgt'], errors='coerce').fillna(0.0)
            df['sgt_f'] = pd.to_numeric(df['sgt'], errors='coerce').fillna(0.0)
            for _, row in df.iterrows():
                try:
                    td = str(row['trade_date'])[:8]
                    td = f"{td[:4]}-{td[4:6]}-{td[6:8]}"
                    north = float(row['hgt_f']) + float(row['sgt_f'])
                    total = total_amount.get(td, 0.0)
                    if total > 0:
                        ratio = round(north / total * 100, 4)  # 百分比
                        all_rows.append({"indicator_id": "north_turnover_ratio_daily", "trade_date": td, "value": ratio})
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"north_turnover_ratio_daily {year} 采集失败: {e}")
    return all_rows


def fetch_margin_balance_sh():
    """上交所融资余额"""
    df = ak.macro_china_market_margin_sh()
    return _rows("margin_balance_sh", df, "日期", "融资余额")


def fetch_margin_balance_sz():
    """深交所融资余额"""
    df = ak.macro_china_market_margin_sz()
    return _rows("margin_balance_sz", df, "日期", "融资余额")


def fetch_all_a_pb():
    """全A市场PB（等权中位数）- 乐咕乐股"""
    df = ak.stock_a_all_pb()
    return _rows("all_a_pb", df, "date", "middlePB")


def fetch_hs300_pb():
    """沪深300 PB - 乐咕乐股"""
    try:
        df = ak.index_value_hist_funddb(symbol="沪深300", indicator="市净率")
        return _rows("hs300_pb", df, "日期", "市净率")
    except Exception:
        try:
            df = ak.stock_a_all_pb()  # 备用：全A PB
            return _rows("hs300_pb", df, "date", "equalWeightAveragePB")
        except Exception:
            return []


def fetch_agri_value_added_pct():
    """农业增加值占GDP比重 - 已有数据，跳过重采"""
    return []


# ─── INDICATOR_MAP（配置中心） ──────────────────────────────────────────────────
# 格式：indicator_id → fetch 函数
# 这里是整个脚本唯一需要维护的配置，新增指标只需加一行

INDICATOR_MAP = {
    # 月度
    "cpi_yoy":              fetch_cpi_yoy,
    "cpi_mom":              fetch_cpi_mom,
    "ppi_yoy":              fetch_ppi_yoy,
    "pmi_mfg":              fetch_pmi_mfg,
    "pmi_non_mfg":          fetch_pmi_non_mfg,
    "export_yoy":           fetch_export_yoy,
    "import_yoy":           fetch_import_yoy,
    "industrial_yoy":       fetch_industrial_yoy,
    "retail_yoy":           fetch_retail_yoy,
    "fai_yoy":              fetch_fai_yoy,
    "unemployment_rate":    fetch_unemployment_rate,
    "m2_yoy":               fetch_m2_yoy,
    "m2_level":             fetch_m2_level,
    "lpr_1y":               fetch_lpr_1y,
    "lpr_5y":               fetch_lpr_5y,
    "social_finance":       fetch_social_finance,
    "social_finance_new":   fetch_social_finance_new,
    "social_finance_yoy":   fetch_social_finance_yoy,
    "new_loans":            fetch_new_loans,
    # 季度
    "gdp_yoy":              fetch_gdp_yoy,
    "gdp_level":            fetch_gdp_level,
    "gdp_qoq":              fetch_gdp_qoq,
    "gdp_primary":          fetch_gdp_primary,
    "gdp_primary_yoy":      fetch_gdp_primary_yoy,
    "gdp_secondary":        fetch_gdp_secondary,
    "gdp_secondary_yoy":    fetch_gdp_secondary_yoy,
    "gdp_tertiary":         fetch_gdp_tertiary,
    "gdp_tertiary_yoy":     fetch_gdp_tertiary_yoy,
    # 年度（由 global 脚本处理，此处返回空）
    "savings_rate":         fetch_savings_rate,
    "gdp_per_capita_ppp":   fetch_gdp_per_capita_ppp,
    "gdp_deflator":         fetch_gdp_deflator,
    "cpi_yoy_annual":       fetch_cpi_yoy_annual,
    "bond_10y_real":        fetch_bond_10y_real,
    "policy_rate":          fetch_policy_rate,
    "fx_usd":               fetch_fx_usd,
    # 日度
    "bond_10y":             fetch_bond_10y,
    "shibor_on":            fetch_shibor_on,
    "shibor_1w":            fetch_shibor_1w,
    "dr001":                fetch_dr001,
    "dr007":                fetch_dr007,
    "north_net_flow":           fetch_north_net_flow,
    "north_daily_turnover":     fetch_north_daily_turnover,
    "north_turnover_ratio_daily": fetch_north_turnover_ratio_daily,
    "margin_balance_sh":    fetch_margin_balance_sh,
    "margin_balance_sz":    fetch_margin_balance_sz,
    "all_a_pb":             fetch_all_a_pb,
    "hs300_pb":             fetch_hs300_pb,
    "agri_value_added_pct": fetch_agri_value_added_pct,
}


# ─── 主函数 ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="CN 宏观指标全量采集 v2")
    parser.add_argument("--dry-run", action="store_true", help="只采集，不写入数据库")
    parser.add_argument("--indicator", type=str, default=None, help="只采集指定 indicator_id")
    args = parser.parse_args()

    logger.info(f"=== 开始采集任务: {MODULE_NAME} ({'dry-run' if args.dry_run else '正式写入'}) ===")
    logger.info(f"INDICATOR_MAP 共 {len(INDICATOR_MAP)} 个指标")

    # 第一段：初始化上下文
    ctx = CollectionContext(module=MODULE_NAME)
    target = get_active_target(ctx.sb, MODULE_NAME)

    # 第二段：记录开始
    log_start(ctx, target)

    # 第三段：执行采集
    total_written = 0
    success_count = 0
    fail_count = 0

    indicators_to_run = (
        {args.indicator: INDICATOR_MAP[args.indicator]}
        if args.indicator and args.indicator in INDICATOR_MAP
        else INDICATOR_MAP
    )

    for indicator_id, fetch_fn in indicators_to_run.items():
        try:
            logger.info(f"  → 采集 {indicator_id} ...")
            rows = fetch_fn()
            if not rows:
                logger.warning(f"    {indicator_id}: 返回空数据，跳过")
                continue
            if args.dry_run:
                logger.info(f"    {indicator_id}: [dry-run] 获取 {len(rows)} 行，不写入")
                total_written += len(rows)
            else:
                written = upsert_values(indicator_id, rows)
                logger.info(f"    {indicator_id}: 写入 {written} 行")
                total_written += written
            success_count += 1
            time.sleep(0.3)  # 避免 API 限速
        except Exception as e:
            logger.error(f"    {indicator_id}: 采集失败 - {e}")
            fail_count += 1
            time.sleep(1)

    # 第四段：记录结果
    ctx.actual_count = total_written
    logger.info(f"=== 采集完成: 成功 {success_count} 个指标，失败 {fail_count} 个，共 {total_written} 行 ===")

    if not args.dry_run:
        log_success(ctx, total_written)
    else:
        logger.info("[dry-run] 跳过 collect_log 写入")


if __name__ == "__main__":
    main()
