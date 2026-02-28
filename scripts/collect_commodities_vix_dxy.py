"""
REQ-035: 大宗商品、美元指数、VIX 恐慌指数采集脚本
数据源: Yahoo Finance (yfinance)
频率: 日度
region: GLOBAL（大宗商品/DXY/VIX）, US（SP500/NASDAQ）
"""
import os, sys, time, math
from datetime import datetime, timezone
import yfinance as yf
from supabase import create_client

DRY_RUN = "--dry-run" in sys.argv

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# ─── 指标定义 ─────────────────────────────────────────────────────────────────
# (indicator_id, ticker, name_cn, region, unit, category, description_cn)
INDICATORS = [
    (
        "oil_wti", "CL=F", "WTI原油价格", "GL", "美元/桶", "commodity",
        "WTI（西德克萨斯中质原油）是美国原油期货定价基准，也是全球最重要的原油价格基准之一。"
        "油价是能源、化工、航运、航空等行业的核心成本驱动因子，同时对通胀（CPI/PPI）有直接传导效应。"
        "油价上涨通常利空石化下游、航空，利多石油开采、煤炭替代。"
    ),
    (
        "oil_brent", "BZ=F", "布伦特原油价格", "GL", "美元/桶", "commodity",
        "布伦特原油产自北海，是欧洲、非洲、中东原油的定价基准，全球约2/3的原油以布伦特计价。"
        "中国进口原油主要参考布伦特价格。布伦特与WTI价差（Brent-WTI Spread）反映全球原油供需结构差异。"
    ),
    (
        "copper_price", "HG=F", "铜价（期货）", "GL", "美元/磅", "commodity",
        "铜被称为『铜博士』（Dr. Copper），因其广泛用于建筑、电力、电子、汽车等领域，"
        "铜价对全球经济景气度有极强的领先预测能力。铜价上涨通常预示全球经济扩张，"
        "利多有色金属板块（铜铝铅锌）、新能源（电缆用铜）。"
        "中国是全球最大铜消费国，铜价与A股有色板块高度相关。"
    ),
    (
        "gold_price", "GC=F", "黄金价格（期货）", "GL", "美元/盎司", "commodity",
        "黄金是全球最重要的避险资产和通胀对冲工具。"
        "金价与美元指数通常呈负相关（美元升值压制金价）；"
        "与实际利率（名义利率-通胀）呈负相关（实际利率上升压制金价）；"
        "在地缘政治风险、金融危机时期金价往往大幅上涨。"
        "金价上涨利多黄金矿业股，同时反映市场避险情绪升温。"
    ),
    (
        "silver_price", "SI=F", "白银价格（期货）", "GL", "美元/盎司", "commodity",
        "白银兼具贵金属（避险/储值）和工业金属（光伏、电子、医疗）双重属性。"
        "白银在光伏电池中用量显著，随着全球光伏装机扩张，工业需求持续增长。"
        "银金比（Gold/Silver Ratio）是判断贵金属相对估值的常用指标，比值高时白银相对低估。"
    ),
    (
        "iron_ore_price", "TIO=F", "铁矿石价格", "GL", "美元/吨", "commodity",
        "铁矿石是钢铁生产的核心原材料，中国是全球最大铁矿石进口国（占全球进口量约70%）。"
        "铁矿石价格主要由中国钢铁需求（基建、房地产、制造业）和澳大利亚/巴西供给决定。"
        "铁矿石价格上涨通常利多矿业股（力拓、必和必拓），利空钢铁下游（成本压力）；"
        "价格下跌则利多钢铁企业利润。"
    ),
    (
        "dxy", "DX-Y.NYB", "美元指数", "GL", "指数", "fx",
        "美元指数（DXY）衡量美元对欧元（57.6%）、日元（13.6%）、英镑（11.9%）、"
        "加元（9.1%）、瑞典克朗（4.2%）、瑞士法郎（3.6%）六种货币的综合强弱。"
        "美元走强通常压制大宗商品价格（以美元计价），导致新兴市场资本外流、本币贬值；"
        "美元走弱则相反，利多大宗商品和新兴市场。"
        "美元指数是判断全球流动性环境和人民币汇率走势的核心参考指标。"
    ),
    (
        "vix", "^VIX", "VIX恐慌指数", "GL", "指数", "macro",
        "VIX（CBOE波动率指数）衡量标普500指数未来30天的市场预期波动率，被称为『恐慌指数』。"
        "VIX<20通常代表市场平静；20~30为警戒区间；>30表示市场恐慌；>40为极度恐慌"
        "（历史极值如2008年金融危机达80+）。"
        "VIX飙升时，全球风险资产普跌，北向资金通常大幅流出A股；"
        "VIX回落则风险偏好修复，利多成长股和新兴市场。"
    ),
    (
        "sp500", "^GSPC", "标普500指数", "US", "点", "equity",
        "标普500指数由美国市值最大的500家上市公司构成，是全球最重要的股市基准指数，"
        "覆盖美国约80%的股市市值。标普500走势影响全球风险偏好，"
        "与A股（尤其是科技板块）存在一定联动。"
        "标普500的PE/PB估值水平也是判断全球股市是否过热的重要参考。"
    ),
    (
        "nasdaq", "^IXIC", "纳斯达克综合指数", "US", "点", "equity",
        "纳斯达克综合指数以科技、互联网、生物医药等成长型企业为主（苹果、微软、英伟达、谷歌等），"
        "对利率变化高度敏感（利率上升压制高估值成长股）。"
        "纳斯达克走势对A股科技板块（半导体、互联网、AI）有较强的情绪传导效应。"
        "纳斯达克与标普500的相对强弱反映市场对成长vs价值风格的偏好。"
    ),
]


