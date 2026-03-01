"""
板块数据采集脚本（同花顺 + 东方财富）
=====================================
用途：采集三套板块体系的元数据、成分股、日度行情，写入数据库
      - sector_meta      板块定义（ths + dc）
      - sector_stock_map 板块成分股（ths + dc，支持历史 diff）
      - sector_daily     板块日度行情（ths + dc）

数据来源：Tushare Pro API
  - 同花顺：ths_index / ths_member / ths_daily
  - 东方财富：dc_index / dc_member / dc_daily
  （通达信 tdx_index/tdx_daily 每日限额极低，暂不采集，后续单独处理）

执行方式：
  python3 collect_sector_data.py [--mode all|meta|member|daily] [--date YYYYMMDD]
  --mode   采集模式，默认 all（全部）
  --date   指定日度行情日期，默认今日（格式 YYYYMMDD）
  --dry-run 只打印，不写库

注意事项：
  1. ths_index 返回 A/HK/US 全市场，需过滤 exchange='A' 只保留 A 股
  2. dc_index 按日期返回当日板块快照，需传 trade_date
  3. ths_daily 只能按单板块查询，批量采集需循环（有频率限制，加 sleep）
  4. dc_daily 可按日期一次拉全量，效率更高
  5. 成分股采用 diff 逻辑：新增写 in_date，移出写 out_date，避免全量重写
  6. sector_meta.id 格式：{system}_{raw_code}，如 ths_885835.TI / dc_BK1184.DC
"""

import os
import sys
import time
import argparse
from datetime import datetime, date, timezone
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")

# 采集的同花顺板块类型（只采 A 股相关）
# N=概念板块 I=行业板块 R=地区板块 S=风格板块
THS_TYPES = ['N', 'I', 'S']

# Tushare 请求间隔（秒），避免触发频率限制
API_SLEEP = 0.5
# 批量 upsert 每批大小
BATCH_SIZE = 500

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_clients():
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    sb  = create_client(SUPABASE_URL, SUPABASE_KEY)
    return pro, sb

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def retry(fn, retries=3, sleep_sec=5, **kwargs):
    """带重试的 Tushare 接口调用（踩坑记录 #9：网络不稳定）"""
    for i in range(retries):
        try:
            df = fn(**kwargs)
            return df
        except Exception as e:
            print(f"  ⚠️  第{i+1}次失败: {e}")
            if i < retries - 1:
                time.sleep(sleep_sec)
    raise Exception(f"接口调用失败，已重试 {retries} 次")

def upsert_batch(sb, table, rows, conflict_cols):
    """分批 upsert，避免单次请求过大"""
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        sb.table(table).upsert(batch, on_conflict=','.join(conflict_cols)).execute()
        print(f"  ✅ upsert {table}: {min(i+BATCH_SIZE, total)}/{total}")

def today_str():
    return date.today().strftime('%Y%m%d')

def get_last_trade_date():
    """获取最近的交易日（周末/节假日回退到上一个周五）"""
    from datetime import timedelta
    d = date.today()
    # 简单处理：周六回退1天，周日回退2天
    if d.weekday() == 5:   # 周六
        d = d - timedelta(days=1)
    elif d.weekday() == 6: # 周日
        d = d - timedelta(days=2)
    return d.strftime('%Y%m%d')

def load_checkpoint():
    """读取断点续传文件，返回已完成的 sector_id 集合"""
    if not os.path.exists(CHECKPOINT_FILE):
        return set()
    with open(CHECKPOINT_FILE, 'r') as f:
        return set(line.strip() for line in f if line.strip())

def save_checkpoint(sector_id):
    """追加写入已完成的 sector_id"""
    with open(CHECKPOINT_FILE, 'a') as f:
        f.write(sector_id + '\n')

