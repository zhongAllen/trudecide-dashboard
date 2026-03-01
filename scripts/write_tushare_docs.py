import os
from datetime import datetime, timezone
from supabase import create_client

sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
now = datetime.now(timezone.utc).isoformat()

contents = {}

contents["tushare-stock-basic-api"] = """# Tushare 股票基础数据 API 接口文档

> 本文档收录 Tushare Pro 中与股票基础信息相关的所有接口，供 ETL 采集脚本开发和 AI 分析调用时参考。

---

## 目录

| 接口名 | 描述 | 积分要求 |
|--------|------|---------|
| `stock_basic` | 股票基础信息（代码/名称/行业/上市日期） | 2000积分 |
| `stk_premarket` | 盘前股本情况（总股本/流通股本/涨跌停价） | 无积分要求 |
| `trade_cal` | 交易日历 | 2000积分 |
| `stock_st` | ST股票列表（按日期） | 3000积分 |
| `st` | ST风险警示板股票详情（含变更原因） | 6000积分 |
| `new_share` | IPO新股列表 | 120积分 |
| `stock_hsgt` | 沪深港通股票列表 | 3000积分 |
| `namechange` | 股票曾用名历史 | 无特殊要求 |

---

## 一、stock_basic — 股票基础信息

**描述**：获取基础信息数据，包括股票代码、名称、上市日期、退市日期等。一次调用可拉取全量，建议保存到本地后使用。

**输入参数**

| 名称 | 类型 | 必选 | 描述 |
|------|------|------|------|
| `ts_code` | str | N | TS股票代码 |
| `name` | str | N | 名称 |
| `market` | str | N | 市场类别（主板/创业板/科创板/CDR/北交所） |
| `list_status` | str | N | 上市状态（L上市 D退市 P暂停上市 G过会未交易，默认L） |
| `exchange` | str | N | 交易所（SSE上交所 SZSE深交所 BSE北交所） |
| `is_hs` | str | N | 是否沪深港通标的（N否 H沪股通 S深股通） |

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `ts_code` | str | TS代码 |
| `symbol` | str | 股票代码 |
| `name` | str | 股票名称 |
| `area` | str | 地域 |
| `industry` | str | 所属行业（Tushare自定义，非官方行业分类） |
| `fullname` | str | 股票全称 |
| `enname` | str | 英文全称 |
| `market` | str | 市场类型 |
| `exchange` | str | 交易所代码 |
| `list_status` | str | 上市状态 |
| `list_date` | str | 上市日期 |
| `delist_date` | str | 退市日期 |
| `is_hs` | str | 是否沪深港通标的 |
| `act_name` | str | 实控人名称 |
| `act_ent_type` | str | 实控人企业性质 |

**接口示例**

```python
pro = ts.pro_api()
data = pro.stock_basic(exchange='', list_status='L',
                       fields='ts_code,symbol,name,area,industry,list_date')
```

**注意事项**：
- `industry` 字段是 Tushare 自定义分类（约100+个），与东方财富/同花顺/通达信板块体系不对应，仅供粗粒度参考
- PE/PB/股本等字段请在 `daily_basic` 接口中获取

---

## 二、stk_premarket — 盘前股本情况

**描述**：每日开盘前获取当日股票的股本情况，包括总股本、流通股本、涨跌停价格等。

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `trade_date` | str | 交易日期 |
| `ts_code` | str | TS股票代码 |
| `total_share` | float | 总股本（万股） |
| `float_share` | float | 流通股本（万股） |
| `pre_close` | float | 昨日收盘价 |
| `up_limit` | float | 今日涨停价 |
| `down_limit` | float | 今日跌停价 |

---

## 三、trade_cal — 交易日历

**描述**：获取各大交易所交易日历数据，默认提取上交所。

**输入参数**

| 名称 | 类型 | 必选 | 描述 |
|------|------|------|------|
| `exchange` | str | N | 交易所（SSE/SZSE/CFFEX/SHFE/CZCE/DCE/INE） |
| `start_date` | str | N | 开始日期（YYYYMMDD） |
| `end_date` | str | N | 结束日期 |
| `is_open` | str | N | 是否交易（'0'休市 '1'交易） |

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `exchange` | str | 交易所 |
| `cal_date` | str | 日历日期 |
| `is_open` | str | 是否交易（0休市 1交易） |
| `pretrade_date` | str | 上一个交易日 |

**应用场景**：数据采集日期验证、交易日筛选、假期识别。当前脚本用周几判断最近交易日，可升级为查此接口实现更准确的判断。

---

## 四、stock_st — ST股票列表

**描述**：获取ST股票列表，可根据交易日期获取历史上每天的ST列表。数据从20160101开始。

---

## 五、new_share — IPO新股列表

**描述**：获取新股上市列表数据。单次最大2000条。

**输出参数（核心字段）**

| 名称 | 类型 | 描述 |
|------|------|------|
| `ts_code` | str | TS股票代码 |
| `name` | str | 名称 |
| `ipo_date` | str | 上网发行日期 |
| `issue_date` | str | 上市日期 |
| `amount` | float | 发行总量（万股） |
| `price` | float | 发行价格 |
| `pe` | float | 市盈率 |
| `funds` | float | 募集资金（亿元） |
| `ballot` | float | 中签率 |

---

## 六、stock_hsgt — 沪深港通股票列表

**类型说明**

| 类型 | 说明 |
|------|------|
| HK_SZ | 深股通（港→深） |
| SZ_HK | 港股通（深→港） |
| HK_SH | 沪股通（港→沪） |
| SH_HK | 港股通（沪→港） |

---

## 七、namechange — 股票曾用名

**输出参数**：`ts_code`, `name`, `start_date`, `end_date`, `ann_date`, `change_reason`
"""

