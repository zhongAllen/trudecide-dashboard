// 每次修改 INITIAL_DOCS 时，递增此版本号，触发自动更新
const DOCS_VERSION = 7;
const VERSION_KEY = 'stock_knowledge_version';

export interface KnowledgeDoc {
  id: string;
  category: 'requirement' | 'data_model' | 'ai_boundary' | 'decision_log' | 'skill' | 'pitfall';
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export const CATEGORY_META: Record<KnowledgeDoc['category'], { label: string; color: string; icon: string }> = {
  requirement:  { label: '需求文档',   color: '#3b82f6', icon: '📋' },
  data_model:   { label: '数据模型',   color: '#8b5cf6', icon: '🗄️' },
  ai_boundary:  { label: 'AI 边界',    color: '#f59e0b', icon: '🤖' },
  decision_log: { label: '决策日志',   color: '#10b981', icon: '📝' },
  skill:        { label: 'Skills 目录', color: '#06b6d4', icon: '⚙️' },
  pitfall:      { label: '踩坑记录',   color: '#ef4444', icon: '⚠️' },
};

const STORAGE_KEY = 'stock_knowledge_docs';

const INITIAL_DOCS: KnowledgeDoc[] = [
    {
    id: 'data-collection-v3',
    category: 'requirement',
    title: '数据采集需求文档 v3（完整修订版）',
    tags: ['数据采集', 'AKShare', '宏观指标', '板块', '个股', '新闻', '免费公开数据', 'Supabase', 'value_type', 'frequency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# 数据采集需求文档 v3（AKShare 公开版 · 完整修订）

本文档是数据采集的**唯一权威参考**，开发角色 AI 在编写采集脚本时必须严格遵循本文档中的接口名称、字段名、indicator_id 命名和数据库映射关系，不得自行推断。

**核心决策**：
- 宏观指标：全部使用 **AKShare 开源 Python 库**（\`pip install akshare\`），封装东方财富、金十数据、国家统计局、中国货币网等公开数据，**完全免费、无需 API Key**。
- 个股和板块：使用 **Tushare Pro**（Token 已配置在 \`.env\` 文件中）。
- 数据库：**Supabase PostgreSQL**（凭证已配置在 \`.env\` 文件中）。

---

## 1. 时间字段设计规范（方案 B · 行业标准）

本项目采用与 Wind、CEIC 一致的**单日期字段 + 区间末日期约定**：

| 频率 | \`trade_date\` 约定 | 举例 |
|:---|:---|:---|
| 日度 | 当天日期 | \`2024-09-30\` |
| 月度 | 月末最后一天 | \`2024-09-30\`（代表 2024 年 9 月） |
| 季度 | 季末最后一天 | \`2024-09-30\`（代表 2024Q3） |
| 年度 | 年末最后一天 | \`2024-12-31\`（代表 2024 年全年） |

> **开发注意**：\`indicator_meta\` 表中的 \`frequency\` 字段说明该指标的时间粒度，\`value_type\` 字段说明数值性质。查询时通过这两个字段还原完整时间语义，无需额外的 \`period_start\`/\`period_end\` 字段。

---

## 2. \`indicator_meta\` 表新增字段规范

在原有 Schema 基础上，\`indicator_meta\` 表需新增以下两个字段：

\`\`\`sql
ALTER TABLE indicator_meta ADD COLUMN frequency TEXT;
-- 取值: 'daily' | 'monthly' | 'quarterly' | 'annual'

ALTER TABLE indicator_meta ADD COLUMN value_type TEXT;
-- 取值: 'level' | 'yoy' | 'qoq' | 'mom' | 'flow' | 'rate' | 'index'
\`\`\`

**\`value_type\` 取值说明**：

| value_type | 含义 | 举例 |
|:---|:---|:---|
| \`level\` | 绝对量（存量/总量） | GDP 总量（亿元）、M2 余额（亿元）、外汇储备 |
| \`yoy\` | 同比增速（%） | GDP 同比、CPI 同比、M2 同比 |
| \`qoq\` | 季比增速（%，季度环比） | GDP 季比 |
| \`mom\` | 月环比增速（%） | CPI 环比 |
| \`flow\` | 当期增量（流量值） | 社融新增（亿元）、新增信贷 |
| \`rate\` | 利率/收益率/汇率（%或绝对值） | LPR、Shibor、国债收益率、人民币汇率 |
| \`index\` | 指数/综合评分（无量纲） | PMI、PE、PB、失业率 |

---

## 3. 宏观指标完整采集清单

### 3.1 宏观经济（Economy）

**目标表**：\`indicator_meta\` + \`indicator_values\`

| indicator_id | 中文名 | AKShare 接口 | 关键输出字段 | 数据来源 | frequency | value_type | 单位 |
|:---|:---|:---|:---|:---|:---|:---|:---|
| \`gdp_yoy\` | GDP 同比增速 | \`macro_china_gdp\` | \`季度国内生产总值-同比增长\` | 东方财富 | quarterly | yoy | % |
| \`gdp_level\` | GDP 总量（季度） | \`macro_china_gdp\` | \`季度国内生产总值-绝对值\` | 东方财富 | quarterly | level | 亿元 |
| \`gdp_qoq\` | GDP 季比增速 | \`macro_china_gdp\` | \`季度国内生产总值-环比增长\` | 东方财富 | quarterly | qoq | % |
| \`gdp_primary\` | 第一产业增加值 | \`macro_china_gdp\` | \`第一产业生产总值-绝对值\` | 东方财富 | quarterly | level | 亿元 |
| \`gdp_primary_yoy\` | 第一产业同比增速 | \`macro_china_gdp\` | \`第一产业生产总值-同比增长\` | 东方财富 | quarterly | yoy | % |
| \`gdp_secondary\` | 第二产业增加值 | \`macro_china_gdp\` | \`第二产业生产总值-绝对值\` | 东方财富 | quarterly | level | 亿元 |
| \`gdp_secondary_yoy\` | 第二产业同比增速 | \`macro_china_gdp\` | \`第二产业生产总值-同比增长\` | 东方财富 | quarterly | yoy | % |
| \`gdp_tertiary\` | 第三产业增加值 | \`macro_china_gdp\` | \`第三产业生产总值-绝对值\` | 东方财富 | quarterly | level | 亿元 |
| \`gdp_tertiary_yoy\` | 第三产业同比增速 | \`macro_china_gdp\` | \`第三产业生产总值-同比增长\` | 东方财富 | quarterly | yoy | % |
| \`cpi_yoy\` | CPI 同比 | \`macro_china_cpi\` | \`今值\` | 东方财富 | monthly | yoy | % |
| \`cpi_mom\` | CPI 环比 | \`macro_china_cpi_mom\` | \`今值\` | 东方财富 | monthly | mom | % |
| \`ppi_yoy\` | PPI 同比 | \`macro_china_ppi\` | \`今值\` | 东方财富 | monthly | yoy | % |
| \`pmi_mfg\` | PMI 制造业 | \`macro_china_pmi\` | \`制造业-今值\` | 东方财富 | monthly | index | 无量纲 |
| \`pmi_non_mfg\` | PMI 非制造业 | \`macro_china_pmi\` | \`非制造业-今值\` | 东方财富 | monthly | index | 无量纲 |
| \`unemployment_rate\` | 城镇调查失业率 | \`macro_china_urban_unemployment\` | \`数据\` | 国家统计局 | monthly | index | % |

> **开发注意**：\`macro_china_gdp\` 接口一次返回所有字段，需从同一 DataFrame 中提取多列分别写入不同 \`indicator_id\`。\`trade_date\` 由接口返回的季度字符串（如 \`2024年三季度\`）转换为季末日期（\`2024-09-30\`）。

### 3.2 流动性与货币政策（Liquidity）

| indicator_id | 中文名 | AKShare 接口 | 关键输出字段 | 数据来源 | frequency | value_type | 单位 |
|:---|:---|:---|:---|:---|:---|:---|:---|
| \`m2_yoy\` | M2 货币供应量同比 | \`macro_china_money_supply\` | \`货币和准货币(M2)-同比增长\` | 东方财富 | monthly | yoy | % |
| \`m2_level\` | M2 余额 | \`macro_china_money_supply\` | \`货币和准货币(M2)-数量\` | 东方财富 | monthly | level | 亿元 |
| \`social_finance_new\` | 社融新增（当月） | \`macro_china_new_financial_credit\` | \`当月\` | 东方财富 | monthly | flow | 亿元 |
| \`social_finance_yoy\` | 社融存量同比 | \`macro_china_new_financial_credit\` | \`同比增速\` | 东方财富 | monthly | yoy | % |
| \`lpr_1y\` | LPR 1 年期 | \`macro_china_lpr\` | \`LPR1Y\` | 东方财富 | 每次调整 | rate | % |
| \`lpr_5y\` | LPR 5 年期 | \`macro_china_lpr\` | \`LPR5Y\` | 东方财富 | 每次调整 | rate | % |
| \`shibor_on\` | Shibor 隔夜 | \`macro_china_shibor_all\` | \`O/N-定价\` | 金十数据 | daily | rate | % |
| \`shibor_1w\` | Shibor 1 周 | \`macro_china_shibor_all\` | \`1W-定价\` | 金十数据 | daily | rate | % |
| \`dr001\` | DR001 银行间隔夜回购 | \`macro_china_shibor_all\` | \`O/N-定价\`（注：DR001 暂用 Shibor O/N 近似，官网直采见备注） | 金十数据 | daily | rate | % |
| \`dr007\` | DR007 银行间 7 天回购 | \`macro_china_shibor_all\` | \`1W-定价\`（注：DR007 暂用 Shibor 1W 近似，官网直采见备注） | 金十数据 | daily | rate | % |

> **DR001/DR007 备注**：AKShare 目前无独立的 DR001/DR007 接口。精确数据来源为**中国货币网**（\`https://www.chinamoney.com.cn/chinese/bkfrr/\`），该页面提供 FR001/FR007（银行间回购定盘利率）历史数据，可通过 HTTP 请求直采。采集脚本应优先尝试直采中国货币网，失败时回退到 Shibor 近似值。\`trade_date\` 约定为当天日期。

> **LPR 备注**：LPR 不是每日发布，每次调整时才有新数据。\`trade_date\` 使用 \`TRADE_DATE\` 字段原始值（格式 \`YYYYMMDD\`），转换为 \`DATE\` 类型写入。

### 3.3 利率与汇率（Rates & FX）

| indicator_id | 中文名 | AKShare 接口 | 关键输出字段 | 数据来源 | frequency | value_type | 单位 |
|:---|:---|:---|:---|:---|:---|:---|:---|
| \`cn_bond_10y\` | 中国 10 年期国债收益率 | \`bond_zh_us_rate\` | \`中国国债收益率10年\` | 东方财富 | daily | rate | % |
| \`us_bond_10y\` | 美国 10 年期国债收益率 | \`bond_zh_us_rate\` | \`美国国债收益率10年\` | 东方财富 | daily | rate | % |
| \`rmb_usd\` | 人民币兑美元中间价 | 直采中国货币网 | 美元/人民币中间价 | 中国外汇交易中心 | daily | rate | 元/美元 |

> **人民币汇率备注**：AKShare 的 \`macro_china_rmb\` 接口数据仅到 2021-05，**不可用**。正确数据源为**中国外汇交易中心（中国货币网）**官网（\`https://www.chinamoney.com.cn/chinese/bkccpr/\`），每日 9:15 发布人民币汇率中间价。采集脚本需直接请求该网站的 API 接口（\`https://www.chinamoney.com.cn/ags/ms/cm-u-bk-ccpr/CcprHisNew\`）获取历史数据。\`trade_date\` 使用公告日期。

### 3.4 资金流向（Fund Flow）

| indicator_id | 中文名 | AKShare 接口 | 关键输出字段 | 数据来源 | frequency | value_type | 单位 |
|:---|:---|:---|:---|:---|:---|:---|:---|
| \`north_net_flow\` | 北向资金净流入 | \`stock_hsgt_north_net_flow_in_em\` | \`value\`（\`symbol="北上"\`） | 东方财富 | daily | flow | 万元 |
| \`margin_balance_sh\` | 上海融资余额 | \`macro_china_market_margin_sh\` | \`融资余额\` | 金十数据 | daily | level | 元 |
| \`margin_balance_sz\` | 深圳融资余额 | \`macro_china_market_margin_sz\` | \`融资余额\` | 金十数据 | daily | level | 元 |

> **融资余额备注**：沪深两市分别采集后，前端展示时合并为全市场融资余额（\`margin_balance_sh + margin_balance_sz\`），合并逻辑在前端计算，不单独存储合并值。注意单位不一致：上海接口单位为**元（int64）**，深圳接口单位为**元（float64）**，写入数据库时统一转换为**亿元**（除以 1e8）。

### 3.5 市场估值（Valuation）

| indicator_id | 中文名 | AKShare 接口 | 参数 | 关键输出字段 | 数据来源 | frequency | value_type | 单位 |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| \`hs300_pe\` | 沪深 300 PE（加权 TTM） | \`stock_a_pe_and_pb\` | \`symbol="000300.SH"\` | \`addTtmPe\` | 乐咕乐股 | daily | index | 倍 |
| \`hs300_pb\` | 沪深 300 PB（加权） | \`stock_a_pe_and_pb\` | \`symbol="000300.SH"\` | \`addPb\` | 乐咕乐股 | daily | index | 倍 |
| \`all_a_pe\` | 全 A 市场 PE（等权 TTM 中位数） | \`stock_a_pe_and_pb\` | \`symbol="sh"\`（上证）+ \`symbol="sz"\`（深证）合并 | \`middleAddTtmPe\` | 乐咕乐股 | daily | index | 倍 |
| \`all_a_pb\` | 全 A 市场 PB（等权中位数） | \`stock_a_pe_and_pb\` | \`symbol="sh"\` + \`symbol="sz"\` 合并 | \`middleAveragePb\` | 乐咕乐股 | daily | index | 倍 |

> **全 A PE/PB 备注**：\`stock_a_pe_and_pb\` 接口的 \`symbol\` 参数支持 \`sh\`（上证 A 股）和 \`sz\`（深证 A 股），分别采集后取等权中位数的均值作为全 A 近似值。\`trade_date\` 使用 \`date\` 字段原始值（格式 \`YYYY-MM-DD\`）。

---

## 4. 前端指标 ID 与数据库 indicator_id 对照表

前端 \`indicators.ts\` 中的 \`id\` 字段与数据库 \`indicator_id\` 的映射关系如下。**开发前端数据查询逻辑时，必须使用此表中的 \`indicator_id\` 进行数据库查询**。

| 前端 \`id\` | 前端展示名 | 数据库 \`indicator_id\`（主要） | 备注 |
|:---|:---|:---|:---|
| \`gdp\` | GDP 增速 | \`gdp_yoy\`, \`gdp_level\`, \`gdp_qoq\` | 前端展示时可切换同比/绝对值/季比 |
| \`cpi\` | CPI | \`cpi_yoy\`, \`cpi_mom\` | 前端默认展示同比 |
| \`ppi\` | PPI | \`ppi_yoy\` | — |
| \`pmi\` | PMI | \`pmi_mfg\`, \`pmi_non_mfg\` | 前端展示两条线 |
| \`unemployment\` | 失业率 | \`unemployment_rate\` | — |
| \`m2\` | M2 货币供应量 | \`m2_yoy\`, \`m2_level\` | 前端可切换同比/余额 |
| \`socialfinance\` | 社融数据 | \`social_finance_new\`, \`social_finance_yoy\` | — |
| \`lpr\` | LPR | \`lpr_1y\`, \`lpr_5y\` | 前端展示两条线 |
| \`bondyield\` | 国债收益率 | \`cn_bond_10y\`, \`us_bond_10y\` | 前端展示中美两条线 |
| \`dr\` | 银行间流动性 | \`dr001\`, \`dr007\` | 前端展示两条线 |
| \`exchange\` | 人民币汇率 | \`rmb_usd\` | — |
| \`northbound\` | 北向资金净流入 | \`north_net_flow\` | — |
| \`pe300\` | 沪深 300 PE | \`hs300_pe\` | — |
| \`allpe\` | 全 A PE/PB | \`all_a_pe\`, \`all_a_pb\` | — |
| \`stockbond\` | 股债收益率差 | 派生指标 | 前端计算：\`1/hs300_pe * 100 - cn_bond_10y\` |
| \`margin\` | 融资余额 | \`margin_balance_sh\`, \`margin_balance_sz\` | 前端合并展示 |
| \`marginratio\` | 两融余额占流通市值比 | 派生指标 | 前端计算：\`(margin_balance_sh + margin_balance_sz) / 全A总市值\` |

---

## 5. 板块数据采集

**目标表**：\`sector_meta\`、\`sector_stock_map\`

| 采集内容 | Tushare 接口 | 参数 | 采集频率 |
|:---|:---|:---|:---|
| 申万一级行业列表 | \`index_classify\` | \`level='L1', src='SW2021'\` | 每月 1 次 |
| 申万行业成分股 | \`index_member\` | \`index_code=<申万行业代码>\` | 每月 1 次 |
| 沪深 300 成分股 | \`index_weight\` | \`index_code='399300.SZ'\` | 每月 1 次 |
| 概念板块列表 | \`concept\` | — | 每月 1 次 |
| 概念板块成分股 | \`concept_detail\` | \`id=<概念 ID>\` | 每月 1 次 |

---

## 6. 个股数据采集

**目标表**：\`stock_meta\`、\`stock_daily\`

| 采集内容 | Tushare 接口 | 关键字段 | 采集频率 |
|:---|:---|:---|:---|
| 股票基础信息 | \`stock_basic\` | \`ts_code\`, \`name\`, \`list_date\`, \`exchange\` | 每周 1 次 |
| 日度行情 | \`daily\` | \`ts_code\`, \`trade_date\`, \`open\`, \`close\`, \`high\`, \`low\`, \`vol\`, \`amount\` | 每日（收盘后） |
| 日度估值指标 | \`daily_basic\` | \`ts_code\`, \`trade_date\`, \`pe_ttm\`, \`pb\`, \`total_mv\` | 每日（收盘后） |

> **开发注意**：\`daily\` 和 \`daily_basic\` 需按 \`(ts_code, trade_date)\` JOIN 后写入 \`stock_daily\` 表。\`vol\` 字段单位为手（100 股），\`amount\` 单位为千元，写入数据库时统一转换为股和元。

---

## 7. 新闻数据采集

**目标表**：\`news\`

| 采集内容 | AKShare 接口 | 关键字段 | 采集频率 |
|:---|:---|:---|:---|
| 财经新闻（宏观） | \`stock_news_em\` | \`title\`, \`content\`, \`publish_time\` | 每小时 |
| 个股公告 | \`stock_notice_report\` | \`ts_code\`, \`title\`, \`content\`, \`ann_date\` | 每日 |

---

## 8. 采集优先级

| 优先级 | 数据类型 | 原因 |
|:---|:---|:---|
| P0 | 个股日度行情（\`stock_daily\`）、板块成分股（\`sector_stock_map\`） | 所有分析的基础数据，缺失则前端无法展示 |
| P1 | 宏观指标（GDP/CPI/PPI/PMI/M2/社融/LPR/国债/北向/PE/PB） | 宏观分析核心数据 |
| P2 | 新闻数据（\`news\`）、汇率（\`rmb_usd\`）、DR001/DR007 | 辅助分析，暂时缺失不影响核心功能 |

---

## 9. 环境变量配置

数据采集脚本运行时，所有凭证通过环境变量注入，**实际值存储在项目根目录的 \`.env\` 文件中，已加入 \`.gitignore\`，禁止提交到 Git**。

### 9.1 凭证清单

| 变量名 | 用途 | 权限级别 | 使用方 |
|:---|:---|:---|:---|
| \`SUPABASE_URL\` | Supabase 项目地址 | 公开 | 后端脚本 + 前端 |
| \`SUPABASE_SERVICE_KEY\` | 服务端密钥，绕过 RLS，完整读写权限 | **高度敏感** | 仅后端/采集脚本 |
| \`SUPABASE_ANON_KEY\` | 匿名公开密钥，受 RLS 策略限制 | 低敏感 | 前端 React |
| \`TUSHARE_TOKEN\` | Tushare Pro 接口调用凭证 | 中等敏感 | 仅后端/采集脚本 |

> AKShare 无需任何 API Key，\`pip install akshare\` 后直接调用。

### 9.2 Python 采集脚本中的使用方式

\`\`\`python
import os
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")  # 采集脚本使用 service_role
TUSHARE_TOKEN = os.environ.get("TUSHARE_TOKEN")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

import tushare as ts
ts.set_token(TUSHARE_TOKEN)
pro = ts.pro_api()
\`\`\`

### 9.3 安全规范

- \`SUPABASE_SERVICE_KEY\` 拥有完整数据库权限，**只能在服务端 Python 脚本中使用**，绝对不能出现在前端代码或 Git 仓库中
- \`SUPABASE_ANON_KEY\` 可以安全暴露在前端代码中，但依赖 Supabase RLS 行级安全策略保护数据
- 凭证过期时间：Service Key 和 Anon Key 的 JWT 过期时间为 **2084-09-26**（约 60 年），无需定期轮换
- Tushare Token 无过期时间，如发生泄露需立即在 Tushare 控制台重置

---

## 10. 注意事项与风险提示

| 风险项 | 说明 |
|:---|:---|
| 接口限频 | AKShare 数据来源为公开网站，频繁请求可能被限频，采集脚本必须加入 \`time.sleep(1)\` 和指数退避重试机制 |
| 接口变更 | 公开网站页面结构可能变更导致接口失效，建议每月验证接口可用性 |
| DR001/DR007 | AKShare 无独立接口，需直采中国货币网（\`chinamoney.com.cn\`），失败时回退到 Shibor 近似值 |
| 人民币汇率 | \`macro_china_rmb\` 数据仅到 2021-05，必须直采中国货币网官方 API |
| 国债历史数据 | \`bond_zh_us_rate\` 中国国债数据从 1990-12 开始，早期数据有大量 NaN，建议从 2010-01-01 开始采集 |
| 融资余额单位 | 上海接口单位为元（int64），深圳接口单位为元（float64），写入数据库统一转换为亿元 |
| GDP 日期转换 | \`macro_china_gdp\` 返回的时间格式为 \`2024年三季度\`，需转换为季末日期 \`2024-09-30\` |
| LPR 频率 | LPR 不是每日发布，仅在调整时才有新数据，采集脚本需做幂等处理（相同 \`trade_date\` 不重复写入） |
`
  },
  {
    id: 'arch-overview',
    category: 'decision_log',
    title: '系统架构全景决策',
    tags: ['架构', 'MANUS', 'Supabase', 'Tushare'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# 系统架构全景

## 核心原则

> **凡是能用确定性规则描述的逻辑，就不该用 AI。把 AI 留给真正需要它的地方。**

## 四层架构

\`\`\`
采集层（确定性）  →  存储层（Supabase）  →  AI分析层（隔离）  →  展示层（React）
Tushare API          indicator_values        analyze_macro          宏观看板
定时任务              stock_snapshot          analyze_sector         板块轮动
数据质量检验          timing_signals          timing_signal          个股分析
\`\`\`

## 关键约束

1. **AI 分析层的输入必须是已存储的数据**，不能实时调外部接口
2. **AI 分析层的输出必须写回数据库**，带置信度 + 推理链 + 有效期
3. **展示层永远只读数据库**，完全不感知 AI 和 Tushare 的存在
4. **数据质量检验优先用规则**（范围检查、时序完整性、统计异常），AI 只做语义层补充

## 技术选型理由

| 组件 | 选择 | 理由 |
|------|------|------|
| 主力 Agent | MANUS | 调度器角色，负责协调各 Skill |
| 数据源 | Tushare 全量 | 专业、稳定、覆盖 A 股全量数据 |
| 存储 | Supabase (PostgreSQL) | 支持 MCP 直连，结构化查询，实时订阅 |
| 展示 | React + Vite | 已有基础，组件库完整 |
| 定时任务 | MANUS Schedule | 与 Skills 体系天然集成 |
`,
  },
  {
    id: 'data-model-v1',
    category: 'data_model',
    title: '数据库 Schema 设计 v2',
    tags: ['Supabase', 'PostgreSQL', 'Schema', '时序数据', '数据版本控制'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# 数据库 Schema 设计 v2

## 核心设计原则

1. **窄表存储原始数据**：所有时序数据使用窄表结构，便于扩展新指标，不覆盖，只追加。
2. **时间序列三要素**：所有时序数据表必须包含 \`trade_date\` (业务时间)、\`publish_date\` (发布时间)、\`collected_at\` (采集时间) 三个时间字段，以避免回测中的未来数据泄露。
3. **数据版本控制**：对可能被修订的数据（如宏观指标），通过 \`revision_seq\` 字段进行版本管理，查询时取最大版本号。
4. **关系有效期**：对会变化的映射关系（如板块成分股），通过 \`effective_date\` 和 \`expiry_date\` 字段管理有效期。
5. **AI 接口预留**：为 AI 分析层预留输入输出字段，如 \`sentiment\`、\`ai_summary\`、\`analyzed_at\` 等。

---

## 基础层（静态/低频更新）

### 1. \`indicator_meta\` 指标元数据

存储所有宏观、行业、个股指标的定义和元信息。

\`\`\`sql
CREATE TABLE indicator_meta (
  id            TEXT PRIMARY KEY,    -- 指标唯一ID, e.g., "gdp_yoy"
  name_cn       TEXT NOT NULL,       -- 指标中文名, e.g., "国内生产总值(同比)"
  description_cn TEXT,               -- 指标标准中文解释
  category      TEXT NOT NULL,       -- 分类: 'macro' | 'sector' | 'stock'
  unit          TEXT,                -- 单位: '%', '亿元(人民币)', '倍', etc.
  source_name   TEXT,                -- 发布单位名称, e.g., "国家统计局"
  source_url    TEXT,                -- 数据来源网址
  credibility   TEXT,                -- 可信度: 'high' | 'medium' | 'low'
  created_at    TIMESTAMPTZ DEFAULT now()
);
\`\`\`

### 2. \`sector_meta\` 板块元数据

存储板块的定义，如申万行业、概念板块等。

\`\`\`sql
CREATE TABLE sector_meta (
  id          TEXT PRIMARY KEY,      -- 板块唯一ID, e.g., "sw_bank"
  name        TEXT NOT NULL,         -- 板块名称, e.g., "申万银行"
  type        TEXT NOT NULL,         -- 分类体系: 'sw_l1' | 'concept' | 'hs300'
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
\`\`\`

### 3. \`stock_meta\` 个股元数据

存储股票的基础信息。

\`\`\`sql
CREATE TABLE stock_meta (
  code         TEXT PRIMARY KEY,     -- 股票代码, e.g., "600036.SH"
  name         TEXT NOT NULL,        -- 股票名称
  listing_date DATE,                 -- 上市日期
  exchange     TEXT,                 -- 交易所: 'SSE' | 'SZSE'
  created_at   TIMESTAMPTZ DEFAULT now()
);
\`\`\`

### 4. \`sector_stock_map\` 板块-个股映射

管理板块和成分股之间的关系，包含有效期。板块统计指标（PE、PB等）通过聚合此映射关系下的个股数据计算得出，不单独存储。

\`\`\`sql
CREATE TABLE sector_stock_map (
  sector_id      TEXT REFERENCES sector_meta(id),
  stock_code     TEXT REFERENCES stock_meta(code),
  effective_date DATE NOT NULL,      -- 纳入日期
  expiry_date    DATE,               -- 剔除日期 (NULL 表示仍在成分中)
  PRIMARY KEY (sector_id, stock_code, effective_date)
);
\`\`\`

---

## 数据层（高频更新）

### 5. \`indicator_values\` 指标时序数据

存储所有宏观指标的时间序列数据，货币单位统一为人民币。

\`\`\`sql
CREATE TABLE indicator_values (
  indicator_id  TEXT REFERENCES indicator_meta(id),
  trade_date    DATE NOT NULL,       -- 数据所属交易日/统计期
  publish_date  DATE NOT NULL,       -- 数据实际发布日期
  value         NUMERIC,             -- 数值 (货币统一为人民币)
  revision_seq  INT DEFAULT 0,       -- 修订版本号 (0为初版)
  collected_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (indicator_id, trade_date, revision_seq)
);
-- 查询最新版本: WHERE revision_seq = (SELECT MAX(revision_seq) ...)
\`\`\`

### 6. \`stock_daily\` 个股日度数据

存储个股每日的行情和财务衍生指标。

\`\`\`sql
CREATE TABLE stock_daily (
  stock_code   TEXT REFERENCES stock_meta(code),
  trade_date   DATE NOT NULL,
  open         NUMERIC, close    NUMERIC,
  high         NUMERIC, low      NUMERIC,
  volume       NUMERIC,           -- 成交量(手)
  amount       NUMERIC,           -- 成交额(人民币元)
  pe_ttm       NUMERIC,           -- 市盈率TTM
  pb_mrq       NUMERIC,           -- 市净率MRQ
  market_cap   NUMERIC,           -- 总市值(人民币元)
  collected_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (stock_code, trade_date)
);
\`\`\`

---

## 信息层（非结构化）

### 7. \`news\` 新闻数据

存储宏观、行业、个股新闻，并为 AI 情感分析预留字段。\`analyzed_at IS NULL\` 即为 AI 分析 Skill 的待处理队列。

\`\`\`sql
CREATE TABLE news (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL,     -- 'macro' | 'sector' | 'stock'
  related_id    TEXT,              -- 关联的 indicator_id / sector_id / stock_code
  title         TEXT NOT NULL,
  content       TEXT,
  source        TEXT,
  publish_time  TIMESTAMPTZ NOT NULL,
  collected_at  TIMESTAMPTZ DEFAULT now(),
  -- AI 分析结果字段 (由 AI 分析层写入)
  sentiment     SMALLINT,          -- -1:负面 | 0:中性 | 1:正面
  sentiment_score FLOAT,           -- 置信度 0-1
  keywords      TEXT[],
  ai_summary    TEXT,
  analyzed_at   TIMESTAMPTZ        -- NULL 表示待分析
);
\`\`\`

---

## 分析层（AI 输出）

### 8. \`timing_signals\` 择时信号

存储 AI 分析后生成的择时信号，覆盖宏观、板块、个股三个层面。

\`\`\`sql
CREATE TABLE timing_signals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type   TEXT NOT NULL,     -- 'macro' | 'sector' | 'stock'
  target_id     TEXT NOT NULL,     -- 关联的 indicator_id / sector_id / stock_code
  signal_type   TEXT NOT NULL,     -- 'buy' | 'sell' | 'hold' | 'watch'
  confidence    FLOAT,             -- 置信度 0-1 (低于0.6不在主看板展示)
  reason        TEXT NOT NULL,     -- AI 推理链 (必填，不可为空)
  valid_until   TIMESTAMPTZ,       -- 信号有效期
  model_version TEXT,              -- 生成信号的 AI 模型版本
  created_at    TIMESTAMPTZ DEFAULT now()
);
\`\`\`

---

## 表关系总览

\`\`\`
【基础层】
indicator_meta ← sector_meta ← stock_meta
                      ↕ (多对多)
               sector_stock_map

【数据层】
indicator_meta → indicator_values  (宏观时序)
stock_meta     → stock_daily       (个股日度)

【信息层】
news (category + related_id 关联到对应实体)

【分析层】
timing_signals (target_type + target_id 覆盖宏观/板块/个股)
\`\`\`
`,
  },
  {
    id: 'ai-boundary-v1',
    category: 'ai_boundary',
    title: 'AI 使用边界定义 v1',
    tags: ['AI', 'MANUS', '边界', '风险控制'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# AI 使用边界定义 v1

## 判断框架

每次设计模块时，问三个问题：

| 问题 | 若答案为"是" | 结论 |
|------|------------|------|
| 这个任务有确定性规则可描述吗？ | 是 | **用代码，不用 AI** |
| 这个任务的错误是可观测的吗？ | 否 | **不适合用 AI** |
| 这个任务的输出会影响后续决策吗？ | 是 | **必须有规则兜底** |

## 各模块 AI 使用规范

### ✅ 允许使用 AI 的场景

| 模块 | AI 职责 | 输入 | 输出要求 |
|------|---------|------|---------|
| 新闻语义分析 | 判断新闻与股票的相关性 | 已存储的新闻文本 | 写回 DB，带置信度 |
| 宏观趋势判断 | 综合多指标给出趋势判断 | Supabase 查询结果 | 写回 timing_signals，带推理链 |
| 研报摘要提取 | 提取关键财务数据 | PDF/文本 | 结构化写入 stock_snapshot |
| 择时信号生成 | 综合分析给出买卖建议 | 已存储的全量数据 | 带 valid_until 和 confidence |

### ❌ 禁止使用 AI 的场景

| 场景 | 原因 | 替代方案 |
|------|------|---------|
| Tushare 数据拉取 | 有确定性 API，无需 AI | 直接调用 Tushare SDK |
| 数值范围检验 | 规则明确，AI 会引入误判 | 统计规则（Z-score、IQR） |
| 时序完整性检验 | 纯逻辑判断 | SQL 查询 |
| 数据库写入操作 | 需要 100% 可靠 | 代码直连 Supabase |
| 定时任务调度 | 需要确定性触发 | MANUS Schedule |

## 风险控制

1. **所有 AI 输出必须写入数据库后才能被展示层使用**
2. **择时信号必须携带 \`valid_until\`**，过期信号自动降级为"参考"
3. **AI 分析结论必须携带 \`model_version\`**，便于回溯和审计
4. **置信度低于 0.6 的信号不显示在主看板**，仅在详情页展示
`,
  },
  {
    id: 'skills-directory',
    category: 'skill',
    title: 'MANUS Skills 目录',
    tags: ['Skills', 'MANUS', '定时任务'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# MANUS Skills 目录

## 规划中的 Skills

### 采集层 Skills（确定性，无 AI）

| Skill 名称 | 触发方式 | 数据源 | 写入表 | 状态 |
|-----------|---------|--------|--------|------|
| fetch_macro_indicators | 每日 09:00 | Tushare | indicator_values | 🔲 待建 |
| fetch_stock_snapshot | 每日 17:00 | Tushare | stock_snapshot | 🔲 待建 |
| fetch_sector_data | 每日 17:30 | Tushare | indicator_values | 🔲 待建 |
| validate_data_quality | 每日 18:00 | Supabase | - (告警) | 🔲 待建 |

### AI 分析层 Skills（隔离，输入来自 DB）

| Skill 名称 | 触发方式 | 输入 | 写入表 | 状态 |
|-----------|---------|------|--------|------|
| analyze_macro | 每周一 08:00 | indicator_values | timing_signals | 🔲 待建 |
| analyze_sector | 每周一 08:30 | indicator_values | timing_signals | 🔲 待建 |
| analyze_stock | 按需触发 | stock_snapshot | timing_signals | 🔲 待建 |
| generate_timing_signal | 每日 19:00 | 全量 DB | timing_signals | 🔲 待建 |

## Skill 设计规范

每个 Skill 必须包含：
1. **输入契约**：明确说明从哪里读数据
2. **输出契约**：明确说明写入哪张表、哪些字段
3. **失败处理**：失败时告警，不静默失败
4. **幂等性**：重复执行不产生重复数据
`,
  },
];

export function loadDocs(): KnowledgeDoc[] {
  try {
    const storedVersion = parseInt(localStorage.getItem(VERSION_KEY) || '0', 10);
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored && storedVersion >= DOCS_VERSION) {
      // 版本一致，直接返回缓存
      return JSON.parse(stored);
    }

    if (stored && storedVersion < DOCS_VERSION) {
      // 版本升级：用 INITIAL_DOCS 中的内置文档覆盖同 id 的旧文档，保留用户新建的文档
      const cachedDocs: KnowledgeDoc[] = JSON.parse(stored);
      const builtinIds = new Set(INITIAL_DOCS.map((d) => d.id));
      const userDocs = cachedDocs.filter((d) => !builtinIds.has(d.id));
      const merged = [...INITIAL_DOCS, ...userDocs];
      localStorage.setItem(VERSION_KEY, String(DOCS_VERSION));
      saveDocs(merged);
      return merged;
    }
  } catch (e) {
    console.error('Failed to load docs from localStorage', e);
  }
  // 首次加载，写入初始文档
  localStorage.setItem(VERSION_KEY, String(DOCS_VERSION));
  saveDocs(INITIAL_DOCS);
  return INITIAL_DOCS;
}

export function saveDocs(docs: KnowledgeDoc[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  } catch (e) {
    console.error('Failed to save docs to localStorage', e);
  }
}

export function saveDoc(doc: KnowledgeDoc): KnowledgeDoc[] {
  const docs = loadDocs();
  const idx = docs.findIndex((d) => d.id === doc.id);
  const updated = { ...doc, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    docs[idx] = updated;
  } else {
    docs.push(updated);
  }
  saveDocs(docs);
  return docs;
}

export function deleteDoc(id: string): KnowledgeDoc[] {
  const docs = loadDocs().filter((d) => d.id !== id);
  saveDocs(docs);
  return docs;
}

export function createDoc(
  category: KnowledgeDoc['category'],
  title: string,
): KnowledgeDoc {
  return {
    id: `doc-${Date.now()}`,
    category,
    title,
    content: `# ${title}\n\n在此处编写内容...\n`,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
