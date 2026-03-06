/**
 * StockDetailPanel.tsx - 统一个股详情面板组件
 *
 * 用途：
 * 1. 作为独立页面使用（StockDetail.tsx）
 * 2. 支持从 Dashboard/TopDown 跳转
 *
 * 技术栈：React + TypeScript + Tailwind CSS + klinecharts + recharts
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'wouter';
import {
  ArrowLeft, ArrowUpRight, ArrowDownRight, X,
  Activity, Zap, BarChart2, DollarSign, TrendingUp, Globe, Info,
  BarChart3, Calendar, FileText, Users, Building2, PieChart, LineChart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { KlineChart, convertToKlineData, type KlineData } from '@/components/KlineChart';
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  LineChart as ReLineChart,
  Line,
  Legend,
  Area,
  AreaChart
} from 'recharts';

// ─── 颜色常量 ──────────────────────────────────────────────────────────────────
const UP_COLOR = '#ef4444';
const DOWN_COLOR = '#22c55e';

// ─── 类型定义 ──────────────────────────────────────────────────────────────────
export interface StockMeta {
  ts_code: string;
  symbol: string;
  name_cn: string;
  area: string;
  industry: string;
  market: string;
  list_date: string;
}

interface StockProfile {
  ts_code: string;
  name_cn: string;
  close_today: number;
  pct_chg_today: number;
  pe_ttm: number;
  pb: number;
  ps_ttm: number;
  dv_ratio: number;
  turnover_rate: number;
  volume_ratio: number;
  total_mv: number;
  circ_mv: number;
  high_52w: number;
  low_52w: number;
  net_amount: number;
  buy_elg_amount: number;
  buy_lg_amount: number;
  buy_md_amount: number;
  buy_sm_amount: number;
  sell_elg_amount: number;
  sell_lg_amount: number;
  sell_md_amount: number;
  sell_sm_amount: number;
}

interface StockDaily {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  amount: number;
  pct_chg: number;
}

interface FinaIndicator {
  end_date: string;
  roe: number;
  debt_to_assets: number;
  grossprofit_margin: number;
  netprofit_margin: number;
  netprofit_yoy: number;
  or_yoy: number;
  // 扩展财务指标
  roa: number;
  roic: number;
  eps: number;
  bps: number;
  current_ratio: number;
  quick_ratio: number;
  cash_ratio: number;
  ar_turn: number;
  assets_turn: number;
  ebitda: number;
  op_yoy: number;
  tr_yoy: number;
  equity_yoy: number;
}

interface Announcement {
  title: string;
  ann_date: string;
  url: string;
}

interface StockHolder {
  holder_name: string;
  hold_ratio: number;
  hold_amount: number;
  holder_type?: string;
  holder_type_desc?: string;
  end_date?: string;
}

interface CompanyInfo {
  ts_code: string;
  name_cn: string;
  name_en: string;
  fullname: string;
  industry: string;
  main_business: string;
  introduction: string;
  chairman: string;
  manager: string;
  secretary: string;
  reg_capital: number;
  setup_date: string;
  province: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  fax: string;
  website: string;
  list_date: string;
  employees: number;
  business_scope: string;
  exchange: string;
}

interface AIAnalysis {
  investment_summary: string;
  risk_factors: string;
  growth_potential: string;
  industry_position: string;
  valuation_analysis: string;
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────
function pctColor(pct: number): string {
  if (pct > 0) return UP_COLOR;
  if (pct < 0) return DOWN_COLOR;
  return '#94a3b8';
}

function fmtPct(n: number): string {
  if (n === 0 || !isFinite(n)) return '0.00%';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function fmtMv(val: number): string {
  if (!val || !isFinite(val)) return '-';
  if (val >= 10000) return `${(val / 10000).toFixed(2)}亿`;
  return `${val.toFixed(0)}万`;
}

function fmtAmount(val: number): string {
  if (!val || !isFinite(val)) return '-';
  const absVal = Math.abs(val);
  if (absVal >= 100000000) return `${(val / 100000000).toFixed(2)}亿`;
  if (absVal >= 10000) return `${(val / 10000).toFixed(0)}万`;
  return `${val.toFixed(0)}`;
}

// ─── 从日K数据聚合周K数据 ────────────────────────────────────────────────────────
function aggregateWeeklyData(dailyData: StockDaily[]): StockDaily[] {
  const weeklyMap = new Map<string, StockDaily>();

  dailyData.forEach((day) => {
    const date = new Date(day.trade_date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + 1); // 周一为周开始
    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, {
        trade_date: weekKey,
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
        vol: day.vol,
        amount: day.amount,
        pct_chg: day.pct_chg,
      });
    } else {
      const week = weeklyMap.get(weekKey)!;
      week.high = Math.max(week.high, day.high);
      week.low = Math.min(week.low, day.low);
      week.close = day.close;
      week.vol += day.vol;
      week.amount += day.amount;
    }
  });

  return Array.from(weeklyMap.values()).sort((a, b) =>
    a.trade_date.localeCompare(b.trade_date)
  );
}

// ─── 从日K数据聚合月K数据 ────────────────────────────────────────────────────────
function aggregateMonthlyData(dailyData: StockDaily[]): StockDaily[] {
  const monthlyMap = new Map<string, StockDaily>();

  dailyData.forEach((day) => {
    const monthKey = day.trade_date.substring(0, 7) + '-01'; // YYYY-MM-01

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        trade_date: monthKey,
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
        vol: day.vol,
        amount: day.amount,
        pct_chg: day.pct_chg,
      });
    } else {
      const month = monthlyMap.get(monthKey)!;
      month.high = Math.max(month.high, day.high);
      month.low = Math.min(month.low, day.low);
      month.close = day.close;
      month.vol += day.vol;
      month.amount += day.amount;
    }
  });

  return Array.from(monthlyMap.values()).sort((a, b) =>
    a.trade_date.localeCompare(b.trade_date)
  );
}

// ─── 从日K数据聚合年K数据 ────────────────────────────────────────────────────────
function aggregateYearlyData(dailyData: StockDaily[]): StockDaily[] {
  const yearlyMap = new Map<string, StockDaily>();

  dailyData.forEach((day) => {
    const yearKey = day.trade_date.substring(0, 4) + '-01-01'; // YYYY-01-01

    if (!yearlyMap.has(yearKey)) {
      yearlyMap.set(yearKey, {
        trade_date: yearKey,
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
        vol: day.vol,
        amount: day.amount,
        pct_chg: day.pct_chg,
      });
    } else {
      const year = yearlyMap.get(yearKey)!;
      year.high = Math.max(year.high, day.high);
      year.low = Math.min(year.low, day.low);
      year.close = day.close;
      year.vol += day.vol;
      year.amount += day.amount;
    }
  });

  return Array.from(yearlyMap.values()).sort((a, b) =>
    a.trade_date.localeCompare(b.trade_date)
  );
}

// ─── K线图面板组件 ─────────────────────────────────────────────────────────────
function KlineChartPanel({ tsCode }: { tsCode: string }) {
  const [dailyData, setDailyData] = useState<StockDaily[]>([]);
  const [klinePeriod, setKlinePeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [loading, setLoading] = useState(true);
  const [realtimeData, setRealtimeData] = useState<{
    current: number;
    pctChg: number;
    volume: number;
    amount: number;
  } | null>(null);

  // 获取日K数据（作为基础数据）
  useEffect(() => {
    async function fetchDailyData() {
      setLoading(true);
      // 获取更多历史数据用于年K线聚合（最多5年）
      const { data } = await supabase
        .from('stock_daily')
        .select('trade_date, open, high, low, close, vol, amount, pct_chg')
        .eq('ts_code', tsCode)
        .order('trade_date', { ascending: true })
        .limit(1500); // 获取约5-6年的日K数据

      setDailyData(data || []);
      setLoading(false);
    }

    fetchDailyData();
  }, [tsCode]);

  // 根据周期计算K线数据
  const klineData = useMemo(() => {
    if (dailyData.length === 0) return [];

    switch (klinePeriod) {
      case 'week':
        return aggregateWeeklyData(dailyData);
      case 'month':
        return aggregateMonthlyData(dailyData);
      case 'year':
        return aggregateYearlyData(dailyData);
      default:
        return dailyData.slice(-120); // 日K显示最近120天
    }
  }, [dailyData, klinePeriod]);

  const chartData = useMemo(() => convertToKlineData(klineData), [klineData]);

  // 获取实时行情（轮询）
  useEffect(() => {
    // 先获取最新一条数据作为实时数据
    if (dailyData.length > 0) {
      const latest = dailyData[dailyData.length - 1];
      setRealtimeData({
        current: latest.close,
        pctChg: latest.pct_chg,
        volume: latest.vol,
        amount: latest.amount,
      });
    }
  }, [dailyData]);

  return (
    <div className="space-y-4">
      {/* 周期切换和实时行情 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(['day', 'week', 'month', 'year'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setKlinePeriod(period)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                klinePeriod === period
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {period === 'day' ? '日K' : period === 'week' ? '周K' : period === 'month' ? '月K' : '年K'}
            </button>
          ))}
        </div>

        {/* 实时行情显示 */}
        {realtimeData && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">最新:</span>
            <span className={`font-bold ${realtimeData.pctChg >= 0 ? 'text-red-500' : 'text-green-500'}`}>
              {realtimeData.current.toFixed(2)}
            </span>
            <span className={`${realtimeData.pctChg >= 0 ? 'text-red-500' : 'text-green-500'}`}>
              {realtimeData.pctChg >= 0 ? '+' : ''}{realtimeData.pctChg.toFixed(2)}%
            </span>
            <span className="text-gray-400 text-xs">
              量: {(realtimeData.volume / 10000).toFixed(0)}万手
            </span>
          </div>
        )}
      </div>

      {/* K线图 */}
      <div className="h-[400px] bg-slate-900 rounded-lg">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            加载中...
          </div>
        ) : chartData.length > 0 ? (
          <KlineChart data={chartData} height={400} maPeriods={[5, 10, 20, 60]} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 资金流向面板 ──────────────────────────────────────────────────────────────
function MoneyFlowPanel({ profile }: { profile: StockProfile }) {
  const netColor = profile.net_amount >= 0 ? UP_COLOR : DOWN_COLOR;

  return (
    <div className="space-y-4">
      {/* 净流入 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="text-sm text-gray-500 mb-1">今日主力净流入</div>
        <div className="text-2xl font-bold" style={{ color: netColor }}>
          {fmtAmount(profile.net_amount)}
        </div>
      </div>

      {/* 买卖分布 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">买入分布</div>
          <div className="text-xs text-gray-500">超大单: {fmtAmount(profile.buy_elg_amount)}</div>
          <div className="text-xs text-gray-500">大单: {fmtAmount(profile.buy_lg_amount)}</div>
          <div className="text-xs text-gray-500">中单: {fmtAmount(profile.buy_md_amount)}</div>
          <div className="text-xs text-gray-500">小单: {fmtAmount(profile.buy_sm_amount)}</div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">卖出分布</div>
          <div className="text-xs text-gray-500">超大单: {fmtAmount(profile.sell_elg_amount)}</div>
          <div className="text-xs text-gray-500">大单: {fmtAmount(profile.sell_lg_amount)}</div>
          <div className="text-xs text-gray-500">中单: {fmtAmount(profile.sell_md_amount)}</div>
          <div className="text-xs text-gray-500">小单: {fmtAmount(profile.sell_sm_amount)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── 基本面面板 ────────────────────────────────────────────────────────────────
function FundamentalsPanel({ profile }: { profile: StockProfile }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: '市盈率(TTM)', value: profile.pe_ttm.toFixed(1) + '倍' },
        { label: '市净率', value: profile.pb.toFixed(2) + '倍' },
        { label: '市销率(TTM)', value: profile.ps_ttm.toFixed(2) + '倍' },
        { label: '股息率', value: profile.dv_ratio.toFixed(2) + '%' },
        { label: '换手率', value: profile.turnover_rate.toFixed(2) + '%' },
        { label: '量比', value: profile.volume_ratio.toFixed(2) },
        { label: '总市值', value: fmtMv(profile.total_mv) },
        { label: '流通市值', value: fmtMv(profile.circ_mv) },
        { label: '52周最高', value: profile.high_52w.toFixed(2) },
        { label: '52周最低', value: profile.low_52w.toFixed(2) },
      ].map((item) => (
        <div key={item.label} className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-400">{item.label}</div>
          <div className="text-sm font-bold text-gray-800 mt-0.5">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 财务面板 ──────────────────────────────────────────────────────────────────
function FinancialPanel({ tsCode }: { tsCode: string }) {
  const [finaData, setFinaData] = useState<FinaIndicator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFina() {
      setLoading(true);
      console.log('[FinancialPanel] Fetching fina_indicator for:', tsCode);

      const { data, error } = await supabase
        .from('stock_fina_indicator')
        .select(`
          end_date, roe, debt_to_assets, grossprofit_margin, netprofit_margin,
          netprofit_yoy, or_yoy, roa, roic, eps, bps, current_ratio, quick_ratio,
          cash_ratio, ar_turn, assets_turn, ebitda, op_yoy, tr_yoy, equity_yoy
        `)
        .eq('ts_code', tsCode)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) console.error('[FinancialPanel] Error:', error);
      console.log('[FinancialPanel] Data:', data);

      setFinaData(data);
      setLoading(false);
    }

    fetchFina();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8 text-gray-400">加载中...</div>;
  if (!finaData) return <div className="text-center py-8 text-gray-400">暂无数据</div>;

  const profitMetrics = [
    { label: '净资产收益率(ROE)', value: finaData.roe?.toFixed(2) + '%', desc: '股东权益回报率' },
    { label: '总资产收益率(ROA)', value: finaData.roa?.toFixed(2) + '%', desc: '总资产盈利能力' },
    { label: '投入资本回报率(ROIC)', value: finaData.roic?.toFixed(2) + '%', desc: '资本使用效率' },
    { label: '毛利率', value: finaData.grossprofit_margin?.toFixed(2) + '%', desc: '产品盈利能力' },
    { label: '净利率', value: finaData.netprofit_margin?.toFixed(2) + '%', desc: '最终盈利水平' },
    { label: '每股收益(EPS)', value: finaData.eps?.toFixed(2), desc: '每股盈利' },
  ];

  const solvencyMetrics = [
    { label: '资产负债率', value: finaData.debt_to_assets?.toFixed(2) + '%', desc: '长期偿债能力' },
    { label: '流动比率', value: finaData.current_ratio?.toFixed(2), desc: '短期偿债能力' },
    { label: '速动比率', value: finaData.quick_ratio?.toFixed(2), desc: '即时偿债能力' },
    { label: '现金比率', value: finaData.cash_ratio?.toFixed(2), desc: '现金偿债能力' },
  ];

  const efficiencyMetrics = [
    { label: '应收账款周转率', value: finaData.ar_turn?.toFixed(2), desc: '回款效率' },
    { label: '总资产周转率', value: finaData.assets_turn?.toFixed(2), desc: '资产使用效率' },
    { label: '每股净资产(BPS)', value: finaData.bps?.toFixed(2), desc: '每股账面价值' },
  ];

  const growthMetrics = [
    { label: '净利润同比', value: finaData.netprofit_yoy?.toFixed(2) + '%', desc: '盈利增长' },
    { label: '营收同比', value: finaData.or_yoy?.toFixed(2) + '%', desc: '收入增长' },
    { label: '营业利润同比', value: finaData.op_yoy?.toFixed(2) + '%', desc: '经营增长' },
    { label: '净资产同比', value: finaData.equity_yoy?.toFixed(2) + '%', desc: '权益增长' },
  ];

  const MetricCard = ({ label, value, desc }: { label: string; value: string; desc: string }) => (
    <div className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-lg font-bold text-gray-800 mt-0.5">{value || '-'}</div>
      <div className="text-xs text-gray-500 mt-1">{desc}</div>
    </div>
  );

  const SectionTitle = ({ title, icon: Icon }: { title: string; icon: any }) => (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-blue-600" />
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
    </div>
  );

  return (
    <div className="space-y-6 max-h-[500px] overflow-y-auto">
      {/* 盈利能力 */}
      <div>
        <SectionTitle title="盈利能力指标" icon={TrendingUp} />
        <div className="grid grid-cols-3 gap-3">
          {profitMetrics.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>
      </div>

      {/* 偿债能力 */}
      <div>
        <SectionTitle title="偿债能力指标" icon={BarChart3} />
        <div className="grid grid-cols-4 gap-3">
          {solvencyMetrics.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>
      </div>

      {/* 运营效率 */}
      <div>
        <SectionTitle title="运营效率指标" icon={Activity} />
        <div className="grid grid-cols-3 gap-3">
          {efficiencyMetrics.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>
      </div>

      {/* 成长能力 */}
      <div>
        <SectionTitle title="成长能力指标" icon={Zap} />
        <div className="grid grid-cols-4 gap-3">
          {growthMetrics.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-400 text-right">
        报告期: {finaData.end_date}
      </div>
    </div>
  );
}

// ─── 财务趋势面板 ──────────────────────────────────────────────────────────────
function FinaTrendPanel({ tsCode }: { tsCode: string }) {
  const [trendData, setTrendData] = useState<FinaIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'quarter' | 'year'>('quarter');
  const [chartMetric, setChartMetric] = useState<'roe' | 'grossprofit_margin' | 'netprofit_margin' | 'debt_to_assets'>('roe');

  useEffect(() => {
    async function fetchTrend() {
      setLoading(true);
      const { data } = await supabase
        .from('stock_fina_indicator')
        .select(`
          end_date, roe, debt_to_assets, grossprofit_margin, netprofit_margin,
          roa, eps, current_ratio, netprofit_yoy, or_yoy
        `)
        .eq('ts_code', tsCode)
        .order('end_date', { ascending: true })
        .limit(20);

      setTrendData((data || []) as FinaIndicator[]);
      setLoading(false);
    }

    fetchTrend();
  }, [tsCode]);

  // 根据视图模式过滤数据
  const filteredData = useMemo(() => {
    if (viewMode === 'year') {
      // 只保留年报数据（12-31结尾）
      return trendData.filter(d => d.end_date?.endsWith('12-31'));
    }
    // 季度视图：显示最近8个季度
    return trendData.slice(-8);
  }, [trendData, viewMode]);

  // 图表数据格式化
  const chartData = useMemo(() => {
    return filteredData.map(d => ({
      name: d.end_date?.slice(0, 7) || '',
      ROE: d.roe,
      毛利率: d.grossprofit_margin,
      净利率: d.netprofit_margin,
      负债率: d.debt_to_assets,
      ROA: d.roa,
      流动比率: d.current_ratio,
    }));
  }, [filteredData]);

  const metricConfig = {
    roe: { label: 'ROE', color: '#3b82f6', unit: '%' },
    grossprofit_margin: { label: '毛利率', color: '#10b981', unit: '%' },
    netprofit_margin: { label: '净利率', color: '#f59e0b', unit: '%' },
    debt_to_assets: { label: '负债率', color: '#ef4444', unit: '%' },
  };

  if (loading) return <div className="text-center py-8 text-gray-400">加载中...</div>;
  if (trendData.length === 0) return <div className="text-center py-8 text-gray-400">暂无数据</div>;

  return (
    <div className="space-y-4">
      {/* 视图切换 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">时间维度:</span>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('quarter')}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                viewMode === 'quarter' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              季度
            </button>
            <button
              onClick={() => setViewMode('year')}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                viewMode === 'year' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              年度
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">图表指标:</span>
          <select
            value={chartMetric}
            onChange={(e) => setChartMetric(e.target.value as any)}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
          >
            <option value="roe">ROE</option>
            <option value="grossprofit_margin">毛利率</option>
            <option value="netprofit_margin">净利率</option>
            <option value="debt_to_assets">资产负债率</option>
          </select>
        </div>
      </div>

      {/* 趋势图表 */}
      <div className="h-[200px] bg-gray-50 rounded-lg p-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={metricConfig[chartMetric].color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={metricConfig[chartMetric].color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
            <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'}}
            />
            <Area
              type="monotone"
              dataKey={metricConfig[chartMetric].label}
              name={`${metricConfig[chartMetric].label}(${metricConfig[chartMetric].unit})`}
              stroke={metricConfig[chartMetric].color}
              fillOpacity={1}
              fill="url(#colorMetric)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 数据表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <th className="text-left py-2 px-2">报告期</th>
              <th className="text-right py-2 px-2">ROE(%)</th>
              <th className="text-right py-2 px-2">ROA(%)</th>
              <th className="text-right py-2 px-2">毛利率(%)</th>
              <th className="text-right py-2 px-2">净利率(%)</th>
              <th className="text-right py-2 px-2">负债率(%)</th>
              <th className="text-right py-2 px-2">流动比率</th>
              <th className="text-right py-2 px-2">EPS</th>
            </tr>
          </thead>
          <tbody>
            {[...filteredData].reverse().map((item) => (
              <tr key={item.end_date} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-2 font-medium">{item.end_date}</td>
                <td className="text-right py-2 px-2">{item.roe?.toFixed(2)}</td>
                <td className="text-right py-2 px-2">{item.roa?.toFixed(2)}</td>
                <td className="text-right py-2 px-2">{item.grossprofit_margin?.toFixed(2)}</td>
                <td className="text-right py-2 px-2">{item.netprofit_margin?.toFixed(2)}</td>
                <td className="text-right py-2 px-2">{item.debt_to_assets?.toFixed(2)}</td>
                <td className="text-right py-2 px-2">{item.current_ratio?.toFixed(2)}</td>
                <td className="text-right py-2 px-2">{item.eps?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 公告面板 ──────────────────────────────────────────────────────────────────
function AnnouncementPanel({ tsCode, nameCn }: { tsCode: string; nameCn: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnnouncements() {
      setLoading(true);
      const { data } = await supabase
        .from('stock_announcement')
        .select('title, ann_date, url')
        .eq('ts_code', tsCode)
        .order('ann_date', { ascending: false })
        .limit(10);

      setAnnouncements(data || []);
      setLoading(false);
    }

    fetchAnnouncements();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto">
      {announcements.length === 0 ? (
        <div className="text-center py-8 text-gray-400">暂无公告</div>
      ) : (
        announcements.map((item, idx) => (
          <a
            key={idx}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="text-sm text-gray-800 line-clamp-2">{item.title}</div>
            <div className="text-xs text-gray-400 mt-1">{item.ann_date}</div>
          </a>
        ))
      )}
    </div>
  );
}

// ─── 公司画布面板 ──────────────────────────────────────────────────────────────
function CompanyCanvasPanel({ stock }: { stock: StockMeta }) {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [holders, setHolders] = useState<StockHolder[]>([]);
  const [aiData, setAiData] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<'bar' | 'pie' | 'list'>('bar');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // 先获取最新的报告期
      const { data: latestHolder } = await supabase
        .from('stock_holders')
        .select('end_date')
        .eq('ts_code', stock.ts_code)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const latestEndDate = latestHolder?.end_date;

      const [{ data: info }, { data: holderData }, { data: ai }] = await Promise.all([
        supabase.from('stock_company_info').select('*').eq('ts_code', stock.ts_code).maybeSingle(),
        latestEndDate
          ? supabase.from('stock_holders').select('holder_name, hold_ratio, hold_amount, holder_type, holder_type_desc').eq('ts_code', stock.ts_code).eq('end_date', latestEndDate).order('hold_ratio', { ascending: false }).limit(10)
          : Promise.resolve({ data: [] }),
        supabase.from('company_ai_analysis').select('*').eq('ts_code', stock.ts_code).maybeSingle(),
      ]);

      setCompanyInfo(info);
      setHolders(holderData || []);
      setAiData(ai);
      setLoading(false);
    }

    fetchData();
  }, [stock.ts_code]);

  // 股东类型分类统计
  const holderTypeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    holders.forEach(h => {
      const type = h.holder_type_desc || '其他';
      stats[type] = (stats[type] || 0) + (h.hold_ratio || 0);
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
  }, [holders]);

  // 饼图颜色
  const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  // 条形图数据
  const barChartData = useMemo(() => {
    return holders.slice(0, 10).map(h => ({
      name: h.holder_name.length > 12 ? h.holder_name.slice(0, 12) + '...' : h.holder_name,
      fullName: h.holder_name,
      ratio: h.hold_ratio,
      amount: h.hold_amount,
    }));
  }, [holders]);

  if (loading) return <div className="text-center py-8 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4 max-h-[600px] overflow-y-auto">
      {/* 公司基本信息卡片 */}
      {companyInfo && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">公司概况</span>
          </div>

          {/* 基本信息网格 */}
          <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">公司全称</div>
              <div className="font-medium text-gray-800">{companyInfo.fullname || companyInfo.name_cn || '-'}</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">所属行业</div>
              <div className="font-medium text-gray-800">{companyInfo.industry || '-'}</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">上市日期</div>
              <div className="font-medium text-gray-800">{companyInfo.list_date || '-'}</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">交易所</div>
              <div className="font-medium text-gray-800">{companyInfo.exchange || '-'}</div>
            </div>
          </div>

          {/* 管理层信息 */}
          <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">董事长</div>
              <div className="font-medium text-gray-800">{companyInfo.chairman || '-'}</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">总经理</div>
              <div className="font-medium text-gray-800">{companyInfo.manager || '-'}</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">董秘</div>
              <div className="font-medium text-gray-800">{companyInfo.secretary || '-'}</div>
            </div>
          </div>

          {/* 注册信息 */}
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">注册资本</div>
              <div className="font-medium text-gray-800">{companyInfo.reg_capital ? `${(companyInfo.reg_capital / 10000).toFixed(2)}万元` : '-'}</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">成立日期</div>
              <div className="font-medium text-gray-800">{companyInfo.setup_date || '-'}</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">注册地址</div>
              <div className="font-medium text-gray-800">{companyInfo.province}{companyInfo.city ? `·${companyInfo.city}` : ''}</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 mb-1">员工人数</div>
              <div className="font-medium text-gray-800">{companyInfo.employees ? `${companyInfo.employees}人` : '-'}</div>
            </div>
          </div>
        </div>
      )}

      {/* 公司简介 */}
      {companyInfo?.introduction && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">公司简介</div>
          <p className="text-xs text-gray-600 leading-relaxed">{companyInfo.introduction}</p>
        </div>
      )}

      {/* 主营业务 */}
      {companyInfo?.main_business && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">主营业务</div>
          <p className="text-xs text-gray-600 leading-relaxed">{companyInfo.main_business}</p>
        </div>
      )}

      {/* 经营范围 */}
      {companyInfo?.business_scope && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">经营范围</div>
          <p className="text-xs text-gray-600 leading-relaxed">{companyInfo.business_scope}</p>
        </div>
      )}

      {/* 股东可视化 */}
      {holders.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">前十大股东</span>
              <span className="text-xs text-gray-400">({holders[0]?.end_date || '最新报告期'})</span>
            </div>
            <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
              <button
                onClick={() => setActiveChart('bar')}
                className={`px-2 py-1 text-xs rounded-md transition-all ${
                  activeChart === 'bar' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
                }`}
                title="条形图"
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveChart('pie')}
                className={`px-2 py-1 text-xs rounded-md transition-all ${
                  activeChart === 'pie' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
                }`}
                title="饼图"
              >
                <PieChart className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveChart('list')}
                className={`px-2 py-1 text-xs rounded-md transition-all ${
                  activeChart === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
                }`}
                title="列表"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 条形图视图 */}
          {activeChart === 'bar' && (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={barChartData} layout="vertical" margin={{ left: 80, right: 30, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{fontSize: 10}} axisLine={false} tickLine={false} unit="%" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{fontSize: 9}}
                    width={75}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'}}
                    formatter={(value: number) => [`${value.toFixed(2)}%`, '持股比例']}
                    labelFormatter={(label) => barChartData.find(d => d.name === label)?.fullName || label}
                  />
                  <Bar dataKey="ratio" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16} />
                </ReBarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 饼图视图 */}
          {activeChart === 'pie' && (
            <div className="flex items-center gap-4">
              <div className="h-[200px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={holderTypeStats.length > 0 ? holderTypeStats : holders.slice(0, 5).map(h => ({ name: h.holder_name.slice(0, 8), value: h.hold_ratio }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {(holderTypeStats.length > 0 ? holderTypeStats : holders.slice(0, 5).map(h => ({ name: h.holder_name.slice(0, 8), value: h.hold_ratio }))).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'}}
                      formatter={(value: number) => `${value.toFixed(2)}%`}
                    />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-[140px] space-y-1">
                {(holderTypeStats.length > 0 ? holderTypeStats : holders.slice(0, 5).map(h => ({ name: h.holder_name.slice(0, 8), value: h.hold_ratio }))).map((entry, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                    <span className="text-gray-600 truncate flex-1">{entry.name}</span>
                    <span className="text-gray-400">{entry.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 列表视图 */}
          {activeChart === 'list' && (
            <div className="space-y-2">
              {holders.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-white rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 flex items-center justify-center bg-gray-100 rounded-full text-gray-500 text-[10px]">
                      {i + 1}
                    </span>
                    <span className="text-gray-700">{h.holder_name}</span>
                    {h.holder_type_desc && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                        {h.holder_type_desc}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400">{fmtAmount(h.hold_amount)}股</span>
                    <span className="font-medium text-blue-600 min-w-[50px] text-right">{h.hold_ratio?.toFixed(2)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI分析 */}
      {aiData && (
        <div className="space-y-3">
          {aiData.investment_summary && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-xs font-medium text-blue-700 mb-1">投资摘要</div>
              <p className="text-xs text-gray-700">{aiData.investment_summary}</p>
            </div>
          )}
          {aiData.risk_factors && (
            <div className="bg-red-50 p-3 rounded-lg">
              <div className="text-xs font-medium text-red-700 mb-1">风险因素</div>
              <p className="text-xs text-gray-700">{aiData.risk_factors}</p>
            </div>
          )}
          {aiData.growth_potential && (
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-xs font-medium text-green-700 mb-1">成长潜力</div>
              <p className="text-xs text-gray-700">{aiData.growth_potential}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 主组件：StockDetailPanel ──────────────────────────────────────────────────
interface StockDetailPanelProps {
  stock: StockMeta;
  from: 'topdown' | 'dashboard';
  onClose?: () => void;
}

export default function StockDetailPanel({ stock, from, onClose }: StockDetailPanelProps) {
  const [profile, setProfile] = useState<StockProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'kline' | 'flow' | 'funda' | 'fina' | 'trend' | 'canvas' | 'ann'>('kline');

  // 获取股票数据
  useEffect(() => {
    async function fetchStockData() {
      setLoading(true);
      console.log('[StockDetailPanel] Fetching data for:', stock.ts_code);

      try {
        const [{ data: dailyData, error: dailyError }, { data: basicData, error: basicError }, { data: moneyflowData, error: moneyflowError }] = await Promise.all([
          supabase.from('stock_daily').select('trade_date, close, pct_chg, high, low').eq('ts_code', stock.ts_code).order('trade_date', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('stock_daily_basic').select('trade_date, pe_ttm, pb, ps_ttm, dv_ratio, turnover_rate, volume_ratio, total_mv, circ_mv').eq('ts_code', stock.ts_code).order('trade_date', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('stock_moneyflow').select('trade_date, net_amount, buy_elg_amount, buy_lg_amount, buy_md_amount, buy_sm_amount, sell_elg_amount, sell_lg_amount, sell_md_amount, sell_sm_amount').eq('ts_code', stock.ts_code).order('trade_date', { ascending: false }).limit(1).maybeSingle(),
        ]);

        if (dailyError) console.error('[StockDetailPanel] Daily data error:', dailyError);
        if (basicError) console.error('[StockDetailPanel] Basic data error:', basicError);
        if (moneyflowError) console.error('[StockDetailPanel] Moneyflow error:', moneyflowError);

        console.log('[StockDetailPanel] Daily data:', dailyData);
        console.log('[StockDetailPanel] Basic data:', basicData);
        console.log('[StockDetailPanel] Moneyflow data:', moneyflowData);

      // 获取52周高低点
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const { data: highLowData } = await supabase
        .from('stock_daily')
        .select('high, low')
        .eq('ts_code', stock.ts_code)
        .gte('trade_date', oneYearAgo.toISOString().split('T')[0]);

      let high52w = dailyData?.high ?? 0;
      let low52w = dailyData?.low ?? 0;

      if (highLowData && highLowData.length > 0) {
        high52w = Math.max(...highLowData.map((d) => d.high));
        low52w = Math.min(...highLowData.map((d) => d.low));
      }

      if (dailyData) {
        setProfile({
          ts_code: stock.ts_code,
          name_cn: stock.name_cn,
          close_today: dailyData.close ?? 0,
          pct_chg_today: dailyData.pct_chg ?? 0,
          pe_ttm: basicData?.pe_ttm ?? 0,
          pb: basicData?.pb ?? 0,
          ps_ttm: basicData?.ps_ttm ?? 0,
          dv_ratio: basicData?.dv_ratio ?? 0,
          turnover_rate: basicData?.turnover_rate ?? 0,
          volume_ratio: basicData?.volume_ratio ?? 0,
          total_mv: basicData?.total_mv ?? 0,
          circ_mv: basicData?.circ_mv ?? 0,
          high_52w: high52w,
          low_52w: low52w,
          net_amount: moneyflowData?.net_amount ?? 0,
          buy_elg_amount: moneyflowData?.buy_elg_amount ?? 0,
          buy_lg_amount: moneyflowData?.buy_lg_amount ?? 0,
          buy_md_amount: moneyflowData?.buy_md_amount ?? 0,
          buy_sm_amount: moneyflowData?.buy_sm_amount ?? 0,
          sell_elg_amount: moneyflowData?.sell_elg_amount ?? 0,
          sell_lg_amount: moneyflowData?.sell_lg_amount ?? 0,
          sell_md_amount: moneyflowData?.sell_md_amount ?? 0,
          sell_sm_amount: moneyflowData?.sell_sm_amount ?? 0,
        });
      }

      setLoading(false);
      } catch (err) {
        console.error('[StockDetailPanel] Fetch error:', err);
        setLoading(false);
      }
    }

    fetchStockData();
  }, [stock.ts_code, stock.name_cn]);

  // 返回路径
  const backPath = from === 'topdown' ? '/topdown' : '/dashboard';
  const backText = from === 'topdown' ? '返回选股' : '返回驾驶舱';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-4">暂无数据</div>
          <Link href={backPath}>
            <Button>{backText}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>{stock.name_cn} ({stock.ts_code}) - 个股详情</title>
      </Helmet>

      <div className="max-w-5xl mx-auto p-4">
        {/* 头部 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{stock.name_cn}</h1>
              <span className="text-sm text-gray-400 font-mono">{stock.symbol}</span>
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{stock.market}</span>
              <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{stock.industry}</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-3xl font-bold tabular-nums text-gray-900">{profile.close_today.toFixed(2)}</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: pctColor(profile.pct_chg_today) }}>
                {profile.pct_chg_today > 0 ? <ArrowUpRight className="inline w-5 h-5" /> : <ArrowDownRight className="inline w-5 h-5" />}
                {fmtPct(profile.pct_chg_today)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={backPath}>
              <Button variant="ghost" size="sm" className="gap-1">
                <ArrowLeft size={16} />
                {backText}
              </Button>
            </Link>
            {onClose && (
              <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* 关键指标卡片 */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'PE(TTM)', value: profile.pe_ttm.toFixed(1) + '倍' },
            { label: 'PB', value: profile.pb.toFixed(2) + '倍' },
            { label: '换手率', value: profile.turnover_rate.toFixed(2) + '%' },
            { label: '总市值', value: fmtMv(profile.total_mv) },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-lg p-3 text-center border border-gray-100">
              <div className="text-xs text-gray-400">{item.label}</div>
              <div className="text-sm font-bold text-gray-800 mt-0.5">{item.value}</div>
            </div>
          ))}
        </div>

        {/* Tab 导航 */}
        <div className="flex flex-wrap bg-gray-100 rounded-lg p-0.5 gap-0.5 mb-4">
          {[
            { key: 'kline', label: 'K线图', icon: Activity },
            { key: 'flow', label: '资金流向', icon: Zap },
            { key: 'funda', label: '基本面', icon: BarChart2 },
            { key: 'fina', label: '财务', icon: DollarSign },
            { key: 'trend', label: '财务趋势', icon: TrendingUp },
            { key: 'canvas', label: '公司画布', icon: Globe },
            { key: 'ann', label: '公告', icon: Info },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                activeTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          {activeTab === 'kline' && <KlineChartPanel tsCode={stock.ts_code} />}
          {activeTab === 'flow' && <MoneyFlowPanel profile={profile} />}
          {activeTab === 'funda' && <FundamentalsPanel profile={profile} />}
          {activeTab === 'fina' && <FinancialPanel tsCode={stock.ts_code} />}
          {activeTab === 'trend' && <FinaTrendPanel tsCode={stock.ts_code} />}
          {activeTab === 'canvas' && <CompanyCanvasPanel stock={stock} />}
          {activeTab === 'ann' && <AnnouncementPanel tsCode={stock.ts_code} nameCn={stock.name_cn} />}
        </div>
      </div>
    </div>
  );
}

// 导出类型供外部使用
export type { StockProfile };