contents["tushare-financial-governance-api"] = """# Tushare 财务报告与公司治理 API 接口文档

> 财务报告接口分为单只股票版（2000积分）和全市场版 `_vip`（5000积分），采集全市场数据请用 `_vip` 版本。

---

## 目录

| 接口名 | 描述 | 积分要求 |
|--------|------|---------|
| `stock_company` | 上市公司基本信息 | 120积分 |
| `stk_managers` | 上市公司管理层 | 2000积分 |
| `stk_rewards` | 管理层薪酬和持股 | 2000积分 |
| `income` / `income_vip` | 利润表 | 2000/5000积分 |
| `balancesheet` / `balancesheet_vip` | 资产负债表 | 2000/5000积分 |
| `cashflow` / `cashflow_vip` | 现金流量表 | 2000/5000积分 |
| `fina_indicator` / `fina_indicator_vip` | 财务指标数据 | 2000/5000积分 |
| `fina_audit` | 财务审计意见 | 500积分 |
| `fina_mainbz` / `fina_mainbz_vip` | 主营业务构成 | 2000/5000积分 |
| `disclosure_date` | 财报披露计划 | 500积分 |
| `forecast` / `forecast_vip` | 业绩预告 | 2000/5000积分 |
| `express` / `express_vip` | 业绩快报 | 2000/5000积分 |
| `top10_holders` | 前十大股东 | 2000积分 |
| `top10_floatholders` | 前十大流通股东 | 2000积分 |
| `pledge_stat` | 股权质押统计 | 500积分 |
| `pledge_detail` | 股权质押明细 | 500积分 |
| `repurchase` | 股票回购 | 600积分 |
| `share_float` | 限售股解禁 | 120积分 |
| `stk_holdernumber` | 股东人数 | 600积分 |
| `stk_holdertrade` | 股东增减持 | 2000积分 |
| `anns_d` | 上市公司全量公告（含PDF链接） | 单独权限 |

---

## 一、财务三表接口说明

财务三表（利润表/资产负债表/现金流量表）接口结构相同，以下统一说明。

**通用输入参数**

| 名称 | 类型 | 必选 | 描述 |
|------|------|------|------|
| `ts_code` | str | Y（单只版）/N（vip版） | 股票代码 |
| `ann_date` | str | N | 公告日期 |
| `start_date` | str | N | 报告期开始日期 |
| `end_date` | str | N | 报告期结束日期 |
| `period` | str | N | 报告期（YYYYMMDD，季度末） |
| `report_type` | str | N | 报告类型（1合并 2单体 6季报 9半年报 12年报） |
| `comp_type` | str | N | 公司类型（1一般工商业 2银行 3保险 4证券） |

**接口名称对照**

| 报表类型 | 单只股票 | 全市场（vip） |
|---------|---------|-------------|
| 利润表 | `income` | `income_vip` |
| 资产负债表 | `balancesheet` | `balancesheet_vip` |
| 现金流量表 | `cashflow` | `cashflow_vip` |
| 财务指标 | `fina_indicator` | `fina_indicator_vip` |
| 主营业务 | `fina_mainbz` | `fina_mainbz_vip` |
| 业绩预告 | `forecast` | `forecast_vip` |
| 业绩快报 | `express` | `express_vip` |

**接口示例**

```python
# 单只股票利润表
df = pro.income(ts_code='600000.SH', start_date='20180101', end_date='20181231')

# 全市场利润表（按报告期，推荐）
df = pro.income_vip(period='20231231', report_type='1')
```

---

## 二、top10_floatholders — 前十大流通股东

**与 top10_holders 的区别**：
- `top10_holders`：前十大股东（包含战略投资者等所有股东）
- `top10_floatholders`：前十大流通股东（仅流通股）

**输出参数（核心字段）**

| 名称 | 类型 | 描述 |
|------|------|------|
| `ts_code` | str | TS股票代码 |
| `ann_date` | str | 公告日期 |
| `end_date` | str | 报告期 |
| `holder_name` | str | 股东名称 |
| `hold_amount` | float | 持有数量（股） |
| `hold_ratio` | float | 占总股本比例(%) |
| `hold_float_ratio` | float | 占流通股本比例(%) |
| `hold_change` | float | 持股变动 |
| `holder_type` | str | 股东类型 |

---

## 三、pledge_stat — 股权质押统计

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `ts_code` | str | TS代码 |
| `end_date` | str | 截止日期 |
| `pledge_count` | int | 质押次数 |
| `unrest_pledge` | float | 无限售股质押数量（万） |
| `rest_pledge` | float | 限售股份质押数量（万） |
| `total_share` | float | 总股本 |
| `pledge_ratio` | float | 质押比例 |

---

## 四、其他治理类接口（快速参考）

- **repurchase**（600积分）：股票回购，输出进度/数量/金额/价格区间
- **share_float**（120积分）：限售股解禁，输出解禁日期/数量/类型
- **stk_holdernumber**（600积分）：股东人数，反映筹码集中度
- **stk_holdertrade**（2000积分）：股东增减持，输出增减持公告/数量/比例
- **anns_d**（单独权限）：上市公司全量公告，提供PDF下载URL
- **disclosure_date**（500积分）：财报披露计划，用于数据采集时间规划
"""

