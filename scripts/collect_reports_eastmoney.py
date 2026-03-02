"""
东方财富研报采集脚本（REQ-076）
================================
用途：采集东方财富研报中心的个股/行业/宏观/策略研报，写入 reports 宽表
数据来源：东方财富 reportapi.eastmoney.com（公开接口，无调用次数限制）
执行方式：
  python3 collect_reports_eastmoney.py [--mode full|incremental] [--dry-run] [--limit N]
  --mode full         全量采集（2025-01-01 至今），默认
  --mode incremental  增量采集（仅最近7天）
  --dry-run           只打印，不写库
  --limit N           限制采集条数（用于测试，如 --limit 5）

注意事项：
  1. 接口无调用次数限制，可放心全量采集
  2. 东方财富无摘要字段（abstract），由 Tushare 补充（每天5次限额）
  3. ts_code 需转换格式：东方财富用 "000001" + market "0/1"，转为 "000001.SZ/SH"
  4. report_id 格式：eastmoney-{infoCode}，如 eastmoney-AP202603021234567
  5. 主键 report_id，ON CONFLICT DO UPDATE 更新除 collected_at 外所有字段
  6. 踩坑#12：脚本字段必须是数据库表字段的子集，不能多也不能少
  7. 踩坑#11：PK 单列 report_id，无多列 PK 冲突风险
"""
import os
import sys
import time
import argparse
import hashlib
from datetime import datetime, date, timedelta, timezone
import requests
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
BATCH_SIZE      = 100    # 每批 upsert 行数（东方财富每页最多100条）
API_SLEEP       = 0.5    # 每次请求间隔（秒），无限制但适当礼貌
RETRY_TIMES     = 3      # 失败重试次数
RETRY_SLEEP     = 5      # 重试等待（秒）
FULL_START_DATE = "2025-01-01"  # 全量采集起始日期

# 东方财富研报类型映射（qType → report_type）
# 0=个股研报 1=行业研报 2=宏观研报 3=策略研报
QTYPE_MAP = {
    0: "stock",
    1: "industry",
    2: "macro",
    3: "strategy",
}

# 东方财富市场代码 → Tushare 后缀
# 实际返回的是字符串："SHANGHAI"或"SHENZHEN"，不是数字 0/1
MARKET_MAP = {
    "SHANGHAI": "SH",
    "SHENZHEN": "SZ",
    "SH": "SH",
    "SZ": "SZ",
    "1": "SH",   # 兼容旧格式
    "0": "SZ",   # 兼容旧格式
}

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_client():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    return sb


# ── 工具函数 ──────────────────────────────────────────────────────────────────
# 东方财富请求头（必须带 Referer，否则返回空响应）
EMONEY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://data.eastmoney.com/report/",
    "Accept": "text/javascript, application/javascript, */*",
}


def retry_get(url, params, retries=RETRY_TIMES, sleep_sec=RETRY_SLEEP):
    """
    带重试的 HTTP GET，处理东方财富 JSONP 格式
    注意：东方财富返回 JSONP 格式 datatable({...})，不是纯 JSON
    必须去掉 datatable() 包装后再解析
    """
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
            print(f"  ⚠️  第{i+1}次失败: {e}")
            if i < retries - 1:
                time.sleep(sleep_sec)
    raise Exception(f"HTTP 请求失败，已重试 {retries} 次")


def to_ts_code(stock_code: str, market: str) -> str | None:
    """
    东方财富股票代码 → Tushare 格式
    东方财富: stock_code="000001", market="0"(深) / "1"(沪)
    Tushare:  "000001.SZ" / "600000.SH"
    """
    if not stock_code:
        return None
    suffix = MARKET_MAP.get(str(market))
    if suffix:
        return f"{stock_code}.{suffix}"
    return None


def parse_publish_date(date_str: str) -> str | None:
    """
    东方财富日期格式 → ISO 日期字符串
    输入："2026-03-01 00:00:00.000" 或 "/Date(1740844800000)/" 或 "2026-03-02" 或 "20260302"
    输出："2026-03-02"
    """
    if not date_str:
        return None
    date_str = str(date_str).strip()
    # "2026-03-01 00:00:00.000" 格式（带时间的日期字符串）
    if len(date_str) >= 10 and date_str[4] == "-" and date_str[7] == "-":
        return date_str[:10]
    # /Date(timestamp)/ 格式（毫秒时间戳）
    if date_str.startswith("/Date("):
        try:
            ts_ms = int(date_str[6:date_str.index(")")])
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return None
    # YYYYMMDD
    if len(date_str) == 8 and date_str.isdigit():
        return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    return None


