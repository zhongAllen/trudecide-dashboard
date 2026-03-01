"""
5只异常缺失正常股补采脚本
==========================
背景：
  stock_daily 和 stock_moneyflow 在最新交易日（2026-02-27）缺少以下5只正常上市股票：
    600438.SH  通威股份
    600673.SH  东阳光
    603056.SH  德邦股份
    603121.SH  华培动力
    603966.SH  法兰泰克

  这5只股票在 stock_meta 中 is_active=True，但最新日无数据，属于采集遗漏。

执行方式：
  python3 patch_missing_5stocks.py [--dry-run] [--start-date YYYYMMDD]
  --dry-run       只打印，不写库
  --start-date    补采起始日期，默认 20250617（与现有数据起始对齐）

注意事项：
  1. 按股票逐只补采（Tushare daily 支持 ts_code 参数按股票查询）
  2. 补采范围：start_date 至今，避免重复写入（upsert 幂等）
  3. stock_moneyflow 同样补采（Tushare moneyflow 支持 ts_code 参数）
  4. 北交所（BJ）股票不在本脚本补采范围内（Tushare moneyflow 不覆盖北交所）
"""
import os
import sys
import time
import logging
import argparse
from datetime import date, datetime
import pandas as pd
import tushare as ts
import requests

# ── 日志配置 ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/tmp/patch_missing_5stocks.log', mode='a'),
    ]
)
log = logging.getLogger(__name__)

# ── 配置 ──────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN    = os.environ.get('TUSHARE_TOKEN', '')
SUPABASE_URL     = os.environ.get('SUPABASE_URL', '')
SUPABASE_SVC_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

BATCH_SIZE = 300
API_SLEEP  = 0.5

# 5只目标股票
TARGET_STOCKS = [
    ('600438.SH', '通威股份'),
    ('600673.SH', '东阳光'),
    ('603056.SH', '德邦股份'),
    ('603121.SH', '华培动力'),
    ('603966.SH', '法兰泰克'),
]