contents["tushare-market-moneyflow-api"] = """# Tushare 行情与资金流向 API 接口文档

> 资金流向数据分为同花顺（THS）和东方财富（DC）两个来源，字段结构相似但不完全相同。

---

## 目录

| 接口名 | 描述 | 积分要求 |
|--------|------|---------|
| `daily` | A股日线行情（OHLCV） | 基础积分 |
| `stk_weekly_monthly` | 股票周/月线行情 | 2000积分 |
| `daily_basic` | 每日指标（PE/PB/市值/换手率） | 2000积分 |
| `moneyflow` | 个股资金流向（传统版） | 2000积分 |
| `moneyflow_ths` | 个股资金流向（同花顺） | 6000积分 |
| `moneyflow_dc` | 个股资金流向（东方财富） | 5000积分 |
| `moneyflow_cnt_ths` | 同花顺概念板块资金流向 | 6000积分 |
| `moneyflow_ind_ths` | 同花顺行业资金流向 | 6000积分 |
| `moneyflow_ind_dc` | 东财概念及行业板块资金流向 | 6000积分 |
| `moneyflow_mkt_dc` | 大盘资金流向（东方财富） | 120/6000积分 |
| `block_trade` | 大宗交易 | 300积分 |
| `stk_surv` | 机构调研表 | 5000积分 |
| `report_rc` | 卖方盈利预测数据 | 120/8000积分 |
| `broker_recommend` | 券商每月荐股 | 6000积分 |

---

## 一、daily — A股日线行情

**输入参数**

| 名称 | 类型 | 必选 | 描述 |
|------|------|------|------|
| `ts_code` | str | N | 股票代码（不填则返回全市场） |
| `trade_date` | str | N | 交易日期（YYYYMMDD） |
| `start_date` | str | N | 开始日期 |
| `end_date` | str | N | 结束日期 |

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `ts_code` | str | 股票代码 |
| `trade_date` | str | 交易日期 |
| `open` | float | 开盘价 |
| `high` | float | 最高价 |
| `low` | float | 最低价 |
| `close` | float | 收盘价 |
| `pre_close` | float | 昨收价 |
| `change` | float | 涨跌额 |
| `pct_chg` | float | 涨跌幅（%） |
| `vol` | float | 成交量（手） |
| `amount` | float | 成交额（**千元**，注意单位） |

---

## 二、daily_basic — 每日指标

**描述**：获取全部股票每日重要的基本面指标数据，包括PE/PB/市值/换手率等。

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `ts_code` | str | 股票代码 |
| `trade_date` | str | 交易日期 |
| `close` | float | 当日收盘价 |
| `turnover_rate` | float | 换手率（%） |
| `turnover_rate_f` | float | 换手率（自由流通股） |
| `volume_ratio` | float | 量比 |
| `pe` | float | 市盈率（亏损为空） |
| `pe_ttm` | float | 市盈率TTM（亏损为空） |
| `pb` | float | 市净率 |
| `ps` | float | 市销率 |
| `ps_ttm` | float | 市销率TTM |
| `dv_ratio` | float | 股息率（%） |
| `dv_ttm` | float | 股息率TTM（%） |
| `total_share` | float | 总股本（万股） |
| `float_share` | float | 流通股本（万股） |
| `free_share` | float | 自由流通股本（万股） |
| `total_mv` | float | 总市值（**万元**） |
| `circ_mv` | float | 流通市值（**万元**） |

**单位注意**：`total_mv`/`circ_mv` 单位为**万元**，换算为亿元需除以10000。

---

## 三、个股资金流向接口对比

| 维度 | `moneyflow`（传统） | `moneyflow_ths`（同花顺） | `moneyflow_dc`（东方财富） |
|------|-------------------|------------------------|--------------------------|
| 积分要求 | 2000 | 6000 | 5000 |
| DC数据开始 | - | - | 20230911 |
| 净流入字段 | `net_mf_amount` | `net_mf_amount` | `net_amount` |

**moneyflow_dc 核心输出字段**

| 名称 | 描述 |
|------|------|
| `net_amount` | 今日主力净流入额（万元） |
| `net_amount_rate` | 今日主力净流入净占比（%） |
| `buy_elg_amount` | 超大单净流入额（万元） |
| `buy_lg_amount` | 大单净流入额（万元） |
| `buy_md_amount` | 中单净流入额（万元） |
| `buy_sm_amount` | 小单净流入额（万元） |

---

## 四、板块资金流向接口

### moneyflow_cnt_ths — 同花顺概念板块资金流向

**核心输出字段**

| 名称 | 描述 |
|------|------|
| `ts_code` | 板块代码 |
| `name` | 板块名称 |
| `lead_stock` | 领涨股票名称 |
| `pct_change` | 行业涨跌幅 |
| `net_buy_amount` | 流入资金（亿元） |
| `net_sell_amount` | 流出资金（亿元） |
| `net_amount` | 净额（亿元） |

### moneyflow_ind_dc — 东财概念及行业板块资金流向

**输入参数**：支持 `content_type`（行业/概念/地域）过滤

**核心输出字段**

| 名称 | 描述 |
|------|------|
| `content_type` | 数据类型（行业/概念/地域） |
| `ts_code` | DC板块代码 |
| `pct_change` | 板块涨跌幅（%） |
| `net_amount` | 今日主力净流入净额（元，注意单位为元） |
| `buy_elg_amount` | 超大单净流入净额（元） |
| `buy_sm_amount_stock` | 今日主力净流入最大股 |

### moneyflow_mkt_dc — 大盘资金流向

**核心输出字段**

| 名称 | 描述 |
|------|------|
| `close_sh` / `pct_change_sh` | 上证收盘/涨跌幅 |
| `close_sz` / `pct_change_sz` | 深证收盘/涨跌幅 |
| `net_amount` | 今日主力净流入净额（元） |
| `buy_elg_amount` | 超大单净流入净额（元） |

---

## 五、其他行情类接口（快速参考）

- **block_trade**（300积分）：大宗交易，输出买卖方营业部/价格/数量/溢价率
- **stk_surv**（5000积分）：机构调研，输出调研日期/机构/接待人员/方式
- **report_rc**（120/8000积分）：卖方盈利预测，输出EPS/净利润/目标价
- **broker_recommend**（6000积分）：券商每月荐股列表
"""