# ── 1. 采集 sector_meta（板块定义）────────────────────────────────────────────
def collect_sector_meta(pro, sb, dry_run=False):
    print("\n=== [1/3] 采集 sector_meta ===")
    rows = []

    # 1.1 同花顺板块
    print("  → 拉取同花顺板块列表...")
    df_ths = retry(pro.ths_index)
    if df_ths is not None and not df_ths.empty:
        # 只保留 A 股相关（exchange 为空或 'A'）
        df_ths = df_ths[df_ths['exchange'].isin(['A', '']) | df_ths['exchange'].isna()]
        for _, row in df_ths.iterrows():
            raw_code = row['ts_code']
            # idx_type 映射：N=概念板块 I=行业板块 R=地区板块 S=风格板块
            type_map = {'N': '概念板块', 'I': '行业板块', 'R': '地区板块', 'S': '风格板块'}
            idx_type = type_map.get(str(row.get('type', '')), str(row.get('type', '')))
            rows.append({
                'id':         f"ths_{raw_code}",
                'name_cn':    row['name'],
                'system':     'ths',
                'level':      1,
                'raw_code':   raw_code,
                'idx_type':   idx_type,
                'is_active':  True,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            })
        print(f"  ✅ 同花顺板块：{len(df_ths)} 个")
    time.sleep(API_SLEEP)

    # 1.2 东方财富板块（按最近交易日拉快照）
    print("  → 拉取东方财富板块列表...")
    trade_date = get_last_trade_date()
    df_dc = retry(pro.dc_index, trade_date=trade_date)
    if df_dc is not None and not df_dc.empty:
        # dc_index 返回字段：ts_code, trade_date, name, leading, leading_code, leading_pct
        seen = set()
        for _, row in df_dc.iterrows():
            raw_code = row['ts_code']
            if raw_code in seen:
                continue
            seen.add(raw_code)
            rows.append({
                'id':         f"dc_{raw_code}",
                'name_cn':    row['name'],
                'system':     'dc',
                'level':      1,
                'raw_code':   raw_code,
                'idx_type':   '概念板块',
                'is_active':  True,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            })
        print(f"  ✅ 东方财富板块：{len(seen)} 个")
    time.sleep(API_SLEEP)

    print(f"\n  共 {len(rows)} 个板块待写入 sector_meta")
    if dry_run:
        print("  [dry-run] 跳过写库")
        return rows

    upsert_batch(sb, 'sector_meta', rows, ['id'])
    return rows