# ── Supabase 请求头 ────────────────────────────────────────────────────────────
def get_headers():
    return {
        'apikey': SUPABASE_SVC_KEY,
        'Authorization': f'Bearer {SUPABASE_SVC_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    }

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def safe_float(v):
    try:
        f = float(v)
        return None if pd.isna(f) else f
    except (TypeError, ValueError):
        return None

def upsert_batch(table: str, rows: list) -> int:
    """分批 upsert，带超时重试"""
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        for attempt in range(5):
            resp = requests.post(
                f'{SUPABASE_URL}/rest/v1/{table}',
                headers=get_headers(),
                json=batch,
                timeout=30,
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

# ── 补采 stock_daily ──────────────────────────────────────────────────────────
def patch_stock_daily(pro, ts_code: str, name: str, start_date: str, dry_run: bool) -> int:
    """补采单只股票的 stock_daily 数据"""
    log.info(f"  [stock_daily] 补采 {ts_code} {name} ({start_date} ~ 今)")
    try:
        # Tushare daily 按股票查询
        df_daily = pro.daily(
            ts_code=ts_code,
            start_date=start_date,
            end_date=datetime.today().strftime('%Y%m%d'),
            fields='ts_code,trade_date,open,high,low,close,pre_close,pct_chg,vol,amount'
        )
        if df_daily is None or df_daily.empty:
            log.warning(f"    {ts_code} daily 返回空")
            return 0
        time.sleep(API_SLEEP)

        # daily_basic
        df_basic = pro.daily_basic(
            ts_code=ts_code,
            start_date=start_date,
            end_date=datetime.today().strftime('%Y%m%d'),
            fields='ts_code,trade_date,pe_ttm,pb,ps_ttm,total_mv,circ_mv'
        )
        time.sleep(API_SLEEP)

        # 合并
        if df_basic is not None and not df_basic.empty:
            df = pd.merge(df_daily,
                          df_basic[['ts_code', 'trade_date', 'pe_ttm', 'pb', 'ps_ttm', 'total_mv', 'circ_mv']],
                          on=['ts_code', 'trade_date'], how='left')
        else:
            df = df_daily.copy()
            for col in ['pe_ttm', 'pb', 'ps_ttm', 'total_mv', 'circ_mv']:
                df[col] = None

        # 转换为 DB 格式
        rows = []
        for _, r in df.iterrows():
            td_raw = str(r.get('trade_date', '') or '').strip()
            td = f"{td_raw[:4]}-{td_raw[4:6]}-{td_raw[6:8]}" if len(td_raw) == 8 else td_raw
            rows.append({
                'ts_code':    str(r['ts_code']),
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

        log.info(f"    {ts_code} stock_daily: {len(rows)} 条待写入")
        if dry_run:
            log.info(f"    [DRY-RUN] 跳过写入")
            return len(rows)

        n = upsert_batch('stock_daily', rows)
        log.info(f"    {ts_code} stock_daily: 写入 {n} 条 ✓")
        return n

    except Exception as e:
        log.error(f"    {ts_code} stock_daily 失败: {e}")
        return 0

# ── 补采 stock_moneyflow ──────────────────────────────────────────────────────
def patch_stock_moneyflow(pro, ts_code: str, name: str, start_date: str, dry_run: bool) -> int:
    """补采单只股票的 stock_moneyflow 数据"""
    log.info(f"  [stock_moneyflow] 补采 {ts_code} {name} ({start_date} ~ 今)")
    try:
        df = pro.moneyflow(
            ts_code=ts_code,
            start_date=start_date,
            end_date=datetime.today().strftime('%Y%m%d'),
        )
        time.sleep(API_SLEEP)

        if df is None or df.empty:
            log.warning(f"    {ts_code} moneyflow 返回空")
            return 0

        rows = []
        for _, r in df.iterrows():
            td_raw = str(r.get('trade_date', '') or '').strip()
            td = f"{td_raw[:4]}-{td_raw[4:6]}-{td_raw[6:8]}" if len(td_raw) == 8 else td_raw

            def net(buy_col, sell_col):
                b = safe_float(r.get(buy_col))
                s = safe_float(r.get(sell_col))
                if b is None and s is None:
                    return None
                return (b or 0) - (s or 0)

            rows.append({
                'ts_code':        str(r['ts_code']),
                'trade_date':     td,
                'net_amount':     safe_float(r.get('net_mf_amount')),
                'buy_elg_amount': net('buy_elg_amount', 'sell_elg_amount'),
                'buy_lg_amount':  net('buy_lg_amount', 'sell_lg_amount'),
                'buy_md_amount':  net('buy_md_amount', 'sell_md_amount'),
                'buy_sm_amount':  net('buy_sm_amount', 'sell_sm_amount'),
                'source':         'tushare',
            })

        log.info(f"    {ts_code} stock_moneyflow: {len(rows)} 条待写入")
        if dry_run:
            log.info(f"    [DRY-RUN] 跳过写入")
            return len(rows)

        n = upsert_batch('stock_moneyflow', rows)
        log.info(f"    {ts_code} stock_moneyflow: 写入 {n} 条 ✓")
        return n

    except Exception as e:
        log.error(f"    {ts_code} stock_moneyflow 失败: {e}")
        return 0

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='补采5只异常缺失股票的日线和资金流向数据')
    parser.add_argument('--dry-run', action='store_true', help='只打印，不写库')
    parser.add_argument('--start-date', default='20250617', help='补采起始日期 YYYYMMDD，默认 20250617')
    args = parser.parse_args()

    dry_run    = args.dry_run
    start_date = args.start_date

    log.info(f"=== 5只异常缺失股票补采 {'[DRY-RUN]' if dry_run else ''} ===")
    log.info(f"补采范围: {start_date} ~ 今")
    log.info(f"目标股票: {[s[0] for s in TARGET_STOCKS]}")
    log.info("")

    if not TUSHARE_TOKEN:
        log.error("TUSHARE_TOKEN 未设置，退出")
        sys.exit(1)
    if not SUPABASE_SVC_KEY and not dry_run:
        log.error("SUPABASE_SERVICE_KEY 未设置，退出")
        sys.exit(1)

    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()

    total_daily = 0
    total_mf    = 0

    for ts_code, name in TARGET_STOCKS:
        log.info(f"\n{'='*50}")
        log.info(f"处理: {ts_code} {name}")

        # 补采 stock_daily
        n = patch_stock_daily(pro, ts_code, name, start_date, dry_run)
        total_daily += n
        time.sleep(1)

        # 补采 stock_moneyflow
        n = patch_stock_moneyflow(pro, ts_code, name, start_date, dry_run)
        total_mf += n
        time.sleep(1)

    log.info(f"\n{'='*50}")
    log.info(f"=== 补采完成 ===")
    log.info(f"  stock_daily    写入: {total_daily} 条")
    log.info(f"  stock_moneyflow 写入: {total_mf} 条")
    log.info(f"日志文件: /tmp/patch_missing_5stocks.log")

if __name__ == '__main__':
    main()
