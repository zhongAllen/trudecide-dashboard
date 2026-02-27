import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, useParams } from 'wouter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Plus, Pencil, Trash2, Save, X, BookOpen, Search, Tag, Link2, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  KnowledgeDoc,
  CATEGORY_META,
  loadDocs,
  saveDoc,
  deleteDoc,
  createDoc,
} from '@/lib/knowledge';

// ── 需求面板类型 ─────────────────────────────────────────────
interface Requirement {
  id: string;
  doc_id: string | null;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done' | 'closed';
  priority: 1 | 2 | 3;
  version: string | null;
}

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const SUPA_HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
};

const STATUS_META: Record<Requirement['status'], { label: string; color: string; bg: string }> = {
  open:        { label: '待处理',  color: '#6b7280', bg: '#f3f4f6' },
  in_progress: { label: '进行中',  color: '#2563eb', bg: '#eff6ff' },
  done:        { label: '已完成',  color: '#16a34a', bg: '#f0fdf4' },
  closed:      { label: '已关闭',  color: '#9ca3af', bg: '#f9fafb' },
};

const PRIORITY_META: Record<number, { label: string; color: string }> = {
  1: { label: '高', color: '#dc2626' },
  2: { label: '中', color: '#d97706' },
  3: { label: '低', color: '#6b7280' },
};

