import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'wouter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Plus, Pencil, Trash2, Save, X, BookOpen, Search, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  KnowledgeDoc,
  CATEGORY_META,
  loadDocs,
  saveDoc,
  deleteDoc,
  createDoc,
} from '@/lib/knowledge';

export default function Knowledge() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [filterCategory, setFilterCategory] = useState<KnowledgeDoc['category'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewDocMenu, setShowNewDocMenu] = useState(false);

  useEffect(() => {
    setDocs(loadDocs());
  }, []);

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

  const startEdit = useCallback(() => {
    if (!selectedDoc) return;
    setEditTitle(selectedDoc.title);
    setEditContent(selectedDoc.content);
    setEditTags(selectedDoc.tags.join(', '));
    setEditing(true);
  }, [selectedDoc]);

  const cancelEdit = () => setEditing(false);

  const saveEdit = () => {
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
    const newDocs = saveDoc(updated);
    setDocs(newDocs);
    setEditing(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('确认删除这篇文档？')) return;
    const newDocs = deleteDoc(id);
    setDocs(newDocs);
    if (selectedId === id) setSelectedId(null);
  };

  const handleNewDoc = (category: KnowledgeDoc['category']) => {
    const title = prompt('请输入文档标题：');
    if (!title) return;
    const doc = createDoc(category, title);
    const newDocs = saveDoc(doc);
    setDocs(newDocs);
    setSelectedId(doc.id);
    setShowNewDocMenu(false);
    // 立即进入编辑模式
    setEditTitle(doc.title);
    setEditContent(doc.content);
    setEditTags('');
    setEditing(true);
  };

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
    '使用说明：开始任务前优先阅读相关分类文档，点击左侧文档卡片查看完整内容',
  ].join(' || ');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>项目知识库目录 | 股票分析策略看板</title>
        <meta name="description" content={`股票分析策略看板项目知识库，共${docs.length}篇文档，分为需求文档、数据模型、AI边界、决策日志、Skills目录、踩坑记录六个分类。`} />
        <meta name="ai-context" content={aiContext} />
        <meta name="ai-doc-index" content={docs.map(d => `[${CATEGORY_META[d.category].label}] ${d.title} (标签: ${d.tags.join(',')})`).join(' | ')} />
        <meta name="last-updated" content={docs.length > 0 ? new Date(Math.max(...docs.map(d => new Date(d.updatedAt).getTime()))).toISOString() : ''} />
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
          <h1 className="text-xl font-bold">项目知识库</h1>
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
              onClick={() => setFilterCategory('all')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterCategory === 'all'
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
                  onClick={() => setFilterCategory(key)}
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
                <button
                  key={doc.id}
                  onClick={() => {
                    setSelectedId(doc.id);
                    setEditing(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg transition-colors group ${
                    selectedId === doc.id
                      ? 'bg-primary/10 border border-primary/30 text-foreground'
                      : 'hover:bg-[#f4f6f8] border border-transparent text-foreground'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
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
                      <div className="font-medium text-sm truncate">{doc.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(doc.updatedAt).toLocaleDateString('zh-CN')}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
                  文档按分类组织，支持全文搜索。AI 可通过读取本页获取项目全貌。
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
                            <button
                              key={doc.id}
                              onClick={() => setSelectedId(doc.id)}
                              className="w-full text-left px-5 py-3.5 hover:bg-[#f4f6f8] transition-colors flex items-start justify-between gap-4 group"
                            >
                              <div className="flex items-start gap-3 min-w-0">
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
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                                {new Date(doc.updatedAt).toLocaleDateString('zh-CN')}
                              </span>
                            </button>
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
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