def fetch_page(qtype: int, page: int, page_size: int = 100,
               start_date: str = None, end_date: str = None) -> dict:
    """
    拉取东方财富研报列表一页
    API: https://reportapi.eastmoney.com/report/list
    qType: 0=个股 1=行业 2=宏观 3=策略
    """
    url = "https://reportapi.eastmoney.com/report/list"
    params = {
        "cb": "datatable",
        "industryCode": "*",
        "pageSize": page_size,
        "industry": "*",
        "rating": "*",
        "ratingChange": "*",
        "beginTime": start_date or FULL_START_DATE,
        "endTime": end_date or date.today().strftime("%Y-%m-%d"),
        "pageNo": page,
        "fields": "",
        "qType": qtype,
        "orgCode": "",
        "code": "*",
        "_": int(time.time() * 1000),
    }
    data = retry_get(url, params)
    return data


def parse_report(item: dict, qtype: int) -> dict | None:
    """
    将东方财富 API 返回的单条研报解析为 reports 表字段
    注意：只填写 reports 表中实际存在的字段（踩坑#12）
    """
    info_code = item.get("infoCode") or item.get("reportCode")
    if not info_code:
        return None

    report_id = f"eastmoney-{info_code}"
    report_type = QTYPE_MAP.get(qtype, "stock")

    # 发布日期
    pub_date = parse_publish_date(
        item.get("publishDate") or item.get("tradeDate") or ""
    )
    if not pub_date:
        return None

    # 标题
    title = (item.get("title") or "").strip()
    if not title:
        return None

    # 股票代码（个股研报专属）
    stock_code = item.get("stockCode") or item.get("secuCode") or ""
    market = str(item.get("market") or item.get("marketCode") or "")
    ts_code = to_ts_code(stock_code, market) if report_type == "stock" else None
    stock_name = item.get("stockName") or item.get("secuName") if report_type == "stock" else None

    # 行业名称（行业研报专属）
    industry_name = None
    if report_type == "industry":
        industry_name = item.get("industryName") or item.get("indvInduName")
    elif report_type == "stock":
        # 个股研报也有行业信息，存入 industry_name
        industry_name = item.get("industryName") or item.get("indvInduName")

    # 评级和目标价
    rating = item.get("emRatingName") or item.get("ratingName")
    target_price_raw = item.get("indvAimPriceT") or item.get("targetPrice")
    target_price = None
    if target_price_raw:
        try:
            target_price = float(target_price_raw)
        except (ValueError, TypeError):
            pass

    # PDF 链接
    pdf_url = None
    if info_code:
        pdf_url = f"https://pdf.dfcfw.com/pdf/H3_{info_code}_1.pdf"

    # 页数
    page_count = None
    raw_pages = item.get("attachPages") or item.get("pageCount")
    if raw_pages:
        try:
            page_count = int(raw_pages)
        except (ValueError, TypeError):
            pass

    return {
        "report_id":     report_id,
        "source":        "eastmoney",
        "report_type":   report_type,
        "publish_date":  pub_date,
        "title":         title,
        # abstract 留空，由 Tushare 补充
        "org_name":      (item.get("orgSName") or item.get("orgName") or "").strip() or None,
        "author":        (item.get("researcher") or item.get("author") or "").strip() or None,
        "ts_code":       ts_code,
        "stock_name":    stock_name,
        "industry_name": industry_name,
        "rating":        rating,
        "target_price":  target_price,
        "pdf_url":       pdf_url,
        "page_count":    page_count,
        # AI提取层和回测层字段初始为 NULL，不写入（让数据库默认 NULL）
    }


def upsert_batch(sb, rows: list[dict], dry_run: bool = False) -> int:
    """批量 upsert 到 reports 表，返回成功写入行数"""
    if not rows:
        return 0
    if dry_run:
        print(f"  [dry-run] 跳过写入 {len(rows)} 条")
        return len(rows)
    try:
        sb.table("reports").upsert(
            rows,
            on_conflict="report_id"
        ).execute()
        return len(rows)
    except Exception as e:
        print(f"  ❌ upsert 失败: {e}")
        return 0