export default function Knowledge() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [filterCategory, setFilterCategory] = useState<KnowledgeDoc['category'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewDocMenu, setShowNewDocMenu] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── 需求面板状态 ─────────────────────────────────────────────
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [updatingReqId, setUpdatingReqId] = useState<string | null>(null);

  // 从 URL 参数读取当前文档 ID（支持 /knowledge/:id 路由）
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const selectedId = params.id ?? null;

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadDocs()
      .then(setDocs)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // 当 selectedId 变化时，加载关联需求并退出编辑模式
  useEffect(() => {
    setEditing(false);
    if (!selectedId) { setReqs([]); return; }
    fetch(
      `${SUPABASE_URL}/rest/v1/requirements?doc_id=eq.${selectedId}&order=id.asc`,
      { headers: SUPA_HEADERS }
    )
      .then((r) => r.json())
      .then((data) => setReqs(Array.isArray(data) ? data : []))
      .catch(() => setReqs([]));
  }, [selectedId]);

  // 更新单条需求状态
  const updateReqStatus = async (reqId: string, newStatus: Requirement['status']) => {
    setUpdatingReqId(reqId);
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/requirements?id=eq.${reqId}`,
        {
          method: 'PATCH',
          headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (!resp.ok) throw new Error(`${resp.status}`);
      setReqs((prev) => prev.map((r) => r.id === reqId ? { ...r, status: newStatus } : r));
    } catch (e) {
      alert(`更新失败：${String(e)}`);
    } finally {
      setUpdatingReqId(null);
    }
  };

  const selectedDoc = docs.find((d) => d.id === selectedId) ?? null;

  const filteredDocs = docs.filter((d) => {
    const matchCat = filterCategory === 'all' || d.category === filterCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      d.title.toLowerCase().includes(q) ||
      d.content.toLowerCase().includes(q) ||
      d.tags.some((t) => t.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  // 点击文档时更新 URL
  const selectDoc = useCallback((id: string) => {
    navigate(`/knowledge/${id}`);
  }, [navigate]);

  // 返回目录
  const goToIndex = useCallback(() => {
    navigate('/knowledge');
  }, [navigate]);

  const startEdit = useCallback(() => {
    if (!selectedDoc) return;
    setEditTitle(selectedDoc.title);
    setEditContent(selectedDoc.content);
    setEditTags(selectedDoc.tags.join(', '));
    setEditing(true);
  }, [selectedDoc]);

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    if (!selectedDoc) return;
    const updated: KnowledgeDoc = {
      ...selectedDoc,
      title: editTitle.trim() || selectedDoc.title,
      content: editContent,
      tags: editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      await saveDoc(updated);
      setDocs((prev) => prev.map((d) => d.id === updated.id ? updated : d));
      setEditing(false);
    } catch (e) {
      alert(`保存失败：${String(e)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除这篇文档？')) return;
    await deleteDoc(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
    if (selectedId === id) goToIndex();
  };

  const handleNewDoc = async (category: KnowledgeDoc['category']) => {
    const title = prompt('请输入文档标题：');
    if (!title) return;
    const doc = await createDoc(category, title);
    setDocs((prev) => [doc, ...prev]);
    setShowNewDocMenu(false);
    // 导航到新文档页面并立即进入编辑模式
    navigate(`/knowledge/${doc.id}`);
    setEditTitle(doc.title);
    setEditContent(doc.content);
    setEditTags('');
    setEditing(true);
  };

  // 复制文档链接到剪贴板
  const copyDocLink = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/knowledge/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const categories = Object.entries(CATEGORY_META) as [
    KnowledgeDoc['category'],
    (typeof CATEGORY_META)[KnowledgeDoc['category']],
  ][];

  // 动态生成 AI 可读的 meta 元信息
  const docSummary = Object.entries(CATEGORY_META)
    .map(([key, meta]) => {
      const catDocs = docs.filter(d => d.category === key);
      const titles = catDocs.map(d => d.title).join(' / ');
      return `${meta.label}(${catDocs.length}篇)${titles ? ': ' + titles : ''}`;
    })
    .join(' | ');

  const aiContext = [
    '项目：股票分析策略看板（宏观-板块-个股-择时四层分析系统）',
    '技术栈：React+Vite+TypeScript+TailwindCSS / Express.js / Supabase / Tushare',
    '核心原则：确定性逻辑不用AI；AI输入必须是已存储数据；展示层只读数据库',
    `知识库共${docs.length}篇文档 | ${docSummary}`,
    '使用说明：开始任务前优先阅读相关分类文档，每篇文档有独立URL /knowledge/:id 可直接访问',
    '【AI行为规范-每次任务必须遵守】① 需求规范：每次需求讨论结束后将关联需求写入requirements表（REQ编号递增，status=open/in_progress/done/closed）② Commit规范：每次git commit必须带REQ编号，格式：feat(REQ-020): 描述 ③ 源数据原则：写入数据库时源数据是什么格式就存什么格式，禁止单位换算 ④ 完成需求时同步填写resolved_at/resolved_by/solution_note/code_refs字段',
  ].join(' || ');

  // 当前文档的 meta 标题（用于 SEO 和 AI 读取）
  const pageTitle = selectedDoc
    ? `${selectedDoc.title} | 项目知识库`
    : '项目知识库目录 | 股票分析策略看板';

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground text-sm">正在加载知识库...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-destructive text-sm">加载失败：{error}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>{pageTitle}</title>
        <meta
          name="description"
          content={
            selectedDoc
              ? `${selectedDoc.title}（${CATEGORY_META[selectedDoc.category].label}）- 股票分析策略看板项目知识库`
              : `股票分析策略看板项目知识库，共${docs.length}篇文档，分为需求文档、数据模型、AI边界、决策日志、Skills目录、踩坑记录六个分类。`
          }
        />
        <meta name="ai-context" content={aiContext} />
        <meta name="ai-doc-index" content={docs.map(d => `[${CATEGORY_META[d.category].label}] ${d.title} (标签: ${d.tags.join(',')}) URL: /knowledge/${d.id}`).join(' | ')} />
        <meta name="last-updated" content={docs.length > 0 ? new Date(Math.max(...docs.map(d => new Date(d.updatedAt).getTime()))).toISOString() : ''} />
        {selectedDoc && <meta name="ai-doc-content" content={selectedDoc.content.slice(0, 500)} />}
      </Helmet>

      {/* Top Bar */}
      <header className="gradient-header text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="flex items-center gap-2 text-blue-100 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">返回看板</span>
            </button>
          </Link>
          <div className="w-px h-5 bg-blue-400 mx-1" />
          <BookOpen className="w-5 h-5" />
          {/* 面包屑导航 */}
          {selectedDoc ? (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={goToIndex}
                className="text-blue-200 hover:text-white transition-colors"
              >
                项目知识库
              </button>
              <span className="text-blue-400">/</span>
              <span className="font-medium truncate max-w-xs">{selectedDoc.title}</span>
            </div>
          ) : (
            <h1 className="text-xl font-bold">项目知识库</h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-300" />
            <input
              type="text"
              placeholder="搜索文档..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-white/30 w-48"
            />
          </div>
          <div className="relative">
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-white/20"
              onClick={() => setShowNewDocMenu(!showNewDocMenu)}
            >
              <Plus className="w-4 h-4 mr-1" />
              新建文档
            </Button>
            {showNewDocMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-border z-50 min-w-[160px] py-1">
                {categories.map(([key, meta]) => (
                  <button
                    key={key}
                    onClick={() => handleNewDoc(key)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center gap-2"
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Category Filter + Doc List */}
        <aside className="w-72 border-r border-border flex flex-col bg-muted/30 shrink-0">
          {/* Category Filter */}
          <div className="p-3 border-b border-border space-y-1">
            <button
              onClick={() => { setFilterCategory('all'); goToIndex(); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                !selectedId && filterCategory === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-[#f4f6f8] text-foreground'
              }`}
            >
              全部文档
              <span className="ml-2 text-xs opacity-70">({docs.length})</span>
            </button>
            {categories.map(([key, meta]) => {
              const count = docs.filter((d) => d.category === key).length;
              return (
                <button
                  key={key}
                  onClick={() => { setFilterCategory(key); goToIndex(); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    filterCategory === key
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-[#f4f6f8] text-foreground'
                  }`}
                >
                  <span>{meta.icon}</span>
                  <span className="flex-1">{meta.label}</span>
                  <span className="text-xs opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Doc List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredDocs.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                暂无文档
              </div>
            )}
            {filteredDocs.map((doc) => {
              const meta = CATEGORY_META[doc.category];
              return (
                <div
                  key={doc.id}
                  className={`relative rounded-lg transition-colors group ${
                    selectedId === doc.id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-[#f4f6f8] border border-transparent'
                  }`}
                >
                  <button
                    onClick={() => selectDoc(doc.id)}
                    className="w-full text-left p-3 pr-8"
                  >
                    <div className="flex items-start gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs">{meta.icon}</span>
                          <span
                            className="text-xs font-medium"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <div className="font-medium text-sm truncate text-foreground">{doc.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {new Date(doc.updatedAt).toLocaleDateString('zh-CN')}
                        </div>
                      </div>
                    </div>
                    {doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {doc.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                  {/* 操作按钮（悬停显示） */}
                  <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => copyDocLink(doc.id, e)}
                      className="p-1 rounded hover:bg-primary/10 hover:text-primary transition-all"
                      title="复制链接"
                    >
                      {copiedId === doc.id
                        ? <Check className="w-3 h-3 text-green-500" />
                        : <Link2 className="w-3 h-3" />
                      }
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                      className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                      title="删除文档"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {!selectedDoc ? (
            /* ===== 知识库目录首页 ===== */
            <div className="max-w-4xl mx-auto px-8 py-8">
              {/* 标题区 */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <BookOpen className="w-6 h-6 text-primary" />
                  <h1 className="text-2xl font-bold text-foreground">项目知识库目录</h1>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  本知识库记录系统的需求、数据模型、AI 边界、架构决策和运维经验。
                  文档按分类组织，支持全文搜索。每篇文档均有独立 URL，可直接分享。
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>共 <strong className="text-foreground">{docs.length}</strong> 篇文档</span>
                  <span>·</span>
                  <span>最近更新：{docs.length > 0 ? new Date(Math.max(...docs.map(d => new Date(d.updatedAt).getTime()))).toLocaleDateString('zh-CN') : '—'}</span>
                </div>
              </div>

              {/* 分类目录 */}
              <div className="space-y-6">
                {Object.entries(CATEGORY_META).map(([key, meta]) => {
                  const catDocs = docs.filter(d => d.category === key);
                  return (
                    <div key={key} className="border border-border rounded-xl overflow-hidden">
                      {/* 分类标题栏 */}
                      <div
                        className="flex items-center gap-3 px-5 py-3 border-b border-border"
                        style={{ backgroundColor: meta.color + '0d' }}
                      >
                        <span className="text-base">{meta.icon}</span>
                        <span className="font-semibold text-sm" style={{ color: meta.color }}>
                          {meta.label}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {catDocs.length} 篇
                        </span>
                      </div>

                      {/* 文档列表 */}
                      {catDocs.length === 0 ? (
                        <div className="px-5 py-4 text-sm text-muted-foreground italic">
                          暂无文档 — 点击右上角「新建文档」添加
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {catDocs.map((doc, idx) => (
                            <div
                              key={doc.id}
                              className="group flex items-start justify-between gap-4 px-5 py-3.5 hover:bg-[#f4f6f8] transition-colors"
                            >
                              <button
                                onClick={() => selectDoc(doc.id)}
                                className="flex items-start gap-3 min-w-0 flex-1 text-left"
                              >
                                <span className="text-xs text-muted-foreground mt-0.5 shrink-0 w-5 text-right">
                                  {idx + 1}.
                                </span>
                                <div className="min-w-0">
                                  <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                    {doc.title}
                                  </div>
                                  {doc.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {doc.tags.map(tag => (
                                        <span
                                          key={tag}
                                          className="text-xs bg-muted border border-border px-1.5 py-0 rounded text-muted-foreground"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </button>
                              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                <span className="text-xs text-muted-foreground">
                                  {new Date(doc.updatedAt).toLocaleDateString('zh-CN')}
                                </span>
                                <button
                                  onClick={(e) => copyDocLink(doc.id, e)}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-primary/10 hover:text-primary transition-all"
                                  title="复制文档链接"
                                >
                                  {copiedId === doc.id
                                    ? <Check className="w-3.5 h-3.5 text-green-500" />
                                    : <Link2 className="w-3.5 h-3.5" />
                                  }
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* AI 读取提示 */}
              <div className="mt-8 p-4 bg-muted/40 border border-border rounded-xl">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">AI 使用说明：</strong>
                  本页为项目知识库总目录。每个分类对应系统的一个知识域：
                  「需求文档」描述功能目标；「数据模型」定义 Supabase Schema；
                  「AI 边界」规定哪些场景允许使用 AI；「决策日志」记录架构决策及原因；
                  「Skills 目录」列出所有 MANUS Skills 的功能和触发条件；「踩坑记录」汇总已知问题和解决方案。
                  每篇文档有独立 URL（格式：/knowledge/:id），可直接访问。
                  开始新任务前，请优先阅读相关分类的文档以获取上下文。
                </p>
              </div>
            </div>
          ) : editing ? (
            /* Edit Mode */
            <div className="h-full flex flex-col">
              {/* Edit Toolbar */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/20">
                <div className="flex items-center gap-2 flex-1">
                  <Pencil className="w-4 h-4 text-primary" />
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-bold text-lg bg-transparent border-b border-primary/40 focus:outline-none focus:border-primary flex-1 max-w-md"
                    placeholder="文档标题"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 mr-2">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="标签，逗号分隔"
                      className="text-sm bg-muted/50 border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary w-40"
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="w-4 h-4 mr-1" />
                    取消
                  </Button>
                  <Button size="sm" onClick={saveEdit}>
                    <Save className="w-4 h-4 mr-1" />
                    保存
                  </Button>
                </div>
              </div>
              {/* Editor */}
              <div className="flex flex-1 overflow-hidden">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 p-6 font-mono text-sm resize-none focus:outline-none bg-background border-r border-border"
                  placeholder="使用 Markdown 编写内容..."
                  spellCheck={false}
                />
                {/* Live Preview */}
                <div className="flex-1 p-6 overflow-y-auto feishu-prose">
                  <div className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">预览</div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            /* Read Mode */
            <div className="max-w-4xl mx-auto px-8 py-8">
              {/* Doc Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{CATEGORY_META[selectedDoc.category].icon}</span>
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: CATEGORY_META[selectedDoc.category].color + '20',
                        color: CATEGORY_META[selectedDoc.category].color,
                        borderColor: CATEGORY_META[selectedDoc.category].color + '40',
                      }}
                    >
                      {CATEGORY_META[selectedDoc.category].label}
                    </Badge>
                  </div>
                  <h1 className="text-2xl font-bold">{selectedDoc.title}</h1>
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span>创建于 {new Date(selectedDoc.createdAt).toLocaleDateString('zh-CN')}</span>
                    <span>·</span>
                    <span>更新于 {new Date(selectedDoc.updatedAt).toLocaleDateString('zh-CN')}</span>
                    <span>·</span>
                    {/* 文档独立链接 */}
                    <button
                      onClick={(e) => copyDocLink(selectedDoc.id, e)}
                      className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                      title="复制文档链接"
                    >
                      {copiedId === selectedDoc.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-green-500">已复制</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3.5 h-3.5" />
                          <span>/knowledge/{selectedDoc.id}</span>
                        </>
                      )}
                    </button>
                  </div>
                  {selectedDoc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {selectedDoc.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-muted border border-border px-2 py-0.5 rounded-full text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={startEdit}>
                  <Pencil className="w-4 h-4 mr-1" />
                  编辑
                </Button>
              </div>

              {/* Divider */}
              <div className="border-t border-border mb-6" />

              {/* Markdown Content */}
              <div className="feishu-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedDoc.content}
                </ReactMarkdown>
              </div>

              {/* ── 关联需求面板 ── */}
              {reqs.length > 0 && (
                <div className="mt-10">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 rounded-full bg-primary" />
                    <h3 className="text-sm font-semibold text-foreground">关联需求</h3>
                    <span className="text-xs text-muted-foreground ml-1">{reqs.length} 条</span>
                  </div>
                  <div className="space-y-2">
                    {reqs.map((req) => {
                      const sm = STATUS_META[req.status];
                      const pm = PRIORITY_META[req.priority];
                      return (
                        <div
                          key={req.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          {/* ID + 优先级 */}
                          <div className="flex flex-col items-center gap-1 pt-0.5 min-w-[52px]">
                            <span className="text-xs font-mono text-muted-foreground">{req.id}</span>
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                              style={{ color: pm.color, backgroundColor: pm.color + '18' }}
                            >
                              {pm.label}先级
                            </span>
                          </div>

                          {/* 标题 + 描述 */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-snug">{req.title}</p>
                            {req.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                                {req.description}
                              </p>
                            )}
                            {req.version && (
                              <span className="text-[10px] text-muted-foreground mt-1 inline-block">
                                {req.version}
                              </span>
                            )}
                          </div>

                          {/* 状态切换下拉 */}
                          <div className="relative flex-shrink-0">
                            <select
                              value={req.status}
                              disabled={updatingReqId === req.id}
                              onChange={(e) => updateReqStatus(req.id, e.target.value as Requirement['status'])}
                              className="text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer appearance-none pr-5"
                              style={{
                                color: sm.color,
                                backgroundColor: sm.bg,
                                opacity: updatingReqId === req.id ? 0.5 : 1,
                              }}
                            >
                              {(Object.keys(STATUS_META) as Requirement['status'][]).map((s) => (
                                <option key={s} value={s}>{STATUS_META[s].label}</option>
                              ))}
                            </select>
                            <ChevronDown
                              className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none"
                              style={{ color: sm.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
