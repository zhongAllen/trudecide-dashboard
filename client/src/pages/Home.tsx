import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import {
  ChevronDown, TrendingUp, BarChart3, PieChart,
  BookOpen, Loader2, AlertTriangle, HelpCircle, Globe
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { INDICATORS } from '@/lib/indicators';
import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────
interface Snapshot {
  snapshot_month: string;
  region: string;
  dimension: string;
  timescale: string;
  status: string;
  score: number;
  alert_flag: boolean;
  config_version: number;
  updated_at: string;
}

// 支持的国家/地区
const REGIONS = [
  { key: 'CN', label: '🇨🇳 中国', desc: 'A股市场' },
  { key: 'US', label: '🇺🇸 美国', desc: '美股市场' },
];

// 四个维度（行）和三个时间尺度（列）
const DIMENSIONS = ['宏观经济', '流动性', '政策与预期', '市场估值情绪'];
const TIMESCALES: { key: string; label: string; desc: string }[] = [
  { key: 'short', label: '短期', desc: '3–9 个月' },
  { key: 'mid',   label: '中期', desc: '2–3 年'  },
  { key: 'long',  label: '长期', desc: '5–10 年' },
];

// ─────────────────────────────────────────────
// 四维度专属状态词 → 颜色配置
// 颜色语义：绿/蓝 = 对A股利多；灰 = 中性；橙/红 = 对A股利空
// ─────────────────────────────────────────────
const STATUS_CONFIG: Record<string, {
  badgeBg: string; badgeText: string; scoreText: string; cellBg: string;
}> = {
  // 宏观经济
  '扩张':       { badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-800', scoreText: 'text-emerald-700', cellBg: 'bg-emerald-50/70' },
  '复苏':       { badgeBg: 'bg-blue-100',    badgeText: 'text-blue-800',    scoreText: 'text-blue-700',    cellBg: 'bg-blue-50/70'    },
  '收缩':       { badgeBg: 'bg-red-100',     badgeText: 'text-red-800',     scoreText: 'text-red-700',     cellBg: 'bg-red-50/70'     },
  '放缓':       { badgeBg: 'bg-amber-100',   badgeText: 'text-amber-800',   scoreText: 'text-amber-700',   cellBg: 'bg-amber-50/70'   },
  // 流动性
  '宽松':       { badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-800', scoreText: 'text-emerald-700', cellBg: 'bg-emerald-50/70' },
  '适度宽松':   { badgeBg: 'bg-teal-100',    badgeText: 'text-teal-800',    scoreText: 'text-teal-700',    cellBg: 'bg-teal-50/70'    },
  '偏紧':       { badgeBg: 'bg-amber-100',   badgeText: 'text-amber-800',   scoreText: 'text-amber-700',   cellBg: 'bg-amber-50/70'   },
  '收紧':       { badgeBg: 'bg-red-100',     badgeText: 'text-red-800',     scoreText: 'text-red-700',     cellBg: 'bg-red-50/70'     },
  // 政策与预期
  '强刺激':     { badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-800', scoreText: 'text-emerald-700', cellBg: 'bg-emerald-50/70' },
  '温和宽松':   { badgeBg: 'bg-blue-100',    badgeText: 'text-blue-800',    scoreText: 'text-blue-700',    cellBg: 'bg-blue-50/70'    },
  '温和收紧':   { badgeBg: 'bg-amber-100',   badgeText: 'text-amber-800',   scoreText: 'text-amber-700',   cellBg: 'bg-amber-50/70'   },
  '强收紧':     { badgeBg: 'bg-red-100',     badgeText: 'text-red-800',     scoreText: 'text-red-700',     cellBg: 'bg-red-50/70'     },
  // 市场估值情绪
  '极度低估':   { badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-800', scoreText: 'text-emerald-700', cellBg: 'bg-emerald-50/70' },
  '低估':       { badgeBg: 'bg-blue-100',    badgeText: 'text-blue-800',    scoreText: 'text-blue-700',    cellBg: 'bg-blue-50/70'    },
  '合理':       { badgeBg: 'bg-gray-100',    badgeText: 'text-gray-700',    scoreText: 'text-gray-600',    cellBg: 'bg-gray-50/70'    },
  '高估':       { badgeBg: 'bg-amber-100',   badgeText: 'text-amber-800',   scoreText: 'text-amber-700',   cellBg: 'bg-amber-50/70'   },
  '泡沫':       { badgeBg: 'bg-red-100',     badgeText: 'text-red-800',     scoreText: 'text-red-700',     cellBg: 'bg-red-50/70'     },
  // 通用兜底
  '中性':       { badgeBg: 'bg-gray-100',    badgeText: 'text-gray-700',    scoreText: 'text-gray-600',    cellBg: 'bg-gray-50/70'    },
};

const DEFAULT_CFG = STATUS_CONFIG['中性'];

// 根据分数推断通用状态词（用于综合评估行）
function scoreToSummaryStatus(score: number): string {
  if (score >= 75) return '扩张';
  if (score >= 60) return '复苏';
  if (score >= 45) return '中性';
  if (score >= 30) return '放缓';
  return '收缩';
}

// ─────────────────────────────────────────────
// 矩阵单元格
// ─────────────────────────────────────────────
function MatrixCell({ snapshot, loading }: { snapshot?: Snapshot; loading?: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-12 rounded-md border border-dashed border-gray-200 bg-gray-50">
        <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-12 rounded-md border border-dashed border-gray-200 bg-gray-50/50 text-gray-400 text-xs">
        待计算
      </div>
    );
  }

  const cfg = STATUS_CONFIG[snapshot.status] ?? DEFAULT_CFG;

  return (
    <div className={`relative flex items-center h-12 rounded-md px-3 gap-2 ${cfg.cellBg}`}>
      {/* 状态 Badge */}
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cfg.badgeBg} ${cfg.badgeText}`}>
        {snapshot.status}
      </span>

      {/* 分数：右对齐，固定宽度 */}
      <div className="flex items-center gap-0.5 ml-auto">
        <span className={`text-xl font-mono font-bold tabular-nums w-8 text-right ${cfg.scoreText}`}>
          {snapshot.score}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="w-3 h-3 text-gray-300 cursor-help flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              <p className="font-semibold mb-1">分数说明（0–100）</p>
              <p>分数表示当前状态的强度，越高代表信号越强、越确定。</p>
              <p className="mt-1">例：<span className="font-medium">宽松 80</span> = 流动性明显宽松；<span className="font-medium">宽松 55</span> = 刚进入宽松区间。</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* 异常标记 */}
      {snapshot.alert_flag && (
        <AlertTriangle className="absolute top-1 right-1 w-3 h-3 text-orange-500" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 综合评估行单元格
// ─────────────────────────────────────────────
function SummaryCell({ snapshots, timescale, loading }: {
  snapshots: Snapshot[]; timescale: string; loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-12 rounded-md bg-slate-100 border border-slate-200">
        <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
      </div>
    );
  }

  const cells = snapshots.filter((s) => s.timescale === timescale);
  if (cells.length === 0) {
    return (
      <div className="flex items-center justify-center h-12 rounded-md bg-slate-100 border border-slate-200 text-gray-400 text-xs">
        待计算
      </div>
    );
  }

  const avgScore = Math.round(cells.reduce((sum, s) => sum + s.score, 0) / cells.length);
  const status = scoreToSummaryStatus(avgScore);
  const cfg = STATUS_CONFIG[status] ?? DEFAULT_CFG;

  return (
    <div className="flex items-center h-12 rounded-md px-3 gap-2 bg-slate-100 border border-slate-200">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cfg.badgeBg} ${cfg.badgeText}`}>
        {status}
      </span>
      <div className="flex items-center gap-0.5 ml-auto">
        <span className={`text-xl font-mono font-bold tabular-nums w-8 text-right ${cfg.scoreText}`}>
          {avgScore}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="w-3 h-3 text-gray-300 cursor-help flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              <p className="font-semibold mb-1">综合评估说明</p>
              <p>该列四个维度分数的简单平均值，代表该时间段的整体宏观状况。</p>
              <p className="mt-1 text-gray-400">后续版本将支持自定义各维度权重。</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 左侧指标列表
// ─────────────────────────────────────────────
function IndicatorList({ indicators }: { indicators: any[] }) {
  return (
    <div className="space-y-1">
      {indicators.map((ind) => (
        <div key={ind.id} className="w-full text-left px-2.5 py-2 rounded border border-border/50 bg-background/60 hover:bg-muted/50 transition-colors cursor-default">
          <div className="font-medium text-xs leading-tight">{ind.name}</div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">{ind.subcategory}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────
export default function Home() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('macro');
  const [selectedRegion, setSelectedRegion] = useState<string>('CN');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toggleCategory = (cat: string) =>
    setExpandedCategory(expandedCategory === cat ? null : cat);

  const getCell = (dimension: string, timescale: string) =>
    snapshots.find((s) => s.dimension === dimension && s.timescale === timescale && s.region === selectedRegion);

  const regionSnapshots = snapshots.filter((s) => s.region === selectedRegion);
  const latestMonth   = regionSnapshots[0]?.snapshot_month ?? '—';
  const latestVersion = regionSnapshots[0]?.config_version ?? '—';

  useEffect(() => {
    const fetchSnapshots = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('macro_wide_snapshot')
          .select('*')
          .order('snapshot_month', { ascending: false })
          .limit(24);
        if (error) throw error;
        setSnapshots(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSnapshots();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="gradient-header text-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="container flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-7 h-7" />
              <h1 className="text-3xl font-bold">Trudecide 股票版</h1>
            </div>
            <p className="text-base text-blue-100 max-w-2xl">
              基于宏观常识的 A 股交易策略
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-xs text-blue-200/70 font-mono tracking-wider">
              v{__APP_VERSION__}
            </span>
            <Link href="/knowledge">
              <button className="flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/30 text-white px-4 py-2 rounded-lg transition-all text-sm font-medium">
                <BookOpen className="w-4 h-4" />
                项目知识库
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="container py-8">
        <div className="flex gap-6 items-start">

          {/* ══════════════════════════════════════
              左侧：无缝导航面板（三板块合一）
          ══════════════════════════════════════ */}
          <div className="w-60 flex-shrink-0">
            <div className="sticky top-4">
              {/* 三个板块合并为一个无缝面板 */}
              <div className="rounded-xl border border-border overflow-hidden shadow-sm">

                {/* 宏观/大盘 */}
                <div className={expandedCategory === 'macro' ? 'bg-primary/5' : 'bg-background'}>
                  <button
                    onClick={() => toggleCategory('macro')}
                    className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <BarChart3 className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="text-left">
                        <div className="text-sm font-semibold">宏观/大盘</div>
                        <div className="text-xs text-muted-foreground">整体市场</div>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expandedCategory === 'macro' ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedCategory === 'macro' && (
                    <div className="px-3 pb-3 border-t border-border/50 space-y-3 pt-3">
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">宏观经济</div>
                        <IndicatorList indicators={INDICATORS.macro.economy} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">流动性与货币政策</div>
                        <IndicatorList indicators={INDICATORS.macro.liquidity} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">政策与预期</div>
                        <IndicatorList indicators={INDICATORS.macro.policy} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">市场估值与情绪</div>
                        <IndicatorList indicators={INDICATORS.macro.valuation} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 分隔线 */}
                <div className="border-t border-border" />

                {/* 中观/板块 */}
                <div className={expandedCategory === 'meso' ? 'bg-orange-50/50' : 'bg-background'}>
                  <button
                    onClick={() => toggleCategory('meso')}
                    className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <PieChart className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      <div className="text-left">
                        <div className="text-sm font-semibold">中观/板块</div>
                        <div className="text-xs text-muted-foreground">行业轮动</div>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expandedCategory === 'meso' ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedCategory === 'meso' && (
                    <div className="px-3 pb-3 border-t border-border/50 space-y-3 pt-3">
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">行业景气度</div>
                        <IndicatorList indicators={INDICATORS.meso.sentiment} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">板块估值</div>
                        <IndicatorList indicators={INDICATORS.meso.valuation} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">资金与情绪</div>
                        <IndicatorList indicators={INDICATORS.meso.fund} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">外部催化</div>
                        <IndicatorList indicators={INDICATORS.meso.catalyst} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 分隔线 */}
                <div className="border-t border-border" />

                {/* 微观/个股 */}
                <div className={expandedCategory === 'micro' ? 'bg-green-50/50' : 'bg-background'}>
                  <button
                    onClick={() => toggleCategory('micro')}
                    className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <div className="text-left">
                        <div className="text-sm font-semibold">微观/个股</div>
                        <div className="text-xs text-muted-foreground">个股精选</div>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expandedCategory === 'micro' ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedCategory === 'micro' && (
                    <div className="px-3 pb-3 border-t border-border/50 space-y-3 pt-3">
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">基本面（财务）</div>
                        <IndicatorList indicators={INDICATORS.micro.fundamental} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">估值指标</div>
                        <IndicatorList indicators={INDICATORS.micro.valuation_stock} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">财务安全</div>
                        <IndicatorList indicators={INDICATORS.micro.safety} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">技术面</div>
                        <IndicatorList indicators={INDICATORS.micro.technical} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide px-1">筹码与情绪</div>
                        <IndicatorList indicators={INDICATORS.micro.chip} />
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════
              右侧：宏观状态矩阵
          ══════════════════════════════════════ */}
          <div className="flex-1 min-w-0">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  {/* 标题 + 问号 */}
                  <CardTitle className="flex items-center gap-2">
                    宏观状态矩阵
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm text-xs leading-relaxed">
                          <p className="font-semibold mb-1">如何阅读此矩阵？</p>
                          <p>矩阵由 <span className="font-medium">4个维度（行）× 3个时间尺度（列）</span> 组成，共12个子结论。</p>
                          <p className="mt-1">每个格子展示该维度在该时间尺度下的 <span className="font-medium">定性状态</span> 和 <span className="font-medium">强度分（0–100）</span>。分数越高代表对股市越有利。</p>
                          <p className="mt-1">底部"综合评估"行为四维度的简单平均，代表整体宏观状况。</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardTitle>

                  {/* 右侧：国家筛选 + 元信息 */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* 国家切换器 */}
                    <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground ml-1" />
                      {REGIONS.map((r) => (
                        <button
                          key={r.key}
                          onClick={() => setSelectedRegion(r.key)}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                            selectedRegion === r.key
                              ? 'bg-background shadow-sm text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>

                    {/* 元信息 */}
                    {!loading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>快照：<span className="font-mono font-medium text-foreground">{latestMonth}</span></span>
                        <span>模型：<span className="font-mono font-medium text-foreground">v{latestVersion}</span></span>
                        <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-xs">
                          ⚠️ 测试数据
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>加载失败</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {!error && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-y-1.5">
                      {/* 表头 */}
                      <thead>
                        <tr>
                          <th className="w-28 pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            维度
                          </th>
                          {TIMESCALES.map((ts) => (
                            <th key={ts.key} className="pb-3 text-center min-w-[160px]">
                              <div className="text-sm font-semibold text-foreground">{ts.label}</div>
                              <div className="text-xs text-muted-foreground font-normal">{ts.desc}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {/* 四个维度行 */}
                        {DIMENSIONS.map((dim) => (
                          <tr key={dim}>
                            <td className="pr-3 align-middle">
                              <span className="text-sm font-medium text-foreground">{dim}</span>
                            </td>
                            {TIMESCALES.map((ts) => (
                              <td key={ts.key} className="px-1 align-middle">
                                <MatrixCell snapshot={getCell(dim, ts.key)} loading={loading} />
                              </td>
                            ))}
                          </tr>
                        ))}

                        {/* 分隔线 */}
                        <tr>
                          <td colSpan={4} className="py-0.5">
                            <div className="border-t border-dashed border-gray-200" />
                          </td>
                        </tr>

                        {/* 综合评估行 */}
                        <tr>
                          <td className="pr-3 align-middle">
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-semibold text-foreground">综合评估</span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="w-3 h-3 text-gray-300 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                                    <p className="font-semibold mb-1">综合评估说明</p>
                                    <p>该行为四个维度在同一时间尺度下的简单平均分，代表该时间段内的整体宏观状况。</p>
                                    <p className="mt-1 text-gray-400">后续版本将支持自定义各维度权重。</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </td>
                          {TIMESCALES.map((ts) => (
                            <td key={ts.key} className="px-1 align-middle">
                              <SummaryCell snapshots={regionSnapshots} timescale={ts.key} loading={loading} />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>

                    {/* 图例 */}
                    <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground mr-1">图例：</span>
                      {['扩张/宽松/强刺激/极度低估', '复苏/适度宽松/温和宽松/低估', '中性/合理', '放缓/偏紧/温和收紧/高估', '收缩/收紧/强收紧/泡沫'].map((label, i) => {
                        const colors = [
                          { bg: 'bg-emerald-100', text: 'text-emerald-800' },
                          { bg: 'bg-blue-100',    text: 'text-blue-800'    },
                          { bg: 'bg-gray-100',    text: 'text-gray-700'    },
                          { bg: 'bg-amber-100',   text: 'text-amber-800'   },
                          { bg: 'bg-red-100',     text: 'text-red-800'     },
                        ];
                        return (
                          <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[i].bg} ${colors[i].text}`}>
                            {label}
                          </span>
                        );
                      })}
                      <span className="ml-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                        异常触发
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-muted/30 py-6 mt-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>Trudecide 股票版 © 2026 | 基于宏观常识的 A 股交易策略</p>
          <p className="mt-1">本工具仅供学习和参考之用，不构成投资建议。投资有风险，请谨慎决策。</p>
        </div>
      </footer>
    </div>
  );
}
