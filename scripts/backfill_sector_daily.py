#!/usr/bin/env python3
"""
sector_daily 历史回填脚本（重构版）

设计原则（踩坑 #14 教训）：
  - ths：按「板块」为外层循环，每个板块一次拉全量历史数据
          → 1236 次请求搞定全部 ths 历史，约 20 分钟
  - dc ：按「日期」为外层循环，每天一次拉全部 dc 板块
          → 825 次请求搞定全部 dc 历史，约 5 分钟
  - 完全不依赖 trade_cal 接口（踩坑 #14）
  - 法定节假日由 API 返回空自动兜底
  - 支持断点续传（ths 按板块断点，dc 按日期断点）
"""
import os
import sys
import time
import math
import argparse
import pandas as pd
from datetime import datetime, timedelta
from supabase import create_client
import tushare as ts

# ── 配置 ──────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN = os.environ.get('TUSHARE_TOKEN', '')
SUPABASE_URL  = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY  = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_KEY', '')

BATCH_SIZE    = 500   # 单次 upsert 行数
API_SLEEP     = 0.3   # dc 接口间隔（秒）
THS_SLEEP     = 0.5   # ths 接口间隔（秒）

# 断点文件（ths 和 dc 分开）
THS_CHECKPOINT = '/tmp/sector_daily_ths_checkpoint.txt'
DC_CHECKPOINT  = '/tmp/sector_daily_dc_checkpoint.txt'

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_clients():
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    sb  = create_client(SUPABASE_URL, SUPABASE_KEY)
    return pro, sb

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def retry(fn, retries=3, sleep_sec=1, **kwargs):
    """带重试的 Tushare 接口调用，失败后 sleep_sec 等待"""
    for i in range(retries):
        try:
            df = fn(**kwargs)
            return df
        except Exception as e:
            print(f"  ⚠️  第{i+1}次失败: {e}")
            if i < retries - 1:
                time.sleep(sleep_sec)
    return None  # 全部失败返回 None，由调用方决定如何处理

def clean_row(row_dict):
    """清理单行数据：nan/inf → None"""
    cleaned = {}
    for k, v in row_dict.items():
        if v is None:
            cleaned[k] = None
        elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            cleaned[k] = None
        else:
            cleaned[k] = v
    return cleaned

def upsert_batch(sb, rows, dry_run=False):
    """分批 upsert sector_daily"""
    if not rows:
        return 0
    # 按 PK (sector_id, trade_date) 去重
    df = pd.DataFrame(rows)
    before = len(df)
    df = df.drop_duplicates(subset=['sector_id', 'trade_date'], keep='last')
    after = len(df)
    if before != after:
        print(f"  ⚠️  批内去重：{before} → {after} 行")
    rows = [clean_row(r) for r in df.to_dict('records')]

    if dry_run:
        print(f"  [dry-run] 跳过写库，共 {len(rows)} 行")
        return len(rows)

    total = len(rows)
    written = 0
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        for attempt in range(5):
            try:
                sb.table('sector_daily').upsert(
                    batch, on_conflict='sector_id,trade_date'
                ).execute()
                written += len(batch)
                break
            except Exception as e:
                err = str(e)
                if '57014' in err or 'statement timeout' in err:
                    wait = 15 * (attempt + 1)
                    print(f"  ⚠️  Supabase 超时(57014)，{wait}s 后重试")
                    time.sleep(wait)
                else:
                    print(f"  ❌ upsert 失败: {e}")
                    break
    return written

def load_sector_meta(sb, system=None):
    """从数据库分页加载 sector_meta"""
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        q = sb.table('sector_meta').select('id,raw_code,system,name_cn')
        if system:
            q = q.eq('system', system)
        r = q.range(offset, offset + page_size - 1).execute()
        if not r.data:
            break
        all_rows.extend(r.data)
        if len(r.data) < page_size:
            break
        offset += page_size
    return all_rows

def get_candidate_dates(start_date, end_date):
    """生成候选日期列表：跳过周六/周日，不依赖 trade_cal 接口（踩坑 #14）"""
    start = datetime.strptime(start_date, '%Y%m%d').date()
    end   = datetime.strptime(end_date,   '%Y%m%d').date()
    result = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:  # 0=周一 … 4=周五
            result.append(cur.strftime('%Y%m%d'))
        cur += timedelta(days=1)
    return result

def _safe(row, col):
    v = row.get(col) if isinstance(row, dict) else getattr(row, col, None)
    if v is None:
        return None
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None

