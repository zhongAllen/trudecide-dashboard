"""
新闻快讯采集脚本（REQ-059）
=====================================
用途：采集 9 大来源新闻快讯，写入 news 表
数据来源：Tushare Pro API → news 接口
数据源：sina / wallstreetcn / 10jqka / eastmoney / cls / yicai / fenghuang / jinrongjie / yuncaijing
执行方式：
  python3 collect_news.py [--mode history|daily] [--src all|sina|cls|...]
                          [--start "YYYY-MM-DD HH:MM:SS"] [--end "YYYY-MM-DD HH:MM:SS"]
                          [--dry-run]
  --mode history  补录历史数据（按天循环，每天分时段拉取）
  --mode daily    采集今日新闻（默认模式）
  --src           指定数据源，默认 all（全部9个）

注意事项：
  1. news 接口 start_date/end_date 格式必须包含时间：'YYYY-MM-DD HH:MM:SS'
  2. 单次最大返回 1000 条，历史补录需按时段分批（每次拉 2 小时）
  3. 去重：写入时用 ON CONFLICT (title_hash) DO NOTHING，安全重跑
  4. news 接口需要单独开通权限（与积分无关）
  5. 断点续传：已完成的 src+date 记录在 /tmp/news_checkpoint.txt
"""
import os
import sys
import time
import argparse
import hashlib
import math
from datetime import datetime, date, timedelta
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN   = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
DEFAULT_START   = "2018-01-01"   # news 接口历史数据起始
CHECKPOINT_FILE = "/tmp/news_checkpoint.txt"
BATCH_SIZE      = 500
API_SLEEP       = 1.0            # news 接口限额较严

# 全部 9 个数据源
ALL_SOURCES = [
    'sina', 'wallstreetcn', '10jqka', 'eastmoney',
    'cls', 'yicai', 'fenghuang', 'jinrongjie', 'yuncaijing'
]

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_clients():
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    sb  = create_client(SUPABASE_URL, SUPABASE_KEY)
    return pro, sb

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def retry(fn, retries=3, sleep_sec=5, **kwargs):
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
    cleaned = {}
    for k, v in row.items():
        if v is None:
            cleaned[k] = None
        elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            cleaned[k] = None
        else:
            cleaned[k] = v
    return cleaned

def df_to_rows(df: pd.DataFrame, src: str) -> list:
    """将 Tushare news DataFrame 转换为 news 表行格式"""
    rows = []
    for _, r in df.iterrows():
        title = str(r.get('title', '') or '')
        pub_time = str(r.get('datetime', '') or '')
        # 生成去重 hash（与 DDL 中 GENERATED ALWAYS 列保持一致）
        title_hash = hashlib.md5(f"{src}|{pub_time}|{title}".encode()).hexdigest()
        row = {
            'src':         src,
            'pub_time':    pub_time if pub_time else None,
            'title':       title or None,
            'content':     str(r.get('content', '') or '') or None,
            'ts_code':     str(r.get('codes', '') or '') or None,  # 关联股票代码
            'url':         str(r.get('url', '') or '') or None,
            'sentiment':   None,    # 预留，由 AI 分析后填入
            'keywords':    None,    # 预留
            'title_hash':  title_hash,
        }
        rows.append(clean_row(row))
    return rows

def upsert_batch(sb, rows: list):
    """分批 upsert，冲突时跳过（去重）"""
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i+BATCH_SIZE]
        try:
            # 利用 title_hash 唯一约束去重
            sb.table("news").upsert(
                chunk,
                on_conflict="title_hash",
                ignore_duplicates=True
            ).execute()
        except Exception as e:
            print(f"  ❌ upsert 失败（{len(chunk)} 行）: {e}")

def load_checkpoint() -> set:
    if not os.path.exists(CHECKPOINT_FILE):
        return set()
    with open(CHECKPOINT_FILE) as f:
        return set(line.strip() for line in f if line.strip())

def save_checkpoint(key: str):
    with open(CHECKPOINT_FILE, "a") as f:
        f.write(key + "\n")

