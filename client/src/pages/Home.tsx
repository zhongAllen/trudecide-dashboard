import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { ChevronDown, TrendingUp, BarChart3, PieChart, BookOpen, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

// 宽表的四个维度（行）和三个时间尺度（列）
const DIMENSIONS = ['宏观经济', '流动性', '政策与预期', '市场估值情绪'];
const TIMESCALES: { key: string; label: string; desc: string }[] = [
  { key: 'short', label: '短期', desc: '3–9 个月' },
  { key: 'mid',   label: '中期', desc: '2–3 年' },
  { key: 'long',  label: '长期', desc: '5–10 年' },
];

// 状态词对应的颜色样式
const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  '扩张': { bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200' },
  '复苏': { bg: 'bg-blue-50',   text: 'text-blue-800',   border: 'border-blue-200'  },
  '中性': { bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200'  },
  '放缓': { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200'},
  '收缩': { bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200'   },
};

// ─────────────────────────────────────────────
// 矩阵单元格组件
// ─────────────────────────────────────────────
function MatrixCell({ snapshot }: { snapshot?: Snapshot }) {
  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-24 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 text-gray-400 text-sm">
        <span>待计算</span>
      </div>
    );
  }

  const style = STATUS_STYLE[snapshot.status] ?? STATUS_STYLE['中性'];

  return (
    <div className={`relative flex flex-col items-center justify-center h-24 rounded-lg border ${style.border} ${style.bg} gap-1 px-2`}>
      {snapshot.alert_flag && (
        <AlertTriangle className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-orange-500" />
      )}
      <span className={`text-base font-bold ${style.text}`}>{snapshot.status}</span>
      <span className={`text-2xl font-mono font-semibold ${style.text}`}>{snapshot.score}</span>
      <span className="text-xs text-gray-400">分</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// 左侧指标列表渲染
// ─────────────────────────────────────────────
function IndicatorList({ indicators }: { indicators: any[] }) {
  return (
    <div className="space-y-1.5">
      {indicators.map((ind) => (
        <div key={ind.id} className="w-full text-left p-2.5 rounded-lg border border-border bg-muted/30">
          <div className="font-medium text-sm leading-tight">{ind.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{ind.subcategory}</div>
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
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toggleCategory = (cat: string) =>
    setExpandedCategory(expandedCategory === cat ? null : cat);

  // 从快照数组中查找特定维度+时间尺度的数据
  const getCell = (dimension: string, timescale: string) =>
    snapshots.find((s) => s.dimension === dimension && s.timescale === timescale);

  // 获取最新快照月份
  const latestMonth = snapshots[0]?.snapshot_month ?? '—';
  const latestVersion = snapshots[0]?.config_version ?? '—';

  useEffect(() => {
    const fetchSnapshots = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('macro_wide_snapshot')
          .select('*')
          .order('snapshot_month', { ascending: false })
          .limit(12); // 只取最新一期的12条

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

          {/* ── 左侧：分析层面目录（固定宽度） ── */}
          <div className="w-64 flex-shrink-0">
            <div className="sticky top-4 space-y-3">
              <h2 className="text-xl font-bold mb-4">分析层面</h2>

              {/* 宏观/大盘 */}
              <Card className="overflow-hidden">
                <button
                  onClick={() => toggleCategory('macro')}
                  className="w-full p-4 flex items-center justify-between hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold">宏观/大盘</div>
                      <div className="text-xs text-muted-foreground">整体市场</div>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${expandedCategory === 'macro' ? 'rotate-180' : ''}`} />
                </button>
                {expandedCategory === 'macro' && (
                  <div className="px-3 pb-3 border-t border-border space-y-3 mt-3">
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">宏观经济</div><IndicatorList indicators={INDICATORS.macro.economy} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">流动性与货币政策</div><IndicatorList indicators={INDICATORS.macro.liquidity} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">政策与预期</div><IndicatorList indicators={INDICATORS.macro.policy} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">市场估值与情绪</div><IndicatorList indicators={INDICATORS.macro.valuation} /></div>
                  </div>
                )}
              </Card>

              {/* 中观/板块 */}
              <Card className="overflow-hidden">
                <button
                  onClick={() => toggleCategory('meso')}
                  className="w-full p-4 flex items-center justify-between hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <PieChart className="w-5 h-5 text-orange-500 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold">中观/板块</div>
                      <div className="text-xs text-muted-foreground">行业轮动</div>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${expandedCategory === 'meso' ? 'rotate-180' : ''}`} />
                </button>
                {expandedCategory === 'meso' && (
                  <div className="px-3 pb-3 border-t border-border space-y-3 mt-3">
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">行业景气度</div><IndicatorList indicators={INDICATORS.meso.sentiment} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">板块估值</div><IndicatorList indicators={INDICATORS.meso.valuation} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">资金与情绪</div><IndicatorList indicators={INDICATORS.meso.fund} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">外部催化</div><IndicatorList indicators={INDICATORS.meso.catalyst} /></div>
                  </div>
                )}
              </Card>

              {/* 微观/个股 */}
              <Card className="overflow-hidden">
                <button
                  onClick={() => toggleCategory('micro')}
                  className="w-full p-4 flex items-center justify-between hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold">微观/个股</div>
                      <div className="text-xs text-muted-foreground">个股精选</div>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${expandedCategory === 'micro' ? 'rotate-180' : ''}`} />
                </button>
                {expandedCategory === 'micro' && (
                  <div className="px-3 pb-3 border-t border-border space-y-3 mt-3">
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">基本面（财务）</div><IndicatorList indicators={INDICATORS.micro.fundamental} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">估值指标</div><IndicatorList indicators={INDICATORS.micro.valuation_stock} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">财务安全</div><IndicatorList indicators={INDICATORS.micro.safety} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">技术面</div><IndicatorList indicators={INDICATORS.micro.technical} /></div>
                    <div><div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">筹码与情绪</div><IndicatorList indicators={INDICATORS.micro.chip} /></div>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* ── 右侧：宏观状态矩阵（占满剩余宽度） ── */}
          <div className="flex-1 min-w-0">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>宏观状态矩阵</CardTitle>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>快照月份：<span className="font-mono font-medium text-foreground">{latestMonth}</span></span>
                        <span>模型版本：<span className="font-mono font-medium text-foreground">v{latestVersion}</span></span>
                        <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-xs">
                          ⚠️ 测试数据
                        </Badge>
                      </>
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
                    {/* 矩阵表格 */}
                    <table className="w-full">
                      <thead>
                        <tr>
                          {/* 左上角空白 */}
                          <th className="w-36 pb-3 text-left text-sm font-semibold text-muted-foreground">维度 / 时间</th>
                          {TIMESCALES.map((ts) => (
                            <th key={ts.key} className="pb-3 text-center">
                              <div className="text-sm font-semibold">{ts.label}</div>
                              <div className="text-xs text-muted-foreground font-normal">{ts.desc}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="space-y-2">
                        {DIMENSIONS.map((dim) => (
                          <tr key={dim} className="border-t border-border/50">
                            {/* 维度标签 */}
                            <td className="py-3 pr-4 text-sm font-medium text-foreground align-middle w-36">
                              {dim}
                            </td>
                            {/* 三个时间尺度的单元格 */}
                            {TIMESCALES.map((ts) => (
                              <td key={ts.key} className="py-3 px-2 align-middle">
                                {loading ? (
                                  <div className="h-24 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
                                    <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                                  </div>
                                ) : (
                                  <MatrixCell snapshot={getCell(dim, ts.key)} />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* 图例 */}
                    <div className="mt-6 pt-4 border-t border-border/50 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">状态说明：</span>
                      {Object.entries(STATUS_STYLE).map(([status, style]) => (
                        <span key={status} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}>
                          {status}
                        </span>
                      ))}
                      <span className="ml-2 flex items-center gap-1">
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
