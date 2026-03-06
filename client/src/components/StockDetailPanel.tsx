/**
 * StockDetailPanel.tsx - 统一个股详情面板组件
 * 
 * 用途：
 * 1. 作为独立页面使用（StockDetail.tsx）
 * 2. 支持从 Dashboard/TopDown 跳转
 * 
 * 技术栈：React + TypeScript + Tailwind CSS + klinecharts
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'wouter';
import {
  ArrowLeft, ArrowUpRight, ArrowDownRight, X,
  Activity, Zap, BarChart2, DollarSign, TrendingUp, Globe, Info,
  BarChart3, Calendar, FileText, Users, Building2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { KlineChart, convertToKlineData, type KlineData } from '@/components/KlineChart';

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
}

interface CompanyInfo {
  ts_code: string;
  name_cn: string;
  name_en: string;
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

// ─── K线图面板组件 ─────────────────────────────────────────────────────────────
function KlineChartPanel({ tsCode }: { tsCode: string }) {
  const [klineData, setKlineData] = useState<StockDaily[]>([]);
  const [klinePeriod, setKlinePeriod] = useState<'day' | 'week' | 'month'>('day');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchKlineData() {
      setLoading(true);
      let tableName = 'stock_daily';
      let limit = 120;

      switch (klinePeriod) {
        case 'week':
          tableName = 'stock_weekly';
          limit = 52;
          break;
        case 'month':
          tableName = 'stock_monthly';
          limit = 24;
          break;
      }

      const { data } = await supabase
        .from(tableName)
        .select('trade_date, open, high, low, close, vol, amount, pct_chg')
        .eq('ts_code', tsCode)
        .order('trade_date', { ascending: true })
        .limit(limit);

      setKlineData(data || []);
      setLoading(false);
    }

    fetchKlineData();
  }, [tsCode, klinePeriod]);

  const chartData = useMemo(() => convertToKlineData(klineData), [klineData]);

  return (
    <div className="space-y-4">
      {/* 周期切换 */}
      <div className="flex items-center gap-2">
        {(['day', 'week', 'month'] as const).map((period) => (
          <button
            key={period}
            onClick={() => setKlinePeriod(period)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
              klinePeriod === period
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {period === 'day' ? '日K' : period === 'week' ? '周K' : '月K'}
          </button>
        ))}
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
      const { data } = await supabase
        .from('fina_indicator')
        .select('end_date, roe, debt_to_assets, grossprofit_margin, netprofit_margin, netprofit_yoy, or_yoy')
        .eq('ts_code', tsCode)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      setFinaData(data);
      setLoading(false);
    }

    fetchFina();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8 text-gray-400">加载中...</div>;
  if (!finaData) return <div className="text-center py-8 text-gray-400">暂无数据</div>;

  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: '净资产收益率(ROE)', value: finaData.roe?.toFixed(2) + '%' },
        { label: '资产负债率', value: finaData.debt_to_assets?.toFixed(2) + '%' },
        { label: '毛利率', value: finaData.grossprofit_margin?.toFixed(2) + '%' },
        { label: '净利率', value: finaData.netprofit_margin?.toFixed(2) + '%' },
        { label: '净利润同比', value: finaData.netprofit_yoy?.toFixed(2) + '%' },
        { label: '营收同比', value: finaData.or_yoy?.toFixed(2) + '%' },
      ].map((item) => (
        <div key={item.label} className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-400">{item.label}</div>
          <div className="text-sm font-bold text-gray-800 mt-0.5">{item.value || '-'}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 财务趋势面板 ──────────────────────────────────────────────────────────────
function FinaTrendPanel({ tsCode }: { tsCode: string }) {
  const [trendData, setTrendData] = useState<FinaIndicator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrend() {
      setLoading(true);
      const { data } = await supabase
        .from('fina_indicator')
        .select('end_date, roe, debt_to_assets, grossprofit_margin, netprofit_margin')
        .eq('ts_code', tsCode)
        .order('end_date', { ascending: true })
        .limit(8);

      setTrendData((data || []) as FinaIndicator[]);
      setLoading(false);
    }

    fetchTrend();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8 text-gray-400">加载中...</div>;
  if (trendData.length === 0) return <div className="text-center py-8 text-gray-400">暂无数据</div>;

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-gray-700">近8个季度财务指标趋势</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b">
              <th className="text-left py-2">报告期</th>
              <th className="text-right py-2">ROE(%)</th>
              <th className="text-right py-2">负债率(%)</th>
              <th className="text-right py-2">毛利率(%)</th>
              <th className="text-right py-2">净利率(%)</th>
            </tr>
          </thead>
          <tbody>
            {trendData.map((item) => (
              <tr key={item.end_date} className="border-b border-gray-100">
                <td className="py-2">{item.end_date}</td>
                <td className="text-right">{item.roe?.toFixed(2)}</td>
                <td className="text-right">{item.debt_to_assets?.toFixed(2)}</td>
                <td className="text-right">{item.grossprofit_margin?.toFixed(2)}</td>
                <td className="text-right">{item.netprofit_margin?.toFixed(2)}</td>
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

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const [{ data: info }, { data: holderData }, { data: ai }] = await Promise.all([
        supabase.from('stock_company_info').select('*').eq('ts_code', stock.ts_code).maybeSingle(),
        supabase.from('stock_holders').select('holder_name, hold_ratio, hold_amount').eq('ts_code', stock.ts_code).order('hold_ratio', { ascending: false }).limit(10),
        supabase.from('company_ai_analysis').select('*').eq('ts_code', stock.ts_code).maybeSingle(),
      ]);

      setCompanyInfo(info);
      setHolders(holderData || []);
      setAiData(ai);
      setLoading(false);
    }

    fetchData();
  }, [stock.ts_code]);

  if (loading) return <div className="text-center py-8 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4 max-h-[500px] overflow-y-auto">
      {/* 公司信息 */}
      {companyInfo && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">公司简介</div>
          <p className="text-xs text-gray-600 leading-relaxed">{companyInfo.introduction || '暂无简介'}</p>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-gray-500">
            <div>董事长: {companyInfo.chairman || '-'}</div>
            <div>总经理: {companyInfo.manager || '-'}</div>
            <div>注册资本: {companyInfo.reg_capital ? fmtMv(companyInfo.reg_capital) : '-'}</div>
            <div>成立日期: {companyInfo.setup_date || '-'}</div>
          </div>
        </div>
      )}

      {/* 主营业务 */}
      {companyInfo?.main_business && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">主营业务</div>
          <p className="text-xs text-gray-600 leading-relaxed">{companyInfo.main_business}</p>
        </div>
      )}

      {/* 股东信息 */}
      {holders.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">前十大股东</div>
          <div className="space-y-1">
            {holders.map((h, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-gray-600 truncate flex-1">{h.holder_name}</span>
                <span className="text-gray-400 ml-2">{h.hold_ratio?.toFixed(2)}%</span>
              </div>
            ))}
          </div>
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