def upsert_meta(ind_id, region, name_cn, unit, category, description, ticker):
    """写入或更新 indicator_meta"""
    record = {
        "id": ind_id,
        "name_cn": name_cn,
        "description_cn": description,
        "category": category,
        "unit": unit,
        "source_name": f"Yahoo Finance ({ticker})",
        "source_url": f"https://finance.yahoo.com/quote/{ticker}",
        "credibility": "high",
        "frequency": "daily",
        "value_type": "price",
        "region": region,
        "currency": "USD",
        "scale": "1",
    }
    existing = sb.table("indicator_meta").select("id").eq("id", ind_id).eq("region", region).execute()
    if existing.data:
        sb.table("indicator_meta").update(record).eq("id", ind_id).eq("region", region).execute()
        return ind_id, "updated"
    else:
        record["id"] = ind_id
        sb.table("indicator_meta").insert(record).execute()
        return ind_id, "created"


def upsert_values(ind_id, region, hist_df):
    """批量 upsert indicator_values"""
    records = []
    now = datetime.now(timezone.utc).isoformat()
    for date, row in hist_df.iterrows():
        val = row["Close"]
        try:
            fval = float(val)
            if math.isnan(fval):
                continue
        except (TypeError, ValueError):
            continue
        date_str = date.strftime("%Y-%m-%d")
        records.append({
            "indicator_id": ind_id,
            "region": region,
            "trade_date": date_str,
            "publish_date": date_str,
            "value": round(fval, 6),
            "revision_seq": 0,
            "collected_at": now,
        })

    if not records:
        return 0

    # 分批 upsert（每批 500 条）
    batch_size = 500
    total = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        sb.table("indicator_values").upsert(
            batch,
            on_conflict="indicator_id,region,trade_date,revision_seq"
        ).execute()
        total += len(batch)

    return total


# ─── 主流程 ──────────────────────────────────────────────────────────────────
print(f"{'[DRY-RUN] ' if DRY_RUN else ''}REQ-035 大宗商品/DXY/VIX 采集开始")
print(f"共 {len(INDICATORS)} 个指标\n")

total_inserted = 0
results = []

for ind_id, ticker, name_cn, region, unit, category, description in INDICATORS:
    print(f"  处理 {ind_id} ({ticker})...")

    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="max")

        if len(hist) == 0:
            print(f"    ✗ 无数据")
            results.append((ind_id, ticker, 0, "无数据"))
            continue

        start_date = hist.index[0].strftime("%Y-%m-%d")
        end_date = hist.index[-1].strftime("%Y-%m-%d")
        latest_val = hist['Close'].iloc[-1]
        print(f"    数据: {len(hist)} 条  {start_date} ~ {end_date}  最新={latest_val:.2f}")

        if DRY_RUN:
            results.append((ind_id, ticker, len(hist), "dry-run OK"))
            continue

        # 写 meta
        meta_id, meta_action = upsert_meta(ind_id, region, name_cn, unit, category, description, ticker)
        print(f"    meta: {meta_action} (id={meta_id})")

        # 写 values
        n = upsert_values(ind_id, region, hist)
        total_inserted += n
        print(f"    ✓ 写入 {n} 条")
        results.append((ind_id, ticker, n, "OK"))

    except Exception as e:
        print(f"    ✗ 错误: {e}")
        results.append((ind_id, ticker, 0, str(e)[:60]))

    time.sleep(0.5)

print(f"\n{'=' * 55}")
print(f"{'[DRY-RUN] ' if DRY_RUN else ''}完成！共写入 {total_inserted:,} 条")
print(f"{'=' * 55}")
for ind_id, ticker, n, status in results:
    print(f"  {ind_id:20s} {ticker:12s} {n:6d} 条  {status}")
