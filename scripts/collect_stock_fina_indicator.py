"""
个股财务指标历史数据采集脚本（REQ-057）
=====================================
用途：采集全市场个股财务指标（ROE/毛利率/同比增速/TTM 等），写入 stock_fina_indicator 表
      - 108 个字段，含 TTM/单季/同比/累计 四套预计算指标
数据来源：Tushare Pro API → fina_indicator_vip 接口
执行方式：
  python3 collect_stock_fina_indicator.py [--start YYYYMMDD] [--end YYYYMMDD]
                                           [--ts-code 000001.SZ]
                                           [--dry-run]
  --start    报告期起始（YYYYMMDD），默认 20150101
  --end      报告期结束（YYYYMMDD），默认今日
  --ts-code  只采集指定股票（调试用）
  --dry-run  只打印，不写库
注意事项：
  1. fina_indicator_vip 需要 5000 积分以上
  2. 按股票代码逐只采集，5500 只股票，断点续传文件：/tmp/fina_indicator_checkpoint.txt
  3. 字段全存（108 字段），包含 TTM/单季/同比/累计 四套预计算指标
  4. 主键冲突键：(ts_code, end_date)  ← fina_indicator_vip 不返回 report_type
  5. 与财务三表（REQ-056）的关联：fina_indicator 是从三表衍生的预计算结果，
     存储后可直接用于选股，无需每次从三表实时计算
"""
import os
import sys
import time
import argparse
from datetime import date
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN   = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")

DEFAULT_START   = "20150101"
BATCH_SIZE      = 500
API_SLEEP       = 0.5
CHECKPOINT_FILE = "/tmp/fina_indicator_checkpoint.txt"

# upsert 冲突键（注意：fina_indicator_vip 接口不返回 report_type，主键只有 ts_code+end_date）
CONFLICT_COLS   = ['ts_code', 'end_date']

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
    return None

def upsert_batch(sb, table, rows, conflict_cols):
    """分批 upsert，避免单次请求过大"""
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        sb.table(table).upsert(batch, on_conflict=','.join(conflict_cols)).execute()

def clean_df(df):
    """
    清洗 DataFrame：
    1. NaN → None
    2. 日期字段 YYYYMMDD → YYYY-MM-DD
    3. numpy 类型 → Python 原生类型
    """
    date_cols = {'ann_date', 'end_date', 'update_flag'}
    rows = []
    for record in df.to_dict('records'):
        cleaned = {}
        for k, v in record.items():
            try:
                if pd.isna(v):
                    cleaned[k] = None
                    continue
            except (TypeError, ValueError):
                pass
            if k in date_cols and isinstance(v, str) and len(v) == 8 and v.isdigit():
                cleaned[k] = f"{v[:4]}-{v[4:6]}-{v[6:8]}"
            elif hasattr(v, 'item'):
                cleaned[k] = v.item()
            else:
                cleaned[k] = v
        rows.append(cleaned)
    return rows

def load_checkpoint():
    if not os.path.exists(CHECKPOINT_FILE):
        return set()
    with open(CHECKPOINT_FILE, 'r') as f:
        return set(line.strip() for line in f if line.strip())

def save_checkpoint(ts_code):
    with open(CHECKPOINT_FILE, 'a') as f:
        f.write(ts_code + '\n')

def get_all_stocks(pro):
    """获取全市场股票列表（含退市股）"""
    dfs = []
    for status in ['L', 'D', 'P']:
        df = retry(pro.stock_basic, exchange='', list_status=status,
                   fields='ts_code,name')
        if df is not None and not df.empty:
            dfs.append(df)
    if not dfs:
        return []
    return sorted(pd.concat(dfs, ignore_index=True)['ts_code'].tolist())

# ── 核心采集函数 ──────────────────────────────────────────────────────────────
def collect_one_stock(pro, sb, ts_code, start_date, end_date, dry_run=False):
    """采集单只股票的财务指标"""
    df = retry(pro.fina_indicator_vip, ts_code=ts_code,
               start_date=start_date, end_date=end_date)
    if df is None or df.empty:
        return 0

    # 去重：Tushare 可能返回同一 end_date 的多条记录，保留第一条（最新披露）
    df = df.drop_duplicates(subset=['ts_code', 'end_date'], keep='first')

    rows = clean_df(df)
    if dry_run:
        return len(rows)

    upsert_batch(sb, 'stock_fina_indicator', rows, CONFLICT_COLS)
    return len(rows)

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='个股财务指标历史数据采集（REQ-057）')
    parser.add_argument('--start',   default=DEFAULT_START, help='报告期起始 YYYYMMDD')
    parser.add_argument('--end',     default=None,          help='报告期结束 YYYYMMDD（默认今日）')
    parser.add_argument('--ts-code', default=None,          help='只采集指定股票（调试用）')
    parser.add_argument('--dry-run', action='store_true',   help='只打印，不写库')
    args = parser.parse_args()

    pro, sb = init_clients()
    dry_run  = args.dry_run
    end_date = args.end or date.today().strftime('%Y%m%d')

    # 确定股票列表
    if args.ts_code:
        stocks = [args.ts_code]
    else:
        print("  → 获取全市场股票列表...")
        stocks = get_all_stocks(pro)
        print(f"  → 共 {len(stocks)} 只股票")

    # 断点续传
    done    = load_checkpoint()
    pending = [s for s in stocks if s not in done]
    print(f"\n=== 采集 stock_fina_indicator ===")
    print(f"  报告期：{args.start} → {end_date}")
    print(f"  已完成 {len(done)} 只，待采集 {len(pending)} 只")

    total_rows = 0
    failed     = []

    for i, ts_code in enumerate(pending, 1):
        try:
            count = collect_one_stock(pro, sb, ts_code, args.start, end_date, dry_run)
            total_rows += count
            if not dry_run:
                save_checkpoint(ts_code)

            if i % 50 == 0 or i <= 5:
                print(f"  [{i}/{len(pending)}] {ts_code}: {count} 行 | 累计 {total_rows:,} 行")

        except Exception as e:
            print(f"  ❌ {ts_code} 失败: {e}")
            failed.append(ts_code)

        time.sleep(API_SLEEP)

    print(f"\n✅ stock_fina_indicator 完成：{len(pending)} 只，{total_rows:,} 行")
    if failed:
        print(f"  ⚠️  失败 {len(failed)} 只：{failed[:10]}{'...' if len(failed)>10 else ''}")

if __name__ == '__main__':
    main()
