"""
指数日线行情采集脚本（REQ-058）
=====================================
用途：采集 A股全量指数 + 国际主要指数日线行情，写入 index_daily 表
数据来源：
  - A股指数：Tushare Pro API → index_daily 接口（market=cn）
  - 国际指数：Tushare Pro API → index_global 接口（market=global）
执行方式：
  python3 collect_index_daily.py [--mode history|daily] [--market cn|global|all]
                                 [--start YYYYMMDD] [--end YYYYMMDD] [--dry-run]
  --mode history  补录历史数据（按指数循环，默认 2015-01-01 至今）
  --mode daily    采集最新一个交易日（默认模式）
  --market        指定市场：cn=A股, global=国际, all=全部（默认 all）
  --start         历史补录起始日期（YYYYMMDD）
  --end           历史补录结束日期（YYYYMMDD）
  --dry-run       只打印，不写库

注意事项：
  1. A股指数按 ts_code 逐只循环，单次最多 8000 行（约 30 年历史），无需分页
  2. 国际指数约 12 个，直接全量拉取
  3. 主键冲突用 upsert（on_conflict=ts_code,trade_date,market），安全重跑
  4. 断点续传：已完成的 ts_code 记录在 /tmp/index_daily_checkpoint.txt
  5. index_global 需要 6000 积分，确认权限后再运行 --market global
"""
import os
import sys
import time
import argparse
from datetime import datetime, date, timedelta, timezone
import math
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN   = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
DEFAULT_START   = "20150101"
CHECKPOINT_FILE = "/tmp/index_daily_checkpoint.txt"
BATCH_SIZE      = 5000
API_SLEEP       = 0.5   # index_daily 限额相对宽松

# 国际主要指数代码（Tushare index_global 支持的全部）
GLOBAL_INDEX_CODES = [
    'XIN9',   # 富时中国A50
    'HSI',    # 恒生指数
    'HKTECH', # 恒生科技
    'DJI',    # 道琼斯
    'SPX',    # 标普500
    'IXIC',   # 纳斯达克
    'FTSE',   # 富时100
    'GDAXI',  # 德国DAX
    'N225',   # 日经225
    'KS11',   # 韩国综合
    'TWII',   # 台湾加权
    'RUT',    # 罗素2000
]

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_clients():
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    sb  = create_client(SUPABASE_URL, SUPABASE_KEY)
    return pro, sb

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def retry(fn, retries=3, sleep_sec=5, **kwargs):
    """带重试的 Tushare 接口调用"""
    for i in range(retries):
        try:
            df = fn(**kwargs)
            return df
        except Exception as e:
            print(f"  ⚠️  第{i+1}次失败: {e}")
            if i < retries - 1:
                time.sleep(sleep_sec)
    return None

def clean_row(row: dict) -> dict:
    """清理 NaN/Inf 为 None"""
    cleaned = {}
    for k, v in row.items():
        if v is None:
            cleaned[k] = None
        elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            cleaned[k] = None
        else:
            cleaned[k] = v
    return cleaned

def upsert_batch(sb, rows: list, conflict_cols: str = "ts_code,trade_date,market"):
    """分批 upsert 到 index_daily"""
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i+BATCH_SIZE]
        try:
            sb.table("index_daily").upsert(chunk, on_conflict=conflict_cols).execute()
        except Exception as e:
            print(f"  ❌ upsert 失败（{len(chunk)} 行）: {e}")
            raise

def load_checkpoint() -> set:
    if not os.path.exists(CHECKPOINT_FILE):
        return set()
    with open(CHECKPOINT_FILE) as f:
        return set(line.strip() for line in f if line.strip())

def save_checkpoint(ts_code: str):
    with open(CHECKPOINT_FILE, "a") as f:
        f.write(ts_code + "\n")