# ── 主采集逻辑 ────────────────────────────────────────────────────────────────
def collect(sb, qtype: int, start_date: str, end_date: str,
            dry_run: bool = False, limit: int = None) -> int:
    """
    采集指定类型研报，返回总写入行数
    """
    type_name = QTYPE_MAP.get(qtype, "unknown")
    print(f"\n{'='*60}")
    print(f"开始采集: {type_name} 研报 (qType={qtype})")
    print(f"时间范围: {start_date} ~ {end_date}")
    print(f"{'='*60}")

    total_written = 0
    page = 1
    # limit 模式下每页拉 limit 条，正常模式每页 100 条
    page_size = limit if limit else 100
    total_count = 0  # 在循环外初始化，避免作用域问题
    total_pages = 0  # 在循环外初始化，避免作用域问题

    while True:
        print(f"  拉取第 {page} 页...", end=" ", flush=True)
        try:
            data = fetch_page(qtype, page, page_size, start_date, end_date)
        except Exception as e:
            print(f"❌ 失败: {e}")
            break

        # 东方财富返回格式：{"hits": N, "size": N, "data": [...], "TotalPage": N}
        # data 字段直接是列表，不是嵌套字典
        items = []
        if isinstance(data, dict):
            raw = data.get("data")
            if isinstance(raw, list):
                items = raw
            elif isinstance(raw, dict):
                # 兼容可能的嵌套格式
                items = raw.get("list") or raw.get("data") or []
        # 注意：total_count/total_pages 必须在 if 块外赋值，确保作用域正确
        if isinstance(data, dict):
            total_count = data.get("hits") or data.get("total") or 0
            total_pages = data.get("TotalPage") or 0

        if not items:
            print(f"无数据，停止（共 {total_written} 条）")
            break

        print(f"获取 {len(items)} 条", end=" ")

        # 解析
        rows = []
        for item in items:
            parsed = parse_report(item, qtype)
            if parsed:
                rows.append(parsed)

        # 写入
        written = upsert_batch(sb, rows, dry_run)
        total_written += written
        print(f"→ 写入 {written} 条（累计 {total_written}）")

        # 打印前5条样本（仅第1页）
        if page == 1 and rows:
            print(f"\n  --- 样本数据（前{min(3,len(rows))}条）---")
            for r in rows[:3]:
                print(f"  report_id: {r['report_id']}")
                print(f"  title:     {r['title'][:50]}...")
                print(f"  org_name:  {r['org_name']} | author: {r['author']}")
                print(f"  ts_code:   {r['ts_code']} | rating: {r['rating']} | target: {r['target_price']}")
                print(f"  pdf_url:   {r['pdf_url']}")
                print()

        # 检查是否达到 limit
        if limit and total_written >= limit:
            print(f"  已达到 limit={limit}，停止")
            break

        # 检查是否还有下一页（使用 TotalPage 字段）
        if page >= total_pages and total_pages > 0:
            print(f"  已到最后一页（共 {total_pages} 页，{total_count} 条），停止")
            break

        page += 1
        time.sleep(API_SLEEP)

    return total_written


# ── 入口 ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="东方财富研报采集脚本（REQ-076）")
    parser.add_argument("--mode", choices=["full", "incremental"], default="full",
                        help="full=全量(2025-01至今) incremental=增量(最近7天)")
    parser.add_argument("--dry-run", action="store_true", help="只打印不写库")
    parser.add_argument("--limit", type=int, default=None,
                        help="限制每种类型采集条数（测试用，如 --limit 5）")
    args = parser.parse_args()

    # 日期范围
    end_date = date.today().strftime("%Y-%m-%d")
    if args.mode == "incremental":
        start_date = (date.today() - timedelta(days=7)).strftime("%Y-%m-%d")
    else:
        start_date = FULL_START_DATE

    print(f"模式: {args.mode} | dry-run: {args.dry_run} | limit: {args.limit}")
    print(f"日期: {start_date} ~ {end_date}")

    sb = init_client()

    grand_total = 0
    # 采集四种类型：个股(0)、行业(1)、宏观(2)、策略(3)
    for qtype in [0, 1, 2, 3]:
        written = collect(sb, qtype, start_date, end_date,
                          dry_run=args.dry_run, limit=args.limit)
        grand_total += written
        time.sleep(1)

    print(f"\n{'='*60}")
    print(f"✅ 全部完成！总写入: {grand_total} 条")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
