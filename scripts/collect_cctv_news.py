"""
新闻联播文字稿采集脚本（REQ-067）
=====================================
用途：采集 CCTV 新闻联播文字稿，写入 cctv_news 表
数据来源：Tushare Pro API → cctv_news 接口
数据格式：每天多条（10~20条），每条为独立新闻标题+内容
执行方式：
  python3 collect_cctv_news.py [--mode history|daily]
                               [--start YYYYMMDD] [--end YYYYMMDD]
                               [--dry-run]
  --mode history  补录历史数据（按天循环）
  --mode daily    采集今日新闻联播（默认模式）

注意事项：
  1. cctv_news 接口每天返回 10~20 条独立新闻条目（非一条整体文字稿）
  2. 主键为 (date, title_hash)，支持每天多条，安全重跑
  3. title_hash = md5(date|title)，由应用层计算后写入
  4. 采集范围：2026年起（用户决策 2026-03-01）
  5. 断点续传：已完成的日期记录在 /tmp/cctv_news_checkpoint.txt

数据模型（cctv_news 表）：
  date         DATE        PK（复合），播出日期
  title_hash   TEXT        PK（复合），md5(date|title)
  title        TEXT        新闻标题
  content      TEXT        新闻正文
  collected_at TIMESTAMPTZ 采集时间（DEFAULT now()）
"""
import os
import sys
import time
import hashlib
import argparse
import math
from datetime import datetime, date, timedelta
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN   = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
# 采集范围：2026年起（用户决策 2026-03-01）
DEFAULT_START   = "20260101"
CHECKPOINT_FILE = "/tmp/cctv_news_checkpoint.txt"
BATCH_SIZE      = 100
API_SLEEP       = 0.5

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

def make_title_hash(date_str: str, title: str) -> str:
    """计算 title_hash = md5(date|title)"""
    raw = f"{date_str}|{title or ''}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()

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

def df_to_rows(df: pd.DataFrame, trade_date: str) -> list:
    """
    将 Tushare cctv_news DataFrame 转换为 cctv_news 表行格式
    Tushare 返回字段：date（YYYYMMDD）, title, content
    表主键：(date DATE, title_hash TEXT)
    """
    rows = []
    seen_hashes = set()  # 批内去重

    for _, r in df.iterrows():
        raw_date = str(r.get('date', trade_date) or trade_date)
        # 统一转为 YYYY-MM-DD 格式（Supabase DATE 类型）
        if len(raw_date) == 8 and '-' not in raw_date:
            date_val = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
        else:
            date_val = raw_date

        title   = str(r.get('title', '') or '').strip() or None
        content = str(r.get('content', '') or '').strip() or None

        # 计算 title_hash（主键之一）
        title_hash = make_title_hash(date_val, title or '')

        # 批内去重
        if title_hash in seen_hashes:
            continue
        seen_hashes.add(title_hash)

        row = {
            'date':       date_val,
            'title_hash': title_hash,
            'title':      title,
            'content':    content,
        }
        rows.append(clean_row(row))

    return rows

def upsert_batch(sb, rows: list):
    """
    分批 upsert 到 cctv_news 表
    主键 (date, title_hash) 冲突时更新
    """
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i+BATCH_SIZE]
        try:
            sb.table("cctv_news").upsert(
                chunk,
                on_conflict="date,title_hash"
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

# ── 历史补录模式 ──────────────────────────────────────────────────────────────
def collect_history(pro, sb, start_date: str, end_date: str, dry_run: bool):
    """按天补录历史新闻联播文字稿"""
    print(f"\n=== 新闻联播历史补录：{start_date} ~ {end_date} ===")
    done = load_checkpoint()
    total_rows = 0

    # 兼容 YYYYMMDD 和 YYYY-MM-DD 两种格式
    fmt_s = '%Y-%m-%d' if '-' in start_date else '%Y%m%d'
    fmt_e = '%Y-%m-%d' if '-' in end_date else '%Y%m%d'
    d     = datetime.strptime(start_date, fmt_s).date()
    end_d = datetime.strptime(end_date,   fmt_e).date()

    while d <= end_d:
        date_str = d.strftime('%Y%m%d')
        if date_str in done:
            d += timedelta(days=1)
            continue

        df = retry(pro.cctv_news, date=date_str)
        if df is not None and not df.empty:
            rows = df_to_rows(df, date_str)
            if not dry_run:
                upsert_batch(sb, rows)
            total_rows += len(rows)
            print(f"  ✅ {date_str}: {len(rows)} 条")
        else:
            print(f"  ⚠️  {date_str}: 无数据（节假日或接口限制）")

        save_checkpoint(date_str)
        d += timedelta(days=1)
        time.sleep(API_SLEEP)

    print(f"\n✅ 历史新闻联播补录完成，累计 {total_rows:,} 条")

# ── 日增量模式 ────────────────────────────────────────────────────────────────
def collect_daily(pro, sb, dry_run: bool):
    """采集今日新闻联播文字稿"""
    today    = date.today()
    date_str = today.strftime('%Y%m%d')
    print(f"\n=== 日增量新闻联播采集：{date_str} ===")

    df = retry(pro.cctv_news, date=date_str)
    if df is not None and not df.empty:
        rows = df_to_rows(df, date_str)
        if not dry_run:
            upsert_batch(sb, rows)
        print(f"  ✅ 写入 {len(rows)} 条")
    else:
        print(f"  ⚠️  今日无数据（可能尚未更新或节假日）")

    print(f"✅ 今日新闻联播采集完成")

# ── 主入口 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='新闻联播文字稿采集（REQ-067）')
    parser.add_argument('--mode',    choices=['history', 'daily'], default='daily')
    parser.add_argument('--start',   default=DEFAULT_START, help='历史起始日期 YYYYMMDD')
    parser.add_argument('--end',     default=date.today().strftime('%Y%m%d'))
    parser.add_argument('--dry-run', action='store_true', help='仅打印，不写入数据库')
    args = parser.parse_args()

    if not TUSHARE_TOKEN:
        print("❌ 缺少 TUSHARE_TOKEN 环境变量")
        sys.exit(1)

    pro, sb = init_clients()

    if args.mode == 'daily':
        collect_daily(pro, sb, args.dry_run)
    else:
        collect_history(pro, sb, args.start, args.end, args.dry_run)

    print("\n🎉 采集完成")

if __name__ == '__main__':
    main()
