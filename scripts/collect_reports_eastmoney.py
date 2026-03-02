"""
东方财富研报采集脚本（REQ-076）- 多线程加速版
================================================
用途：采集东方财富研报中心的个股/行业/宏观研报，写入 reports 宽表
数据来源：东方财富 reportapi.eastmoney.com（公开接口，无调用次数限制）

执行方式：
  python3 collect_reports_eastmoney.py [--mode full|incremental] [--dry-run] [--limit N] [--workers N]
  --mode full         全量采集（2025-01-01 至今），默认
  --mode incremental  增量采集（仅最近7天）
  --dry-run           只打印，不写库
  --limit N           限制每种类型采集条数（测试用，如 --limit 5）
  --workers N         并发线程数，默认 8

加速策略：
  1. 按月份分片：将时间范围切成若干月份区间，每个区间独立采集
  2. 线程池并发：多个月份区间同时采集，互不干扰
  3. UPSERT 去重：report_id 主键保证幂等，重复运行安全

注意事项：
  1. 接口无调用次数限制，可放心多线程（建议 8~16 线程）
  2. 东方财富返回 JSONP 格式 datatable({...})，需剥离后解析
  3. market 字段是 "SHANGHAI"/"SHENZHEN" 字符串（不是 0/1 数字）
  4. 日期格式是 "2026-03-01 00:00:00.000"（带时间的字符串）
  5. ts_code 格式：stockCode + market → "000001.SZ" / "600000.SH"
  6. 踩坑#12：脚本字段必须是数据库表字段的子集
"""
import os
import sys
import time
import argparse
import threading
from datetime import datetime, date, timedelta, timezone
from dateutil.relativedelta import relativedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
API_SLEEP       = 0.2    # 每次请求间隔（秒）
RETRY_TIMES     = 3      # 失败重试次数
RETRY_SLEEP     = 3      # 重试等待（秒）
FULL_START_DATE = "2025-01-01"  # 全量采集起始日期
DEFAULT_WORKERS = 8      # 默认并发线程数

# 研报类型映射（qType → report_type）
QTYPE_MAP = {
    0: "stock",
    1: "industry",
    2: "macro",
}

# 东方财富市场代码 → Tushare 后缀
# 实际返回 "SHANGHAI"/"SHENZHEN" 字符串
MARKET_MAP = {
    "SHANGHAI": "SH",
    "SHENZHEN": "SZ",
    "SH": "SH",
    "SZ": "SZ",
    "1": "SH",
    "0": "SZ",
}

# 线程安全计数器
_lock = threading.Lock()
_total_written = 0
_total_failed = 0

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_client():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ── 工具函数 ──────────────────────────────────────────────────────────────────
EMONEY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://data.eastmoney.com/report/",
    "Accept": "text/javascript, application/javascript, */*",
}


def retry_get(url, params, retries=RETRY_TIMES, sleep_sec=RETRY_SLEEP):
    """带重试的 HTTP GET，处理东方财富 JSONP 格式"""
    import json as json_lib
    for i in range(retries):
        try:
            resp = requests.get(url, params=params, headers=EMONEY_HEADERS, timeout=15)
            resp.raise_for_status()
            text = resp.text.strip()
            # 去掉 JSONP 包装：datatable({...}) → {...}
            if text.startswith("datatable(") and text.endswith(")"):
                text = text[len("datatable("):-1]
            return json_lib.loads(text)
        except Exception as e:
            if i < retries - 1:
                time.sleep(sleep_sec)
    return None


def to_ts_code(stock_code: str, market: str):
    """东方财富股票代码 → Tushare 格式（000001 + SHANGHAI → 000001.SH）"""
    if not stock_code:
        return None
    suffix = MARKET_MAP.get(str(market).upper())
    return f"{stock_code}.{suffix}" if suffix else None


