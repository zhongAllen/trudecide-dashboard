# Trudecide 数据更新核心脚本清单 v1.5.1

> **版本**: v1.5.1  
> **更新日期**: 2026-03-07  
> **用途**: 集中管理所有数据采集脚本，确保数据资产持续更新

---

## 一、脚本分类总览

| 类别 | 脚本数量 | 说明 |
|------|----------|------|
| 股票行情数据 | 5 | 日线、周线、月线、资金流向、估值 |
| 公司基本面 | 5 | 公司信息、高管、主营业务、股东户数、前十大股东 |
| 财务数据 | 2 | 财务指标、财务报表 |
| 宏观数据 | 12+ | CN/US/EU 经济指标、PMI、利率、汇率 |
| 板块/概念 | 2 | 板块日线、板块元数据 |
| 新闻/公告 | 3 | 新闻快讯、公告、研报 |

---

## 二、核心采集脚本详情

### 2.1 股票行情数据（每日/每周更新）

| 脚本 | 目标表 | 数据源 | 积分 | 更新频率 | 执行时间 |
|------|--------|--------|------|----------|----------|
| `collect_stock_daily.py` | `stock_daily` | Tushare daily | 免费 | 每日 | 19:00 后 |
| `collect_stock_daily_basic.py` | `stock_daily_basic` | Tushare daily_basic | 免费 | 每日 | 19:00 后 |
| `collect_stock_moneyflow.py` | `stock_moneyflow` | Tushare moneyflow | 免费 | 每日 | 19:00 后 |
| `collect_stock_weekly.py` | `stock_weekly` | Tushare stk_weekly | 2000 | 每周 | 周日 |
| `collect_stock_monthly.py` | `stock_monthly` | Tushare stk_monthly | 2000 | 每月 | 月初 |

**执行命令**:
```bash
# 日线（增量）
python3 scripts/collect_stock_daily.py --mode incremental

# 周线（全量 - 首次）
python3 scripts/collect_stock_weekly.py --mode full --workers 10

# 月线（全量 - 首次）
python3 scripts/collect_stock_monthly.py --mode full --workers 10
```

### 2.2 公司基本面数据（REQ-160~163）

| 脚本 | 目标表 | 数据源 | 积分 | 更新频率 | 说明 |
|------|--------|--------|------|----------|------|
| `collect_stock_company_info.py` | `stock_company_info` | stock_basic + stock_company | 120 | 每月 | 公司画像基础 |
| `collect_stock_managers.py` | `stock_managers` | stk_managers | 2000 | 每季度 | 高管团队 |
| `collect_stock_main_business.py` | `stock_main_business` | fina_mainbz_vip | 5000 | 每季度 | 主营业务构成 |
| `collect_stock_holder_number.py` | `stock_holder_number` | stk_holdernumber | 600 | 每季度 | 股东户数趋势 |
| `collect_stock_holders.py` | `stock_holders` | top10_holders | 免费 | 每季度 | 前十大流通股东 |

**执行命令**:
```bash
# 公司基本信息（全量）
python3 scripts/collect_stock_company_info.py

# 高管信息（全量 - 需较长时间）
python3 scripts/collect_stock_managers.py

# 主营业务构成（增量 - 近2个报告期）
python3 scripts/collect_stock_main_business.py --mode incremental

# 股东户数（增量 - 近1年）
python3 scripts/collect_stock_holder_number.py --mode incremental
```

### 2.3 财务数据（每季度更新）

| 脚本 | 目标表 | 数据源 | 更新频率 |
|------|--------|--------|----------|
| `collect_stock_fina_indicator.py` | `stock_fina_indicator` | fina_indicator | 每季度 |
| `collect_stock_financial.py` | `stock_income/balance/cashflow` | income/balance/cashflow | 每季度 |

### 2.4 宏观数据（每日/每周更新）

| 脚本 | 目标表 | 数据源 | 说明 |
|------|--------|--------|------|
| `collect_macro_cn.py` | `indicator_values` | Tushare 宏观接口 | CN 经济指标 |
| `collect_macro_us.py` | `indicator_values` | Tushare 宏观接口 | US 经济指标 |
| `collect_macro_eu.py` | `indicator_values` | Tushare/WorldBank | EU 经济指标 |
| `collect_macro_pmi.py` | `indicator_values` | NBS/SPGlobal | PMI 数据 |
| `collect_macro_bond_yield_10y.py` | `indicator_values` | 多渠道 | 国债收益率 |

### 2.5 板块/概念数据

| 脚本 | 目标表 | 说明 |
|------|--------|------|
| `collect_sector_data.py` | `sector_daily`, `sector_meta` | 板块日线和元数据 |
| `backfill_sector_daily.py` | `sector_daily` | 板块历史数据补录 |

### 2.6 新闻/公告/研报

| 脚本 | 目标表 | 更新频率 |
|------|--------|----------|
| `collect_news.py` | `news` | 每日 |
| `collect_stock_announcement.py` | `stock_announcement` | 每日 |
| `collect_research_report.py` | `research_report` | 每日 |
| `collect_cctv_news.py` | `cctv_news` | 每日 |

---

## 三、批量执行脚本

### 3.1 首次全量采集（v1.5.1 数据初始化）

