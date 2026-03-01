"""
上市公司公告采集脚本（REQ-060）
=====================================
用途：采集上市公司公告元数据（标题+链接）及正文，写入 stock_announcement 表
数据来源：Tushare Pro API → anns_d 接口（需单独开通权限）
接口文档：https://tushare.pro/document/2?doc_id=176
执行方式：
  python3 collect_stock_announcement.py [--mode history|daily|backfill-content]
                                        [--start YYYYMMDD] [--end YYYYMMDD]
                                        [--ts-code 000001.SZ] [--dry-run]
  --mode history          补录历史公告元数据（按日期循环）
  --mode daily            采集今日公告元数据（默认）
  --mode backfill-content 补抓 content IS NULL 的公告正文（异步补充）
  --ts-code               指定单只股票（调试用）

注意事项：
  1. anns_d 接口需要单独开通权限（非积分制），确认权限后再运行
  2. 公告正文（content）通过 url 异步抓取，与元数据采集分离
  3. 单次最大返回 2000 条，按日期循环获取全量
  4. 主键：ts_code + ann_date + title_hash（md5(ts_code|ann_date|title)），防重复
  5. 断点续传：已完成的日期记录在 /tmp/announcement_checkpoint.txt

数据模型（stock_announcement 表）：
  ts_code      TEXT        股票代码
  ann_date     DATE        公告日期
  ann_type     TEXT        公告类型（annual/semi/quarter/other，从 title 推断）
  title        TEXT        公告标题
  title_hash   TEXT        PK，md5(ts_code|ann_date|title)，去重键
  url          TEXT        PDF 下载链接
  rec_time     TIMESTAMPTZ 发布时间（Tushare rec_time 字段）
  content      TEXT        公告正文（backfill-content 模式补抓）
  content_at   TIMESTAMPTZ 正文抓取时间
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
# 采集范围：近1年（用户决策 2026-03-01）
_DEFAULT_START_DAYS = 365
DEFAULT_START   = (date.today() - timedelta(days=_DEFAULT_START_DAYS)).strftime('%Y%m%d')
CHECKPOINT_FILE = "/tmp/announcement_checkpoint.txt"
BATCH_SIZE      = 500
API_SLEEP       = 0.5

# 公告类型推断（从 title 关键词推断 ann_type）
ANN_TYPE_KEYWORDS = {
    'annual':  ['年度报告', '年报', '年度业绩'],
    'semi':    ['半年度报告', '半年报', '中期报告'],
    'quarter': ['一季度', '三季度', '季度报告', '季报'],
}

def infer_ann_type(title: str) -> str:
    if not title:
        return 'other'
    for ann_type, keywords in ANN_TYPE_KEYWORDS.items():
        for kw in keywords:
            if kw in title:
                return ann_type
    return 'other'

def make_title_hash(ts_code: str, ann_date: str, title: str) -> str:
    """生成公告去重键：md5(ts_code|ann_date|title)"""
    raw = f"{ts_code}|{ann_date}|{title}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()

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

def df_to_rows(df: pd.DataFrame) -> list:
    """
    将 Tushare anns_d DataFrame 转换为 stock_announcement 表行格式
    Tushare 返回字段：ann_date, ts_code, name, title, url, rec_time
    """
    rows = []
    for _, r in df.iterrows():
        ts_code = str(r.get('ts_code', '') or '')
        ann_date_raw = str(r.get('ann_date', '') or '')
        title = str(r.get('title', '') or '') or None

        # 日期格式转换：YYYYMMDD → YYYY-MM-DD
        if len(ann_date_raw) == 8:
            ann_date = f"{ann_date_raw[:4]}-{ann_date_raw[4:6]}-{ann_date_raw[6:8]}"
        else:
            ann_date = ann_date_raw or None

        # rec_time 处理
        rec_time_raw = r.get('rec_time', None)
        rec_time = str(rec_time_raw) if rec_time_raw and str(rec_time_raw) not in ('nan', 'None', '') else None

        # 生成去重 hash
        title_hash = make_title_hash(ts_code, ann_date_raw, title or '')

        row = {
            'ts_code':    ts_code,
            'ann_date':   ann_date or None,
            'ann_type':   infer_ann_type(title or ''),
            'title':      title,
            'title_hash': title_hash,
            'url':        str(r.get('url', '') or '') or None,
            'rec_time':   rec_time,
            'content':    None,       # 元数据阶段不抓正文
            'content_at': None,
        }
        rows.append(clean_row(row))

    # 批内去重：同一批次内 title_hash 相同只保留第一条（Tushare 数据本身可能有重复）
    seen = set()
    deduped = []
    for r in rows:
        if r.get('ts_code') and r.get('ann_date'):
            h = r.get('title_hash')
            if h not in seen:
                seen.add(h)
                deduped.append(r)
    return deduped

def upsert_batch(sb, rows: list):
    """upsert，on_conflict=title_hash（唯一去重键）"""
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i+BATCH_SIZE]
        try:
            sb.table("stock_announcement").upsert(
                chunk, on_conflict="title_hash"
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
def collect_history(pro, sb, start_date: str, end_date: str, ts_code_filter: str, dry_run: bool):
    """按日期补录历史公告元数据（接口：anns_d）"""
    print(f"\n=== 历史公告元数据补录 ===")
    print(f"日期范围：{start_date} ~ {end_date}")
    done = load_checkpoint()
    total_rows = 0

    d = datetime.strptime(start_date, '%Y%m%d').date()
    end_d = datetime.strptime(end_date, '%Y%m%d').date()

    while d <= end_d:
        date_str = d.strftime('%Y%m%d')
        ck_key = f"ann_{date_str}"

        if ck_key not in done:
            kwargs = {'ann_date': date_str}
            if ts_code_filter:
                kwargs['ts_code'] = ts_code_filter

            df = retry(pro.anns_d, **kwargs)
            if df is not None and not df.empty:
                rows = df_to_rows(df)
                if not dry_run:
                    upsert_batch(sb, rows)
                total_rows += len(rows)
                if len(rows) > 0:
                    print(f"  {date_str}: {len(rows)} 条 | 累计 {total_rows:,} 条")

            save_checkpoint(ck_key)
            time.sleep(API_SLEEP)

        d += timedelta(days=1)

    print(f"✅ 历史公告补录完成，累计 {total_rows:,} 条")

# ── 日增量模式 ────────────────────────────────────────────────────────────────
def collect_daily(pro, sb, dry_run: bool):
    """采集今日公告（接口：anns_d）"""
    today = date.today().strftime('%Y%m%d')
    print(f"\n=== 日增量公告采集：{today} ===")

    df = retry(pro.anns_d, ann_date=today)
    if df is not None and not df.empty:
        rows = df_to_rows(df)
        if not dry_run:
            upsert_batch(sb, rows)
        print(f"✅ 今日公告：{len(rows)} 条")
    else:
        print("今日暂无公告数据")

# ── 正文补抓模式 ──────────────────────────────────────────────────────────────
def backfill_content(sb, dry_run: bool):
    """查询 content IS NULL 且有 url 的公告，逐条抓取正文"""
    print(f"\n=== 公告正文补抓 ===")
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        print("❌ 需要安装 requests 和 beautifulsoup4")
        return

    r = sb.table("stock_announcement") \
          .select("ts_code,ann_date,ann_type,title_hash,url") \
          .is_("content", "null") \
          .not_.is_("url", "null") \
          .limit(100) \
          .execute()

    if not r.data:
        print("✅ 无待补抓记录")
        return

    print(f"待补抓：{len(r.data)} 条")
    updated = 0

    for rec in r.data:
        url = rec.get('url')
        if not url:
            continue
        try:
            resp = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
            soup = BeautifulSoup(resp.text, 'html.parser')
            text = soup.get_text(separator='\n', strip=True)[:50000]

            if not dry_run:
                from datetime import timezone
                sb.table("stock_announcement").update({
                    'content':    text,
                    'content_at': datetime.now(timezone.utc).isoformat()
                }).eq('title_hash', rec['title_hash']).execute()
            updated += 1
            time.sleep(0.5)
        except Exception as e:
            print(f"  ⚠️  {rec['ts_code']} {rec['ann_date']}: {e}")

    print(f"✅ 正文补抓完成：{updated} 条")

# ── 主入口 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='上市公司公告采集（REQ-060）')
    parser.add_argument('--mode',     choices=['history', 'daily', 'backfill-content'], default='daily')
    parser.add_argument('--start',    default=DEFAULT_START)
    parser.add_argument('--end',      default=date.today().strftime('%Y%m%d'))
    parser.add_argument('--ts-code',  default='', help='指定单只股票（调试用）')
    parser.add_argument('--dry-run',  action='store_true')
    args = parser.parse_args()

    if not TUSHARE_TOKEN:
        print("❌ 缺少 TUSHARE_TOKEN 环境变量")
        sys.exit(1)

    pro, sb = init_clients()

    if args.mode == 'daily':
        collect_daily(pro, sb, args.dry_run)
    elif args.mode == 'history':
        collect_history(pro, sb, args.start, args.end, args.ts_code, args.dry_run)
    elif args.mode == 'backfill-content':
        backfill_content(sb, args.dry_run)

    print("\n🎉 采集完成")

if __name__ == '__main__':
    main()
