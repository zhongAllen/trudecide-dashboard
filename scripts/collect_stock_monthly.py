"""
个股月线数据采集脚本（REQ-172）
===============================
用途：采集 A 股全量股票的月线行情，写入 stock_monthly 表
数据来源：Tushare Pro stk_monthly 接口
采集范围：stock_meta 中所有股票，最近 5 年
执行方式：
  python3 collect_stock_monthly.py [--mode full|incremental] [--dry-run] [--workers N]
  --mode full         全量采集（最近5年），默认
  --mode incremental  增量采集（仅最近 3 个月）
  --dry-run           只打印，不写库
  --workers N         并发线程数，默认 10
接口文档：https://tushare.pro/document/2?doc_id=145
积分要求：2000 积分
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
        logging.FileHandler('/tmp/stock_monthly_collect.log', mode='a'),
    ]
)
log = logging.getLogger(__name__)

# ── 配置 ──────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN    = os.environ.get('TUSHARE_TOKEN', '')
SUPABASE_URL     = os.environ.get('SUPABASE_URL', '')
SUPABASE_SVC_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

MAX_WORKERS   = 10      # 并发线程数
BATCH_SIZE    = 500     # upsert 批次大小
API_SLEEP     = 0.3     # 每次请求间隔（秒）
RETRY_TIMES   = 3       # 失败重试次数
RETRY_SLEEP   = 5       # 重试等待（秒）
PROGRESS_FILE = '/tmp/stock_monthly_progress.json'
YEARS_BACK    = 5       # 全量采集年数

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
    """加载已完成的股票代码集合"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            data = json.load(f)
            return set(data.get('done_codes', []))
    return set()


def save_progress(done_codes: set):
    """保存进度"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump({'done_codes': sorted(done_codes), 'updated_at': datetime.now().isoformat()}, f)


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


def upsert_batch(rows: list[dict], table: str = 'stock_monthly') -> int:
    """分批 upsert 到数据库"""
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        for attempt in range(5):
            resp = requests.post(
                f'{SUPABASE_URL}/rest/v1/{table}',
                headers=HEADERS,
                json=batch,
            )
            if resp.ok:
                total += len(batch)
                break
            elif '57014' in resp.text or 'statement timeout' in resp.text:
                wait = 10 * (attempt + 1)
                log.warning(f"  57014 超时，{wait}s 后重试 (attempt {attempt+1}/5)")
                time.sleep(wait)
            else:
                log.error(f"  upsert 失败: {resp.status_code} - {resp.text[:200]}")
                break
        time.sleep(0.1)
    return total


def get_stock_list(pro) -> list[str]:
    """获取所有股票代码列表"""
    df = retry_call(pro.stock_basic, exchange='', list_status='L', fields='ts_code')
    return df['ts_code'].tolist() if df is not None and not df.empty else []


# ── 核心采集逻辑（单只股票）────────────────────────────────────────────────────
def collect_one_stock(ts_code: str, pro, start_date: str, end_date: str, dry_run: bool = False) -> dict:
    """
    采集单只股票的月线数据
    返回: {'code': str, 'rows': int, 'status': 'ok'|'empty'|'error', 'msg': str}
    """
    try:
        time.sleep(API_SLEEP)
        
        # 获取月线数据
        df = retry_call(
            pro.monthly,
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fields='ts_code,trade_date,open,high,low,close,pre_close,pct_chg,vol,amount'
        )
        
        if df is None or df.empty:
            return {'code': ts_code, 'rows': 0, 'status': 'empty', 'msg': '无月线数据'}
        
        # 转换为 DB 格式
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
            })
        
        if not rows:
            return {'code': ts_code, 'rows': 0, 'status': 'empty', 'msg': '转换后行数为0'}
        
        if dry_run:
            return {'code': ts_code, 'rows': len(rows), 'status': 'dry_run', 'msg': f'dry-run: {len(rows)} 行'}
        
        # 写入数据库
        upserted = upsert_batch(rows, 'stock_monthly')
        return {'code': ts_code, 'rows': upserted, 'status': 'ok', 'msg': f'写入 {upserted} 行'}
        
    except Exception as e:
        log.error(f"  {ts_code} 采集失败: {e}")
        return {'code': ts_code, 'rows': 0, 'status': 'error', 'msg': str(e)}


# ── 主函数 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='REQ-172: 个股月线数据采集')
    parser.add_argument('--mode', choices=['full', 'incremental'], default='full')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--workers', type=int, default=MAX_WORKERS)
    parser.add_argument('--stock', type=str, default='', help='指定单只股票代码（如 000001.SZ）')
    args = parser.parse_args()

    log.info(f"=== REQ-172: stock_monthly 采集开始 (mode={args.mode}, workers={args.workers}) ===")
    
    pro = init_tushare()
    
    # 确定采集范围
    today = date.today()
    if args.mode == 'incremental':
        # 增量：最近 3 个月
        start_date = (today - timedelta(days=90)).strftime('%Y%m%d')
    else:
        # 全量：最近 5 年
        start_date = (today.replace(year=today.year - YEARS_BACK)).strftime('%Y%m%d')
    
    end_date = today.strftime('%Y%m%d')
    log.info(f"采集日期范围: {start_date} ~ {end_date}")
    
    # 获取股票列表
    if args.stock:
        stock_list = [args.stock]
        log.info(f"指定单只股票: {args.stock}")
    else:
        stock_list = get_stock_list(pro)
        log.info(f"获取股票列表: {len(stock_list)} 只")
    
    # 加载进度
    done_codes = load_progress()
    if done_codes and args.mode == 'full' and not args.stock:
        stock_list = [c for c in stock_list if c not in done_codes]
        log.info(f"排除已完成: 剩余 {len(stock_list)} 只")
    
    # 并发采集
    results = {'ok': 0, 'empty': 0, 'error': 0, 'total_rows': 0}
    
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(collect_one_stock, code, pro, start_date, end_date, args.dry_run): code
            for code in stock_list
        }
        
        for future in as_completed(futures):
            code = futures[future]
            try:
                result = future.result()
                results[result['status']] = results.get(result['status'], 0) + 1
                if result['status'] == 'ok':
                    results['total_rows'] += result['rows']
                    done_codes.add(code)
                    # 每 100 个保存一次进度
                    if len(done_codes) % 100 == 0:
                        save_progress(done_codes)
                        log.info(f"进度: {len(done_codes)}/{len(stock_list)}, 本次写入: {results['total_rows']} 行")
            except Exception as e:
                log.error(f"{code} 异常: {e}")
                results['error'] += 1
    
    # 保存最终进度
    save_progress(done_codes)
    
    log.info("=== 采集完成 ===")
    log.info(f"成功: {results.get('ok', 0)}, 空数据: {results.get('empty', 0)}, 失败: {results.get('error', 0)}")
    log.info(f"总写入行数: {results['total_rows']}")


if __name__ == '__main__':
    main()
