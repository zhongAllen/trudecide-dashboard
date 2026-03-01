"""
Forex Factory 经济日历采集脚本（REQ-044~047）
=============================================
用途：从 Forex Factory 官方 JSON 接口采集当周经济事件，写入 economic_events 表
数据来源：
  - https://nfs.faireconomy.media/ff_calendar_thisweek.json
  - 接口说明：免费、无需认证、每周一更新，返回当周全部事件（约 100~150 条）
采集策略：
  - 每次全量拉取本周数据，按 (event_id, event_timestamp) 做 UPSERT
  - actual/forecast/previous 值会随时间逐渐填充，每日运行可增量更新
  - 建议每日运行一次，以保持 actual 值最新
执行方式：
  python3 collect_ff_calendar.py [--dry-run]
  --dry-run   只打印，不写库
注意事项：
  1. 接口有频率限制（429），失败时自动重试，间隔 5 秒
  2. event_id 从 Forex Factory 事件 URL 中提取（格式：/calendar/{id}-{slug}）
     若接口不返回 URL，则用 title+date 的 MD5 作为 event_id
  3. 时间处理：接口返回 ISO 8601 格式，直接存为 TIMESTAMPTZ
  4. 踩坑：接口 country 字段是货币代码（USD/EUR/CNY 等），不是国家名
  5. 踩坑：impact 字段返回 "High"/"Medium"/"Low"，直接存储
"""
import os
import sys
import time
import json
import logging
import hashlib
import argparse
import requests
from datetime import datetime, timezone

# ── 日志配置 ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/tmp/ff_calendar_collect.log', mode='a'),
    ]
)
log = logging.getLogger(__name__)

# ── 配置 ──────────────────────────────────────────────────────────────────────
SUPABASE_URL     = os.environ.get('SUPABASE_URL', '')
SUPABASE_SVC_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

FF_JSON_URL  = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
BATCH_SIZE   = 100
RETRY_TIMES  = 3
RETRY_SLEEP  = 5
API_SLEEP    = 2   # 请求间隔（避免 429）

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def make_event_id(row: dict) -> str:
    """从 URL 提取 event_id，若无 URL 则用 title+date 的 MD5"""
    url = row.get('url', '')
    if url:
        # URL 格式: https://www.forexfactory.com/calendar/851-ge-buba-president-nagel-speaks
        parts = url.rstrip('/').split('/')
        if parts:
            return parts[-1]  # 如 "851-ge-buba-president-nagel-speaks"
    # fallback: MD5(title + date)
    raw = f"{row.get('title', '')}{row.get('date', '')}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def parse_timestamp(date_str: str, time_str: str) -> str:
    """
    将 FF 接口返回的 date/time 字段合并为 ISO 8601 字符串
    接口返回格式示例：
      date: "03-03-2026"  或 ISO 格式 "2026-03-03T00:00:00-0500"
      time: "8:30am"      或 ISO 格式 "2026-03-03T13:30:00-0500"
    优先使用 time 字段（若为完整 ISO 格式），否则拼接 date+time
    """
    # 若 time 是完整 ISO 格式，直接用
    if time_str and 'T' in time_str:
        try:
            dt = datetime.fromisoformat(time_str)
            return dt.isoformat()
        except Exception:
            pass

    # 若 date 是完整 ISO 格式，直接用
    if date_str and 'T' in date_str:
        try:
            dt = datetime.fromisoformat(date_str)
            return dt.isoformat()
        except Exception:
            pass

    # fallback: 返回 date 字符串（只有日期，无时间）
    return date_str or ''