# ── 2. 采集 sector_stock_map（成分股，diff 逻辑）──────────────────────────────
def collect_sector_member(pro, sb, meta_rows, dry_run=False):
    print("\n=== [2/3] 采集 sector_stock_map（成分股）===")
    today = date.today().isoformat()  # YYYY-MM-DD

    # 读取数据库中当前所有有效成分股（is_current=true），用于 diff
    print("  → 读取数据库现有成分股快照...")
    existing_map = {}  # {sector_id: set(ts_code)}
    offset = 0
    while True:
        r = sb.table('sector_stock_map').select('sector_id,ts_code') \
              .eq('is_current', True).range(offset, offset+999).execute()
        if not r.data:
            break
        for item in r.data:
            sid = item['sector_id']
            if sid not in existing_map:
                existing_map[sid] = set()
            existing_map[sid].add(item['ts_code'])
        if len(r.data) < 1000:
            break
        offset += 1000
    print(f"  ✅ 已读取 {sum(len(v) for v in existing_map.values())} 条现有成分股")

    insert_rows = []
    update_out  = []  # 需要标记 out_date 的 (sector_id, ts_code) 列表

    # 2.1 同花顺成分股
    ths_sectors = [r for r in meta_rows if r['system'] == 'ths']
    print(f"  → 采集同花顺成分股（{len(ths_sectors)} 个板块）...")
    for i, sector in enumerate(ths_sectors):
        sector_id = sector['id']
        raw_code  = sector['raw_code']
        try:
            df = retry(pro.ths_member, ts_code=raw_code)
            if df is None or df.empty:
                continue
            new_codes = set(df['con_code'].tolist())
            old_codes = existing_map.get(sector_id, set())

            # 新增的成分股
            for code in new_codes - old_codes:
                insert_rows.append({
                    'sector_id':  sector_id,
                    'ts_code':    code,
                    'system':     'ths',
                    'in_date':    today,
                    'is_current': True,
                })
            # 移出的成分股（标记 out_date）
            for code in old_codes - new_codes:
                update_out.append({'sector_id': sector_id, 'ts_code': code})

        except Exception as e:
            print(f"  ⚠️  ths_member({raw_code}) 失败: {e}")
        time.sleep(API_SLEEP)
        if (i+1) % 50 == 0:
            print(f"    进度: {i+1}/{len(ths_sectors)}")

    # 2.2 东方财富成分股
    dc_sectors = [r for r in meta_rows if r['system'] == 'dc']
    print(f"  → 采集东方财富成分股（{len(dc_sectors)} 个板块）...")
    trade_date = today_str()
    for i, sector in enumerate(dc_sectors):
        sector_id = sector['id']
        raw_code  = sector['raw_code']
        try:
            df = retry(pro.dc_member, ts_code=raw_code, trade_date=trade_date)
            if df is None or df.empty:
                continue
            new_codes = set(df['con_code'].tolist())
            old_codes = existing_map.get(sector_id, set())

            for code in new_codes - old_codes:
                insert_rows.append({
                    'sector_id':  sector_id,
                    'ts_code':    code,
                    'system':     'dc',
                    'in_date':    today,
                    'is_current': True,
                })
            for code in old_codes - new_codes:
                update_out.append({'sector_id': sector_id, 'ts_code': code})

        except Exception as e:
            print(f"  ⚠️  dc_member({raw_code}) 失败: {e}")
        time.sleep(API_SLEEP)
        if (i+1) % 50 == 0:
            print(f"    进度: {i+1}/{len(dc_sectors)}")

    print(f"\n  新增成分股: {len(insert_rows)} 条")
    print(f"  移出成分股: {len(update_out)} 条")

    if dry_run:
        print("  [dry-run] 跳过写库")
        return

    # 写入新增成分股
    if insert_rows:
        upsert_batch(sb, 'sector_stock_map', insert_rows, ['sector_id', 'ts_code'])

    # 标记移出成分股（out_date + is_current=false）
    if update_out:
        print(f"  → 标记 {len(update_out)} 条移出成分股...")
        for item in update_out:
            sb.table('sector_stock_map').update({
                'out_date':   today,
                'is_current': False,
            }).eq('sector_id', item['sector_id']).eq('ts_code', item['ts_code']).execute()
        print(f"  ✅ 移出标记完成")

# ── 3. 采集 sector_daily（日度行情）──────────────────────────────────────────
def collect_sector_daily(pro, sb, meta_rows, trade_date=None, dry_run=False):
    print("\n=== [3/3] 采集 sector_daily（日度行情）===")
    if trade_date is None:
        trade_date = get_last_trade_date()  # 使用最近交易日，避免周末返回空数据
    print(f"  日期: {trade_date}")

    rows = []
    trade_date_fmt = f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:]}"  # YYYY-MM-DD

    # 3.1 东方财富日度行情（一次拉全量，效率高）
    print("  → 拉取东方财富板块行情...")
    df_dc = retry(pro.dc_daily, trade_date=trade_date)
    if df_dc is not None and not df_dc.empty:
        # dc_daily 字段：ts_code, trade_date, close, open, high, low, pre_close,
        #                 change, pct_change, vol, amount, swing, up_num, down_num,
        #                 turnover_rate, total_mv, leading_code, leading_name, leading_pct
        for _, row in df_dc.iterrows():
            raw_code  = row['ts_code']
            sector_id = f"dc_{raw_code}"
            rows.append({
                'sector_id':      sector_id,
                'trade_date':     trade_date_fmt,
                'system':         'dc',
                'open':           _safe(row, 'open'),
                'high':           _safe(row, 'high'),
                'low':            _safe(row, 'low'),
                'close':          _safe(row, 'close'),
                'pre_close':      _safe(row, 'pre_close'),
                'change_val':     _safe(row, 'change'),
                'pct_change':     _safe(row, 'pct_change'),
                'vol':            _safe(row, 'vol'),
                'amount':         _safe_amount_dc(row),   # DC 单位：万元 → 元
                'swing':          _safe(row, 'swing'),
                'up_num':         _safe_int(row, 'up_num'),
                'down_num':       _safe_int(row, 'down_num'),
                'turnover_rate':  _safe(row, 'turnover_rate'),
                'total_mv':       _safe(row, 'total_mv'),  # 亿元
                'leading_code':   _safe_str(row, 'leading_code'),
                'leading_name':   _safe_str(row, 'leading_name'),
                'leading_pct':    _safe(row, 'leading_pct'),
            })
        print(f"  ✅ 东方财富行情：{len(df_dc)} 条")
    time.sleep(API_SLEEP)

    # 3.2 同花顺日度行情（需按板块逐个查询，有频率限制）
    ths_sectors = [r for r in meta_rows if r['system'] == 'ths']
    print(f"  → 拉取同花顺板块行情（{len(ths_sectors)} 个板块，逐个查询）...")
    ths_count = 0
    for i, sector in enumerate(ths_sectors):
        sector_id = sector['id']
        raw_code  = sector['raw_code']
        try:
            df = retry(pro.ths_daily, ts_code=raw_code,
                       start_date=trade_date, end_date=trade_date)
            if df is None or df.empty:
                continue
            row = df.iloc[0]
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
            ths_count += 1
        except Exception as e:
            print(f"  ⚠️  ths_daily({raw_code}) 失败: {e}")
        time.sleep(API_SLEEP)
        if (i+1) % 100 == 0:
            print(f"    进度: {i+1}/{len(ths_sectors)}，已采集 {ths_count} 条")

    print(f"  ✅ 同花顺行情：{ths_count} 条")
    print(f"\n  共 {len(rows)} 条行情待写入 sector_daily")

    if dry_run:
        print("  [dry-run] 跳过写库")
        return

    # 过滤掉 sector_id 不在 sector_meta 中的行（避免外键约束报错）
    valid_ids = {r['id'] for r in meta_rows}
    rows = [r for r in rows if r['sector_id'] in valid_ids]
    upsert_batch(sb, 'sector_daily', rows, ['sector_id', 'trade_date'])

