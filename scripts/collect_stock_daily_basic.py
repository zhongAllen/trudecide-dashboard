"""
个股每日估值指标采集脚本（REQ-055）
=====================================
用途：采集全市场个股每日估值指标，写入 stock_daily_basic 表
      覆盖字段：PE/PB/PS/市值/换手率/量比/股息率 等 18 个字段
数据来源：Tushare Pro API → daily_basic 接口
执行方式：
  python3 collect_stock_daily_basic.py [--mode history|daily] [--start YYYYMMDD] [--end YYYYMMDD]
  --mode history  补录历史数据（按交易日循环，默认 2015-01-01 至今）
  --mode daily    采集最新一个交易日（默认模式）
  --start         历史补录起始日期（YYYYMMDD）
  --end           历史补录结束日期（YYYYMMDD）
  --dry-run       只打印，不写库
注意事项：
  1. daily_basic 按 trade_date 一次拉全市场，效率高，无需逐只股票循环
  2. 历史数据量大（2015-2026 约 2700 个交易日 × 5500 只 ≈ 1500 万行），建议分段补录
  3. 断点续传：已完成的 trade_date 记录在 /tmp/daily_basic_checkpoint.txt
  4. Tushare daily_basic 每分钟限额约 200 次，加 0.3s 间隔即可
  5. 主键冲突用 upsert（on_conflict=ts_code,trade_date），安全重跑
"""
import os
import sys
import time
import argparse
from datetime import datetime, date, timedelta, timezone
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN  = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL   = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY   = os.environ.get("SUPABASE_SERVICE_KEY", "")

# 历史补录默认起始日期
DEFAULT_START  = "20150101"
# 断点续传文件
CHECKPOINT_FILE = "/tmp/daily_basic_checkpoint.txt"
# 批量 upsert 每批大小（daily_basic 单日约 5500 行，一次写完）
BATCH_SIZE     = 3000
# 接口调用间隔（秒）
API_SLEEP      = 0.3

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
    return None  # 失败返回 None，不抛出，由调用方决定是否跳过

def upsert_batch(sb, table, rows, conflict_cols):
    """
    分批 upsert，避免单次请求过大
    踩坑 #13：Supabase 免费版有 statement timeout，单批过大时报 57014，需重试
    """
    import math as _math
    # 逐值清理 nan/inf（to_dict/clean_row 后仍可能残留 float nan）
    cleaned_rows = []
    for row in rows:
        cleaned = {}
        for k, v in row.items():
            if v is None:
                cleaned[k] = None
            elif isinstance(v, float) and (_math.isnan(v) or _math.isinf(v)):
                cleaned[k] = None
            else:
                cleaned[k] = v
        cleaned_rows.append(cleaned)
    rows = cleaned_rows
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        for attempt in range(5):
            try:
                sb.table(table).upsert(batch, on_conflict=','.join(conflict_cols)).execute()
                break
            except Exception as e:
                err_str = str(e)
                if '57014' in err_str or 'statement timeout' in err_str:
                    wait = 15 * (attempt + 1)
                    print(f"  ⚠️  Supabase 超时(57014)，{wait}s 后重试 (attempt {attempt+1}/5)")
                    time.sleep(wait)
                    continue
                raise

def get_last_trade_date():
    """获取最近的交易日（周末回退到上一个周五，节假日需人工处理）"""
    d = date.today()
    if d.weekday() == 5:   # 周六
        d = d - timedelta(days=1)
    elif d.weekday() == 6: # 周日
        d = d - timedelta(days=2)
    return d.strftime('%Y%m%d')

def load_checkpoint():
    """读取断点续传文件，返回已完成的 trade_date 集合"""
    if not os.path.exists(CHECKPOINT_FILE):
        return set()
    with open(CHECKPOINT_FILE, 'r') as f:
        return set(line.strip() for line in f if line.strip())

def save_checkpoint(trade_date):
    """追加写入已完成的 trade_date"""
    with open(CHECKPOINT_FILE, 'a') as f:
        f.write(trade_date + '\n')

