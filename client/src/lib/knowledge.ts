/**
 * knowledge.ts
 * 知识库数据层 — Supabase 版
 *
 * 架构变更说明（v2）：
 *   旧版：文档硬编码在 INITIAL_DOCS 数组中，通过 localStorage 持久化。
 *         问题：跨设备不同步、清缓存丢数据、AI 更新文档需改源码重部署。
 *   新版：文档存储在 Supabase 四表结构中，前端直接调 REST API 读写。
 *         knowledge_doc_meta  → 轻量索引（AI 快速检索）
 *         knowledge_docs      → Markdown 正文（按需加载）
 *         knowledge_doc_links → 文档关联关系（语义图谱）
 *         knowledge_docs_history → 编辑历史快照（防误操作）
 *
 * 数据迁移：见 scripts/migrate_knowledge.py
 */

// ── Supabase 连接配置 ──────────────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** 通用 Supabase REST 请求头 */
const headers = {
  "apikey":        SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
  "Content-Type":  "application/json",
  "Prefer":        "return=representation",
};

// ── 类型定义 ───────────────────────────────────────────────────────────────────
export interface KnowledgeDoc {
  id:        string;
  category:  string;
  title:     string;
  content:   string;
  tags:      string[];
  createdAt: string;
  updatedAt: string;
}

/** knowledge_doc_meta 表的行结构（轻量，不含 content） */
export interface KnowledgeDocMeta {
  id:         string;
  category:   string;
  title:      string;
  summary:    string;
  tags:       string[];
  status:     string;
  version:    number;
  updated_at: string;
}

// ── 分类元信息（前端展示用，不存库） ──────────────────────────────────────────
export const CATEGORY_META: Record<string, { label: string; emoji: string; icon: string; color: string }> = {
  decision_log:  { label: '决策日志',    emoji: '📝', icon: '📝', color: '#6366f1' },
  data_model:    { label: '数据模型',    emoji: '🗄️', icon: '🗄️', color: '#0ea5e9' },
  ai_boundary:   { label: 'AI 边界',     emoji: '🤖', icon: '🤖', color: '#f59e0b' },
  skill:         { label: 'Skills 目录', emoji: '⚙️', icon: '⚙️', color: '#10b981' },
  pitfall:       { label: '踩坑记录',    emoji: '⚠️', icon: '⚠️', color: '#ef4444' },
  etl_blueprint: { label: 'ETL 蓝图',    emoji: '🔄', icon: '🔄', color: '#8b5cf6' },
  requirement:   { label: '需求文档',    emoji: '📋', icon: '📋', color: '#14b8a6' },
};

// ── 读取操作 ───────────────────────────────────────────────────────────────────

/**
 * 加载所有文档（含正文）。
 * 内部先拉 meta 列表，再并发拉各文档的 content，合并为 KnowledgeDoc[]。
 * Knowledge.tsx 中的 useEffect 调用此函数。
 */
export async function loadDocs(): Promise<KnowledgeDoc[]> {
  // 1. 拉取所有 meta（轻量，不含 content）
  const metaRes = await fetch(
    `${SUPABASE_URL}/rest/v1/knowledge_doc_meta?select=id,category,title,tags,updated_at&order=updated_at.desc`,
    { headers }
  );
  if (!metaRes.ok) throw new Error(`loadDocs meta failed: ${metaRes.status}`);
  const metaList: KnowledgeDocMeta[] = await metaRes.json();

  // 2. 并发拉取所有文档正文
  const docs = await Promise.all(
    metaList.map(async (meta) => {
      const contentRes = await fetch(
        `${SUPABASE_URL}/rest/v1/knowledge_docs?id=eq.${meta.id}&select=content,created_at`,
        { headers }
      );
      const contentRows = contentRes.ok ? await contentRes.json() : [];
      const row = contentRows[0] ?? {};
      return {
        id:        meta.id,
        category:  meta.category,
        title:     meta.title,
        content:   row.content ?? "",
        tags:      meta.tags ?? [],
        createdAt: row.created_at ?? meta.updated_at,
        updatedAt: meta.updated_at,
      } as KnowledgeDoc;
    })
  );

  return docs;
}

/**
 * 加载单篇文档（含正文）。
 * 用于文档详情页按需加载，避免全量拉取。
 */
export async function loadDoc(id: string): Promise<KnowledgeDoc | null> {
  const [metaRes, contentRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/knowledge_doc_meta?id=eq.${id}&select=*`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/knowledge_docs?id=eq.${id}&select=content,created_at`, { headers }),
  ]);
  const metaRows    = metaRes.ok    ? await metaRes.json()    : [];
  const contentRows = contentRes.ok ? await contentRes.json() : [];
  if (!metaRows[0]) return null;
  const meta = metaRows[0];
  const row  = contentRows[0] ?? {};
  return {
    id:        meta.id,
    category:  meta.category,
    title:     meta.title,
    content:   row.content ?? "",
    tags:      meta.tags ?? [],
    createdAt: row.created_at ?? meta.updated_at,
    updatedAt: meta.updated_at,
  };
}

// ── 写入操作 ───────────────────────────────────────────────────────────────────

/**
 * 保存（upsert）文档。
 * 同时更新 knowledge_doc_meta 和 knowledge_docs 两张表。
 */
export async function saveDoc(doc: KnowledgeDoc): Promise<void> {
  const now = new Date().toISOString();

  await Promise.all([
    // 更新 meta 表（title、tags、updated_at）
    fetch(`${SUPABASE_URL}/rest/v1/knowledge_doc_meta?id=eq.${doc.id}`, {
      method:  "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({
        title:      doc.title,
        tags:       doc.tags,
        updated_at: now,
      }),
    }),
    // 更新 docs 表（content、updated_at）
    fetch(`${SUPABASE_URL}/rest/v1/knowledge_docs?id=eq.${doc.id}`, {
      method:  "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({
        content:    doc.content,
        updated_at: now,
      }),
    }),
  ]);
}

/**
 * 新建文档。
 * 同时在 knowledge_doc_meta 和 knowledge_docs 中插入新行。
 */
export async function createDoc(category: string, title: string): Promise<KnowledgeDoc> {
  const now = new Date().toISOString();
  const id  = `doc-${Date.now()}`;
  const doc: KnowledgeDoc = {
    id,
    category,
    title,
    content:   `# ${title}\n\n在此处编写内容...\n`,
    tags:      [],
    createdAt: now,
    updatedAt: now,
  };

  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/knowledge_doc_meta`, {
      method:  "POST",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({
        id,
        category,
        title,
        summary:    "",
        tags:       [],
        status:     "active",
        version:    1,
        updated_at: now,
      }),
    }),
    fetch(`${SUPABASE_URL}/rest/v1/knowledge_docs`, {
      method:  "POST",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({
        id,
        content:    doc.content,
        created_at: now,
        updated_at: now,
      }),
    }),
  ]);

  return doc;
}

/**
 * 删除文档。
 * 同时删除 knowledge_doc_meta 和 knowledge_docs 中的对应行。
 */
export async function deleteDoc(id: string): Promise<void> {
  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/knowledge_doc_meta?id=eq.${id}`, {
      method:  "DELETE",
      headers: { ...headers, "Prefer": "return=minimal" },
    }),
    fetch(`${SUPABASE_URL}/rest/v1/knowledge_docs?id=eq.${id}`, {
      method:  "DELETE",
      headers: { ...headers, "Prefer": "return=minimal" },
    }),
  ]);
}