# ── 辅助函数 ──────────────────────────────────────────────────────────────────
def _safe(row, col):
    """安全读取 float 字段，None/NaN 返回 None"""
    val = row.get(col) if hasattr(row, 'get') else getattr(row, col, None)
    if val is None:
        return None
    try:
        import math
        return None if math.isnan(float(val)) else float(val)
    except:
        return None

def _safe_int(row, col):
    val = _safe(row, col)
    return int(val) if val is not None else None

def _safe_str(row, col):
    val = row.get(col) if hasattr(row, 'get') else getattr(row, col, None)
    if val is None or (isinstance(val, float) and __import__('math').isnan(val)):
        return None
    return str(val)

def _safe_amount_dc(row):
    """DC 成交额单位为万元，统一换算为元"""
    val = _safe(row, 'amount')
    return val * 10000 if val is not None else None

# ── 主入口 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='板块数据采集脚本')
    parser.add_argument('--mode',    default='all',
                        choices=['all', 'meta', 'member', 'daily'],
                        help='采集模式：all=全部 meta=仅板块定义 member=仅成分股 daily=仅行情')
    parser.add_argument('--date',    default=None,
                        help='行情日期 YYYYMMDD，默认今日')
    parser.add_argument('--dry-run', action='store_true',
                        help='只打印，不写库')
    args = parser.parse_args()

    if not TUSHARE_TOKEN:
        print("❌ 未设置 TUSHARE_TOKEN 环境变量")
        sys.exit(1)
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ 未设置 SUPABASE_URL / SUPABASE_SERVICE_KEY 环境变量")
        sys.exit(1)

    print(f"🚀 板块数据采集开始 | 模式={args.mode} | 日期={args.date or '今日'} | dry-run={args.dry_run}")
    pro, sb = init_clients()

    # 先采集 meta（后续步骤依赖 meta_rows）
    if args.mode in ('all', 'meta', 'member', 'daily'):
        meta_rows = collect_sector_meta(pro, sb, dry_run=args.dry_run)
    else:
        meta_rows = []

    if args.mode in ('all', 'member'):
        collect_sector_member(pro, sb, meta_rows, dry_run=args.dry_run)

    if args.mode in ('all', 'daily'):
        collect_sector_daily(pro, sb, meta_rows,
                             trade_date=args.date, dry_run=args.dry_run)

    print("\n🎉 采集完成")

if __name__ == '__main__':
    main()
