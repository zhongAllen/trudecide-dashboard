# Trudecide 数据更新核心脚本清单 v1.5.2

> **版本**: v1.5.2  
> **更新日期**: 2026-03-07  
> **说明**: 新增REQ-177~180指数/行业/市场/资金模块

---

## 新增模块概览

| 模块 | REQ | 表数量 | 脚本数量 | 说明 |
|------|-----|--------|----------|------|
| 指数数据 | REQ-177 | 5 | 5 | 指数基本信息、周线、月线、权重、估值 |
| 行业数据 | REQ-178 | 8 | 3 | 申万/中信行业分类、成分、行情、国际指数 |
| 市场统计 | REQ-179 | 3 | 3 | 技术面因子、市场统计、深圳市场 |
| 资金流向 | REQ-180 | 6 | 4 | 多源个股/行业/大盘资金流向 |

---

## 新增采集脚本

### REQ-177: 指数数据

| 脚本 | 目标表 | 数据源 | 积分 | 频率 |
|------|--------|--------|------|------|
| `collect_index_basic.py` | index_basic | index_basic | 免费 | 月度 |
| `collect_index_weekly.py` | index_weekly | index_weekly | 免费 | 每周 |
| `collect_index_monthly.py` | index_monthly | index_monthly | 免费 | 每月 |
| `collect_index_weight.py` | index_weight | index_weight | 免费 | 季度 |
| `collect_index_dailybasic.py` | index_dailybasic | index_dailybasic | 免费 | 每日 |

### REQ-178: 行业数据

| 脚本 | 目标表 | 数据源 | 积分 | 频率 |
|------|--------|--------|------|------|
| `collect_sw_industry.py` | sw_* | index_classify/member/sw_daily | 免费 | 每日 |
| `collect_citic_industry.py` | citic_* | index_classify/member/citic_daily | 免费 | 每日 |
| `collect_global_index.py` | global_* | index_global | 免费 | 每日 |

### REQ-179: 市场统计

| 脚本 | 目标表 | 数据源 | 积分 | 频率 |
|------|--------|--------|------|------|
| `collect_index_technical.py` | index_technical | index_technical | 2000 | 每日 |
| `collect_market_daily_info.py` | market_daily_info | daily_info | 免费 | 每日 |
| `collect_sz_market_daily.py` | sz_market_daily | sz_daily_info | 免费 | 每日 |

### REQ-180: 资金流向

| 脚本 | 目标表 | 数据源 | 积分 | 频率 |
|------|--------|--------|------|------|
| `collect_moneyflow.py` | moneyflow | moneyflow | 免费 | 每日 |
| `collect_moneyflow_ths.py` | moneyflow_ths | moneyflow_ths | 2000 | 每日 |
| `collect_moneyflow_dc.py` | moneyflow_dc | moneyflow_dc | 2000 | 每日 |
| `collect_moneyflow_industry.py` | moneyflow_industry_* | moneyflow_industry_ths/dc, moneyflow_market_dc | 6000 | 每日 |

---

## 批量执行

```bash
# 执行v1.5.2所有数据采集
bash scripts/run_collection_v152.sh
```

---

## 数据表清单

### 指数模块 (REQ-177)
- `index_basic` - 指数基本信息
- `index_weekly` - 指数周线
- `index_monthly` - 指数月线
- `index_weight` - 指数成分权重
- `index_dailybasic` - 指数估值指标

### 行业模块 (REQ-178)
- `sw_industry_classify` - 申万行业分类
- `sw_industry_member` - 申万行业成分
- `sw_industry_daily` - 申万行业行情
- `citic_industry_classify` - 中信行业分类
- `citic_industry_member` - 中信行业成分
- `citic_industry_daily` - 中信行业行情
- `global_index` - 国际指数元数据
- `global_index_daily` - 国际指数日线

### 市场统计 (REQ-179)
- `index_technical` - 技术面因子
- `market_daily_info` - 市场每日统计
- `sz_market_daily` - 深圳市场统计

### 资金流向 (REQ-180)
- `moneyflow` - 个股资金流向（标准）
- `moneyflow_ths` - 同花顺个股资金流向
- `moneyflow_dc` - 东方财富个股资金流向
- `moneyflow_industry_ths` - 同花顺行业资金流向
- `moneyflow_industry_dc` - 东方财富板块资金流向
- `moneyflow_market_dc` - 东方财富大盘资金流向

---

## 版本变更记录

### v1.5.2 (2026-03-07)
- 新增REQ-177指数数据模块（5表5脚本）
- 新增REQ-178行业数据模块（8表3脚本）
- 新增REQ-179市场统计模块（3表3脚本）
- 新增REQ-180资金流向模块（6表4脚本）
- 新增批量采集脚本run_collection_v152.sh
- 更新collect_target注册
