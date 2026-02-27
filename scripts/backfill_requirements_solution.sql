-- ============================================================
-- 回填 requirements 表的 resolved_at / resolved_by / solution_note / code_refs
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- REQ-001: 支持多国宏观指标采集（G20 覆盖）
UPDATE requirements SET
  resolved_at   = '2026-02-25T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '在 collect_macro_cn.py 基础上新增 collect_macro_global.py，通过 AKShare 采集 US/EU/DE/GB/JP/AU/CA/HK 等主要经济体的宏观指标，写入 indicator_values 表，region 字段区分国家。',
  code_refs     = ARRAY['scripts/collect_macro_global.py', 'scripts/collect_macro_cn.py']
WHERE id = 'REQ-001';

-- REQ-002: indicator_id 命名规范统一
UPDATE requirements SET
  resolved_at   = '2026-02-25T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '在 indicator_meta 表中统一使用 snake_case 命名规范，如 cpi_yoy / gdp_yoy / policy_rate，并在数据采集需求文档 v6 中明确记录命名规范表。',
  code_refs     = ARRAY['scripts/seed_indicator_meta.py']
WHERE id = 'REQ-002';

-- REQ-003: indicator_meta 新增 currency 字段
UPDATE requirements SET
  resolved_at   = '2026-02-25T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '在 Supabase indicator_meta 表中新增 currency CHAR(3) 字段，使用 ISO 4217 三字母货币代码（CNY/USD/EUR），与 unit/scale 字段配合描述原始数据格式。无货币单位的指标（如 PMI、PE）此字段为 NULL。',
  code_refs     = ARRAY['scripts/seed_indicator_meta.py']
WHERE id = 'REQ-003';

-- REQ-004: 时间字段统一为 date_value DATE 类型
UPDATE requirements SET
  resolved_at   = '2026-02-25T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '所有指标统一使用 date_value DATE 字段存储时间，采用区间末日期约定：月度数据取当月最后一天，季度数据取季末最后一天，年度数据取年末最后一天（与 Wind/CEIC 一致）。',
  code_refs     = ARRAY['scripts/collect_macro_cn.py', 'scripts/collect_macro_global.py']
WHERE id = 'REQ-004';

-- REQ-007: 宏观指标元数据（indicator_meta）初始化
UPDATE requirements SET
  resolved_at   = '2026-02-24T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '通过 seed_indicator_meta.py 脚本批量写入 indicator_meta 表，包含 CN/US/EU 等主要经济体的宏观指标元数据，字段包括 id/region/name/unit/scale/currency/frequency/source。',
  code_refs     = ARRAY['scripts/seed_indicator_meta.py']
WHERE id = 'REQ-007';

-- REQ-008: 中国宏观指标采集（AKShare）
UPDATE requirements SET
  resolved_at   = '2026-02-24T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '通过 collect_macro_cn.py 脚本使用 AKShare 采集 A 股融资融券余额、M2、CPI、PPI、PMI、GDP 等中国宏观指标，写入 indicator_values 表，支持增量更新（upsert）。',
  code_refs     = ARRAY['scripts/collect_macro_cn.py']
WHERE id = 'REQ-008';

-- REQ-009: 融资融券数据采集
UPDATE requirements SET
  resolved_at   = '2026-02-24T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '在 collect_macro_cn.py 中通过 AKShare stock_margin_sh/sz 接口采集沪深两市融资融券余额，原始单位为"元"，按源数据原样存储（第一原则），indicator_meta 中 unit=元 scale=0。',
  code_refs     = ARRAY['scripts/collect_macro_cn.py']
WHERE id = 'REQ-009';

-- REQ-010: indicator_values 表设计
UPDATE requirements SET
  resolved_at   = '2026-02-24T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '在 Supabase 中建立 indicator_values 表，字段包括 indicator_id/region/date_value/value/source，主键为 (indicator_id, region, date_value)，支持 upsert 写入。',
  code_refs     = ARRAY['scripts/seed_indicator_meta.py']
WHERE id = 'REQ-010';