def get_trade_calendar(pro, start_date, end_date):
    """获取交易日历，返回交易日列表（YYYYMMDD 字符串）"""
    df = retry(pro.trade_cal, exchange='SSE', start_date=start_date,
               end_date=end_date, is_open='1')
    if df is None or df.empty:
        return []
    return sorted(df['cal_date'].tolist())

def clean_row(row_dict):
    """清洗单行数据：NaN → None，trade_date 转 DATE 格式"""
    cleaned = {}
    for k, v in row_dict.items():
        if pd.isna(v) if not isinstance(v, str) else False:
            cleaned[k] = None
        elif k == 'trade_date' and isinstance(v, str) and len(v) == 8:
            # YYYYMMDD → YYYY-MM-DD
            cleaned[k] = f"{v[:4]}-{v[4:6]}-{v[6:8]}"
        else:
            cleaned[k] = v
    return cleaned

# ── 核心采集函数 ──────────────────────────────────────────────────────────────
def collect_daily(pro, sb, trade_date, dry_run=False):
    """
    采集单个交易日的全市场估值指标
    daily_basic 接口字段：
      ts_code, trade_date, close, turnover_rate, turnover_rate_f,
      volume_ratio, pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
      total_share, float_share, free_share, total_mv, circ_mv
    """
    df = retry(pro.daily_basic, ts_code='', trade_date=trade_date,
               fields='ts_code,trade_date,close,turnover_rate,turnover_rate_f,'
                      'volume_ratio,pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,'
                      'total_share,float_share,free_share,total_mv,circ_mv')
    if df is None or df.empty:
        print(f"  ⚠️  {trade_date} 无数据（可能是节假日或接口返回空）")
        return 0

    rows = [clean_row(r) for r in df.to_dict('records')]

    if dry_run:
        print(f"  [dry-run] {trade_date}: {len(rows)} 行")
        return len(rows)

    upsert_batch(sb, 'stock_daily_basic', rows, ['ts_code', 'trade_date'])
    return len(rows)

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='个股每日估值指标采集（REQ-055）')
    parser.add_argument('--mode', choices=['history', 'daily'], default='daily',
                        help='采集模式：history=历史补录，daily=最新一天')
    parser.add_argument('--start', default=DEFAULT_START, help='历史补录起始日期 YYYYMMDD')
    parser.add_argument('--end',   default=None,          help='历史补录结束日期 YYYYMMDD（默认今日）')
    parser.add_argument('--dry-run', action='store_true', help='只打印，不写库')
    args = parser.parse_args()

    pro, sb = init_clients()
    dry_run = args.dry_run

    if args.mode == 'daily':
        # ── 模式一：采集最新一个交易日 ──────────────────────────────────────
        trade_date = get_last_trade_date()
        print(f"\n=== [daily] 采集 {trade_date} 估值指标 ===")
        count = collect_daily(pro, sb, trade_date, dry_run)
        print(f"✅ 完成：{count} 行写入 stock_daily_basic")

    else:
        # ── 模式二：历史补录 ─────────────────────────────────────────────────
        end_date = args.end or date.today().strftime('%Y%m%d')
        print(f"\n=== [history] 历史补录 {args.start} → {end_date} ===")

        # 获取交易日历
        print("  → 获取交易日历...")
        trade_dates = get_trade_calendar(pro, args.start, end_date)
        print(f"  → 共 {len(trade_dates)} 个交易日")

        # 断点续传：跳过已完成的日期
        done = load_checkpoint()
        pending = [d for d in trade_dates if d not in done]
        print(f"  → 已完成 {len(done)} 天，待采集 {len(pending)} 天")

        total_rows = 0
        for i, td in enumerate(pending, 1):
            print(f"  [{i}/{len(pending)}] {td}...", end=' ', flush=True)
            count = collect_daily(pro, sb, td, dry_run)
            total_rows += count
            print(f"{count} 行")

            if not dry_run:
                save_checkpoint(td)

            time.sleep(API_SLEEP)

            # 每 100 天打印一次进度摘要
            if i % 100 == 0:
                print(f"\n  📊 进度摘要：{i}/{len(pending)} 天，累计 {total_rows:,} 行\n")

        print(f"\n✅ 历史补录完成：共 {len(pending)} 天，{total_rows:,} 行写入 stock_daily_basic")

if __name__ == '__main__':
    main()
