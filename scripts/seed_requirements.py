"""
seed_requirements.py
将现有需求文档解析为结构化需求条目，写入 requirements 表
基于 collect_macro_cn.py 的 Supabase 连接模式
"""
import os, requests, json, time

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates,return=minimal",
}

# ── 结构化需求条目 ─────────────────────────────────────────────
REQUIREMENTS = [

    # ── 数据采集需求文档 v6（多国指标 + 货币单位）data-collection-v3 ──
    {
        "id": "REQ-001",
        "doc_id": "data-collection-v3",
        "title": "支持多国宏观指标采集（G20 覆盖）",
        "description": "采集范围覆盖 CN/US/EU/DE/GB/JP/AU/CA/HK 等主要经济体，第二组通过 IMF/World Bank 补充年度数据",
        "status": "done",
        "priority": 1,
        "version": "v6",
    },
    {
        "id": "REQ-002",
        "doc_id": "data-collection-v3",
        "title": "indicator_id 命名规范统一",
        "description": "所有指标 ID 遵循 snake_case 命名，如 cpi_yoy / gdp_yoy / policy_rate，跨国通用",
        "status": "done",
        "priority": 1,
        "version": "v6",
    },
    {
        "id": "REQ-003",
        "doc_id": "data-collection-v3",
        "title": "indicator_meta 新增 currency 字段",
        "description": "用 ISO 4217 三字母货币代码标注货币单位，与 unit/scale 字段配合，描述原始数据格式",
        "status": "done",
        "priority": 1,
        "version": "v6",
    },
    {
        "id": "REQ-004",
        "doc_id": "data-collection-v3",
        "title": "时间字段统一为 date_value DATE 类型",
        "description": "所有指标统一使用 date_value 字段存储时间，月度数据取当月第一天，季度数据取季度第一天",
        "status": "done",
        "priority": 1,
        "version": "v6",
    },
    {
        "id": "REQ-005",
        "doc_id": "data-collection-v3",
        "title": "AKShare 无接口的国家通过 IMF API 补充",
        "description": "FR/IT/KR/IN/BR/RU/MX/ID/TR/SA/AR/ZA/NG 等国家使用 IMF Data API 采集年度 CPI/GDP/失业率/经常账户",
        "status": "in_progress",
        "priority": 2,
        "version": "v6",
    },
    {
        "id": "REQ-006",
        "doc_id": "data-collection-v3",
        "title": "台湾地区数据接入",
        "description": "AKShare 无专项接口，后续通过台湾主计总处 API 补充",
        "status": "open",
        "priority": 3,
        "version": "v6",
    },

    # ── 数据采集需求文档 v2（AKShare 公开版）data-collection-v2 ──
    {
        "id": "REQ-007",
        "doc_id": "data-collection-v2",
        "title": "宏观经济指标采集（GDP/CPI/PPI/PMI）",
        "description": "使用 AKShare 采集中国宏观经济四大指标，数据来源东方财富",
        "status": "done",
        "priority": 1,
        "version": "v2",
    },
    {
        "id": "REQ-008",
        "doc_id": "data-collection-v2",
        "title": "流动性与货币政策指标采集（M2/LPR/存准率/Shibor）",
        "description": "采集 M2、新增信贷、LPR（1Y/5Y）、存款准备金率、1周 Shibor",
        "status": "done",
        "priority": 1,
        "version": "v2",
    },
    {
        "id": "REQ-009",
        "doc_id": "data-collection-v2",
        "title": "利率与市场利差采集（中美国债收益率）",
        "description": "采集 10年期中美国债收益率，股债收益率差由前端计算，不单独采集",
        "status": "done",
        "priority": 2,
        "version": "v2",
    },
    {
        "id": "REQ-010",
        "doc_id": "data-collection-v2",
        "title": "北向资金净流入采集",
        "description": "使用 stock_hsgt_north_net_flow_in_em 接口（旧接口 stock_hsgt_hist_em 已废弃）",
        "status": "done",
        "priority": 2,
        "version": "v2",
    },
    {
        "id": "REQ-011",
        "doc_id": "data-collection-v2",
        "title": "沪深300 市盈率/市净率采集",
        "description": "使用 funddb 接口采集 hs300_pe / hs300_pb，每日频率",
        "status": "done",
        "priority": 2,
        "version": "v2",
    },
    {
        "id": "REQ-012",
        "doc_id": "data-collection-v2",
        "title": "融资融券余额采集（沪深两市）",
        "description": "采集 margin_balance_sh / margin_balance_sz，单位为元（原始数据），scale=0",
        "status": "done",
        "priority": 2,
        "version": "v2",
    },
    {
        "id": "REQ-013",
        "doc_id": "data-collection-v2",
        "title": "板块数据采集（行业/概念日线）",
        "description": "采集 sector_daily 和 sector_meta，覆盖申万行业和概念板块",
        "status": "in_progress",
        "priority": 2,
        "version": "v2",
    },
    {
        "id": "REQ-014",
        "doc_id": "data-collection-v2",
        "title": "个股日线数据采集",
        "description": "采集 stock_daily 和 stock_meta，使用 Tushare Pro 接口",
        "status": "open",
        "priority": 3,
        "version": "v2",
    },
]


def upsert_rows(table: str, rows: list, dry_run: bool = False) -> None:
    if dry_run:
        print(f"[DRY-RUN] {table}: {len(rows)} 条")
        for r in rows:
            print(f"  {r['id']} | {r['status']} | {r['title'][:40]}")
        return

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=HEADERS,
        json=rows,
        timeout=30,
    )
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"upsert {table} 失败: {resp.status_code} {resp.text}")
    print(f"[OK] {table}: {len(rows)} 条写入成功")


if __name__ == "__main__":
    import sys
    dry = "--dry-run" in sys.argv
    print(f"{'[DRY-RUN] ' if dry else ''}写入 {len(REQUIREMENTS)} 条需求...")
    upsert_rows("requirements", REQUIREMENTS, dry_run=dry)
    if not dry:
        print("迁移完成。")
