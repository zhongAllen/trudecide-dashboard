import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { ChevronDown, TrendingUp, BarChart3, PieChart, BookOpen, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { INDICATORS } from '@/lib/indicators';
import { supabase } from '@/lib/supabase';

interface Snapshot {
  snapshot_month: string;
  region: string;
  dimension: string;
  timescale: string;
  status: string;
  score: number;
  config_version: number;
  updated_at: string;
}

export default function Home() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('macro');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toggleCategory = (category: string) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  const renderIndicatorsList = (indicators: any[]) => {
    return (
      <div className="space-y-2">
        {indicators.map((indicator) => (
          <div
            key={indicator.id}
            className="w-full text-left p-3 rounded-lg border border-border bg-muted/30"
          >
            <div className="font-medium text-sm">{indicator.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{indicator.subcategory}</div>
          </div>
        ))}
      </div>
    );
  };

  useEffect(() => {
    const fetchSnapshots = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('macro_wide_snapshot')
          .select('*')
          .order('snapshot_month', { ascending: false })
          .order('dimension', { ascending: true })
          .order('timescale', { ascending: true });

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
      {/* Header */}
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
          <div className="flex flex-col items-end gap-2 mt-1">
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

      {/* Main Content */}
      <main className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Left Sidebar - 分析层面目录 */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-3">
              <h2 className="text-xl font-bold mb-4">分析层面</h2>

              {/* 宏观/大盘 */}
              <Card className="overflow-hidden">
                <button
                  onClick={() => toggleCategory('macro')}
                  className="w-full p-4 flex items-center justify-between hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <div className="font-semibold">宏观/大盘</div>
                      <div className="text-xs text-muted-foreground">整体市场</div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      expandedCategory === 'macro' ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedCategory === 'macro' && (
                  <div className="px-4 pb-4 border-t border-border">
                    <div className="space-y-3 mt-3">
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">宏观经济</div>
                        {renderIndicatorsList(INDICATORS.macro.economy)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">流动性与货币政策</div>
                        {renderIndicatorsList(INDICATORS.macro.liquidity)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">政策与预期</div>
                        {renderIndicatorsList(INDICATORS.macro.policy)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">市场估值与情绪</div>
                        {renderIndicatorsList(INDICATORS.macro.valuation)}
                      </div>
                    </div>
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
                    <PieChart className="w-5 h-5 text-orange-500" />
                    <div className="text-left">
                      <div className="font-semibold">中观/板块</div>
                      <div className="text-xs text-muted-foreground">行业轮动</div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      expandedCategory === 'meso' ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedCategory === 'meso' && (
                  <div className="px-4 pb-4 border-t border-border">
                    <div className="space-y-3 mt-3">
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">行业景气度</div>
                        {renderIndicatorsList(INDICATORS.meso.sentiment)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">板块估值</div>
                        {renderIndicatorsList(INDICATORS.meso.valuation)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">资金与情绪</div>
                        {renderIndicatorsList(INDICATORS.meso.fund)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">外部催化</div>
                        {renderIndicatorsList(INDICATORS.meso.catalyst)}
                      </div>
                    </div>
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
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <div className="text-left">
                      <div className="font-semibold">微观/个股</div>
                      <div className="text-xs text-muted-foreground">个股精选</div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      expandedCategory === 'micro' ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedCategory === 'micro' && (
                  <div className="px-4 pb-4 border-t border-border">
                    <div className="space-y-3 mt-3">
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">基本面（财务）</div>
                        {renderIndicatorsList(INDICATORS.micro.fundamental)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">估值指标</div>
                        {renderIndicatorsList(INDICATORS.micro.valuation_stock)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">财务安全</div>
                        {renderIndicatorsList(INDICATORS.micro.safety)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">技术面</div>
                        {renderIndicatorsList(INDICATORS.micro.technical)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">筹码与情绪</div>
                        {renderIndicatorsList(INDICATORS.micro.chip)}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Right Content - 宏观状态宽表 */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>宏观状态宽表</CardTitle>
              </CardHeader>
              <CardContent>
                {loading && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="ml-4 text-muted-foreground">正在加载数据...</p>
                  </div>
                )}
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>加载失败</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {!loading && !error && snapshots.length === 0 && (
                  <div className="text-center py-16 text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>暂无宏观快照数据</p>
                    <p className="text-sm mt-1">请先运行计算引擎生成数据</p>
                  </div>
                )}
                {!loading && !error && snapshots.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>快照月份</TableHead>
                        <TableHead>地区</TableHead>
                        <TableHead>维度</TableHead>
                        <TableHead>时间尺度</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">分数</TableHead>
                        <TableHead className="text-right">模型版本</TableHead>
                        <TableHead>更新时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshots.map((snapshot, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono">{snapshot.snapshot_month}</TableCell>
                          <TableCell>{snapshot.region}</TableCell>
                          <TableCell>{snapshot.dimension}</TableCell>
                          <TableCell>{snapshot.timescale}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              snapshot.status === '扩张' ? 'bg-green-100 text-green-800' :
                              snapshot.status === '复苏' ? 'bg-blue-100 text-blue-800' :
                              snapshot.status === '收缩' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {snapshot.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">{snapshot.score}</TableCell>
                          <TableCell className="text-right font-mono">v{snapshot.config_version}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(snapshot.updated_at).toLocaleString('zh-CN')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-6 mt-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>Trudecide 股票版 © 2026 | 基于宏观常识的 A 股交易策略</p>
          <p className="mt-1">本工具仅供学习和参考之用，不构成投资建议。投资有风险，请谨慎决策。</p>
        </div>
      </footer>
    </div>
  );
}
