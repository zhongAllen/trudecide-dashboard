"""
指数日线行情采集脚本（REQ-064）
=====================================
用途：采集 A股全量指数 + 国际主要指数日线行情，写入 index_daily 表
数据来源：
  - A股指数：Tushare Pro API → index_daily 接口（market=cn）
  - 国际指数：Tushare Pro API → index_global 接口（market=global）
执行方式：
  python3 collect_index_daily.py [--mode history|daily] [--market cn|global|all]
                                 [--start YYYYMMDD] [--end YYYYMMDD]
                                 [--workers N] [--dry-run]
  --mode history  补录历史数据（按指数循环，默认 2015-01-01 至今）
  --mode daily    采集最新一个交易日（默认模式）
  --market        指定市场：cn=A股, global=国际, all=全部（默认 all）
  --start         历史补录起始日期（YYYYMMDD）
  --end           历史补录结束日期（YYYYMMDD）
  --workers       并发线程数（默认 5，建议 3~8）
  --dry-run       只打印，不写库

注意事项：
  1. A股指数约 8000 个，多线程并发采集，每线程独立创建 Supabase 客户端
  2. checkpoint 文件用 threading.Lock 保护，线程安全
  3. 主键冲突用 upsert（on_conflict=ts_code,trade_date,market），安全重跑
  4. 断点续传：已完成的 ts_code 记录在 /tmp/index_daily_checkpoint.txt
  5. index_global 需要 6000 积分，确认权限后再运行 --market global
  6. 多线程下 API_SLEEP 可降至 0.2s，总并发请求数 = workers × (1/API_SLEEP)

踩坑记录：
  - index_basic(market='SSE') 返回空，需用 fields='ts_code,name,market' 全量获取
  - Supabase 客户端不是线程安全的，每线程必须独立 create_client
  - checkpoint 文件 append 操作需要加锁，否则多线程写入会乱序
  - index_daily 表有 260 万行 A 股数据，upsert 时全表冲突检测慢，批次必须 ≤300 行
    否则触发 57014 statement timeout；已在 upsert_batch 中加入自动重试逻辑
"""
import os
import sys
import time
import argparse
import threading
from datetime import datetime, date, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
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
BATCH_SIZE      = 300   # 踩坑 #57014: index_daily 大表 upsert 必须小批次，否则 statement timeout
API_SLEEP       = 0.2   # 多线程下单线程压力降低，可缩短等待

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

# ── 线程安全的 checkpoint ─────────────────────────────────────────────────────
_ck_lock = threading.Lock()
_print_lock = threading.Lock()

def safe_print(*args, **kwargs):
    with _print_lock:
        print(*args, **kwargs)

def load_checkpoint() -> set:
    if not os.path.exists(CHECKPOINT_FILE):
        return set()
    with open(CHECKPOINT_FILE) as f:
        return set(line.strip() for line in f if line.strip())

def save_checkpoint(key: str):
    with _ck_lock:
        with open(CHECKPOINT_FILE, "a") as f:
            f.write(key + "\n")

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def make_clients():
    """每线程独立创建 Tushare pro 和 Supabase 客户端（非线程安全，不可共享）"""
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    sb  = create_client(SUPABASE_URL, SUPABASE_KEY)
    return pro, sb

def retry(fn, retries=3, sleep_sec=5, **kwargs):
    """带重试的 Tushare 接口调用"""
    for i in range(retries):
        try:
            df = fn(**kwargs)
            return df
        except Exception as e:
            safe_print(f"  ⚠️  第{i+1}次失败: {e}")
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
    """分批 upsert 到 index_daily
    踩坑 #57014: index_daily 表大（260万行），upsert 冲突检测慢，批次必须 ≤300 行
    每批失败后指数退避重试，最多 5 次
    """
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i+BATCH_SIZE]
        for attempt in range(5):
            try:
                sb.table("index_daily").upsert(chunk, on_conflict=conflict_cols).execute()
                break
            except Exception as e:
                err_str = str(e)
                if '57014' in err_str or 'statement timeout' in err_str:
                    wait = 10 * (attempt + 1)
                    safe_print(f"  ⚠️  57014 超时，{wait}s 后重试 (attempt {attempt+1}/5)")
                    time.sleep(wait)
                    continue
                safe_print(f"  ❌ upsert 失败（{len(chunk)} 行）: {e}")
                raise
        time.sleep(0.1)  # 批次间短暂休息，避免连续压力

# ── 单只指数采集任务（供线程池调用）────────────────────────────────────────────
def fetch_one_cn(ts_code: str, start_date: str, end_date: str, dry_run: bool) -> int:
    """
    采集单只 A股指数的历史行情，返回写入行数。
    每次调用都创建独立的 pro/sb 客户端（线程安全）。
    """
    pro, sb = make_clients()
    df = retry(pro.index_daily, ts_code=ts_code, start_date=start_date, end_date=end_date)
    if df is None or df.empty:
        save_checkpoint(f"cn_{ts_code}")
        return 0

    df['market'] = 'cn'
    df['trade_date'] = pd.to_datetime(df['trade_date'], format='%Y%m%d').dt.date.astype(str)
    rows = [clean_row(r) for r in df.to_dict('records')]

    if not dry_run:
        upsert_batch(sb, rows)

    save_checkpoint(f"cn_{ts_code}")
    time.sleep(API_SLEEP)
    return len(rows)