def _safe_int(row, col):
    v = row.get(col) if isinstance(row, dict) else getattr(row, col, None)
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None

def _safe_str(row, col):
    v = row.get(col) if isinstance(row, dict) else getattr(row, col, None)
    return str(v).strip() if v is not None else None

# ── ths 采集（按板块循环）────────────────────────────────────────────────────
def backfill_ths(pro, sb, ths_sectors, start_date, end_date, dry_run=False, reset=False):
    """
    ths 按板块循环：每个板块一次拉全量历史数据
    断点：记录最后完成的 sector_id
    """
    print(f"\n{'─'*60}")
    print(f"  [THS] 按板块回填，共 {len(ths_sectors)} 个板块")
    print(f"  日期范围：{start_date} → {end_date}")
    print(f"{'─'*60}")

    # 读取断点
    checkpoint_id = None
    if not reset and os.path.exists(THS_CHECKPOINT):
        with open(THS_CHECKPOINT) as f:
            checkpoint_id = f.read().strip() or None

    if checkpoint_id:
        # 找到断点位置，从下一个开始
        ids = [s['id'] for s in ths_sectors]
        try:
            idx = ids.index(checkpoint_id)
            ths_sectors = ths_sectors[idx+1:]
            print(f"  断点续传：跳过 {idx+1} 个已完成板块，剩余 {len(ths_sectors)} 个")
        except ValueError:
            print(f"  断点 {checkpoint_id} 未找到，从头开始")
    else:
        print(f"  从头开始")

    total_written = 0
    for i, sector in enumerate(ths_sectors):
        sector_id = sector['id']
        raw_code  = sector['raw_code']
        name      = sector['name_cn']

        df = retry(pro.ths_daily, retries=3, sleep_sec=1,
                   ts_code=raw_code, start_date=start_date, end_date=end_date)

        if df is None or df.empty:
            print(f"  [{i+1}/{len(ths_sectors)}] {name}({raw_code}): 无数据，跳过")
            # 仍然保存断点，避免重复查询
            if not dry_run:
                with open(THS_CHECKPOINT, 'w') as f:
                    f.write(sector_id)
            time.sleep(THS_SLEEP)
            continue

        rows = []
        for _, row in df.iterrows():
            trade_date_raw = str(row.get('trade_date', ''))
            if len(trade_date_raw) == 8:
                trade_date_fmt = f"{trade_date_raw[:4]}-{trade_date_raw[4:6]}-{trade_date_raw[6:]}"
            else:
                trade_date_fmt = trade_date_raw
            rows.append({
                'sector_id':     sector_id,
                'trade_date':    trade_date_fmt,
                'system':        'ths',
                'open':          _safe(row, 'open'),
                'high':          _safe(row, 'high'),
                'low':           _safe(row, 'low'),
                'close':         _safe(row, 'close'),
                'pre_close':     _safe(row, 'pre_close'),
                'avg_price':     _safe(row, 'avg_price'),
                'change_val':    _safe(row, 'change'),
                'pct_change':    _safe(row, 'pct_change'),
                'vol':           _safe(row, 'vol'),
                'turnover_rate': _safe(row, 'turnover_rate'),
            })

        written = upsert_batch(sb, rows, dry_run=dry_run)
        total_written += written
        print(f"  [{i+1}/{len(ths_sectors)}] {name}({raw_code}): {written} 行 | 累计 {total_written:,} 行")

        if not dry_run:
            with open(THS_CHECKPOINT, 'w') as f:
                f.write(sector_id)

        time.sleep(THS_SLEEP)

    print(f"\n✅ THS 回填完成！共写入 {total_written:,} 行")
    return total_written

