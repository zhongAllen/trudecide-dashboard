"""
个股日线数据采集脚本（REQ-014）
================================
用途：采集 A 股全量股票的日线行情 + 估值数据，写入 stock_daily 表
数据来源：
  - Tushare Pro daily（OHLCV + pct_chg）
  - Tushare Pro daily_basic（pe_ttm / pb / ps_ttm / total_mv / circ_mv / adj_factor）
采集范围：stock_meta 中所有股票，2015-01-01 至今
执行方式：
  python3 collect_stock_daily.py [--mode full|incremental] [--dry-run] [--workers N]
  --mode full         全量采集（2015-01-01 至今），默认
  --mode incremental  增量采集（仅最近 7 天）
  --dry-run           只打印，不写库
  --workers N         并发线程数，默认 20
注意事项：
  1. 任务按时间段切分（每段 30 天），每个线程处理一段时间内的所有股票
     （按日期切分而非按股票切分，避免同一股票被多线程重复写入）
  2. 断点续采：进度文件 /tmp/stock_daily_progress.json 记录已完成的时间段
  3. Tushare daily 按日期查询（trade_date 参数），返回当日所有股票
  4. daily_basic 同样按日期查询，与 daily 合并后写入
  5. 踩坑：Tushare 单次调用 daily 返回约 5000 行（全市场），无需按股票循环
  6. 踩坑：Supabase upsert 单次请求不超过 500 行，需分批
  7. 踩坑：stock_daily 有外键约束 stock_daily_ts_code_fkey，
     必须先保证 stock_meta 有数据才能写入
"""
import os
import sys
import time
import json
import logging
import argparse
from datetime import date, datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import tushare as ts
import requests

# ── 日志配置 ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/tmp/stock_daily_collect.log', mode='a'),
    ]
)
log = logging.getLogger(__name__)

# ── 配置 ──────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN    = os.environ.get('TUSHARE_TOKEN', '')
SUPABASE_URL     = os.environ.get('SUPABASE_URL', '')
SUPABASE_SVC_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

MAX_WORKERS   = 20      # 并发线程数
BATCH_SIZE    = 500     # 每批 upsert 行数
API_SLEEP     = 0.2     # 每次请求间隔（秒）
RETRY_TIMES   = 3       # 失败重试次数
RETRY_SLEEP   = 5       # 重试等待（秒）
DAYS_PER_TASK = 1       # 每个任务处理的天数（按日期切分，1天=1任务）
PROGRESS_FILE = '/tmp/stock_daily_progress.json'
START_DATE    = '20150101'  # 全量采集起始日期

