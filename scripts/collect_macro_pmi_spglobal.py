"""
S&P Global PMI 历史数据采集脚本

策略（双轨并行）：
1. [主轨] Playwright 直接访问 S&P Global 官网，获取最新 169 条报告（约 2025-08 至 2026-02）
2. [辅轨] Wayback Machine 存档，补充 2022-05 至 2025-07 的历史数据
3. 合并去重后写入数据库

数据范围：2022-04 至今
量纲：50 为荣枯分界线（与中国 PMI 完全对齐）
"""

import os
import re
import time
import subprocess
import tempfile
import logging
from typing import Optional

import requests
from bs4 import BeautifulSoup
from supabase import create_client

# ─── 配置 ─────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_KEY']
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

LANG_EXCLUDE = ['Deutsch', 'Français', 'Español', 'Italiano', 'Português', 'Sector',
                'Türkçe', 'Polska', 'Čeština', 'Română', 'Magyar', 'Slovenský']

US_KEYWORDS = ['Flash US PMI', 'US Manufacturing PMI', 'US Services PMI',
               'S&P Global US Manufacturing', 'S&P Global US Services', 'S&P Global Flash US']
EU_KEYWORDS = ['Flash Eurozone PMI', 'HCOB Eurozone Manufacturing', 'HCOB Eurozone Services',
               'HCOB Flash Eurozone', 'Eurozone Manufacturing PMI', 'Eurozone Services PMI']

MONTH_MAP = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
}

# ─── 数据库操作 ────────────────────────────────────────────────────────────────

def get_indicator_id(region: str, indicator: str) -> Optional[str]:
    res = supabase.table('indicator_meta').select('id').eq('region', region).eq('id', indicator).execute()
    if res.data:
        return res.data[0]['id']
    return None


def upsert_values(indicator_id: str, region: str, records: list) -> int:
    if not records:
        return 0
    rows = [
        {
            'indicator_id': indicator_id,
            'region': region,
            'trade_date': r['date'],
            'publish_date': r['date'],
            'value': r['value'],
            'revision_seq': 0,
        }
        for r in records
    ]
    for i in range(0, len(rows), 500):
        supabase.table('indicator_values').upsert(
            rows[i:i+500],
            on_conflict='indicator_id,region,trade_date,revision_seq'
        ).execute()
    return len(rows)


# ─── 工具函数 ─────────────────────────────────────────────────────────────────

def is_us_target(title: str) -> bool:
    if any(x in title for x in LANG_EXCLUDE):
        return False
    return any(kw in title for kw in US_KEYWORDS)


def is_eu_target(title: str) -> bool:
    if any(x in title for x in LANG_EXCLUDE):
        return False
    return any(kw in title for kw in EU_KEYWORDS)


def parse_data_month(date_text: str) -> Optional[str]:
    """将发布日期转换为数据月份（发布日期的上个月）"""
    m = re.match(r'(\w+)\s+(\d+)\s+(\d{4})', date_text)
    if not m:
        return None
    month_name, day, year = m.group(1), int(m.group(2)), int(m.group(3))
    month = MONTH_MAP.get(month_name)
    if not month:
        return None
    if month == 1:
        return f'{year - 1}-12-01'
    else:
        return f'{year}-{month - 1:02d}-01'


def parse_pmi_from_pdf(pdf_content: bytes, title: str) -> dict:
    """从 PDF 内容中提取 PMI 数值"""
    result = {'mfg': None, 'services': None, 'composite': None}

    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
        f.write(pdf_content)
        pdf_path = f.name

    try:
        proc = subprocess.run(['pdftotext', pdf_path, '-'], capture_output=True, text=True, timeout=30)
        text = proc.stdout
        if not text:
            return result

        # 主要解析方法：找 "Manufacturing/Services/Composite PMI® XX.X" 格式
        pmi_pattern = re.compile(
            r'(Manufacturing|Services|Service|Composite|Output)\s+(?:PMI[®™]?|Index|Output Index)\s*[^\d]*?(\d{2}\.\d)',
            re.IGNORECASE
        )
        for m in pmi_pattern.finditer(text[:4000]):
            category = m.group(1).lower()
            value = float(m.group(2))
            if not (20 <= value <= 80):
                continue
            if 'manufacturing' in category:
                if result['mfg'] is None:
                    result['mfg'] = value
            elif 'service' in category:
                if result['services'] is None:
                    result['services'] = value
            elif 'composite' in category or 'output' in category:
                if result['composite'] is None:
                    result['composite'] = value

        # 备用方法
        if result['mfg'] is None and result['composite'] is None:
            all_vals = re.findall(r'\b(\d{2}\.\d)\b', text[:2000])
            pmi_vals = [float(v) for v in all_vals if 30 <= float(v) <= 70]
            if pmi_vals:
                if 'Flash' in title:
                    if len(pmi_vals) >= 1:
                        result['composite'] = pmi_vals[0]
                    if len(pmi_vals) >= 2:
                        result['mfg'] = pmi_vals[1]
                    if len(pmi_vals) >= 3:
                        result['services'] = pmi_vals[2]
                elif 'Manufacturing' in title:
                    result['mfg'] = pmi_vals[0]
                elif 'Services' in title:
                    result['services'] = pmi_vals[0]

        return result

    except Exception as e:
        log.error(f"PDF parse error: {e}")
        return result
    finally:
        try:
            os.unlink(pdf_path)
        except:
            pass