def parse_date(date_str: str):
    """
    东方财富日期 → ISO 日期字符串
    支持：'2026-03-01 00:00:00.000' / '/Date(1740844800000)/' / '20260302'
    """
    if not date_str:
        return None
    s = str(date_str).strip()
    # "2026-03-01 ..." 格式（最常见）
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    # /Date(timestamp)/ 格式
    if s.startswith("/Date("):
        try:
            ts_ms = int(s[6:s.index(")")])
            return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        except Exception:
            return None
    # YYYYMMDD
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return None


def parse_item(item: dict, qtype: int):
    """将东方财富单条研报解析为 reports 表字段"""
    info_code = item.get("infoCode") or item.get("reportCode")
    if not info_code:
        return None

    title = (item.get("title") or "").strip()
    pub_date = parse_date(item.get("publishDate") or item.get("tradeDate") or "")
    if not title or not pub_date:
        return None

    report_type = QTYPE_MAP.get(qtype, "stock")
    ts_code = None
    stock_name = None
    if report_type == "stock":
        ts_code = to_ts_code(
            item.get("stockCode") or item.get("secuCode") or "",
            item.get("market") or item.get("marketCode") or ""
        )
        stock_name = item.get("stockName") or item.get("secuName")

    industry_name = item.get("industryName") or item.get("indvInduName")

    target_price = None
    raw_tp = item.get("indvAimPriceT") or item.get("targetPrice")
    if raw_tp:
        try:
            target_price = float(raw_tp)
        except (ValueError, TypeError):
            pass

    page_count = None
    raw_pc = item.get("attachPages") or item.get("pageCount")
    if raw_pc:
        try:
            page_count = int(raw_pc)
        except (ValueError, TypeError):
            pass

    return {
        "report_id":     f"eastmoney-{info_code}",
        "source":        "eastmoney",
        "report_type":   report_type,
        "publish_date":  pub_date,
        "title":         title,
        "org_name":      (item.get("orgSName") or item.get("orgName") or "").strip() or None,
        "author":        (item.get("researcher") or item.get("author") or "").strip() or None,
        "ts_code":       ts_code,
        "stock_name":    stock_name,
        "industry_name": industry_name,
        "rating":        item.get("emRatingName") or item.get("ratingName"),
        "target_price":  target_price,
        "pdf_url":       f"https://pdf.dfcfw.com/pdf/H3_{info_code}_1.pdf",
        "page_count":    page_count,
    }


def fetch_and_upsert_month(sb, qtype: int, start_date: str, end_date: str,
                           dry_run: bool = False):
    """
    采集指定月份区间的所有研报并写入数据库
    这是线程池的工作单元，每个月份区间独立运行
    返回：(written, failed)
    """
    global _total_written, _total_failed

    url = "https://reportapi.eastmoney.com/report/list"
    page = 1
    page_size = 100
    written = 0
    total_pages = 0

    while True:
        params = {
            "cb": "datatable",
            "industryCode": "*",
            "pageSize": page_size,
            "industry": "*",
            "rating": "*",
            "ratingChange": "*",
            "beginTime": start_date,
            "endTime": end_date,
            "pageNo": page,
            "fields": "",
            "qType": qtype,
            "orgCode": "",
            "code": "*",
            "_": int(time.time() * 1000),
        }

        data = retry_get(url, params)
        if not data:
            break

        items = data.get("data", [])
        if not isinstance(items, list) or not items:
            break

        total_pages = data.get("TotalPage") or 0

        # 解析
        rows = [r for item in items if (r := parse_item(item, qtype))]

        # 写入
        if rows and not dry_run:
            try:
                sb.table("reports").upsert(rows, on_conflict="report_id").execute()
                written += len(rows)
            except Exception as e:
                with _lock:
                    _total_failed += len(rows)
        elif rows and dry_run:
            written += len(rows)

        # 更新全局计数
        with _lock:
            _total_written += len(rows)

        if page >= total_pages and total_pages > 0:
            break
        page += 1
        time.sleep(API_SLEEP)

    return written