# ── Supabase REST 请求头 ───────────────────────────────────────────────────────
HEADERS = {
    'apikey': SUPABASE_SVC_KEY,
    'Authorization': f'Bearer {SUPABASE_SVC_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_tushare():
    ts.set_token(TUSHARE_TOKEN)
    return ts.pro_api()


# ── 进度管理 ──────────────────────────────────────────────────────────────────
def load_progress() -> set:
    """加载已完成的日期集合（格式 YYYYMMDD）"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            data = json.load(f)
            return set(data.get('done_dates', []))
    return set()


def save_progress(done_dates: set):
    """保存进度"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump({'done_dates': sorted(done_dates), 'updated_at': datetime.now().isoformat()}, f)


# ── 工具函数 ──────────────────────────────────────────────────────────────────
def retry_call(fn, retries=RETRY_TIMES, sleep_sec=RETRY_SLEEP, **kwargs):
    """带重试的 Tushare 接口调用"""
    for i in range(retries):
        try:
            return fn(**kwargs)
        except Exception as e:
            log.warning(f"  第{i+1}次失败: {e}")
            if i < retries - 1:
                time.sleep(sleep_sec)
    raise Exception(f"接口调用失败，已重试 {retries} 次")


def upsert_batch(rows: list[dict]) -> int:
    """分批 upsert 到 stock_daily 表"""
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        resp = requests.post(
            f'{SUPABASE_URL}/rest/v1/stock_daily',
            headers=HEADERS,
            json=batch,
        )
        if not resp.ok:
            log.error(f"  upsert 失败: {resp.status_code} - {resp.text[:200]}")
        else:
            total += len(batch)
    return total


def gen_trade_dates(start: str, end: str, pro) -> list[str]:
    """获取指定范围内的交易日列表（格式 YYYYMMDD），由近到远"""
    df = retry_call(
        pro.trade_cal,
        exchange='SSE',
        start_date=start,
        end_date=end,
        is_open='1',
        fields='cal_date'
    )
    if df is None or df.empty:
        return []
    dates = sorted(df['cal_date'].tolist(), reverse=True)  # 由近到远
    return dates


# ── 核心采集逻辑（单日）────────────────────────────────────────────────────────
def collect_one_date(trade_date: str, pro, dry_run: bool = False) -> dict:
    """
    采集单个交易日的所有股票日线数据
    返回: {'date': str, 'rows': int, 'status': 'ok'|'empty'|'error', 'msg': str}
    """
    try:
        time.sleep(API_SLEEP)

        # 1. 获取日线行情（daily）
        df_daily = retry_call(
            pro.daily,
            trade_date=trade_date,
            fields='ts_code,trade_date,open,high,low,close,pre_close,pct_chg,vol,amount'
        )
        if df_daily is None or df_daily.empty:
            return {'date': trade_date, 'rows': 0, 'status': 'empty', 'msg': '日线数据为空'}

        time.sleep(API_SLEEP)

        # 2. 获取每日估值指标（daily_basic）
        df_basic = retry_call(
            pro.daily_basic,
            trade_date=trade_date,
            fields='ts_code,trade_date,pe_ttm,pb,ps_ttm,total_mv,circ_mv'
        )

        # 3. 合并数据
        if df_basic is not None and not df_basic.empty:
            df = pd.merge(df_daily, df_basic[['ts_code', 'pe_ttm', 'pb', 'ps_ttm', 'total_mv', 'circ_mv']],
                          on='ts_code', how='left')
        else:
            df = df_daily.copy()
            for col in ['pe_ttm', 'pb', 'ps_ttm', 'total_mv', 'circ_mv']:
                df[col] = None

        # 4. 转换为 DB 格式
        rows = []
        for _, r in df.iterrows():
            td_raw = str(r.get('trade_date', '') or '').strip()
            if len(td_raw) == 8:
                td = f"{td_raw[:4]}-{td_raw[4:6]}-{td_raw[6:8]}"
            else:
                td = td_raw

            def safe_float(v):
                try:
                    f = float(v)
                    return None if pd.isna(f) else f
                except (TypeError, ValueError):
                    return None

            rows.append({
                'ts_code':    str(r['ts_code']).strip(),
                'trade_date': td,
                'open':       safe_float(r.get('open')),
                'high':       safe_float(r.get('high')),
                'low':        safe_float(r.get('low')),
                'close':      safe_float(r.get('close')),
                'pre_close':  safe_float(r.get('pre_close')),
                'pct_chg':    safe_float(r.get('pct_chg')),
                'vol':        safe_float(r.get('vol')),
                'amount':     safe_float(r.get('amount')),
                'pe_ttm':     safe_float(r.get('pe_ttm')),
                'pb':         safe_float(r.get('pb')),
                'ps_ttm':     safe_float(r.get('ps_ttm')),
                'total_mv':   safe_float(r.get('total_mv')),
                'circ_mv':    safe_float(r.get('circ_mv')),
            })

        if not rows:
            return {'date': trade_date, 'rows': 0, 'status': 'empty', 'msg': '转换后行数为0'}

        if dry_run:
            return {'date': trade_date, 'rows': len(rows), 'status': 'dry_run', 'msg': f'dry-run: {len(rows)} 行'}

        # 5. 写入数据库
        upserted = upsert_batch(rows)
        return {'date': trade_date, 'rows': upserted, 'status': 'ok', 'msg': f'写入 {upserted} 行'}

    except Exception as e:
        log.error(f"  {trade_date} 采集失败: {e}")
        return {'date': trade_date, 'rows': 0, 'status': 'error', 'msg': str(e)}


# ── 主函数 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='REQ-014: 个股日线数据采集')
    parser.add_argument('--mode', choices=['full', 'incremental'], default='full')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--workers', type=int, default=MAX_WORKERS)
    args = parser.parse_args()

    log.info(f"=== REQ-014: stock_daily 采集开始 (mode={args.mode}, workers={args.workers}) ===")

    pro = init_tushare()

    # 确定采集范围
    today = date.today().strftime('%Y%m%d')
    if args.mode == 'incremental':
        start = (date.today() - timedelta(days=7)).strftime('%Y%m%d')
        end   = today
    else:
        start = START_DATE
        end   = today

    # 获取交易日列表（由近到远）
    log.info(f"获取交易日列表: {start} ~ {end}...")
    trade_dates = gen_trade_dates(start, end, pro)
    log.info(f"共 {len(trade_dates)} 个交易日")

    # 断点续采：过滤已完成的日期
    done_dates = load_progress()
    if args.mode == 'full':
        pending_dates = [d for d in trade_dates if d not in done_dates]
        log.info(f"已完成 {len(done_dates)} 个，待采集 {len(pending_dates)} 个")
    else:
        pending_dates = trade_dates  # 增量模式不跳过
        log.info(f"增量模式，采集最近 {len(pending_dates)} 个交易日")

    if not pending_dates:
        log.info("✅ 所有日期已采集完成，无需重复采集")
        return

    # 多线程采集
    total_rows = 0
    success_count = 0
    error_count = 0
    lock_done = set(done_dates)

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(collect_one_date, d, pro, args.dry_run): d
            for d in pending_dates
        }
        for future in as_completed(futures):
            result = future.result()
            d = result['date']
            if result['status'] in ('ok', 'empty', 'dry_run'):
                success_count += 1
                total_rows += result['rows']
                if result['status'] == 'ok':
                    lock_done.add(d)
                    # 每完成 50 个日期保存一次进度
                    if len(lock_done) % 50 == 0:
                        save_progress(lock_done)
                log.info(f"  ✅ {d}: {result['msg']}")
            else:
                error_count += 1
                log.warning(f"  ❌ {d}: {result['msg']}")

    # 保存最终进度
    save_progress(lock_done)

    log.info(f"=== 采集完成: 成功 {success_count} 天，失败 {error_count} 天，共写入 {total_rows} 行 ===")


if __name__ == '__main__':
    main()