def assign_pmi_value(pmi: dict, title: str, region: str, data_date: str,
                     us_mfg: dict, us_svc: dict, eu_mfg: dict, eu_svc: dict):
    """将解析出的 PMI 值分配到对应字典"""
    if region == 'US':
        if 'Manufacturing' in title and 'Flash' not in title:
            if pmi['mfg'] and data_date not in us_mfg:
                us_mfg[data_date] = pmi['mfg']
        elif 'Services' in title and 'Flash' not in title:
            if pmi['services'] and data_date not in us_svc:
                us_svc[data_date] = pmi['services']
        elif 'Flash' in title:
            if pmi['mfg'] and data_date not in us_mfg:
                us_mfg[data_date] = pmi['mfg']
            if pmi['services'] and data_date not in us_svc:
                us_svc[data_date] = pmi['services']
            elif pmi['composite'] and data_date not in us_svc:
                us_svc[data_date] = pmi['composite']
    elif region == 'EU':
        if 'Manufacturing' in title and 'Flash' not in title:
            if pmi['mfg'] and data_date not in eu_mfg:
                eu_mfg[data_date] = pmi['mfg']
        elif 'Services' in title and 'Flash' not in title:
            if pmi['services'] and data_date not in eu_svc:
                eu_svc[data_date] = pmi['services']
        elif 'Flash' in title:
            if pmi['mfg'] and data_date not in eu_mfg:
                eu_mfg[data_date] = pmi['mfg']
            if pmi['services'] and data_date not in eu_svc:
                eu_svc[data_date] = pmi['services']
            elif pmi['composite'] and data_date not in eu_svc:
                eu_svc[data_date] = pmi['composite']


# ─── 主轨：Playwright 直接访问官网 ────────────────────────────────────────────