```bash
#!/bin/bash
# scripts/run_full_collection_v151.sh
# v1.5.1 首次全量数据采集

set -e

echo "=== Trudecide v1.5.1 首次全量数据采集 ==="
echo "开始时间: $(date)"

# 1. 股票行情数据（周/月 K 线）
echo "[1/7] 采集周线数据..."
python3 scripts/collect_stock_weekly.py --mode full --workers 10

echo "[2/7] 采集月线数据..."
python3 scripts/collect_stock_monthly.py --mode full --workers 10

# 2. 公司基本面数据（REQ-160~163）
echo "[3/7] 采集公司基本信息..."
python3 scripts/collect_stock_company_info.py

echo "[4/7] 采集高管信息..."
python3 scripts/collect_stock_managers.py

echo "[5/7] 采集主营业务构成..."
python3 scripts/collect_stock_main_business.py --mode full

echo "[6/7] 采集股东户数..."
python3 scripts/collect_stock_holder_number.py --mode full

# 3. 日线数据（增量 - 最近1年）
echo "[7/7] 采集日线数据（增量）..."
python3 scripts/collect_stock_daily.py --mode incremental

echo "=== 采集完成 ==="
echo "结束时间: $(date)"
```

### 3.2 每日例行更新

```bash
#!/bin/bash
# scripts/run_daily_update.sh
# 每日例行数据更新

echo "=== $(date) 每日数据更新 ==="

# 行情数据
python3 scripts/collect_stock_daily.py --mode incremental
python3 scripts/collect_stock_daily_basic.py --mode incremental
python3 scripts/collect_stock_moneyflow.py --mode incremental

# 宏观数据
python3 scripts/collect_macro_cn.py
python3 scripts/collect_macro_us.py

# 新闻公告
python3 scripts/collect_news.py
python3 scripts/collect_stock_announcement.py

echo "=== 每日更新完成 ==="
```

### 3.3 每周例行更新

```bash
#!/bin/bash
# scripts/run_weekly_update.sh
# 每周例行数据更新（周日执行）

echo "=== $(date) 每周数据更新 ==="

# 周线数据
python3 scripts/collect_stock_weekly.py --mode incremental --workers 10

# 公司基本面（部分）
python3 scripts/collect_stock_holder_number.py --mode incremental

echo "=== 每周更新完成 ==="
```

### 3.4 每季度例行更新

```bash
#!/bin/bash
# scripts/run_quarterly_update.sh
# 每季度例行数据更新

echo "=== $(date) 季度数据更新 ==="

# 财务数据
python3 scripts/collect_stock_fina_indicator.py --mode incremental
python3 scripts/collect_stock_financial.py --mode incremental

# 公司基本面
python3 scripts/collect_stock_main_business.py --mode incremental
python3 scripts/collect_stock_managers.py
python3 scripts/collect_stock_holders.py --mode incremental

# 股东户数
python3 scripts/collect_stock_holder_number.py --mode incremental

echo "=== 季度更新完成 ==="
```

---

## 四、采集状态监控

### 4.1 查看采集日志

```sql
-- 查看最近采集记录
SELECT 
  module,
  run_date,
  status,
  actual_count,
  completion_rate,
  started_at,
  finished_at
FROM collect_log
ORDER BY run_date DESC, started_at DESC
LIMIT 20;
```

### 4.2 查看数据表统计

```sql
-- 查看各表最新数据日期
SELECT 
  'stock_daily' as table_name, MAX(trade_date) as latest_date, COUNT(*) as total_rows
FROM stock_daily
UNION ALL
SELECT 'stock_weekly', MAX(trade_date), COUNT(*) FROM stock_weekly
UNION ALL
SELECT 'stock_monthly', MAX(trade_date), COUNT(*) FROM stock_monthly
UNION ALL
SELECT 'stock_company_info', MAX(updated_at), COUNT(*) FROM stock_company_info
UNION ALL
SELECT 'stock_managers', MAX(updated_at), COUNT(*) FROM stock_managers
UNION ALL
SELECT 'stock_main_business', MAX(end_date), COUNT(*) FROM stock_main_business
UNION ALL
SELECT 'stock_holder_number', MAX(end_date), COUNT(*) FROM stock_holder_number;
```

---

## 五、环境变量配置

所有脚本依赖以下环境变量：

```bash
# Tushare Pro
export TUSHARE_TOKEN="your_tushare_token"

# Supabase
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your_service_key"
```

---

## 六、注意事项

1. **积分管理**: 部分接口需要 Tushare 积分（如 stk_managers 2000分），请确保账户积分充足
2. **执行时间**: 全量采集可能需要数小时，建议在非交易时间执行
3. **并发控制**: 周/月线采集使用 `--workers` 控制并发，避免触发 API 限流
4. **进度保存**: 周/月线采集支持断点续传，进度保存在 `/tmp/stock_weekly_progress.json`
5. **日志查看**: 采集日志保存在 `/tmp/stock_*_collect.log`

---

## 七、版本变更记录

### v1.5.1 (2026-03-07)
- 新增 `collect_stock_weekly.py` - 周线数据采集
- 新增 `collect_stock_monthly.py` - 月线数据采集
- 整理公司基本面采集脚本（REQ-160~163）
- 建立批量执行脚本规范