# ── dc 采集（按日期循环）────────────────────────────────────────────────────
def backfill_dc(pro, sb, dc_sectors, start_date, end_date, dry_run=False, reset=False):
    """
    dc 按日期循环：每天一次拉全部 dc 板块
    断点：记录最后完成的 trade_date
    """
    print(f"\n{'─'*60}")
    print(f"  [DC] 按日期回填，共 {len(dc_sectors)} 个板块")
    print(f"  日期范围：{start_date} → {end_date}")
    print(f"{'─'*60}")

    valid_ids = {s['id'] for s in dc_sectors}
    dates = get_candidate_dates(start_date, end_date)

    # 读取断点
    checkpoint_date = None
    if not reset and os.path.exists(DC_CHECKPOINT):
        with open(DC_CHECKPOINT) as f:
            checkpoint_date = f.read().strip() or None

    if checkpoint_date:
        dates = [d for d in dates if d > checkpoint_date]
        print(f"  断点续传：从 {checkpoint_date} 之后继续，剩余 {len(dates)} 天")
    else:
        print(f"  从头开始，共 {len(dates)} 个候选日期（周一至周五）")

    total_written = 0
    for i, trade_date in enumerate(dates):
        df = retry(pro.dc_daily, retries=3, sleep_sec=1, trade_date=trade_date)

        if df is None or df.empty:
            print(f"  [{i+1}/{len(dates)}] {trade_date}: 空（非交易日）")
            if not dry_run:
                with open(DC_CHECKPOINT, 'w') as f:
                    f.write(trade_date)
            time.sleep(API_SLEEP)
            continue

        trade_date_fmt = f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:]}"
        rows = []
        for _, row in df.iterrows():
            raw_code  = row.get('ts_code', '')
            sector_id = f"dc_{raw_code}"
            if sector_id not in valid_ids:
                continue
            rows.append({
                'sector_id':     sector_id,
                'trade_date':    trade_date_fmt,
                'system':        'dc',
                'open':          _safe(row, 'open'),
                'high':          _safe(row, 'high'),
                'low':           _safe(row, 'low'),
                'close':         _safe(row, 'close'),
                'pre_close':     _safe(row, 'pre_close'),
                'change_val':    _safe(row, 'change'),
                'pct_change':    _safe(row, 'pct_change'),
                'vol':           _safe(row, 'vol'),
                'amount':        _safe(row, 'amount'),
                'swing':         _safe(row, 'swing'),
                'up_num':        _safe_int(row, 'up_num'),
                'down_num':      _safe_int(row, 'down_num'),
                'turnover_rate': _safe(row, 'turnover_rate'),
                'total_mv':      _safe(row, 'total_mv'),
                'leading_code':  _safe_str(row, 'leading_code'),
                'leading_name':  _safe_str(row, 'leading_name'),
                'leading_pct':   _safe(row, 'leading_pct'),
            })

        written = upsert_batch(sb, rows, dry_run=dry_run)
        total_written += written
        print(f"  [{i+1}/{len(dates)}] {trade_date}: {written} 行 | 累计 {total_written:,} 行")

        if not dry_run:
            with open(DC_CHECKPOINT, 'w') as f:
                f.write(trade_date)

        time.sleep(API_SLEEP)

    print(f"\n✅ DC 回填完成！共写入 {total_written:,} 行")
    return total_written

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='sector_daily 历史回填（重构版）')
    parser.add_argument('--start',   default='20230101', help='起始日期 YYYYMMDD')
    parser.add_argument('--end',     default=None,       help='结束日期 YYYYMMDD，默认今日')
    parser.add_argument('--system',  default='all',      choices=['dc', 'ths', 'all'])
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--reset',   action='store_true', help='忽略断点，从头开始')
    args = parser.parse_args()

    end_date = args.end or datetime.now().strftime('%Y%m%d')

    print(f"\n{'='*60}")
    print(f"  sector_daily 历史回填（重构版）")
    print(f"  日期范围：{args.start} → {end_date}")
    print(f"  体系：{args.system}  dry-run：{args.dry_run}")
    print(f"{'='*60}\n")

    pro, sb = init_clients()

    print("→ 加载板块元数据...")
    all_sectors = load_sector_meta(sb)
    dc_sectors  = [s for s in all_sectors if s['system'] == 'dc']
    ths_sectors = [s for s in all_sectors if s['system'] == 'ths']
    print(f"  dc: {len(dc_sectors)} 个，ths: {len(ths_sectors)} 个，共 {len(all_sectors)} 个")

    total = 0

    # THS：按板块循环（每个板块一次拉全量历史）
    if args.system in ('ths', 'all') and ths_sectors:
        total += backfill_ths(pro, sb, ths_sectors, args.start, end_date,
                              dry_run=args.dry_run, reset=args.reset)

    # DC：按日期循环（每天一次拉全部 dc 板块）
    if args.system in ('dc', 'all') and dc_sectors:
        total += backfill_dc(pro, sb, dc_sectors, args.start, end_date,
                             dry_run=args.dry_run, reset=args.reset)

    print(f"\n🎉 全部完成！总写入 {total:,} 行")

if __name__ == '__main__':
    main()