def fetch_live_targets() -> list:
    """用 Playwright 访问 S&P Global 官网，获取最新 169 条报告列表"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.warning("Playwright not installed, skipping live fetch")
        return []

    log.info("=== Phase 1: Fetching live targets from S&P Global website ===")
    targets = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        context = browser.new_context(
            user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = context.new_page()

        try:
            page.goto('https://www.pmi.spglobal.com/Public/Release/PressReleases', timeout=30000)
            page.wait_for_load_state('networkidle', timeout=15000)
            content = page.content()
            log.info(f"Live page length: {len(content)}")

            soup = BeautifulSoup(content, 'html.parser')
            items = soup.find_all('div', class_='listItem')
            log.info(f"Live items: {len(items)}")

            for item in items:
                date_span = item.find('span', class_='releaseDate')
                title_span = item.find('span', class_='releaseTitle')
                link = item.find('a', href=re.compile(r'PressRelease/[a-f0-9]{32}'))
                if not (date_span and title_span and link):
                    continue
                date_text = date_span.get_text(strip=True)
                title_text = title_span.get_text(strip=True)
                href = link.get('href', '')
                hash_match = re.search(r'PressRelease/([a-f0-9]{32})', href)
                if not hash_match:
                    continue
                hash_val = hash_match.group(1)
                is_us = is_us_target(title_text)
                is_eu = is_eu_target(title_text)
                if is_us or is_eu:
                    targets.append({
                        'hash': hash_val,
                        'date': date_text,
                        'title': title_text,
                        'region': 'US' if is_us else 'EU',
                        'source': 'live'
                    })

        except Exception as e:
            log.error(f"Live fetch error: {e}")

        # 用 Playwright 下载每个 PDF
        pdf_cache = {}
        for t in targets:
            hash_val = t['hash']
            if hash_val in pdf_cache:
                continue
            pdf_url = f'https://www.pmi.spglobal.com/Public/Home/PressRelease/{hash_val}'
            try:
                # 拦截下载
                pdf_bytes = None
                with context.expect_download(timeout=20000) as dl_info:
                    try:
                        pdf_page = context.new_page()
                        pdf_page.goto(pdf_url, timeout=20000)
                    except Exception:
                        pass
                download = dl_info.value
                # 保存到临时文件
                tmp_path = f'/tmp/pmi_{hash_val}.pdf'
                download.save_as(tmp_path)
                if os.path.exists(tmp_path):
                    with open(tmp_path, 'rb') as f:
                        pdf_bytes = f.read()
                    os.unlink(tmp_path)
                    if b'%PDF' in pdf_bytes[:10]:
                        pdf_cache[hash_val] = pdf_bytes
                        log.info(f"  [LIVE] Downloaded {t['title'][:50]}: {len(pdf_bytes)} bytes")
                    else:
                        log.warning(f"  [LIVE] Not a PDF: {hash_val}")
                try:
                    pdf_page.close()
                except:
                    pass
            except Exception as e:
                log.warning(f"  [LIVE] Download failed {hash_val}: {e}")
            time.sleep(0.5)

        browser.close()

    # 将 PDF 内容附加到 targets
    for t in targets:
        t['pdf'] = pdf_cache.get(t['hash'])

    log.info(f"Live targets: {len(targets)}, downloaded PDFs: {len(pdf_cache)}")
    return targets


# ─── 辅轨：Wayback Machine 历史数据 ──────────────────────────────────────────

def get_monthly_archives() -> list:
    cdx_url = 'http://web.archive.org/cdx/search/cdx'
    params = {
        'url': 'pmi.spglobal.com/Public/Release/PressReleases',
        'output': 'json',
        'limit': 500,
        'fl': 'timestamp,original',
        'from': '20220101',
        'to': '20260301',
        'collapse': 'timestamp:6',
    }
    r = requests.get(cdx_url, params=params, timeout=30)
    data = r.json()
    archives = [{'timestamp': row[0]} for row in data[1:]]
    log.info(f"Found {len(archives)} monthly Wayback archives")
    return archives


def fetch_archive_releases(timestamp: str) -> list:
    wayback_url = f'https://web.archive.org/web/{timestamp}/https://www.pmi.spglobal.com/Public/Release/PressReleases'
    try:
        r = requests.get(wayback_url, headers=HEADERS, timeout=30)
        if r.status_code != 200:
            log.warning(f"Archive {timestamp}: HTTP {r.status_code}")
            return []
        soup = BeautifulSoup(r.content, 'html.parser')
        items = soup.find_all('div', class_='listItem')
        releases = []
        for item in items:
            date_span = item.find('span', class_='releaseDate')
            title_span = item.find('span', class_='releaseTitle')
            link = item.find('a', href=re.compile(r'PressRelease/[a-f0-9]{32}'))
            if not (date_span and title_span and link):
                continue
            date_text = date_span.get_text(strip=True)
            title_text = title_span.get_text(strip=True)
            href = link.get('href', '')
            hash_match = re.search(r'PressRelease/([a-f0-9]{32})', href)
            if not hash_match:
                continue
            releases.append({'date': date_text, 'title': title_text, 'hash': hash_match.group(1)})
        log.info(f"Archive {timestamp}: {len(releases)} releases")
        return releases
    except Exception as e:
        log.error(f"Error fetching archive {timestamp}: {e}")
        return []


def find_downloadable_timestamp(hash_val: str) -> Optional[str]:
    orig_url = f'https://www.pmi.spglobal.com/Public/Home/PressRelease/{hash_val}'
    cdx_url = 'http://web.archive.org/cdx/search/cdx'
    params = {
        'url': orig_url,
        'output': 'json',
        'limit': 10,
        'fl': 'timestamp,statuscode',
        'filter': 'statuscode:200',
    }
    try:
        r = requests.get(cdx_url, params=params, timeout=15)
        data = r.json()
        if len(data) > 1:
            return data[1][0]
        return None
    except Exception as e:
        log.error(f"CDX lookup error for {hash_val}: {e}")
        return None


def download_pdf_wayback(hash_val: str, ts_200: str) -> Optional[bytes]:
    orig_url = f'https://www.pmi.spglobal.com/Public/Home/PressRelease/{hash_val}'
    wayback_url = f'https://web.archive.org/web/{ts_200}/{orig_url}'
    try:
        r = requests.get(wayback_url, headers=HEADERS, timeout=30)
        if r.status_code == 200 and b'%PDF' in r.content[:10]:
            return r.content
        return None
    except Exception as e:
        log.error(f"Download error {hash_val}: {e}")
        return None


def fetch_wayback_targets(known_hashes: set) -> list:
    """从 Wayback Machine 获取历史数据，跳过已知 hash"""
    log.info("=== Phase 2: Fetching historical targets from Wayback Machine ===")
    archives = get_monthly_archives()

    all_targets = {}
    for archive in archives:
        ts = archive['timestamp']
        releases = fetch_archive_releases(ts)
        for rel in releases:
            hash_val = rel['hash']
            if hash_val in all_targets or hash_val in known_hashes:
                continue
            title = rel['title']
            if is_us_target(title):
                all_targets[hash_val] = {**rel, 'region': 'US', 'source': 'wayback'}
            elif is_eu_target(title):
                all_targets[hash_val] = {**rel, 'region': 'EU', 'source': 'wayback'}
        time.sleep(1)

    log.info(f"Wayback unique new targets: {len(all_targets)}")

    # 下载 PDF
    targets = []
    for hash_val, rel in all_targets.items():
        ts_200 = find_downloadable_timestamp(hash_val)
        if not ts_200:
            log.warning(f"  No archive for {hash_val}")
            rel['pdf'] = None
        else:
            pdf = download_pdf_wayback(hash_val, ts_200)
            rel['pdf'] = pdf
            if pdf:
                log.info(f"  [WB] {rel['title'][:50]}: {len(pdf)} bytes")
            else:
                log.warning(f"  [WB] Download failed {hash_val}")
        targets.append(rel)
        time.sleep(1.5)

    return targets


# ─── 主流程 ───────────────────────────────────────────────────────────────────

def collect_pmi_data():
    # 获取指标 ID
    us_mfg_id = get_indicator_id('US', 'pmi_mfg')
    us_svc_id = get_indicator_id('US', 'pmi_non_mfg')
    eu_mfg_id = get_indicator_id('EU', 'pmi_mfg')
    eu_svc_id = get_indicator_id('EU', 'pmi_non_mfg')
    log.info(f"Indicator IDs: US_mfg={us_mfg_id}, US_svc={us_svc_id}, EU_mfg={eu_mfg_id}, EU_svc={eu_svc_id}")

    us_mfg_records = {}
    us_svc_records = {}
    eu_mfg_records = {}
    eu_svc_records = {}

    # Phase 1: 直接从官网获取最新数据
    live_targets = fetch_live_targets()
    live_hashes = set()

    for t in live_targets:
        live_hashes.add(t['hash'])
        if not t.get('pdf'):
            continue
        data_date = parse_data_month(t['date'])
        if not data_date:
            continue
        pmi = parse_pmi_from_pdf(t['pdf'], t['title'])
        log.info(f"  [LIVE] {t['title'][:50]} -> {data_date}: {pmi}")
        assign_pmi_value(pmi, t['title'], t['region'], data_date,
                         us_mfg_records, us_svc_records, eu_mfg_records, eu_svc_records)

    log.info(f"After Phase 1: US_mfg={len(us_mfg_records)}, US_svc={len(us_svc_records)}, "
             f"EU_mfg={len(eu_mfg_records)}, EU_svc={len(eu_svc_records)}")

    # Phase 2: Wayback Machine 历史补充
    wb_targets = fetch_wayback_targets(live_hashes)

    for t in wb_targets:
        if not t.get('pdf'):
            continue
        data_date = parse_data_month(t['date'])
        if not data_date:
            continue
        pmi = parse_pmi_from_pdf(t['pdf'], t['title'])
        log.info(f"  [WB] {t['title'][:50]} -> {data_date}: {pmi}")
        assign_pmi_value(pmi, t['title'], t['region'], data_date,
                         us_mfg_records, us_svc_records, eu_mfg_records, eu_svc_records)

    log.info(f"After Phase 2: US_mfg={len(us_mfg_records)}, US_svc={len(us_svc_records)}, "
             f"EU_mfg={len(eu_mfg_records)}, EU_svc={len(eu_svc_records)}")

    # 写入数据库
    def to_records(d):
        return [{'date': k, 'value': v} for k, v in sorted(d.items())]

    results = {}
    if us_mfg_id and us_mfg_records:
        n = upsert_values(us_mfg_id, 'US', to_records(us_mfg_records))
        results['US pmi_mfg'] = n
    if us_svc_id and us_svc_records:
        n = upsert_values(us_svc_id, 'US', to_records(us_svc_records))
        results['US pmi_non_mfg'] = n
    if eu_mfg_id and eu_mfg_records:
        n = upsert_values(eu_mfg_id, 'EU', to_records(eu_mfg_records))
        results['EU pmi_mfg'] = n
    if eu_svc_id and eu_svc_records:
        n = upsert_values(eu_svc_id, 'EU', to_records(eu_svc_records))
        results['EU pmi_non_mfg'] = n

    log.info("=== Final Summary ===")
    for k, v in results.items():
        log.info(f"  {k}: {v} records written")

    for name, records in [('US mfg', us_mfg_records), ('US svc', us_svc_records),
                           ('EU mfg', eu_mfg_records), ('EU svc', eu_svc_records)]:
        if records:
            sorted_items = sorted(records.items())
            log.info(f"  {name}: {sorted_items[0][0]} to {sorted_items[-1][0]}, "
                     f"count={len(sorted_items)}, latest={sorted_items[-1][1]}")

    return results


if __name__ == '__main__':
    collect_pmi_data()