# ── A股指数多线程采集 ─────────────────────────────────────────────────────────
def collect_cn_index(start_date: str, end_date: str, dry_run: bool, workers: int):
    """多线程采集 A股全量指数日线行情"""
    safe_print(f"\n=== A股指数日线行情 (cn) ===")
    safe_print(f"日期范围：{start_date} ~ {end_date}，并发线程数：{workers}")

    # 获取全量指数列表
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    df_list = retry(pro.index_basic, fields='ts_code,name,market')
    if df_list is None or df_list.empty:
        safe_print('❌ 无法获取指数列表，退出')
        return
    codes = df_list['ts_code'].dropna().unique().tolist()
    safe_print(f"共 {len(codes)} 个 A股指数")

    # 过滤已完成的
    done = load_checkpoint()
    pending = [c for c in codes if f"cn_{c}" not in done]
    safe_print(f"已完成：{len(codes) - len(pending)} 个，待采集：{len(pending)} 个")

    total_rows = 0
    completed  = 0

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(fetch_one_cn, code, start_date, end_date, dry_run): code
            for code in pending
        }
        for future in as_completed(futures):
            code = futures[future]
            try:
                n = future.result()
                total_rows += n
                completed  += 1
                if completed % 100 == 0:
                    safe_print(f"  [{completed}/{len(pending)}] 已完成 {completed} 个 | 累计 {total_rows:,} 行")
            except Exception as e:
                safe_print(f"  ❌ {code} 失败: {e}")

    safe_print(f"✅ A股指数完成，累计写入 {total_rows:,} 行")

# ── 国际指数采集（单线程，数量少）────────────────────────────────────────────
def collect_global_index(start_date: str, end_date: str, dry_run: bool):
    """采集国际主要指数日线行情（约 12 个，单线程即可）"""
    safe_print(f"\n=== 国际主要指数 (global) ===")
    pro, sb = make_clients()
    total_rows = 0

    for ts_code in GLOBAL_INDEX_CODES:
        df = retry(pro.index_global, ts_code=ts_code, start_date=start_date, end_date=end_date)
        if df is None or df.empty:
            safe_print(f"  ⚠️  {ts_code}: 无数据（可能需要 6000 积分权限）")
            continue

        df['market'] = 'global'
        df['trade_date'] = pd.to_datetime(df['trade_date'], format='%Y%m%d').dt.date.astype(str)
        for col in ['vol', 'amount']:
            if col not in df.columns:
                df[col] = None

        rows = [clean_row(r) for r in df.to_dict('records')]
        if not dry_run:
            upsert_batch(sb, rows)
        total_rows += len(rows)
        safe_print(f"  ✅ {ts_code}: {len(rows)} 行")
        time.sleep(API_SLEEP)

    safe_print(f"✅ 国际指数完成，累计写入 {total_rows:,} 行")

# ── 日增量模式 ────────────────────────────────────────────────────────────────
def collect_daily(market: str, dry_run: bool, workers: int):
    """采集最新一个交易日数据"""
    today     = date.today().strftime('%Y%m%d')
    yesterday = (date.today() - timedelta(days=1)).strftime('%Y%m%d')
    safe_print(f"日增量模式：{yesterday} ~ {today}")

    if market in ('cn', 'all'):
        collect_cn_index(yesterday, today, dry_run, workers)
    if market in ('global', 'all'):
        collect_global_index(yesterday, today, dry_run)

# ── 主入口 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='指数日线行情采集（REQ-064）')
    parser.add_argument('--mode',    choices=['history', 'daily'], default='daily')
    parser.add_argument('--market',  choices=['cn', 'global', 'all'], default='all')
    parser.add_argument('--start',   default=DEFAULT_START)
    parser.add_argument('--end',     default=date.today().strftime('%Y%m%d'))
    parser.add_argument('--workers', type=int, default=5, help='并发线程数（默认 5）')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if not TUSHARE_TOKEN:
        print("❌ 缺少 TUSHARE_TOKEN 环境变量")
        sys.exit(1)
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ 缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY 环境变量")
        sys.exit(1)

    if args.mode == 'daily':
        collect_daily(args.market, args.dry_run, args.workers)
    else:
        if args.market in ('cn', 'all'):
            collect_cn_index(args.start, args.end, args.dry_run, args.workers)
        if args.market in ('global', 'all'):
            collect_global_index(args.start, args.end, args.dry_run)

    print("\n🎉 采集完成")

if __name__ == '__main__':
    main()
