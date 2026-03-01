"""
PMI 历史数据采集脚本 - 数据来源：Eulerpool（S&P Global）
覆盖：US 制造业 PMI、US 服务业 PMI、EU 制造业 PMI、EU 服务业 PMI
历史深度：2012-06 至今
量纲：50 为中性（与中国 PMI 完全对齐）
"""

import os
import re
import json
import time
from datetime import datetime
from playwright.sync_api import sync_playwright
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 指标配置：(region, indicator_id, eulerpool_url, description)
PMI_TARGETS = [
    (
        "US",
        "pmi_mfg",
        "https://www.eulerpool.com/en/macro/stany-zjednoczone/manufacturing-pmi",
        "US S&P Global Manufacturing PMI",
    ),
    (
        "US",
        "pmi_non_mfg",
        "https://www.eulerpool.com/en/macro/stany-zjednoczone/services-pmi",
        "US S&P Global Services PMI",
    ),
    (
        "EU",
        "pmi_mfg",
        "https://www.eulerpool.com/en/macro/eurozone/manufacturing-pmi",
        "Eurozone S&P Global Manufacturing PMI",
    ),
    (
        "EU",
        "pmi_non_mfg",
        "https://www.eulerpool.com/en/macro/eurozone/services-pmi",
        "Eurozone S&P Global Services PMI",
    ),
]

JS_EXTRACT = """() => {
    const rows = document.querySelectorAll('tr');
    const data = [];
    const seen = {};
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
            const date = cells[0].textContent.trim();
            const value = cells[1].textContent.trim();
            const key = date + value;
            if (date && value && !seen[key]) {
                seen[key] = true;
                data.push({date: date, value: value});
            }
        }
    });
    return data;
}"""


def parse_date(date_str):
    """将 '1/1/2026' 格式转换为 '2026-01-01'"""
    try:
        dt = datetime.strptime(date_str.strip(), "%m/%d/%Y")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


def parse_value(value_str):
    """将 '52.4  Points' 格式转换为 float"""
    try:
        num = re.search(r"[\d.]+", value_str)
        if num:
            return float(num.group())
    except Exception:
        pass
    return None


def get_indicator_id(region, indicator_slug):
    """查询 indicator_meta 表获取 indicator_id"""
    res = (
        supabase.table("indicator_meta")
        .select("id")
        .eq("region", region)
        .eq("indicator_id", indicator_slug)
        .execute()
    )
    if res.data:
        return res.data[0]["id"]
    return None


def upsert_values(indicator_id, records):
    """批量 upsert 到 indicator_values 表"""
    if not records:
        return 0
    rows = [
        {
            "indicator_id": indicator_id,
            "date": r["date"],
            "value": r["value"],
        }
        for r in records
    ]
    # 分批写入，每批 200 条
    written = 0
    for i in range(0, len(rows), 200):
        batch = rows[i : i + 200]
        supabase.table("indicator_values").upsert(
            batch, on_conflict="indicator_id,date"
        ).execute()
        written += len(batch)
    return written


def scrape_eulerpool(page, url, description):
    """用 Playwright 抓取 Eulerpool 页面的 PMI 数据"""
    print(f"  Fetching: {description}")
    print(f"  URL: {url}")
    
    try:
        page.goto(url, timeout=30000)
        page.wait_for_timeout(8000)
        
        raw_rows = page.evaluate(JS_EXTRACT)
        print(f"  Raw rows: {len(raw_rows)}")
        
        records = []
        for row in raw_rows:
            date = parse_date(row["date"])
            value = parse_value(row["value"])
            if date and value is not None:
                records.append({"date": date, "value": value})
        
        # 去重（按日期）
        seen_dates = {}
        for r in records:
            if r["date"] not in seen_dates:
                seen_dates[r["date"]] = r["value"]
        
        final = [{"date": d, "value": v} for d, v in sorted(seen_dates.items())]
        print(f"  Parsed: {len(final)} records")
        if final:
            print(f"  Range: {final[0]['date']} ~ {final[-1]['date']}")
        return final
        
    except Exception as e:
        print(f"  Error: {e}")
        return []


def main():
    print("=" * 60)
    print("PMI 历史数据采集 - Eulerpool (S&P Global)")
    print("=" * 60)
    
    summary = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        
        for region, indicator_slug, url, description in PMI_TARGETS:
            print(f"\n[{region}] {indicator_slug} - {description}")
            
            # 查询 indicator_id
            ind_id = get_indicator_id(region, indicator_slug)
            if not ind_id:
                print(f"  ERROR: indicator_meta 中未找到 {region}/{indicator_slug}")
                summary.append((region, indicator_slug, 0, "indicator_id not found"))
                continue
            print(f"  indicator_id: {ind_id}")
            
            # 抓取数据
            records = scrape_eulerpool(page, url, description)
            
            if not records:
                print(f"  WARNING: 未获取到数据")
                summary.append((region, indicator_slug, 0, "no data"))
                continue
            
            # 写入数据库
            written = upsert_values(ind_id, records)
            print(f"  Written: {written} records")
            summary.append((region, indicator_slug, written, "OK"))
            
            # 避免请求过快
            time.sleep(3)
        
        browser.close()
    
    print("\n" + "=" * 60)
    print("采集汇总")
    print("=" * 60)
    for region, slug, count, status in summary:
        print(f"  [{region}] {slug}: {count} records - {status}")
    
    total = sum(c for _, _, c, _ in summary)
    print(f"\n总计写入: {total} 条")


if __name__ == "__main__":
    main()