-- REQ-011: 美国宏观指标采集（AKShare）
UPDATE requirements SET
  resolved_at   = '2026-02-25T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '在 collect_macro_global.py 中通过 AKShare macro_usa_* 系列接口采集美国 CPI/PPI/GDP/PMI/失业率/非农/零售/政策利率等指标，写入 indicator_values 表，region=US。',
  code_refs     = ARRAY['scripts/collect_macro_global.py']
WHERE id = 'REQ-011';

-- REQ-012: 欧元区/英国/日本等主要经济体宏观指标采集
UPDATE requirements SET
  resolved_at   = '2026-02-25T00:00:00Z',
  resolved_by   = 'AI',
  solution_note = '在 collect_macro_global.py 中通过 AKShare 对应接口采集 EU/DE/GB/JP/AU/CA/HK 等经济体的宏观指标，各经济体覆盖 CPI/GDP/PMI/失业率/政策利率等核心指标。',
  code_refs     = ARRAY['scripts/collect_macro_global.py']
WHERE id = 'REQ-012';

-- REQ-015: 需求讨论后必须写入 requirements 表
UPDATE requirements SET
  resolved_at   = '2026-02-27T03:30:00Z',
  resolved_by   = 'AI',
  solution_note = '在知识库中新增「工作流规范：需求讨论 → requirements 表」文档（doc_id: workflow-requirements），明确触发条件、执行步骤和字段速查，AI 每次任务启动时读取此规范并遵循。',
  code_refs     = ARRAY['scripts/seed_requirements.py']
WHERE id = 'REQ-015';

-- REQ-016: 知识库迁移到 Supabase 四表结构
UPDATE requirements SET
  resolved_at   = '2026-02-27T02:00:00Z',
  resolved_by   = 'AI',
  solution_note = '删除 knowledge.ts 中 86KB 的 INITIAL_DOCS 硬编码数组和全部 localStorage 逻辑。新建 knowledge_doc_meta / knowledge_docs / knowledge_docs_history / knowledge_doc_links 四表，通过 migrate_knowledge.py 将 9 篇文档迁移入库。',
  code_refs     = ARRAY['client/src/lib/knowledge.ts', 'scripts/migrate_knowledge.py']
WHERE id = 'REQ-016';

-- REQ-017: knowledge_doc_meta 与 knowledge_docs 分离存储
UPDATE requirements SET
  resolved_at   = '2026-02-27T02:00:00Z',
  resolved_by   = 'AI',
  solution_note = '元信息表（knowledge_doc_meta）只存 id/category/title/summary/tags 等轻量字段，正文表（knowledge_docs）只存 content。前端首次加载只 fetch meta 表，点击文档时才 fetch content，减少 bundle 大小和首屏加载时间。',
  code_refs     = ARRAY['client/src/lib/knowledge.ts', 'client/src/pages/Knowledge.tsx']
WHERE id = 'REQ-017';

-- REQ-020: 知识库文档详情页关联需求面板
UPDATE requirements SET
  resolved_at   = '2026-02-27T03:00:00Z',
  resolved_by   = 'AI',
  solution_note = '在 Knowledge.tsx 文档正文下方新增「关联需求」面板，通过 doc_id 过滤 requirements 表，展示需求编号/优先级/标题/描述/版本，右侧状态下拉直接 PATCH Supabase，无需刷新。',
  code_refs     = ARRAY['client/src/pages/Knowledge.tsx']
WHERE id = 'REQ-020';

-- REQ-021: 前端版本号显示
UPDATE requirements SET
  resolved_at   = '2026-02-27T02:30:00Z',
  resolved_by   = 'AI',
  solution_note = '在 vite.config.ts 中通过 define.__APP_VERSION__ 注入 package.json 的 version 字段，在 Home.tsx 右上角以等宽字体显示版本号，构建时自动更新，无需手动维护。',
  code_refs     = ARRAY['vite.config.ts', 'client/src/pages/Home.tsx', 'client/src/vite-env.d.ts']
WHERE id = 'REQ-021';
