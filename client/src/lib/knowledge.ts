// 每次修改 INITIAL_DOCS 时，递增此版本号，触发自动更新
const DOCS_VERSION = 12;
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
     id: 'system-design-v1',
    category: 'decision_log',
    title: '系统设计 v1：数据采集架构与决策日志',
    tags: ['系统设计', '架构', '决策', '数据采集', 'AKShare', 'Supabase', '数据源', 'API', 'ETL'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# 系统设计 v1：数据采集架构与决策日志

本文档阐述 Trudecide 股票版项目的数据采集架构、核心设计原则以及在开发过程中做出的关键技术决策，旨在为项目的维护和迭代提供清晰的上下文和“第一性原理”参考。

---

## 1. 核心设计原则

1.  **代码即文档 (Code as Documentation)**: 采集逻辑、数据源选择、字段映射等核心信息必须在代码（脚本、SQL）和知识库文档中保持同步。注释应解释“Why”，而不是“What”。
2.  **数据源可靠性优先**: 优先选择官方、稳定、有持续维护的公开数据源。在多源可选时，优先选择 API 接口而非页面抓取。
3.  **自动化与可复现**: 所有数据采集和处理流程必须代码化，杜绝手动操作。脚本应支持幂等性（重复执行结果一致）和可回填（能一次性采集所有历史数据）。
4.  **分层解耦**: 数据模型（Schema）、采集脚本（ETL）、前端展示（Frontend）三层分离，各自独立演进。

---

## 2. 数据采集架构

本项目的宏观数据采集流程是一个典型的 ETL（Extract, Transform, Load）过程：

```mermaid
graph TD
    subgraph Extract [1. 数据提取]
        A[AKShare] --> C{采集脚本};
        B[国家统计局 API] --> C;
        D[商务部 API] --> C;
    end

    subgraph Transform [2. 数据转换]
        C -- pandas DataFrame --> E[数据清洗/转换];
    end

    subgraph Load [3. 数据加载]
        E -- JSON (records) --> F[Supabase API];
        F -- upsert --> G[(Supabase DB)];
    end

    style A fill:#f9f,stroke:#333,stroke-width:2px
    style B fill:#f9f,stroke:#333,stroke-width:2px
    style D fill:#f9f,stroke:#333,stroke-width:2px
    style C fill:#ccf,stroke:#333,stroke-width:2px
    style E fill:#cfc,stroke:#333,stroke-width:2px
    style F fill:#ffc,stroke:#333,stroke-width:2px
    style G fill:#cff,stroke:#333,stroke-width:2px
```

-   **Extract**: 主要使用 `AKShare` 库作为统一入口，对于 AKShare 无法稳定访问的数据源（如商务部、国家统计局），则通过自定义的 `requests` 逻辑直接请求其底层 API。
-   **Transform**: 使用 `pandas` 库进行数据处理，包括：
    -   字段重命名（映射到数据库字段）
    -   数据类型转换（如日期字符串转 `datetime`）
    -   数据计算（如从累计值计算单季值）
    -   数据标准化（如单位统一为“亿元”）
-   **Load**: 通过纯 `requests` 调用 Supabase 的 REST API 进行数据写入。采用 `upsert` 模式（`Prefer: resolution=merge-duplicates`），确保数据不重复且支持重跑。

---

## 3. 关键技术决策日志

### 3.1 数据源选型

-   **决策**: 宏观指标主要使用 **AKShare**。
-   **理由 (Why)**:
    1.  **免费与开放**: 完全免费，无需 API Key 或积分，降低了项目启动和维护成本。
    2.  **覆盖面广**: 封装了东方财富、金十数据、国家统计局等多个主流财经数据源，满足了绝大部分宏观指标需求。
    3.  **社区活跃**: 作为国内流行的开源财经数据库，社区活跃，接口更新快。
-   **权衡**: 放弃了 Tushare 的宏观接口，尽管其数据更规整，但需要积分，不符合本项目低成本、高可用的原则。个股数据仍将使用 Tushare，因其在个股领域的专业性和数据质量更高。

### 3.2 数据库 Schema 设计

-   **决策**: 采用 `indicator_meta` (元数据) 和 `indicator_values` (时序数据) 的分离设计，并在 `indicator_values` 主键中加入 `region` 字段。
-   **理由 (Why)**:
    1.  **支持多国数据**: `region` 字段（如 'CN', 'US'）的引入，使得单一指标（如 `cpi_yoy`）可以存储多个国家的数据，避免了 `cn_cpi_yoy`, `us_cpi_yoy` 这种冗余且难以扩展的 ID 设计。
    2.  **查询效率**: 将指标的描述性信息（名称、单位、来源等）和高频更新的时序数据分离，可以提高时序数据表的查询和写入性能。
    3.  **主键设计**: `(indicator_id, trade_date, revision_seq, region)` 的复合主键确保了同一指标、同一天、同一国家的数据唯一性，同时 `revision_seq` 为未来可能的数据修正（如 GDP 初值、终值）预留了空间。

### 3.3 SSL/TLS 握手失败解决方案

-   **决策**: 针对商务部、国家统计局等接口的 SSL 握手失败问题，采用**自定义 `TLSAdapter`** 的方案。
-   **理由 (Why)**:
    1.  **根源解决**: 问题根源是目标服务器 TLS 版本过低，而非证书错误。因此，简单的 `verify=False` 无效。
    2.  **最小化影响**: 通过 `requests.Session` 和 `mount`，只对特定域名（如 `data.mofcom.gov.cn`）使用降级的 TLS 配置，不影响与其他现代网站的通信安全，远优于全局修改 OpenSSL 配置。
    3.  **代码化**: 该方案完全在 Python 代码中实现，无需修改沙箱环境配置，保证了脚本的可移植性。

### 3.4 数据缺失的替代与计算

-   **决策**: 对于 AKShare 无法直接提供的指标，采取“替代”或“计算”的策略。
-   **理由 (Why)**:
    1.  **业务连续性**: 保证核心指标不空缺，即使数据源不完美。例如，使用高度相关的 FR 利率替代 DR 利率，对于宏观趋势分析是可接受的。
    2.  **数据挖掘**: 从现有数据中派生新数据是数据分析的常见手段。例如，从 GDP 累计值计算单季环比，是基于公开数据还原真实经济活动的必要步骤。
    3.  **透明度**: 所有替代和计算逻辑都在采集脚本的注释和本文档中明确记录，使用者清楚数据的来源和处理过程，避免误读。
`
    },

    {
    id: 'pitfall-log-v1',
    category: 'pitfall',
    title: '踩坑记录 v1：数据采集 & Supabase 交互',
    tags: ['踩坑', 'Supabase', 'AKShare', 'RLS', 'SSL', 'TLS', '数据源', 'API'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# 踩坑记录 v1：数据采集 & Supabase 交互

本文档记录在开发宏观指标数据采集脚本过程中遇到的关键问题、失败路径、根本原因及最终解决方案，旨在为后续开发（尤其是 AI 参与的开发）提供“排雷”指南，避免重复踩坑。

---

## 1. Supabase RLS 策略导致写入失败

-   **现象**: `supabase.table(...).upsert(...)` 或 `requests.post(...)` 写入数据时，返回 HTTP 403/404 错误，提示违反行级别安全（RLS）策略。
-   **失败路径**:
    1.  最初怀疑是 `service_role` Key 无效，更换后问题依旧。
    2.  怀疑是网络问题，但 `select` 操作正常。
    3.  怀疑是 `upsert` 方法本身有问题，改用 `insert`，部分成功但无法处理冲突。
-   **根本原因**:
    1.  **`upsert` 需要 `UPDATE` 权限**：`upsert` 操作在数据库层面是一个原子性的“插入或更新”操作，因此要求执行角色同时具备 `INSERT` 和 `UPDATE` 权限。初版 RLS 策略仅为 `service_role` 授予了 `INSERT` 权限。
    2.  **SDK 参数触发复杂检查**：Supabase Python SDK 的 `upsert` 方法会生成带有 `?on_conflict=...&columns=...` 参数的 URL，这会触发更严格的 RLS 检查，比简单的 `POST` 请求更容易失败。
-   **最终解决方案**:
    1.  **修正 RLS 策略**：在 Supabase Dashboard 的 SQL Editor 中，将 `indicator_values` 表针对 `service_role` 的策略从 `FOR INSERT` 修改为 `FOR ALL`，授予其完整的写权限。
        ```sql
        -- 删除旧策略
        DROP POLICY IF EXISTS "service_role can insert indicator_values" ON indicator_values;
        -- 创建新的统一写入策略
        CREATE POLICY "service_role_write_all" ON indicator_values FOR ALL TO service_role USING (true) WITH CHECK (true);
        ```
    2.  **绕过 SDK，使用纯 `requests`**：为确保稳定性，所有写入操作统一改用 `requests.post`，并在请求头中加入 `"Prefer": "resolution=merge-duplicates"`。这个组合最简单、最可靠，只要求 `INSERT` + `UPDATE` 权限，不会触发额外参数检查。

---

## 2. AKShare 部分接口 SSL/TLS 握手失败

-   **现象**: 调用某些 AKShare 接口（如 `macro_china_shrzgm`、`macro_china_urban_unemployment`）时，在沙箱环境中报 `SSLV3_ALERT_HANDSHAKE_FAILURE` 或 `CERTIFICATE_VERIFY_FAILED`。
-   **失败路径**:
    1.  尝试在 `requests` 中加入 `verify=False`，无效。
    2.  尝试全局禁用 SSL 验证，有安全风险且不一定奏效。
-   **根本原因**: **目标服务器 TLS 版本过低**。这些接口的数据源（如商务部 `data.mofcom.gov.cn`、国家统计局 `data.stats.gov.cn`）使用的 TLS 协议版本较低（如 TLS 1.0/1.1），而 Manus 沙箱环境中的 OpenSSL 默认安全级别（`SECLEVEL=2`）要求 TLS 1.2+，导致握手失败。
-   **最终解决方案**:
    1.  **直接请求 API，绕过 AKShare**：通过浏览器抓包等方式找到原始 API 地址。
    2.  **自定义 `TLSAdapter`**：编写一个 `requests.adapters.HTTPAdapter` 的子类，在其中创建一个自定义的 `ssl.Context`，并强制设置加密套件的安全级别为 `SECLEVEL=1`，允许与旧版 TLS 服务器通信。
        ```python
        import ssl
        import requests
        from requests.adapters import HTTPAdapter

        class TLSAdapter(HTTPAdapter):
            def init_poolmanager(self, *args, **kwargs):
                ctx = ssl.create_default_context()
                ctx.set_ciphers('DEFAULT@SECLEVEL=1') # 核心：降低安全级别
                kwargs['ssl_context'] = ctx
                return super().init_poolmanager(*args, **kwargs)

        session = requests.Session()
        session.mount("https://", TLSAdapter())
        # 使用 session 对象发出请求
        response = session.post(url, ...)
        ```
    3.  **应用场景**：此方法成功解决了**社融增量**（商务部）和**城镇调查失业率**（国家统计局）的数据采集问题。

---

## 3. 数据源接口不一致与数据缺失

-   **现象**: 需求文档中的某些指标在 AKShare 中找不到完全对应的接口，或接口返回的数据不符合预期。
-   **案例与解决方案**:
    -   **DR001/DR007**: AKShare 无直接接口。**决策**：使用高度相关的银行间质押式回购利率 **FR001/FR007** (`repo_rate_hist`) 作为替代，并在文档中明确标注。
    -   **GDP 季比 (`gdp_qoq`)**: `macro_china_gdp` 接口只提供累计同比。**决策**：从累计绝对值数据中**反算单季度绝对值**，再手动计算环比（QoQ），这是在无法获取原始数据时的标准处理方法。
    -   **全市场 PB (`all_a_pb`)**: AKShare 无直接的全市场 PB 接口。**决策**：分别获取上证（`sh`）和深证（`sz`）的 PB 数据，然后**取其均值**作为全 A 市场的近似值。

---

## 4. 数据库 ID 命名规范化迁移

-   **现象**: 初期采集的 14 个指标 ID 带有 `cn_` 前缀（如 `cn_cpi_yoy`），与后期规划（`region` 字段 + 无前缀 ID）不一致。
-   **失败路径**: 直接 `UPDATE indicator_values SET indicator_id = 'cpi_yoy' WHERE indicator_id = 'cn_cpi_yoy'` 会因违反外键约束而失败，因为 `indicator_meta` 表中尚不存在 `cpi_yoy` 这个 ID。
-   **根本原因**: **外键约束要求操作有序**。
-   **最终解决方案**: 编写了一个事务性的 SQL 迁移脚本，严格遵循以下顺序：
    1.  **`INSERT` 新 ID**：在 `indicator_meta` 中插入不带前缀的新版 ID 记录。
    2.  **`UPDATE` 子表**：更新 `indicator_values` 表，将其 `indicator_id` 从旧版 `cn_*` ID 更新为新版 ID。
    3.  **`DELETE` 旧 ID**：从 `indicator_meta` 中删除所有旧的 `cn_*` ID 记录。
    4.  **重建主键**：将 `region` 字段加入 `indicator_values` 的主键，以支持多国数据。

这条经验对于未来任何涉及主外键关系的数据迁移都至关重要。`
    },

    {
    id: 'data-collection-v3',
    category: 'requirement',
    title: '数据采集需求文档 v5（指标 ID 规范化版）',
    tags: ['数据采集', 'AKShare', 'Tushare', '宏观指标', '板块', '通达信', '东方财富', '个股', '新闻', 'Supabase', 'sector_daily', 'value_type'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# 数据采集需求文档 v5（AKShare 公开版 · 指标 ID 规范化）

> **v5 变更**：指标 ID 全面去除 cn\_ 前缀，由 indicator_meta.region 字段区分国家。indicator_values 主键已含 region 字段。当前已完成数据库过渡并写入 5035 条 CN 历史数据。

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

## 2. \`indicator_meta\` 表字段说明

> **已执行**：\`frequency\`、\`value_type\`、\`region\` 字段均已在建表时创建，无需再执行 ALTER TABLE。当前字段实际状态：

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| \`frequency\` | TEXT | 'daily' \| 'monthly' \| 'quarterly' \| 'annual' \| '每次调整' |
| \`value_type\` | TEXT | 'level' \| 'yoy' \| 'qoq' \| 'mom' \| 'flow' \| 'rate' \| 'index' |
| \`region\` | CHAR(2) | ISO 3166-1 alpha-2，默认 'CN'，区分国家/地区 |

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

**目标表**：\`sector_meta\`、\`sector_stock_map\`、\`sector_daily\`（新增）

本项目采用 **Tushare 打板专题数据**，覆盖通达信（TDX）和东方财富（DC）两套板块体系，放弃旧版申万行业 + \`concept\` 接口方案。

### 5.1 数据库表结构

**\`sector_meta\`（板块元数据，需新增字段）**

\`\`\`sql
CREATE TABLE sector_meta (
  id            TEXT PRIMARY KEY,        -- 内部 ID，格式：{source}_{ts_code}，如 TDX_880728
  ts_code       TEXT NOT NULL,           -- Tushare 原始代码，如 880728.TDX / BK1184.DC
  source        TEXT NOT NULL,           -- 数据来源：'TDX' | 'DC'
  name          TEXT NOT NULL,           -- 板块名称
  idx_type      TEXT,                    -- 板块类型（TDX 专有）：'概念板块' | '行业板块' | '风格板块' | '地区板块'
  created_at    TIMESTAMPTZ DEFAULT now()
);
\`\`\`

**\`sector_stock_map\`（板块-个股映射）**

\`\`\`sql
CREATE TABLE sector_stock_map (
  sector_id      TEXT REFERENCES sector_meta(id),
  stock_code     TEXT NOT NULL,          -- 个股代码，如 000001.SZ
  stock_name     TEXT,                   -- 个股名称
  trade_date     DATE NOT NULL,          -- 成分股有效日期（区间末日期约定）
  PRIMARY KEY (sector_id, stock_code, trade_date)
);
\`\`\`

**\`sector_daily\`（板块日度行情，新增表）**

\`\`\`sql
CREATE TABLE sector_daily (
  sector_id       TEXT REFERENCES sector_meta(id),
  trade_date      DATE NOT NULL,
  pct_change      FLOAT,                 -- 涨跌幅（%）
  turnover_rate   FLOAT,                 -- 换手率（%）
  up_num          INT,                   -- 上涨家数
  down_num        INT,                   -- 下跌家数
  limit_up_num    INT,                   -- 涨停家数（TDX 专有）
  limit_down_num  INT,                   -- 跌停家数（TDX 专有）
  total_mv        FLOAT,                 -- 总市值（亿元）
  float_mv        FLOAT,                 -- 流通市值（亿元）
  pe              FLOAT,                 -- 市盈率（TDX 专有）
  pb              FLOAT,                 -- 市净率（TDX 专有）
  bm_net          FLOAT,                 -- 主力净额（元，TDX 专有）
  bm_ratio        FLOAT,                 -- 主力占比（%，TDX 专有）
  leading         TEXT,                  -- 领涨股名称（DC 专有）
  leading_code    TEXT,                  -- 领涨股代码（DC 专有）
  leading_pct     FLOAT,                 -- 领涨股涨跌幅（%，DC 专有）
  PRIMARY KEY (sector_id, trade_date)
);
\`\`\`

### 5.2 通达信板块（TDX）采集方案

通达信板块体系最为完整，包含概念、行业、风格、地区四类，且提供主力资金数据，**优先级 P0**。

| 采集内容 | Tushare 接口 | 关键参数 | 目标表 | 采集频率 |
|:---|:---|:---|:---|:---|
| 板块元数据（全量） | \`tdx_index\` | \`trade_date=<当日>\` | \`sector_meta\` | 每日（更新名称和类型）|
| 板块成分股 | \`tdx_member\` | \`trade_date=<当日>\` | \`sector_stock_map\` | 每日（成分股变动频繁）|
| 板块日度行情 | \`tdx_daily\` | \`trade_date=<当日>\` | \`sector_daily\` | 每日（收盘后 17:30）|

**\`tdx_index\` 输出字段映射**

| Tushare 字段 | 数据库字段 | 说明 |
|:---|:---|:---|
| \`ts_code\` | \`ts_code\` | 板块代码，如 \`880728.TDX\` |
| \`name\` | \`name\` | 板块名称 |
| \`idx_type\` | \`idx_type\` | 板块类型 |
| — | \`source\` | 固定值 \`'TDX'\` |
| — | \`id\` | 生成规则：\`'TDX_' + ts_code.split('.')[0]\` |

**\`tdx_daily\` 输出字段映射（写入 \`sector_daily\`）**

| Tushare 字段 | 数据库字段 | 说明 |
|:---|:---|:---|
| \`ts_code\` | \`sector_id\`（转换） | 通过 \`sector_meta\` 查找对应 \`id\` |
| \`trade_date\` | \`trade_date\` | 格式 YYYYMMDD → DATE |
| \`pct_change\` | \`pct_change\` | 涨跌幅（%）|
| \`turnover_rate\` | \`turnover_rate\` | 换手率（%）|
| \`up_num\` | \`up_num\` | 上涨家数 |
| \`down_num\` | \`down_num\` | 下跌家数 |
| \`limit_up_num\` | \`limit_up_num\` | 涨停家数 |
| \`limit_down_num\` | \`limit_down_num\` | 跌停家数 |
| \`float_mv\` | \`float_mv\` | 流通市值（亿）|
| \`ab_total_mv\` | \`total_mv\` | 总市值（亿）|
| \`pe\` | \`pe\` | 市盈率 |
| \`pb\` | \`pb\` | 市净率 |
| \`bm_net\` | \`bm_net\` | 主力净额（元）|
| \`bm_ratio\` | \`bm_ratio\` | 主力占比（%）|

> **权限要求**：\`tdx_index\`、\`tdx_member\`、\`tdx_daily\` 均需 **6000 积分**。

### 5.3 东方财富概念板块（DC）采集方案

东方财富概念板块更新及时，提供领涨股信息，**优先级 P1**。

| 采集内容 | Tushare 接口 | 关键参数 | 目标表 | 采集频率 |
|:---|:---|:---|:---|:---|
| 概念板块元数据 + 日度行情 | \`dc_index\` | \`trade_date=<当日>\` | \`sector_meta\` + \`sector_daily\` | 每日（收盘后 17:30）|
| 概念板块成分股 | \`dc_member\` | \`ts_code=<板块代码>\` | \`sector_stock_map\` | 每日 |

**\`dc_index\` 输出字段映射**

| Tushare 字段 | 目标表 | 数据库字段 | 说明 |
|:---|:---|:---|:---|
| \`ts_code\` | \`sector_meta\` | \`ts_code\` | 板块代码，如 \`BK1184.DC\` |
| \`name\` | \`sector_meta\` | \`name\` | 概念名称 |
| — | \`sector_meta\` | \`source\` | 固定值 \`'DC'\` |
| — | \`sector_meta\` | \`idx_type\` | 固定值 \`'概念板块'\` |
| \`pct_change\` | \`sector_daily\` | \`pct_change\` | 涨跌幅（%）|
| \`turnover_rate\` | \`sector_daily\` | \`turnover_rate\` | 换手率（%）|
| \`up_num\` | \`sector_daily\` | \`up_num\` | 上涨家数 |
| \`down_num\` | \`sector_daily\` | \`down_num\` | 下跌家数 |
| \`total_mv\` | \`sector_daily\` | \`total_mv\` | 总市值（万元 → 亿元，除以 10000）|
| \`leading\` | \`sector_daily\` | \`leading\` | 领涨股名称 |
| \`leading_code\` | \`sector_daily\` | \`leading_code\` | 领涨股代码 |
| \`leading_pct\` | \`sector_daily\` | \`leading_pct\` | 领涨股涨跌幅（%）|

> **开发注意**：\`dc_index\` 单次最多返回 5000 条，每个交易日约有 450-500 个概念板块，单次请求即可获取全量。\`total_mv\` 单位为**万元**，写入数据库时需除以 10000 转换为亿元。

### 5.4 采集优先级汇总

| 优先级 | 采集内容 | 接口 | 说明 |
|:---|:---|:---|:---|
| **P0** | 通达信板块元数据 + 成分股 + 日度行情 | \`tdx_index\` + \`tdx_member\` + \`tdx_daily\` | 字段最全，含主力资金，是板块轮动分析的核心数据 |
| **P1** | 东方财富概念板块 + 成分股 | \`dc_index\` + \`dc_member\` | 概念更新及时，领涨股信息有价值 |

> **旧版接口废弃说明**：v3 文档中的 \`index_classify\`（申万行业）、\`concept\`（概念板块）、\`index_member\`、\`concept_detail\` 接口已废弃，统一替换为打板专题接口。

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
    title: '数据库 Schema 设计 v5（indicator_values 含 region，ID 规范化）',
    tags: ['Supabase', 'PostgreSQL', 'Schema', '时序数据', '数据版本控制', 'RLS', '多国指标'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# 数据库 Schema 设计 v5（indicator_values 含 region，ID 规范化）

> **状态**：✅ 已在 Supabase 生产环境建表完成并迁移（2026-02-26）
> **v5 变更**：indicator_values 新增 region 字段并纳入主键；indicator_id 命名去 cn_ 前缀，由 region 字段区分国家
> **Project URL**：https://ozwgqdcqtkdprvhuacjk.supabase.co
> **建表脚本**：\`create_all_tables.sql\`（项目根目录）
> **迁移脚本**：\`migrate_v2_region_and_rename.sql\`（项目根目录）

## 核心设计原则

1. **窄表存储原始数据**：所有时序数据使用窄表结构，便于扩展新指标，不覆盖，只追加。
2. **时间序列三要素**：宏观指标表包含 \`trade_date\` (业务时间)、\`publish_date\` (发布时间)、\`collected_at\` (采集时间) 三个时间字段，以避免回测中的未来数据泄露。
3. **数据版本控制**：对可能被修订的数据（如宏观指标），通过 \`revision_seq\` 字段进行版本管理，查询时取最大版本号。
4. **关系有效期**：对会变化的映射关系（如板块成分股），通过 \`in_date\` 和 \`out_date\` 字段管理有效期，\`is_current\` 标记当前成分。
5. **RLS 权限控制**：所有表启用行级安全（RLS），所有人可读，service_role 可写。
6. **多国架构**：\`indicator_meta\` 使用 ISO 3166-1 alpha-2 \`region\` 字段区分国家/地区，数据源可为 WEO、世界银行、各国统计局，缺失数据留空。

---

## 表总览（8张表）

| 表名 | 字段数 | 分类 | 说明 |
|:---|:---:|:---|:---|
| \`indicator_meta\` | 12 | 基础层 | 宏观指标元数据（含 region 字段，29条 CN 种子数据） |
| \`indicator_values\` | 7 | 数据层 | 宏观指标时序数据（含 region 字段，主键含 region） |
| \`sector_meta\` | 7 | 基础层 | 板块元数据（TDX+DC双体系） |
| \`sector_stock_map\` | 5 | 基础层 | 板块-股票多对多映射 |
| \`sector_daily\` | 15 | 数据层 | 板块日度行情 |
| \`stock_meta\` | 11 | 基础层 | 个股基础信息 |
| \`stock_daily\` | 17 | 数据层 | 个股日度行情+估值 |
| \`news\` | 10 | 信息层 | 新闻舆情 |

---

## 基础层

### 1. \`indicator_meta\` 指标元数据（v5 含 region，ID 不含国家前缀）

\`\`\`sql
CREATE TABLE indicator_meta (
  id             TEXT PRIMARY KEY,
  name_cn        TEXT NOT NULL,
  description_cn TEXT,
  category       TEXT NOT NULL CHECK (category IN ('macro', 'sector', 'stock')),
  unit           TEXT,
  source_name    TEXT,
  source_url     TEXT,
  credibility    TEXT CHECK (credibility IN ('high', 'medium', 'low')),
  frequency      TEXT CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  value_type     TEXT CHECK (value_type IN ('level', 'yoy', 'mom', 'qoq', 'flow', 'rate', 'index')),
  region         CHAR(2) NOT NULL DEFAULT 'CN',  -- ISO 3166-1 alpha-2: CN/US/HK/TW/EU/JP/GLOBAL
  created_at     TIMESTAMPTZ DEFAULT now()
);
\`\`\`

**region 字段说明**：

| 值 | 含义 | 典型数据源 |
|:---|:---|:---|
| \`CN\` | 中国大陆 | 国家统计局、人民银行、AKShare |
| \`US\` | 美国 | BLS、美联储、AKShare |
| \`HK\` | 香港 | 香港统计处 |
| \`TW\` | 台湾 | 主计总处 |
| \`EU\` | 欧元区 | Eurostat |
| \`JP\` | 日本 | 日本统计局 |
| \`GLOBAL\` | 全球/多国汇总 | IMF WEO、世界银行 |

**已预置的 29 个 CN 宏观指标**（indicator_id 不含国家前缀，由 region 字段区分）：

| ID | 名称 | 频率 | 类型 |
|:---|:---|:---|:---|
| \`gdp_yoy\` | GDP同比增速 | quarterly | yoy |
| \`gdp_level\` | GDP总量（季度） | quarterly | level |
| \`gdp_qoq\` | GDP季比增速 | quarterly | qoq |
| \`gdp_primary\` | 第一产业增加值 | quarterly | level |
| \`gdp_primary_yoy\` | 第一产业同比增速 | quarterly | yoy |
| \`gdp_secondary\` | 第二产业增加值 | quarterly | level |
| \`gdp_secondary_yoy\` | 第二产业同比增速 | quarterly | yoy |
| \`gdp_tertiary\` | 第三产业增加值 | quarterly | level |
| \`gdp_tertiary_yoy\` | 第三产业同比增速 | quarterly | yoy |
| \`cpi_yoy\` | CPI同比 | monthly | yoy |
| \`cpi_mom\` | CPI环比 | monthly | mom |
| \`ppi_yoy\` | PPI同比 | monthly | yoy |
| \`pmi_mfg\` | 制造业PMI | monthly | index |
| \`pmi_non_mfg\` | 非制造业PMI | monthly | index |
| \`unemployment_rate\` | 城镇调查失业率 | monthly | index |
| \`m2_yoy\` | M2同比增速 | monthly | yoy |
| \`m2_level\` | M2余额 | monthly | level |
| \`social_finance_new\` | 社融新增（当月） | monthly | flow |
| \`social_finance_yoy\` | 社融存量同比 | monthly | yoy |
| \`new_loans\` | 新增人民币贷款 | monthly | flow |
| \`export_yoy\` | 出口金额同比 | monthly | yoy |
| \`import_yoy\` | 进口金额同比 | monthly | yoy |
| \`industrial_yoy\` | 工业增加值同比 | monthly | yoy |
| \`retail_yoy\` | 社零总额同比 | monthly | yoy |
| \`fai_yoy\` | 固定资产投资同比 | monthly | yoy |
| \`lpr_1y\` | 1年期LPR | 每次调整 | rate |
| \`lpr_5y\` | 5年期LPR | 每次调整 | rate |
| \`cn_bond_10y\` | 中国10年期国债收益率 | daily | rate |
| \`us_bond_10y\` | 美国10年期国债收益率（region=US） | daily | rate |

### 2. \`sector_meta\` 板块元数据

\`\`\`sql
CREATE TABLE sector_meta (
  id           TEXT PRIMARY KEY,
  name_cn      TEXT NOT NULL,
  system       TEXT NOT NULL CHECK (system IN ('tdx', 'dc')),
  level        INT  NOT NULL CHECK (level IN (1, 2, 3)),
  parent_id    TEXT REFERENCES sector_meta(id),
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
\`\`\`

### 3. \`stock_meta\` 个股元数据

\`\`\`sql
CREATE TABLE stock_meta (
  ts_code       TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL,
  name_cn       TEXT NOT NULL,
  area          TEXT,
  industry      TEXT,
  market        TEXT CHECK (market IN ('主板', '创业板', '科创板', '北交所', 'B股')),
  list_date     DATE,
  delist_date   DATE,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
\`\`\`

### 4. \`sector_stock_map\` 板块-个股映射

\`\`\`sql
CREATE TABLE sector_stock_map (
  sector_id   TEXT NOT NULL REFERENCES sector_meta(id),
  ts_code     TEXT NOT NULL,
  in_date     DATE,
  out_date    DATE,
  is_current  BOOLEAN DEFAULT true,
  PRIMARY KEY (sector_id, ts_code)
);
\`\`\`

---

## 数据层

### 5. \`indicator_values\` 宏观指标时序

\`\`\`sql
CREATE TABLE indicator_values (
  indicator_id  TEXT NOT NULL REFERENCES indicator_meta(id),
  trade_date    DATE NOT NULL,
  publish_date  DATE NOT NULL,
  value         NUMERIC,
  revision_seq  INT DEFAULT 0,
  collected_at  TIMESTAMPTZ DEFAULT now(),
  region        CHAR(2) NOT NULL DEFAULT 'CN',  -- ISO 3166-1 alpha-2，与 indicator_meta.region 一致
  PRIMARY KEY (indicator_id, trade_date, revision_seq, region)  -- v5 新增 region 到主键
);
\`\`\`

> **v5 设计说明**：\`region\` 字段纳入主键，支持同一 \`indicator_id\`（如 \`cpi_yoy\`）存储多个国家的数据（CN/US/EU 等），查询时通过 \`WHERE region = 'CN'\` 过滤。

### 6. \`sector_daily\` 板块日度行情

\`\`\`sql
CREATE TABLE sector_daily (
  sector_id    TEXT NOT NULL REFERENCES sector_meta(id),
  trade_date   DATE NOT NULL,
  open NUMERIC, high NUMERIC, low NUMERIC, close NUMERIC,
  pct_chg      NUMERIC,
  volume       NUMERIC,
  amount       NUMERIC,
  up_count     INT,
  down_count   INT,
  flat_count   INT,
  avg_pe       NUMERIC,
  total_mv     NUMERIC,
  collected_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (sector_id, trade_date)
);
\`\`\`

### 7. \`stock_daily\` 个股日度行情+估值

\`\`\`sql
CREATE TABLE stock_daily (
  ts_code      TEXT NOT NULL REFERENCES stock_meta(ts_code),
  trade_date   DATE NOT NULL,
  open NUMERIC, high NUMERIC, low NUMERIC, close NUMERIC,
  pre_close    NUMERIC,
  pct_chg      NUMERIC,
  vol          NUMERIC,
  amount       NUMERIC,
  adj_factor   NUMERIC,
  pe_ttm       NUMERIC,
  pb           NUMERIC,
  ps_ttm       NUMERIC,
  total_mv     NUMERIC,
  circ_mv      NUMERIC,
  collected_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ts_code, trade_date)
);
\`\`\`

---

## 信息层

### 8. \`news\` 新闻舆情

\`\`\`sql
CREATE TABLE news (
  id           BIGSERIAL PRIMARY KEY,
  ts_code      TEXT,
  title        TEXT NOT NULL,
  content      TEXT,
  pub_time     TIMESTAMPTZ NOT NULL,
  source       TEXT,
  url          TEXT,
  sentiment    NUMERIC CHECK (sentiment BETWEEN -1 AND 1),
  keywords     TEXT[],
  collected_at TIMESTAMPTZ DEFAULT now()
);
\`\`\`

---

## 数据采集脚本规划

| 脚本 | 数据源 | 目标表 | 频率 |
|:---|:---|:---|:---|
| \`collect_macro.py\` | AKShare / WEO / 各国统计局 | indicator_values | 每日/每月 |
| \`collect_sector_meta.py\` | Tushare TDX/DC | sector_meta, sector_stock_map | 每周 |
| \`collect_sector_daily.py\` | Tushare TDX/DC | sector_daily | 每日 |
| \`collect_stock_meta.py\` | Tushare stock_basic | stock_meta | 每周 |
| \`collect_stock_daily.py\` | Tushare daily + daily_basic | stock_daily | 每日 |
| \`collect_news.py\` | Tushare news | news | 每小时 |
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
