#!/usr/bin/env python3
"""
REQ-071: 个股基础信息采集 (stock_meta)
数据源: Tushare Pro stock_basic 接口
采集范围: 全量 A 股（上市 L + 退市 D + 暂停 P），约 5,500 条
采集方式: 一次性全量采集，upsert 模式（幂等）
字段映射:
  Tushare: ts_code, symbol, name, area, industry, market, list_date, list_status
  DB:      ts_code, symbol, name_cn, area, industry, market, list_date, delist_date, is_active
注意:
  - market 字段有 CHECK 约束: ('主板', '创业板', '科创板', '北交所', 'B股')
  - Tushare 返回的 market 值可能包含其他值（如 '中小板'），需要映射
  - is_active: list_status == 'L' 则为 true，否则 false
  - delist_date: Tushare 不直接返回，暂设为 NULL
"""

import os
import sys
import logging
import tushare as ts
import pandas as pd
import requests
from datetime import datetime

# ── 日志配置 ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/tmp/collect_stock_meta.log', mode='w'),
    ]
)
log = logging.getLogger(__name__)

# ── 环境变量 ──────────────────────────────────────────────────────────────────
TUSHARE_TOKEN    = os.environ['TUSHARE_TOKEN']
SUPABASE_URL     = os.environ['SUPABASE_URL']
SUPABASE_SVC_KEY = os.environ['SUPABASE_SERVICE_KEY']

# ── Tushare 初始化 ─────────────────────────────────────────────────────────────
pro = ts.pro_api(TUSHARE_TOKEN)

# ── Supabase REST 请求头 ───────────────────────────────────────────────────────
HEADERS = {
    'apikey': SUPABASE_SVC_KEY,
    'Authorization': f'Bearer {SUPABASE_SVC_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',  # upsert 模式
}

# ── market 字段映射（Tushare → DB CHECK 约束值）───────────────────────────────
MARKET_MAP = {
    '主板':   '主板',
    '中小板': '主板',   # 中小板已并入主板
    '创业板': '创业板',
    '科创板': '科创板',
    '北交所': '北交所',
    'B股':    'B股',
    '科创板B': '科创板',
}


def fetch_stock_basic(list_status: str) -> pd.DataFrame:
    """从 Tushare 获取指定状态的股票列表"""
    log.info(f"获取 list_status={list_status} 的股票列表...")
    df = pro.stock_basic(
        exchange='',
        list_status=list_status,
        fields='ts_code,symbol,name,area,industry,market,list_date,list_status'
    )
    log.info(f"  list_status={list_status}: {len(df)} 条")
    return df


def transform(df: pd.DataFrame) -> list[dict]:
    """将 Tushare 数据转换为 DB 格式"""
    rows = []
    for _, row in df.iterrows():
        market_raw = str(row.get('market') or '').strip()
        market_db = MARKET_MAP.get(market_raw)
        if market_db is None:
            # 未知 market 值，记录警告并跳过 CHECK 约束（设为 NULL 或 '主板'）
            log.warning(f"未知 market 值: '{market_raw}'，ts_code={row['ts_code']}，映射为 '主板'")
            market_db = '主板'

        list_date_raw = str(row.get('list_date') or '').strip()
        list_date = None
        if list_date_raw and len(list_date_raw) == 8:
            try:
                list_date = datetime.strptime(list_date_raw, '%Y%m%d').strftime('%Y-%m-%d')
            except ValueError:
                log.warning(f"无效 list_date: {list_date_raw}，ts_code={row['ts_code']}")

        is_active = str(row.get('list_status') or '').strip() == 'L'

        rows.append({
            'ts_code':    str(row['ts_code']).strip(),
            'symbol':     str(row['symbol']).strip(),
            'name_cn':    str(row['name']).strip(),
            'area':       str(row.get('area') or '').strip() or None,
            'industry':   str(row.get('industry') or '').strip() or None,
            'market':     market_db,
            'list_date':  list_date,
            'is_active':  is_active,
        })
    return rows


def upsert_batch(rows: list[dict], batch_size: int = 500) -> int:
    """批量 upsert 到 stock_meta 表"""
    total_upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        resp = requests.post(
            f'{SUPABASE_URL}/rest/v1/stock_meta',
            headers=HEADERS,
            json=batch,
        )
        if resp.ok:
            total_upserted += len(batch)
            log.info(f"  upsert 第 {i//batch_size + 1} 批 ({len(batch)} 条) 成功")
        else:
            log.error(f"  upsert 失败: {resp.status_code} - {resp.text[:300]}")
    return total_upserted


def verify():
    """验证采集结果"""
    from supabase import create_client
    sb = create_client(SUPABASE_URL, os.environ['SUPABASE_KEY'])
    r = sb.table('stock_meta').select('ts_code', count='exact').execute()
    total = r.count
    r_active = sb.table('stock_meta').select('ts_code', count='exact').eq('is_active', True).execute()
    active = r_active.count
    log.info(f"验收: stock_meta 总行数={total}, is_active=true 行数={active}")
    return total


def main():
    log.info("=== REQ-071: stock_meta 全量采集开始 ===")
    all_rows = []

    for status in ['L', 'D', 'P']:
        df = fetch_stock_basic(status)
        rows = transform(df)
        all_rows.extend(rows)

    log.info(f"总计转换 {len(all_rows)} 条记录，开始写入数据库...")
    upserted = upsert_batch(all_rows)
    log.info(f"写入完成，共 upsert {upserted} 条")

    total = verify()
    if total >= 5000:
        log.info(f"✅ 验收通过: stock_meta 共 {total} 条，满足 > 5000 的要求")
    else:
        log.error(f"❌ 验收失败: stock_meta 共 {total} 条，不满足 > 5000 的要求")

    log.info("=== REQ-071: stock_meta 全量采集完成 ===")


if __name__ == '__main__':
    main()