# ── A股指数采集 ───────────────────────────────────────────────────────────────
def collect_cn_index(pro, sb, start_date: str, end_date: str, dry_run: bool):
    """采集 A股全量指数日线行情"""
    print(f"\n=== A股指数日线行情 (cn) ===")
    print(f"日期范围：{start_date} ~ {end_date}")

    # 获取全量指数列表
    df_basic = retry(pro.index_basic, market='SSE')
    df_basic2 = retry(pro.index_basic, market='SZSE')
    df_basic3 = retry(pro.index_basic, market='CSI')
    df_basic4 = retry(pro.index_basic, market='SW')
    df_list = pd.concat([df for df in [df_basic, df_basic2, df_basic3, df_basic4] if df is not None])
    codes = df_list['ts_code'].dropna().unique().tolist()
    print(f"共 {len(codes)} 个 A股指数")

    done = load_checkpoint()
    total_rows = 0

    for idx, ts_code in enumerate(codes):
        ck_key = f"cn_{ts_code}"
        if ck_key in done:
            continue

        df = retry(pro.index_daily, ts_code=ts_code, start_date=start_date, end_date=end_date)
        if df is None or df.empty:
            save_checkpoint(ck_key)
            continue

        df['market'] = 'cn'
        df['trade_date'] = pd.to_datetime(df['trade_date'], format='%Y%m%d').dt.date.astype(str)

        rows = [clean_row(r) for r in df.to_dict('records')]
        if not dry_run:
            upsert_batch(sb, rows)
        total_rows += len(rows)

        if (idx + 1) % 50 == 0:
            print(f"  [{idx+1}/{len(codes)}] {ts_code}: {len(rows)} 行 | 累计 {total_rows:,} 行")

        save_checkpoint(ck_key)
        time.sleep(API_SLEEP)

    print(f"✅ A股指数完成，累计写入 {total_rows:,} 行")

# ── 国际指数采集 ──────────────────────────────────────────────────────────────
def collect_global_index(pro, sb, start_date: str, end_date: str, dry_run: bool):
    """采集国际主要指数日线行情"""
    print(f"\n=== 国际主要指数 (global) ===")
    total_rows = 0

    for ts_code in GLOBAL_INDEX_CODES:
        df = retry(pro.index_global, ts_code=ts_code, start_date=start_date, end_date=end_date)
        if df is None or df.empty:
            print(f"  ⚠️  {ts_code}: 无数据（可能需要 6000 积分权限）")
            continue

        df['market'] = 'global'
        df['trade_date'] = pd.to_datetime(df['trade_date'], format='%Y%m%d').dt.date.astype(str)
        # global 接口无 vol/amount 字段，补 NULL
        for col in ['vol', 'amount']:
            if col not in df.columns:
                df[col] = None

        rows = [clean_row(r) for r in df.to_dict('records')]
        if not dry_run:
            upsert_batch(sb, rows)
        total_rows += len(rows)
        print(f"  ✅ {ts_code}: {len(rows)} 行")
        time.sleep(API_SLEEP)

    print(f"✅ 国际指数完成，累计写入 {total_rows:,} 行")

# ── 日增量模式 ────────────────────────────────────────────────────────────────
def collect_daily(pro, sb, market: str, dry_run: bool):
    """采集最新一个交易日数据"""
    today = date.today().strftime('%Y%m%d')
    yesterday = (date.today() - timedelta(days=1)).strftime('%Y%m%d')
    start = yesterday
    end = today
    print(f"日增量模式：{start} ~ {end}")

    if market in ('cn', 'all'):
        collect_cn_index(pro, sb, start, end, dry_run)
    if market in ('global', 'all'):
        collect_global_index(pro, sb, start, end, dry_run)

# ── 主入口 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='指数日线行情采集（REQ-058）')
    parser.add_argument('--mode',    choices=['history', 'daily'], default='daily')
    parser.add_argument('--market',  choices=['cn', 'global', 'all'], default='all')
    parser.add_argument('--start',   default=DEFAULT_START)
    parser.add_argument('--end',     default=date.today().strftime('%Y%m%d'))
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if not TUSHARE_TOKEN:
        print("❌ 缺少 TUSHARE_TOKEN 环境变量")
        sys.exit(1)
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ 缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY 环境变量")
        sys.exit(1)

    pro, sb = init_clients()

    if args.mode == 'daily':
        collect_daily(pro, sb, args.market, args.dry_run)
    else:
        if args.market in ('cn', 'all'):
            collect_cn_index(pro, sb, args.start, args.end, args.dry_run)
        if args.market in ('global', 'all'):
            collect_global_index(pro, sb, args.start, args.end, args.dry_run)

    print("\n🎉 采集完成")

if __name__ == '__main__':
    main()