# ── 按时段拉取（单次最大1000条，按2小时分段）────────────────────────────────
def collect_src_timerange(pro, src: str, start_dt: str, end_dt: str) -> pd.DataFrame:
    """
    按时段分批拉取，避免单次超过 1000 条上限
    start_dt/end_dt 格式：'YYYY-MM-DD HH:MM:SS'
    """
    all_dfs = []
    # 将时间段切成 2 小时小块
    fmt = '%Y-%m-%d %H:%M:%S'
    t_start = datetime.strptime(start_dt, fmt)
    t_end   = datetime.strptime(end_dt, fmt)
    step    = timedelta(hours=2)

    t = t_start
    while t < t_end:
        t_next = min(t + step, t_end)
        df = retry(
            pro.news,
            src=src,
            start_date=t.strftime(fmt),
            end_date=t_next.strftime(fmt)
        )
        if df is not None and not df.empty:
            all_dfs.append(df)
        t = t_next
        time.sleep(API_SLEEP)

    return pd.concat(all_dfs) if all_dfs else pd.DataFrame()

# ── 历史补录模式 ──────────────────────────────────────────────────────────────
def collect_history(pro, sb, sources: list, start_date: str, end_date: str, dry_run: bool):
    """按天、按来源补录历史新闻"""
    print(f"\n=== 历史新闻补录 ===")
    done = load_checkpoint()
    total_rows = 0

    # 生成日期列表
    d = datetime.strptime(start_date, '%Y-%m-%d').date()
    end_d = datetime.strptime(end_date, '%Y-%m-%d').date()
    dates = []
    while d <= end_d:
        dates.append(d)
        d += timedelta(days=1)

    for src in sources:
        print(f"\n  来源: {src}")
        for day in dates:
            ck_key = f"{src}_{day.strftime('%Y%m%d')}"
            if ck_key in done:
                continue

            start_dt = f"{day.strftime('%Y-%m-%d')} 00:00:00"
            end_dt   = f"{day.strftime('%Y-%m-%d')} 23:59:59"
            df = collect_src_timerange(pro, src, start_dt, end_dt)

            if df is not None and not df.empty:
                rows = df_to_rows(df, src)
                if not dry_run:
                    upsert_batch(sb, rows)
                total_rows += len(rows)
                print(f"    {day}: {len(rows)} 条")

            save_checkpoint(ck_key)

    print(f"\n✅ 历史新闻补录完成，累计 {total_rows:,} 条")

# ── 日增量模式 ────────────────────────────────────────────────────────────────
def collect_daily(pro, sb, sources: list, dry_run: bool):
    """采集今日新闻"""
    today = date.today()
    start_dt = f"{today.strftime('%Y-%m-%d')} 00:00:00"
    end_dt   = f"{today.strftime('%Y-%m-%d')} 23:59:59"
    print(f"\n=== 日增量新闻采集：{today} ===")
    total_rows = 0

    for src in sources:
        df = collect_src_timerange(pro, src, start_dt, end_dt)
        if df is not None and not df.empty:
            rows = df_to_rows(df, src)
            if not dry_run:
                upsert_batch(sb, rows)
            total_rows += len(rows)
            print(f"  {src}: {len(rows)} 条")
        else:
            print(f"  {src}: 0 条")

    print(f"✅ 今日新闻采集完成，共 {total_rows:,} 条")

# ── 主入口 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='新闻快讯采集（REQ-059）')
    parser.add_argument('--mode',    choices=['history', 'daily'], default='daily')
    parser.add_argument('--src',     default='all', help='数据源，多个用逗号分隔，all=全部')
    parser.add_argument('--start',   default=DEFAULT_START, help='历史起始日期 YYYY-MM-DD')
    parser.add_argument('--end',     default=date.today().strftime('%Y-%m-%d'))
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if not TUSHARE_TOKEN:
        print("❌ 缺少 TUSHARE_TOKEN 环境变量")
        sys.exit(1)

    sources = ALL_SOURCES if args.src == 'all' else [s.strip() for s in args.src.split(',')]
    pro, sb = init_clients()

    if args.mode == 'daily':
        collect_daily(pro, sb, sources, args.dry_run)
    else:
        collect_history(pro, sb, sources, args.start, args.end, args.dry_run)

    print("\n🎉 采集完成")

if __name__ == '__main__':
    main()
