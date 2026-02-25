// 每次修改 INITIAL_DOCS 时，递增此版本号，触发自动更新
const DOCS_VERSION = 4;
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
    id: 'data-collection-v2',
    category: 'requirement',
    title: '数据采集需求文档 v2（AKShare 公开版）',
    tags: ['数据采集', 'AKShare', '宏观指标', '板块', '个股', '新闻', '免费公开数据'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# 数据采集需求文档 v2（AKShare 公开版）

本需求文档基于已确定的 **数据库 Schema v2** 和 **指标体系**，明确宏观、板块、个股、新闻四大类数据的采集范围、来源、频率和字段映射关系。

**核心决策**：宏观指标数据采集全部使用 **AKShare 开源 Python 库**，封装了东方财富、新浪财经、国家统计局、中国债券信息网等公开网站数据，**完全免费、无需注册、无需 API Key**。个股和板块数据仍沿用 Tushare Pro（已有 Token）。

---

## 1. 宏观指标数据采集

**目标数据表**: \`indicator_meta\`, \`indicator_values\`

核心原则：\`indicator_meta\` 表一次性初始化，后续仅在新增指标时追加；\`indicator_values\` 表按频率采集，只追加不覆盖，对可能修订的数据通过 \`revision_seq\` 进行版本管理。

### 1.1 宏观经济（Economy）

| 指标中文名 | indicator_id | AKShare 接口 | 关键字段 | 数据来源 | 采集频率 |
|:---|:---|:---|:---|:---|:---|
| GDP 增速 | gdp_yoy | \`macro_china_gdp\` | \`国内生产总值-同比增长\` | 东方财富 | 季度 |
| CPI 同比 | cpi_yoy | \`macro_china_cpi\` | \`全国-同比增长\` | 东方财富 | 月度 |
| PPI 同比 | ppi_yoy | \`macro_china_ppi\` | \`当月同比增长\` | 东方财富 | 月度 |
| PMI（制造业） | pmi_mfg | \`macro_china_pmi\` | \`制造业-指数\` | 东方财富 | 月度 |
| PMI（非制造业） | pmi_non_mfg | \`macro_china_pmi\` | \`非制造业-指数\` | 东方财富 | 月度 |

### 1.2 流动性与货币政策（Liquidity）

| 指标中文名 | indicator_id | AKShare 接口 | 关键字段 | 数据来源 | 采集频率 |
|:---|:---|:---|:---|:---|:---|
| M2 货币供应量同比 | m2_yoy | \`macro_china_money_supply\` | \`货币和准货币(M2)-同比增长\` | 东方财富 | 月度 |
| 社融增量（当月） | sfa_amount | \`macro_china_new_financial_credit\` | 当月新增信贷 | 东方财富 | 月度 |
| 1年期 LPR | lpr_1y | \`macro_china_lpr\` | \`LPR1Y\` | 东方财富 | 每次调整 |
| 存款准备金率（大型机构） | rrr_large | \`macro_china_reserve_requirement_ratio\` | \`大型金融机构-调整后\` | 东方财富 | 每次调整 |
| 1周 Shibor | shibor_1w | \`macro_china_shibor_all\` | \`1W-定价\` | 金十数据 | 每日 |

### 1.3 政策与预期（Policy）

| 指标中文名 | indicator_id | AKShare 接口 | 关键字段 | 数据来源 | 采集频率 |
|:---|:---|:---|:---|:---|:---|
| 10年期中国国债收益率 | bond_10y | \`bond_zh_us_rate\` | \`中国国债收益率10年\` | 东方财富 | 每日 |
| 10年期美国国债收益率 | us_bond_10y | \`bond_zh_us_rate\` | \`美国国债收益率10年\` | 东方财富 | 每日 |
| 北向资金净流入 | north_money | \`stock_hsgt_hist_em\` | 北向资金净买入 | 东方财富 | 每日 |

> 人民币汇率（USD/CNY）：\`macro_china_rmb\` 接口数据仅到 2021-05，暂不采集，待后续评估替代方案（中国银行汇率 \`currency_boc_sina\`）。

> 财政政策和产业政策为定性指标，通过 \`news\` 表采集相关新闻和公告进行分析，不直接采集数值。

### 1.4 市场估值与情绪（Valuation）

| 指标中文名 | indicator_id | AKShare 接口 | 关键字段 | 数据来源 | 采集频率 |
|:---|:---|:---|:---|:---|:---|
| 沪深300 PE(TTM) | hs300_pe_ttm | \`index_value_hist_funddb\` | PE 值 | funddb（韭圈儿） | 每日 |
| 沪深300 PB | hs300_pb | \`index_value_hist_funddb\` | PB 值 | funddb（韭圈儿） | 每日 |

> 股债收益率差、两融余额占流通市值比为派生指标，由前端或分析层计算，不单独采集。

---

## 2. 板块数据采集

**目标数据表**: \`sector_meta\`, \`sector_stock_map\`

核心原则：板块本身不产生时序数据，其估值、涨跌幅等指标均由成分股数据聚合计算而来。核心是维护 \`sector_stock_map\` 的准确性。

### 2.1 板块定义（写入 sector_meta）

| 板块分类 | type 值 | 接口来源 | 接口名 | 采集频率 |
|:---|:---|:---|:---|:---|
| 申万一级行业（31个） | \`sw_l1\` | Tushare | \`index_classify\` | 每月 |
| 概念板块 | \`concept\` | Tushare | \`concept\` | 每月 |
| 沪深300 | \`hs300\` | Tushare | \`index_basic\` | 每月 |
| 中证500 | \`zz500\` | Tushare | \`index_basic\` | 每月 |

### 2.2 板块成分股（写入 sector_stock_map）

| 板块分类 | 接口来源 | 接口名 | 关键参数 | 采集频率 |
|:---|:---|:---|:---|:---|
| 申万行业/指数成分 | Tushare | \`index_member\` | \`index_code\` | 每月 |
| 概念板块成分 | Tushare | \`concept_detail\` | \`concept_id\` | 每月 |

> 成分股变更时，将旧关系的 \`expiry_date\` 置为调整日，并插入新关系记录（\`effective_date\` = 调整日）。

---

## 3. 个股数据采集

**目标数据表**: \`stock_meta\`, \`stock_daily\`

### 3.1 个股基础信息（写入 stock_meta）

| 字段 | 接口来源 | 接口名 | 字段名 | 采集频率 |
|:---|:---|:---|:---|:---|
| 股票代码 | Tushare | \`stock_basic\` | \`ts_code\` | 每周 |
| 股票名称 | Tushare | \`stock_basic\` | \`name\` | 每周 |
| 上市日期 | Tushare | \`stock_basic\` | \`list_date\` | 每周 |
| 交易所 | Tushare | \`stock_basic\` | \`exchange\` | 每周 |

### 3.2 个股日度数据（写入 stock_daily）

| 字段 | 接口来源 | 接口名 | 字段名 | 采集频率 | 备注 |
|:---|:---|:---|:---|:---|:---|
| 开/收/高/低价 | Tushare | \`daily\` | \`open\`, \`close\`, \`high\`, \`low\` | 每日 | - |
| 成交量 | Tushare | \`daily\` | \`vol\` | 每日 | 单位：手 |
| 成交额 | Tushare | \`daily\` | \`amount\` | 每日 | 单位：千元，写入时换算为元 |
| 市盈率TTM | Tushare | \`daily_basic\` | \`pe_ttm\` | 每日 | - |
| 市净率MRQ | Tushare | \`daily_basic\` | \`pb\` | 每日 | - |
| 总市值 | Tushare | \`daily_basic\` | \`total_mv\` | 每日 | 单位：万元，写入时换算为元 |

---

## 4. 新闻数据采集

**目标数据表**: \`news\`

核心原则：采集后 \`analyzed_at\` 字段为 NULL，等待 AI 分析 Skill 进行情感分析和摘要提取。

| 新闻分类 | category 值 | 接口来源 | 接口名 | 采集频率 | 关联说明 |
|:---|:---|:---|:---|:---|:---|
| 宏观新闻 | \`macro\` | Tushare | \`news\` | 每小时 | \`related_id\` 置空，\`source='cctv'\` |
| 行业/个股新闻 | \`sector\` / \`stock\` | Tushare | \`news\` | 每小时 | 采集后由 AI 分析 Skill 补充 \`related_id\` |

---

## 5. 采集优先级

| 优先级 | 数据类型 | 原因 |
|:---|:---|:---|
| P0（立即） | 个股日度数据（stock_daily） | 是板块估值聚合计算的基础 |
| P0（立即） | 个股基础信息（stock_meta） | 是所有关联的前提 |
| P0（立即） | 板块成分股（sector_stock_map） | 是板块分析的核心 |
| P1（本周） | 宏观指标（indicator_values） | 宏观分析的数据源，使用 AKShare 免费采集 |
| P1（本周） | 板块定义（sector_meta） | 支撑板块分析 |
| P2（下周） | 新闻数据（news） | 依赖 AI 分析 Skill |

---

## 6. AKShare 安装与使用说明

\`\`\`bash
pip install akshare
\`\`\`

\`\`\`python
import akshare as ak

# 宏观数据示例
gdp_df = ak.macro_china_gdp()              # GDP 季度数据
cpi_df = ak.macro_china_cpi()              # CPI 月度数据
pmi_df = ak.macro_china_pmi()              # PMI 月度数据
m2_df  = ak.macro_china_money_supply()     # M2 货币供应量
lpr_df = ak.macro_china_lpr()             # LPR 利率
bond_df = ak.bond_zh_us_rate(start_date="20100101")  # 中美国债收益率
north_df = ak.stock_hsgt_hist_em(symbol="北向资金")  # 北向资金
pe_df = ak.index_value_hist_funddb(symbol="沪深300", indicator="PE")  # 沪深300 PE
\`\`\`

> **注意**：AKShare 数据来源为公开网站，存在被限频或接口变更的风险。建议采集时加入重试机制，并定期验证接口可用性。
`,
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
