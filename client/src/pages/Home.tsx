import { useState } from 'react';
import { ChevronDown, TrendingUp, BarChart3, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { INDICATORS, CATEGORIES } from '@/lib/indicators';

export default function Home() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('macro');
  const [selectedIndicator, setSelectedIndicator] = useState<any>(null);

  const toggleCategory = (category: string) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  const renderIndicatorsList = (indicators: any[]) => {
    return (
      <div className="space-y-2">
        {indicators.map((indicator) => (
          <button
            key={indicator.id}
            onClick={() => setSelectedIndicator(indicator)}
            className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <div className="font-medium text-sm">{indicator.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{indicator.subcategory}</div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-header text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="container">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-8 h-8" />
            <h1 className="text-4xl font-bold">股票分析指标全景图</h1>
          </div>
          <p className="text-lg text-blue-100 max-w-2xl">
            一份完整的股票投资分析指南，涵盖宏观经济、行业板块和个股分析的所有关键指标
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Sidebar - Categories */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">
              <h2 className="text-2xl font-bold mb-6">分析层面</h2>

              {/* Macro */}
              <Card className="card-hover overflow-hidden">
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
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">宏观经济</div>
                        {renderIndicatorsList(INDICATORS.macro.economy)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">流动性与货币政策</div>
                        {renderIndicatorsList(INDICATORS.macro.liquidity)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">政策与预期</div>
                        {renderIndicatorsList(INDICATORS.macro.policy)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">市场估值与情绪</div>
                        {renderIndicatorsList(INDICATORS.macro.valuation)}
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* Meso */}
              <Card className="card-hover overflow-hidden">
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
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">行业景气度</div>
                        {renderIndicatorsList(INDICATORS.meso.sentiment)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">板块估值</div>
                        {renderIndicatorsList(INDICATORS.meso.valuation)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">资金与情绪</div>
                        {renderIndicatorsList(INDICATORS.meso.fund)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">外部催化</div>
                        {renderIndicatorsList(INDICATORS.meso.catalyst)}
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* Micro */}
              <Card className="card-hover overflow-hidden">
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
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">基本面（财务）</div>
                        {renderIndicatorsList(INDICATORS.micro.fundamental)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">估值指标</div>
                        {renderIndicatorsList(INDICATORS.micro.valuation_stock)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">财务安全</div>
                        {renderIndicatorsList(INDICATORS.micro.safety)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">技术面</div>
                        {renderIndicatorsList(INDICATORS.micro.technical)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">筹码与情绪</div>
                        {renderIndicatorsList(INDICATORS.micro.chip)}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Right Content - Details */}
          <div className="lg:col-span-2">
            {selectedIndicator ? (
              <Card className="p-6 sticky top-4">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">{selectedIndicator.name}</h2>
                    <p className="text-muted-foreground">{selectedIndicator.subcategory}</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2">核心含义</h3>
                      <p className="text-base leading-relaxed">{selectedIndicator.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2">数据来源</h3>
                        <p className="text-base">{selectedIndicator.source}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2">分析层面</h3>
                        <p className="text-base capitalize">{selectedIndicator.category}</p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2">应用场景</h3>
                      <p className="text-base leading-relaxed">{selectedIndicator.useCase}</p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setSelectedIndicator(null)}
                    className="w-full"
                  >
                    关闭详情
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-8 text-center sticky top-4">
                <TrendingUp className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-semibold mb-2">选择指标查看详情</h3>
                <p className="text-muted-foreground">
                  从左侧选择任何指标，查看其详细说明、数据来源和应用场景
                </p>
              </Card>
            )}

            {/* Quick Reference */}
            <div className="mt-8 space-y-6">
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">快速参考：指标优先级</h3>
                <Tabs defaultValue="first" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="first">第一优先级</TabsTrigger>
                    <TabsTrigger value="second">第二优先级</TabsTrigger>
                    <TabsTrigger value="third">第三优先级</TabsTrigger>
                  </TabsList>
                  <TabsContent value="first" className="space-y-4 mt-4">
                    <div>
                      <h4 className="font-semibold mb-2">宏观指标</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• GDP</li>
                        <li>• PMI</li>
                        <li>• M2</li>
                        <li>• 利率</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">板块指标</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• 行业利润增速</li>
                        <li>• 景气度</li>
                        <li>• PE分位</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">个股指标</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• ROE</li>
                        <li>• PE</li>
                        <li>• 现金流</li>
                      </ul>
                    </div>
                  </TabsContent>
                  <TabsContent value="second" className="space-y-4 mt-4">
                    <div>
                      <h4 className="font-semibold mb-2">宏观指标</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• CPI</li>
                        <li>• 社融</li>
                        <li>• 北向资金</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">板块指标</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• 资金净流入</li>
                        <li>• 换手率</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">个股指标</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• 营收增长率</li>
                        <li>• 毛利率</li>
                        <li>• 资产负债率</li>
                      </ul>
                    </div>
                  </TabsContent>
                  <TabsContent value="third" className="space-y-4 mt-4">
                    <div>
                      <h4 className="font-semibold mb-2">宏观指标</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• 融资余额</li>
                        <li>• 股债收益率差</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">板块指标</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• 基金持仓比例</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">个股指标</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• 技术面指标</li>
                        <li>• 龙虎榜数据</li>
                      </ul>
                    </div>
                  </TabsContent>
                </Tabs>
              </Card>

              {/* Analysis Scenarios */}
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">常见分析场景</h3>
                <div className="space-y-4">
                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold mb-2">场景1：判断大盘是否处于底部</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• 检查：GDP增速是否触底、PMI是否回升、M2增速是否加快</li>
                      <li>• 估值：全A PE是否处于历史低位（&lt;15倍）</li>
                      <li>• 情绪：融资余额是否大幅下降、北向资金是否持续净流入</li>
                    </ul>
                  </div>
                  <div className="border-l-4 border-orange-500 pl-4">
                    <h4 className="font-semibold mb-2">场景2：寻找板块轮动机会</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• 对比：各板块的景气度趋势和PE分位</li>
                      <li>• 选择：景气度上升+PE分位&lt;30%的板块</li>
                      <li>• 验证：资金是否持续净流入、机构是否增持</li>
                    </ul>
                  </div>
                  <div className="border-l-4 border-green-600 pl-4">
                    <h4 className="font-semibold mb-2">场景3：精选个股投资标的</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• 基本面：ROE&gt;15%、营收增长&gt;20%、现金流为正</li>
                      <li>• 估值：PE相对行业平均低20%、PEG&lt;1</li>
                      <li>• 技术面：MA金叉、MACD向上、RSI&lt;70</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8 mt-12">
        <div className="container text-center text-sm text-muted-foreground">
          <p>股票分析指标全景图 © 2026 | 专业投资者参考指南</p>
          <p className="mt-2">
            本指南仅供学习和参考之用，不构成投资建议。投资有风险，请谨慎决策。
          </p>
        </div>
      </footer>
    </div>
  );
}