contents["tushare-macro-index-news-api"] = """# Tushare 宏观/指数/新闻 API 接口文档

> 新闻类和研报类接口通常需要**单独开通权限**，与积分无关。

---

## 目录

| 接口名 | 描述 | 积分要求 |
|--------|------|---------|
| `eco_cal` | 全球财经日历（经济事件） | 2000积分 |
| `index_basic` | 指数基本信息（申万/中证/上证等） | 无特殊 |
| `index_global` | 国际主要指数日线行情 | 6000积分 |
| `yc_cb` | 国债收益率曲线（中债） | 单独权限 |
| `fx_obasic` | 海外外汇/大宗商品基础信息（FXCM） | 2000积分 |
| `research_report` | 券商研究报告 | 单独权限 |
| `news` | 新闻快讯（9大来源） | 单独权限 |
| `major_news` | 新闻通讯（长篇） | 单独权限 |
| `cctv_news` | 新闻联播文字稿 | 单独权限 |

---

## 一、eco_cal — 全球财经日历

**描述**：获取全球财经日历，包括经济事件数据更新。单次最大100行。

**输入参数**

| 名称 | 类型 | 必选 | 描述 |
|------|------|------|------|
| `date` | str | N | 日期（YYYYMMDD） |
| `start_date` | str | N | 开始日期 |
| `end_date` | str | N | 结束日期 |
| `currency` | str | N | 货币代码 |
| `country` | str | N | 国家（如：中国、美国） |
| `event` | str | N | 事件（支持模糊匹配：`*非农*`） |

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `date` | str | 日期 |
| `time` | str | 时间 |
| `currency` | str | 货币代码 |
| `country` | str | 国家 |
| `event` | str | 经济事件 |
| `value` | str | 今值 |
| `pre_value` | str | 前值 |
| `fore_value` | str | 预测值 |

**接口示例**

```python
# 获取中国经济事件
df = pro.eco_cal(country='中国')

# 获取美国非农数据（模糊匹配）
df = pro.eco_cal(event='美国季调后非农*',
                 fields='date,time,country,event,value,pre_value,fore_value')
```

**与 Forex Factory 的关系**：`eco_cal` 是 Tushare 内置的财经日历，可作为 REQ-044~047 Forex Factory 爬虫的**备选数据源**，先验证数据质量再决定是否替代。

---

## 二、index_basic — 指数基本信息

**描述**：获取指数基础信息，支持按市场/发布商/类别筛选。

**市场代码说明**

| 市场代码 | 说明 |
|---------|------|
| MSCI | MSCI指数 |
| CSI | 中证指数 |
| SSE | 上交所指数 |
| SZSE | 深交所指数 |
| CICC | 中金指数 |
| SW | 申万指数 |
| OTH | 其他指数 |

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `ts_code` | str | TS代码 |
| `name` | str | 简称 |
| `fullname` | str | 指数全称 |
| `market` | str | 市场 |
| `publisher` | str | 发布方 |
| `index_type` | str | 指数风格 |
| `category` | str | 指数类别 |
| `base_date` | str | 基期 |
| `base_point` | float | 基点 |
| `list_date` | str | 发布日期 |
| `weight_rule` | str | 加权方式 |

---

## 三、index_global — 国际主要指数日线行情

**支持的指数**

| TS代码 | 指数名称 |
|--------|---------|
| XIN9 | 富时中国A50指数 |
| HSI | 恒生指数 |
| HKTECH | 恒生科技指数 |
| DJI | 道琼斯工业指数 |
| SPX | 标普500指数 |
| IXIC | 纳斯达克指数 |
| FTSE | 富时100指数 |
| GDAXI | 德国DAX指数 |
| N225 | 日经225指数 |
| KS11 | 韩国综合指数 |
| TWII | 台湾加权指数 |
| RUT | 罗素2000指数 |

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `ts_code` | str | TS指数代码 |
| `trade_date` | str | 交易日 |
| `open/high/low/close` | float | OHLC点位 |
| `pre_close` | float | 昨日收盘点 |
| `change` | float | 涨跌点位 |
| `pct_chg` | float | 涨跌幅 |
| `swing` | float | 振幅 |

---

## 四、yc_cb — 国债收益率曲线

**描述**：获取中债收益率曲线，包含即期和到期收益率曲线数据。单次最大2000条。

**输入参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `ts_code` | str | 收益率曲线编码（1001.CB=国债收益率曲线） |
| `curve_type` | str | 曲线类型（0=到期，1=即期） |
| `curve_term` | float | 期限（年，如0.25/0.5/1/2/3/5/7/10/20/30） |

**输出参数**

| 名称 | 类型 | 描述 |
|------|------|------|
| `trade_date` | str | 交易日期 |
| `curve_type` | str | 曲线类型 |
| `curve_term` | float | 期限（年） |
| `yield` | float | 收益率（%） |

---

## 五、新闻类接口

### news — 新闻快讯（9大来源）

**数据源**：sina / wallstreetcn / 10jqka / eastmoney / cls / yicai / fenghuang / jinrongjie / yuncaijing

**注意**：`start_date`/`end_date` 格式必须包含时间，如 `2018-11-20 09:00:00`

```python
df = pro.news(src='cls', start_date='2018-11-21 09:00:00', end_date='2018-11-22 10:10:00')
```

### cctv_news — 新闻联播文字稿

数据从2017年开始，按日期查询：

```python
df = pro.cctv_news(date='20181211')
```

### research_report — 券商研究报告

历史从20170101开始，每天两次增量更新，单次最大1000条。

**输出参数**：`trade_date`, `title`, `abstr`（摘要）, `report_type`, `author`, `ts_code`, `inst_csname`（机构简称）, `url`（下载链接）
"""

for doc_id, content in contents.items():
    sb.table("knowledge_docs").upsert({
        "id": doc_id,
        "content": content,
        "updated_at": now
    }, on_conflict="id").execute()
    print(f"✅ content 写入: {doc_id}")

print("\n🎉 全部 4 个文档正文写入完成")