def fetch_this_week() -> list[dict]:
    """拉取本周 FF 经济日历 JSON 数据，失败自动重试"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.forexfactory.com/',
    }
    for attempt in range(1, RETRY_TIMES + 1):
        try:
            r = requests.get(FF_JSON_URL, headers=headers, timeout=30)
            if r.status_code == 429:
                log.warning(f"[{attempt}/{RETRY_TIMES}] 429 频率限制，等待 {RETRY_SLEEP}s...")
                time.sleep(RETRY_SLEEP)
                continue
            r.raise_for_status()
            data = r.json()
            log.info(f"拉取成功，共 {len(data)} 条事件")
            return data
        except Exception as e:
            log.error(f"[{attempt}/{RETRY_TIMES}] 拉取失败: {e}")
            if attempt < RETRY_TIMES:
                time.sleep(RETRY_SLEEP)
    log.error("所有重试均失败，退出")
    return []


def transform(raw: list[dict]) -> list[dict]:
    """将原始 JSON 转换为 economic_events 表格式"""
    rows = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for item in raw:
        event_id  = make_event_id(item)
        ts        = parse_timestamp(item.get('date', ''), item.get('time', ''))
        country   = item.get('country', '')
        title     = item.get('title', '')
        impact    = item.get('impact', '')
        actual    = item.get('actual') or None
        forecast  = item.get('forecast') or None
        previous  = item.get('previous') or None

        if not ts or not title:
            log.warning(f"跳过无效行: {item}")
            continue

        rows.append({
            'event_id':        event_id,
            'event_timestamp': ts,
            'country':         country,
            'title':           title,
            'impact':          impact,
            'actual':          actual,
            'forecast':        forecast,
            'previous':        previous,
            'source':          'Forex Factory',
            'collected_at':    now_iso,
        })
    log.info(f"转换完成，有效行 {len(rows)} 条（原始 {len(raw)} 条）")
    return rows


def upsert_batch(rows: list[dict], dry_run: bool = False) -> int:
    """按批次 UPSERT 写入 Supabase，返回成功写入条数"""
    if dry_run:
        log.info(f"[DRY-RUN] 将写入 {len(rows)} 条，示例：{rows[0] if rows else {}}")
        return len(rows)

    headers = {
        'apikey':        SUPABASE_SVC_KEY,
        'Authorization': f'Bearer {SUPABASE_SVC_KEY}',
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal',
    }
    url = f'{SUPABASE_URL}/rest/v1/economic_events'
    total_ok = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        for attempt in range(1, RETRY_TIMES + 1):
            try:
                r = requests.post(url, headers=headers, json=batch, timeout=30)
                if r.status_code in (200, 201):
                    total_ok += len(batch)
                    log.info(f"批次 {i // BATCH_SIZE + 1}: 写入 {len(batch)} 条 ✓")
                    break
                else:
                    log.error(f"批次 {i // BATCH_SIZE + 1} 失败 [{r.status_code}]: {r.text[:200]}")
                    if attempt < RETRY_TIMES:
                        time.sleep(RETRY_SLEEP)
            except Exception as e:
                log.error(f"批次 {i // BATCH_SIZE + 1} 异常: {e}")
                if attempt < RETRY_TIMES:
                    time.sleep(RETRY_SLEEP)
        time.sleep(0.2)

    return total_ok


# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Forex Factory 经济日历采集脚本')
    parser.add_argument('--dry-run', action='store_true', help='只打印，不写库')
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SVC_KEY:
        log.error("缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_KEY，退出")
        sys.exit(1)

    log.info("=" * 60)
    log.info("Forex Factory 经济日历采集开始")
    log.info(f"模式: {'DRY-RUN' if args.dry_run else '正式写库'}")
    log.info("=" * 60)

    # 1. 拉取数据
    time.sleep(API_SLEEP)
    raw = fetch_this_week()
    if not raw:
        log.error("未获取到数据，退出")
        sys.exit(1)

    # 2. 转换
    rows = transform(raw)
    if not rows:
        log.warning("转换后无有效数据，退出")
        sys.exit(0)

    # 3. 写库
    ok = upsert_batch(rows, dry_run=args.dry_run)

    log.info("=" * 60)
    log.info(f"采集完成：共 {len(rows)} 条，成功写入 {ok} 条")
    log.info("=" * 60)


if __name__ == '__main__':
    main()
