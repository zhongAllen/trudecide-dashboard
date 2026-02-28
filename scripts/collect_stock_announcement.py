"""
上市公司公告采集脚本（REQ-060）
=====================================
用途：采集上市公司公告元数据（标题+链接）及正文，写入 stock_announcement 表
数据来源：Tushare Pro API → disclosure 接口（需单独开通权限）
执行方式：
  python3 collect_stock_announcement.py [--mode history|daily|backfill-content]
                                        [--start YYYYMMDD] [--end YYYYMMDD]
                                        [--ts-code 000001.SZ] [--dry-run]
  --mode history          补录历史公告元数据（按日期循环）
  --mode daily            采集今日公告元数据（默认）
  --mode backfill-content 补抓 content IS NULL 的公告正文（异步补充）
  --ts-code               指定单只股票（调试用）

注意事项：
  1. disclosure 接口需要单独开通权限（非积分制），确认权限后再运行
  2. 公告正文（content）通过 url 异步抓取，与元数据采集分离
  3. 主键冲突用 upsert（on_conflict=ts_code,ann_date,ann_type），安全重跑
  4. backfill-content 模式：查询 content IS NULL 的记录，逐条抓取 url 内容
  5. 断点续传：已完成的日期记录在 /tmp/announcement_checkpoint.txt
"""
import os
import sys
import time
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
DEFAULT_START   = "20150101"
CHECKPOINT_FILE = "/tmp/announcement_checkpoint.txt"
BATCH_SIZE      = 500
API_SLEEP       = 0.5

# 公告类型映射（Tushare disclosure 返回的 type_name → 我们的 ann_type）
ANN_TYPE_MAP = {
    '年度报告':   'annual',
    '半年度报告': 'semi',
    '一季度报告': 'quarter',
    '三季度报告': 'quarter',
    '季度报告':   'quarter',
}

def map_ann_type(type_name: str) -> str:
    if not type_name:
        return 'other'
    for k, v in ANN_TYPE_MAP.items():
        if k in type_name:
            return v
    return 'other'

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
    """将 Tushare disclosure DataFrame 转换为 stock_announcement 表行格式"""
    rows = []
    for _, r in df.iterrows():
        ann_date_raw = str(r.get('ann_date', '') or r.get('end_date', '') or '')
        if len(ann_date_raw) == 8:
            ann_date = f"{ann_date_raw[:4]}-{ann_date_raw[4:6]}-{ann_date_raw[6:8]}"
        else:
            ann_date = ann_date_raw

        row = {
            'ts_code':  str(r.get('ts_code', '') or ''),
            'ann_date': ann_date or None,
            'ann_type': map_ann_type(str(r.get('type_name', '') or '')),
            'title':    str(r.get('title', '') or '') or None,
            'url':      str(r.get('url', '') or '') or None,
            'content':  None,       # 元数据阶段不抓正文
            'content_at': None,
        }
        rows.append(clean_row(row))
    return [r for r in rows if r.get('ts_code') and r.get('ann_date')]

def upsert_batch(sb, rows: list):
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i+BATCH_SIZE]
        try:
            sb.table("stock_announcement").upsert(
                chunk, on_conflict="ts_code,ann_date,ann_type"
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
    """按日期补录历史公告元数据"""
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

            df = retry(pro.disclosure, **kwargs)
            if df is not None and not df.empty:
                rows = df_to_rows(df)
                if not dry_run:
                    upsert_batch(sb, rows)
                total_rows += len(rows)
                if total_rows % 1000 == 0:
                    print(f"  {date_str}: {len(rows)} 条 | 累计 {total_rows:,} 条")

            save_checkpoint(ck_key)
            time.sleep(API_SLEEP)

        d += timedelta(days=1)

    print(f"✅ 历史公告补录完成，累计 {total_rows:,} 条")

# ── 日增量模式 ────────────────────────────────────────────────────────────────
def collect_daily(pro, sb, dry_run: bool):
    """采集今日公告"""
    today = date.today().strftime('%Y%m%d')
    print(f"\n=== 日增量公告采集：{today} ===")

    df = retry(pro.disclosure, ann_date=today)
    if df is not None and not df.empty:
        rows = df_to_rows(df)
        if not dry_run:
            upsert_batch(sb, rows)
        print(f"✅ 今日公告：{len(rows)} 条")
    else:
        print("今日暂无公告数据")

# ── 正文补抓模式 ──────────────────────────────────────────────────────────────
def backfill_content(sb, dry_run: bool):
    """
    查询 content IS NULL 且有 url 的公告，逐条抓取正文
    注意：需要 requests + BeautifulSoup，且交易所 PDF 需要额外解析
    此处为框架，具体解析逻辑待实现
    """
    print(f"\n=== 公告正文补抓 ===")
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        print("❌ 需要安装 requests 和 beautifulsoup4")
        return

    # 查询待补抓记录（每次处理 100 条）
    r = sb.table("stock_announcement") \
          .select("ts_code,ann_date,ann_type,url") \
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
            # 简单提取正文文本（实际需根据交易所页面结构调整）
            text = soup.get_text(separator='\n', strip=True)[:50000]  # 限制 50K 字符

            if not dry_run:
                from datetime import timezone
                sb.table("stock_announcement").update({
                    'content':    text,
                    'content_at': datetime.now(timezone.utc).isoformat()
                }).eq('ts_code', rec['ts_code']) \
                  .eq('ann_date', rec['ann_date']) \
                  .eq('ann_type', rec['ann_type']) \
                  .execute()
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
