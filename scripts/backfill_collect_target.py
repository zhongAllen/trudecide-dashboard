"""
backfill_collect_target.py
REQ-135: 将 DataAdmin.tsx 中的硬编码数据源配置回填到 collect_target 表的新字段中。
一次性脚本，幂等（使用 upsert on_conflict='module'）。
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ozwgqdcqtkdprvhuacjk.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 完整的数据源配置（来自 DataAdmin.tsx DATA_GROUPS，逐条对应 collect_target.module）
SOURCES = [
    # ── 宏观指标 ──────────────────────────────────────────────────────────────
    {
        "module": "macro_indicator_meta",
        "label": "指标元数据",
        "group_id": "macro",
        "group_label": "宏观指标",
        "description": "所有宏观指标的静态属性定义（名称/单位/来源/频率）",
        "table_name": "indicator_meta",
        "date_field": None,
        "req_id": "REQ-029",
        "schedule_desc": "手动维护",
        "is_active": True,
    },
    {
        "module": "macro_indicator_values",
        "label": "宏观指标数值",
        "group_id": "macro",
        "group_label": "宏观指标",
        "description": "全球24国宏观时序数据（GDP/CPI/PPI/PMI/M2/政策利率/汇率等）",
        "table_name": "indicator_values",
        "date_field": "trade_date",
        "req_id": "REQ-029/031",
        "schedule_desc": "每月1日自动更新",
        "is_active": True,
    },
    # ── 行情数据 ──────────────────────────────────────────────────────────────
    {
        "module": "index_daily",
        "label": "指数日线行情",
        "group_id": "market",
        "group_label": "行情数据",
        "description": "A股全量指数（SSE/SZSE/CSI/SW约5000+）+ 国际主要指数（12个）",
        "table_name": "index_daily",
        "date_field": "trade_date",
        "req_id": "REQ-064",
        "schedule_desc": "每交易日收盘后自动更新",
        "is_active": True,
    },
    {
        "module": "stock_daily",
        "label": "个股日线行情",
        "group_id": "market",
        "group_label": "行情数据",
        "description": "A股个股OHLCV日线数据（全市场约5000只）",
        "table_name": "stock_daily",
        "date_field": "trade_date",
        "req_id": "REQ-048",
        "schedule_desc": "每交易日收盘后自动更新",
        "is_active": True,
    },
    {
        "module": "stock_daily_basic",
        "label": "个股每日估值",
        "group_id": "market",
        "group_label": "行情数据",
        "description": "PE/PB/市值/换手率等每日估值指标（全市场）",
        "table_name": "stock_daily_basic",
        "date_field": "trade_date",
        "req_id": "REQ-049",
        "schedule_desc": "每交易日收盘后自动更新",
        "is_active": True,
    },
    {
        "module": "sector_daily",
        "label": "板块/概念日线",
        "group_id": "market",
        "group_label": "行情数据",
        "description": "行业板块、概念板块、通达信/东方财富指数日线行情",
        "table_name": "sector_daily",
        "date_field": "trade_date",
        "req_id": "REQ-058",
        "schedule_desc": "每交易日收盘后自动更新",
        "is_active": True,
    },
    {
        "module": "stock_moneyflow",
        "label": "个股资金流向",
        "group_id": "market",
        "group_label": "行情数据",
        "description": "个股大/中/小单资金流向（东方财富/同花顺双源）",
        "table_name": "stock_moneyflow",
        "date_field": "trade_date",
        "req_id": "REQ-054",
        "schedule_desc": "每交易日收盘后自动更新",
        "is_active": True,
    },
    # ── 财务数据 ──────────────────────────────────────────────────────────────
    {
        "module": "stock_income",
        "label": "利润表",
        "group_id": "financial",
        "group_label": "财务数据",
        "description": "全市场A股历史利润表（85字段全存）",
        "table_name": "stock_income",
        "date_field": "end_date",
        "req_id": "REQ-050",
        "schedule_desc": "每季报季更新（3/4/8/10月）",
        "is_active": True,
    },
    {
        "module": "stock_balance",
        "label": "资产负债表",
        "group_id": "financial",
        "group_label": "财务数据",
        "description": "全市场A股历史资产负债表（152字段全存）",
        "table_name": "stock_balance",
        "date_field": "end_date",
        "req_id": "REQ-051",
        "schedule_desc": "每季报季更新（3/4/8/10月）",
        "is_active": True,
    },
    {
        "module": "stock_cashflow",
        "label": "现金流量表",
        "group_id": "financial",
        "group_label": "财务数据",
        "description": "全市场A股历史现金流量表（97字段全存）",
        "table_name": "stock_cashflow",
        "date_field": "end_date",
        "req_id": "REQ-052",
        "schedule_desc": "每季报季更新（3/4/8/10月）",
        "is_active": True,
    },
    {
        "module": "stock_fina_indicator",
        "label": "财务指标（衍生）",
        "group_id": "financial",
        "group_label": "财务数据",
        "description": "ROE/毛利率/资产负债率/FCF等108个衍生财务指标（含TTM/单季）",
        "table_name": "stock_fina_indicator",
        "date_field": "end_date",
        "req_id": "REQ-053",
        "schedule_desc": "每季报季更新（3/4/8/10月）",
        "is_active": True,
    },
    # ── 新闻/公告 ──────────────────────────────────────────────────────────────
    {
        "module": "news",
        "label": "新闻快讯",
        "group_id": "news",
        "group_label": "新闻/公告",
        "description": "9大来源新闻（新浪/华尔街见闻/同花顺/东方财富/财联社/第一财经等）",
        "table_name": "news",
        "date_field": "pub_time",
        "req_id": "REQ-065",
        "schedule_desc": "每日两次增量更新",
        "is_active": True,
    },
    {
        "module": "stock_announcement",
        "label": "上市公司公告",
        "group_id": "news",
        "group_label": "新闻/公告",
        "description": "全市场A股上市公司公告（含年报/季报/重大事项）",
        "table_name": "stock_announcement",
        "date_field": "ann_date",
        "req_id": "REQ-066",
        "schedule_desc": "每日增量更新",
        "is_active": True,
    },
    {
        "module": "cctv_news",
        "label": "新闻联播文字稿",
        "group_id": "news",
        "group_label": "新闻/公告",
        "description": "央视新闻联播文字稿（政策信号分析用）",
        "table_name": "cctv_news",
        "date_field": "date",
        "req_id": "REQ-067",
        "schedule_desc": "每日增量更新",
        "is_active": True,
    },
    # ── 研报/荐股 ──────────────────────────────────────────────────────────────
    {
        "module": "broker_recommend",
        "label": "券商月度金股",
        "group_id": "research",
        "group_label": "研报/荐股",
        "description": "各大券商每月推荐的重点股票（月度金股池）",
        "table_name": "broker_recommend",
        "date_field": "month",
        "req_id": "REQ-069",
        "schedule_desc": "每月初自动更新",
        "is_active": True,
    },
    {
        "module": "reports_eastmoney",
        "label": "券商研究报告",
        "group_id": "research",
        "group_label": "研报/荐股",
        "description": "个股/行业/宏观研报（三层宽表：原始信息+AI提取+回测验证）",
        "table_name": "reports",
        "date_field": "publish_date",
        "req_id": "REQ-076",
        "schedule_desc": "每日09:00增量采集",
        "is_active": True,
    },
    # ── 事件日历 ──────────────────────────────────────────────────────────────
    {
        "module": "economic_events",
        "label": "Forex Factory 经济日历",
        "group_id": "calendar",
        "group_label": "事件日历",
        "description": "全球重要经济事件（非农/CPI/央行会议等），含重要性等级和预期值",
        "table_name": "economic_events",
        "date_field": "event_timestamp",
        "req_id": "REQ-044~047",
        "schedule_desc": "每日08:00自动更新本周数据",
        "is_active": True,
    },
    # ── 个股事件（REQ-063 新增）──────────────────────────────────────────────
    {
        "module": "stock_holders",
        "label": "前十大流通股东",
        "group_id": "stock_events",
        "group_label": "个股事件",
        "description": "每季度末前十大流通股东持股情况，含持股比例、变动和股东类型",
        "table_name": "stock_holders",
        "date_field": "end_date",
        "req_id": "REQ-063",
        "schedule_desc": "每季报季更新（3/4/8/10月）",
        "is_active": True,
    },
    {
        "module": "stock_pledge",
        "label": "股权质押统计",
        "group_id": "stock_events",
        "group_label": "个股事件",
        "description": "上市公司股权质押情况（质押比例/质押股数/质押方）",
        "table_name": "stock_pledge",
        "date_field": "end_date",
        "req_id": "REQ-063",
        "schedule_desc": "每季报季更新",
        "is_active": True,
    },
    {
        "module": "stock_holder_trade",
        "label": "重要股东增减持",
        "group_id": "stock_events",
        "group_label": "个股事件",
        "description": "董监高及5%以上股东的增持/减持公告（含变动股数和金额）",
        "table_name": "stock_holder_trade",
        "date_field": "ann_date",
        "req_id": "REQ-063",
        "schedule_desc": "每日增量更新",
        "is_active": True,
    },
]

def main():
    print(f"开始回填 collect_target 表，共 {len(SOURCES)} 条记录...")
    success = 0
    errors = 0

    for src in SOURCES:
        try:
            # 只更新新字段，不覆盖原有的 target_value/target_logic 等字段
            r = sb.table("collect_target").update({
                "label": src["label"],
                "group_id": src["group_id"],
                "group_label": src["group_label"],
                "description": src["description"],
                "table_name": src["table_name"],
                "date_field": src["date_field"],
                "req_id": src["req_id"],
                "schedule_desc": src["schedule_desc"],
                "is_active": src["is_active"],
            }).eq("module", src["module"]).execute()

            if r.data:
                print(f"  ✓ 更新: {src['module']} → [{src['group_label']}] {src['label']}")
                success += 1
            else:
                # 记录不存在，执行 insert
                from datetime import date
                r2 = sb.table("collect_target").insert({
                    "module": src["module"],
                    "version": 1,
                    "target_logic": f"初始配置（{src['label']}）",
                    "target_value": None,
                    "effective_from": str(date.today()),
                    **{k: src[k] for k in ["label","group_id","group_label","description",
                                           "table_name","date_field","req_id","schedule_desc","is_active"]},
                }).execute()
                print(f"  + 新增: {src['module']} → [{src['group_label']}] {src['label']}")
                success += 1
        except Exception as e:
            print(f"  ✗ 失败: {src['module']} → {e}")
            errors += 1

    print(f"\n完成！成功: {success}，失败: {errors}")

if __name__ == "__main__":
    main()
