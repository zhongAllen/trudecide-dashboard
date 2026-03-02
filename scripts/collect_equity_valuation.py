#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全球股市估值指标采集脚本 (REQ-032) - v1.0
==========================================
用途：通过 yfinance ETF 口径采集全球主要经济体的股市 PE/PB 估值指标。
      每日采集当日最新 PE/PB 快照，写入 indicator_values 表。

数据源：yfinance ETF（iShares 系列）
- 注意：ETF 口径 ≠ 本地指数口径，存在成分股差异，indicator_id 加 _etf 后缀区分
- indicator_id: equity_pe_etf, equity_pb_etf

执行方式：
  python3 collect_equity_valuation.py [--dry-run]

四段式结构（REQ-079 规范）：
  1. 初始化上下文
  2. 获取目标
  3. 执行采集
  4. 记录结果

踩坑记录：
  - yfinance 对指数（^N225 等）不提供聚合 PE/PB，必须用 ETF 代替（踩坑 #16）
  - 部分 ETF 的 PB（priceToBook）返回 None，属正常现象（如 INDA/MCHI/EIDO/THD）
  - yfinance .info 调用较慢，每个 ticker 约 1~2 秒，20 个国家约 30 秒
"""
import os
import sys
import time
import argparse
from datetime import date, datetime

import yfinance as yf
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
MODULE_NAME = "equity_valuation_etf"

# ETF 映射：region → (ticker, etf_name)
ETF_MAP = {
    'US': ('SPY',  'SPDR S&P 500 ETF'),
    'JP': ('EWJ',  'iShares MSCI Japan ETF'),
    'KR': ('EWY',  'iShares MSCI South Korea ETF'),
    'DE': ('EWG',  'iShares MSCI Germany ETF'),
    'FR': ('EWQ',  'iShares MSCI France ETF'),
    'IT': ('EWI',  'iShares MSCI Italy ETF'),
    'AU': ('EWA',  'iShares MSCI Australia ETF'),
    'CA': ('EWC',  'iShares MSCI Canada ETF'),
    'BR': ('EWZ',  'iShares MSCI Brazil ETF'),
    'MX': ('EWW',  'iShares MSCI Mexico ETF'),
    'ZA': ('EZA',  'iShares MSCI South Africa ETF'),
    'GB': ('EWU',  'iShares MSCI United Kingdom ETF'),
    'IN': ('INDA', 'iShares MSCI India ETF'),
    'CN': ('MCHI', 'iShares MSCI China ETF'),
    'HK': ('EWH',  'iShares MSCI Hong Kong ETF'),
    'SG': ('EWS',  'iShares MSCI Singapore ETF'),
    'TW': ('EWT',  'iShares MSCI Taiwan ETF'),
    'ID': ('EIDO', 'iShares MSCI Indonesia ETF'),
    'MY': ('EWM',  'iShares MSCI Malaysia ETF'),
    'TH': ('THD',  'iShares MSCI Thailand ETF'),
}

# indicator_meta 定义
INDICATOR_META = [
    {
        'id': 'equity_pe_etf',
        'name_cn': '全球股市市盈率（ETF口径）',
        'description_cn': '各国主要股市市盈率（PE），通过 iShares ETF 代理，ETF口径与本地指数存在成分股差异。每日快照。',
        'category': 'equity',
        'unit': '倍',
        'source_name': 'Yahoo Finance (yfinance)',
        'source_url': 'https://finance.yahoo.com',
        'credibility': 'medium',
        'frequency': 'daily',
        'value_type': 'ratio',
        'scale': '1',
    },
    {
        'id': 'equity_pb_etf',
        'name_cn': '全球股市市净率（ETF口径）',
        'description_cn': '各国主要股市市净率（PB），通过 iShares ETF 代理，ETF口径与本地指数存在成分股差异。每日快照。',
        'category': 'equity',
        'unit': '倍',
        'source_name': 'Yahoo Finance (yfinance)',
        'source_url': 'https://finance.yahoo.com',
        'credibility': 'medium',
        'frequency': 'daily',
        'value_type': 'ratio',
        'scale': '1',
    },
]

# ── 初始化上下文 ──────────────────────────────────────────────────────────────
def init_context():
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_KEY')
    if not url or not key:
        raise RuntimeError('SUPABASE_URL / SUPABASE_KEY 未设置')
    sb = create_client(url, key)
    return sb

# ── upsert indicator_meta ─────────────────────────────────────────────────────
def upsert_indicator_meta(sb, regions):
    """为所有目标 region 写入 indicator_meta"""
    rows = []
    for meta in INDICATOR_META:
        for region in regions:
            rows.append({**meta, 'region': region})
    # 分批 upsert
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        sb.table('indicator_meta').upsert(
            batch,
            on_conflict='id,region'
        ).execute()
    print(f'  indicator_meta upsert 完成: {len(rows)} 条')

# ── 采集核心逻辑 ──────────────────────────────────────────────────────────────
def fetch_all_etf_valuation():
    """获取所有 ETF 的 PE/PB 数据，返回 {region: {pe, pb}} 字典"""
    results = {}
    for region, (ticker, etf_name) in ETF_MAP.items():
        try:
            info = yf.Ticker(ticker).info
            pe = info.get('trailingPE') or info.get('forwardPE')
            pb = info.get('priceToBook')
            results[region] = {'pe': pe, 'pb': pb, 'ticker': ticker}
            status = '✅' if (pe or pb) else '⚠️ '
            print(f'  {status} {region} ({ticker}): PE={round(pe,2) if pe else None}, PB={round(pb,2) if pb else None}')
            time.sleep(0.3)
        except Exception as e:
            print(f'  ❌ {region} ({ticker}): {str(e)[:80]}')
            results[region] = {'pe': None, 'pb': None, 'ticker': ticker}
    return results

# ── 写入数据库 ────────────────────────────────────────────────────────────────
def upsert_values(sb, etf_data, today_str, dry_run=False):
    """将 PE/PB 数据写入 indicator_values"""
    rows = []
    for region, data in etf_data.items():
        pe = data.get('pe')
        pb = data.get('pb')
        if pe is not None:
            rows.append({
                'indicator_id': 'equity_pe_etf',
                'region': region,
                'trade_date': today_str,
                'publish_date': today_str,
                'value': round(float(pe), 4),
                'revision_seq': 0,
            })
        if pb is not None:
            rows.append({
                'indicator_id': 'equity_pb_etf',
                'region': region,
                'trade_date': today_str,
                'publish_date': today_str,
                'value': round(float(pb), 4),
                'revision_seq': 0,
            })

    if dry_run:
        print(f'  [dry-run] 待写入 {len(rows)} 行')
        for r in rows[:5]:
            print(f'    {r}')
        return len(rows)

    if not rows:
        print('  无数据可写入')
        return 0

    # 分批 upsert
    batch_size = 100
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        resp = sb.table('indicator_values').upsert(
            batch,
            on_conflict='indicator_id,region,trade_date,revision_seq'
        ).execute()
        total += len(resp.data)
    print(f'  写入 {total} 行到 indicator_values')
    return total

# ── 主函数 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='全球股市估值 ETF 采集脚本 (REQ-032)')
    parser.add_argument('--dry-run', action='store_true', help='只打印，不写库')
    args = parser.parse_args()

    today_str = date.today().isoformat()
    print(f'=== 全球股市估值采集 (REQ-032) | {today_str} | dry_run={args.dry_run} ===')

    # 1. 初始化上下文
    sb = init_context()
    regions = list(ETF_MAP.keys())
    print(f'目标国家/地区: {len(regions)} 个')

    # 2. upsert indicator_meta
    if not args.dry_run:
        upsert_indicator_meta(sb, regions)

    # 3. 执行采集
    print('开始采集 ETF PE/PB 数据...')
    etf_data = fetch_all_etf_valuation()

    success_count = sum(1 for v in etf_data.values() if v['pe'] or v['pb'])
    print(f'采集完成: {success_count}/{len(regions)} 个国家有数据')

    # 4. 写入数据库
    written = upsert_values(sb, etf_data, today_str, dry_run=args.dry_run)

    # 5. 写入 collect_log
    if not args.dry_run:
        try:
            from collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure
            ctx = CollectionContext(sb, MODULE_NAME)
            target = get_active_target(ctx)
            log_id = log_start(ctx, target)
            target_count = len(regions) * 2  # PE + PB
            log_success(ctx, log_id, target_count=target_count, actual_count=written)
        except Exception as e:
            print(f'  collect_log 写入失败（非致命）: {e}')

    print(f'=== 完成 | 写入 {written} 行 ===')

if __name__ == '__main__':
    main()