def generate_month_ranges(start_date: str, end_date: str):
    """
    将时间范围按月切片，返回 [(start, end), ...] 列表
    例：2025-01-01 ~ 2026-03-01 → [(2025-01-01, 2025-01-31), (2025-02-01, 2025-02-28), ...]
    """
    ranges = []
    current = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()

    while current <= end:
        # 月末
        next_month = current + relativedelta(months=1)
        month_end = min(next_month - timedelta(days=1), end)
        ranges.append((current.strftime("%Y-%m-%d"), month_end.strftime("%Y-%m-%d")))
        current = next_month

    return ranges


def collect_qtype(sb, qtype: int, start_date: str, end_date: str,
                  workers: int, dry_run: bool, limit: int = None):
    """
    多线程采集指定类型的研报
    策略：按月份分片，每个月份区间作为一个任务，线程池并发执行
    """
    type_name = QTYPE_MAP.get(qtype, "unknown")
    print(f"\n{'='*60}")
    print(f"[{type_name}] 开始采集 (qType={qtype}) | workers={workers}")
    print(f"时间范围: {start_date} ~ {end_date}")

    # 生成月份区间
    month_ranges = generate_month_ranges(start_date, end_date)
    print(f"共 {len(month_ranges)} 个月份区间，并发 {workers} 线程")
    print(f"{'='*60}")

    total = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(fetch_and_upsert_month, sb, qtype, s, e, dry_run): (s, e)
            for s, e in month_ranges
        }
        for future in as_completed(futures):
            s, e = futures[future]
            try:
                written = future.result()
                total += written
                elapsed = time.time() - start_time
                speed = total / elapsed if elapsed > 0 else 0
                print(f"  ✅ {s}~{e}: {written} 条 | 累计 {total} 条 | 速度 {speed:.0f} 条/秒")
            except Exception as exc:
                print(f"  ❌ {s}~{e}: 失败 - {exc}")

            if limit and total >= limit:
                print(f"  已达到 limit={limit}，停止")
                # 取消剩余任务
                for f in futures:
                    f.cancel()
                break

    elapsed = time.time() - start_time
    print(f"\n[{type_name}] 完成: {total} 条，耗时 {elapsed:.1f}s，平均速度 {total/elapsed:.0f} 条/秒")
    return total


# ── 入口 ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="东方财富研报采集脚本（REQ-076）多线程版")
    parser.add_argument("--mode", choices=["full", "incremental"], default="full")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS,
                        help=f"并发线程数，默认 {DEFAULT_WORKERS}")
    args = parser.parse_args()

    end_date = date.today().strftime("%Y-%m-%d")
    start_date = (date.today() - timedelta(days=7)).strftime("%Y-%m-%d") \
        if args.mode == "incremental" else FULL_START_DATE

    print(f"模式: {args.mode} | workers: {args.workers} | dry-run: {args.dry_run} | limit: {args.limit}")
    print(f"日期: {start_date} ~ {end_date}")

    # 安装 python-dateutil（如果没有）
    try:
        from dateutil.relativedelta import relativedelta
    except ImportError:
        import subprocess
        subprocess.run(["pip3", "install", "python-dateutil", "-q"])

    sb = init_client()
    grand_total = 0
    grand_start = time.time()

    for qtype in [0, 1, 2]:  # 个股、行业、宏观
        written = collect_qtype(
            sb, qtype, start_date, end_date,
            workers=args.workers,
            dry_run=args.dry_run,
            limit=args.limit
        )
        grand_total += written

    elapsed = time.time() - grand_start
    print(f"\n{'='*60}")
    print(f"✅ 全部完成！总写入: {grand_total} 条，总耗时: {elapsed:.1f}s")
    print(f"   平均速度: {grand_total/elapsed:.0f} 条/秒")
    if _total_failed > 0:
        print(f"   ⚠️  失败: {_total_failed} 条")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
