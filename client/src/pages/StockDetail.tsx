/**
 * StockDetail.tsx - 独立个股详情页面
 * 
 * 功能：
 * 1. 展示个股完整信息（K线、基本面、资金流向、财务、公告、股东、公司画像）
 * 2. 支持从 Dashboard/TopDown 跳转
 * 3. 专业炒股软件风格的K线展示
 */
import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useSearch, Link } from 'wouter';
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus,
  BarChart3, Activity, DollarSign, Users, FileText,
  Building2, Clock, AlertCircle, ChevronUp, ChevronDown,
  Calendar, Globe, Mail, Phone, MapPin, User
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, ReferenceLine, Area
} from 'recharts';
import { supabase } from '@/lib/supabase';
import TradingViewChart from '@/components/TradingViewChart';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────
interface StockMeta {
  ts_code: string;
  symbol: string;
  name_cn: string;
  area: string;
  industry: string;
  market: string;
  list_date: string;
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

// 周K/月K数据类型（与StockDaily兼容）
interface StockWeekly extends StockDaily {}
interface StockMonthly extends StockDaily {}

// 图表展示用的扩展类型
interface ChartData extends StockDaily {
  date: string;
  fullDate: string;
  isUp: boolean;
  amplitude: string;
}

interface StockDailyBasic {
  trade_date: string;
  pe_ttm: number;
  pb: number;
  total_mv: number;
  circ_mv: number;
  turnover_rate: number;
  volume_ratio: number;
}

interface MoneyFlow {
  trade_date: string;
  net_mf_amount: number;
  buy_elg_amount: number;
  buy_lg_amount: number;
  buy_md_amount: number;
  buy_sm_amount: number;
  sell_elg_amount: number;
  sell_lg_amount: number;
  sell_md_amount: number;
  sell_sm_amount: number;
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
  holder_type: string;
}

interface CompanyInfo {
  // 基础信息（来自 stock_basic）
  ts_code: string;
  symbol: string;
  name: string;
  fullname: string;
  enname: string;
  cnspell: string;
  area: string;
  industry: string;
  market: string;
  exchange: string;
  list_status: string;
  list_date: string;
  delist_date: string;
  is_hs: string;
  act_name: string;
  act_ent_type: string;
  // 工商信息（来自 stock_company）
  com_name: string;
  com_id: string;
  chairman: string;
  manager: string;
  secretary: string;
  reg_capital: number;
  setup_date: string;
  province: string;
  city: string;
  introduction: string;
  website: string;
  email: string;
  office: string;
  employees: number;
  main_business: string;
  business_scope: string;
}

// 管理层信息
interface CompanyManager {
  name: string;
  gender: string;
  edu: string;
  national: string;
  birthday: string;
  begin_date: string;
  end_date: string;
  resume: string;
}

interface CompanyAIAnalysis {
  moat: string;
  competitive_advantage: string;
  risk_factors: string;
  growth_potential: string;
  valuation_analysis: string;
  industry_position: string;
  ai_analyzed_at: string;
}

// ─── 颜色常量 ─────────────────────────────────────────────────────────────────
const UP_COLOR = '#ef4444';
const DOWN_COLOR = '#22c55e';
const FLAT_COLOR = '#94a3b8';

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function fmtPrice(v: number) {
  return v?.toFixed(2) ?? '--';
}

function fmtPct(v: number) {
  if (v === undefined || v === null) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtMoney(v: number) {
  if (v === undefined || v === null) return '--';
  if (Math.abs(v) >= 100000000) {
    return `${(v / 100000000).toFixed(2)}亿`;
  }
  if (Math.abs(v) >= 10000) {
    return `${(v / 10000).toFixed(2)}万`;
  }
  return v.toFixed(0);
}

function fmtVolume(v: number) {
  if (v === undefined || v === null) return '--';
  if (v >= 100000000) {
    return `${(v / 100000000).toFixed(2)}亿`;
  }
  if (v >= 10000) {
    return `${(v / 10000).toFixed(2)}万`;
  }
  return v.toString();
}

function pctColor(v: number) {
  if (v > 0) return 'text-red-500';
  if (v < 0) return 'text-green-500';
  return 'text-gray-500';
}

function pctBg(v: number) {
  if (v > 0) return 'bg-red-50';
  if (v < 0) return 'bg-green-50';
  return 'bg-gray-50';
}

// ─── 专业K线图组件 ────────────────────────────────────────────────────────────
function ProfessionalKlineChart({ data, period }: { data: StockDaily[]; period: 'day' | 'week' | 'month' }) {
  const [hoverData, setHoverData] = useState<ChartData | null>(null);
  
  const chartData = useMemo<ChartData[]>(() => {
    return data.map(d => ({
      ...d,
      date: d.trade_date.slice(5), // MM-DD
      fullDate: d.trade_date,
      isUp: d.close >= d.open,
      amplitude: ((d.high - d.low) / d.low * 100).toFixed(2),
    })).reverse();
  }, [data]);

  const latest = hoverData || chartData[chartData.length - 1];

  return (
    <div className="space-y-3">
      {/* 价格信息栏 */}
      <div className="flex items-baseline gap-4">
        <span className={`text-3xl font-bold ${pctColor(latest?.pct_chg)}`}>
          {fmtPrice(latest?.close)}
        </span>
        <span className={`text-lg ${pctColor(latest?.pct_chg)}`}>
          {latest?.pct_chg > 0 ? '+' : ''}{fmtPrice(latest?.pct_chg)}
        </span>
        <span className={`text-lg ${pctColor(latest?.pct_chg)}`}>
          {fmtPct(latest?.pct_chg)}
        </span>
      </div>

      {/* 详细数据 */}
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500">今开</span>
          <div className={`font-medium ${pctColor((latest?.open || 0) - (latest?.close || 0))}`}>
            {fmtPrice(latest?.open)}
          </div>
        </div>
        <div>
          <span className="text-gray-500">最高</span>
          <div className="font-medium text-red-500">{fmtPrice(latest?.high)}</div>
        </div>
        <div>
          <span className="text-gray-500">最低</span>
          <div className="font-medium text-green-500">{fmtPrice(latest?.low)}</div>
        </div>
        <div>
          <span className="text-gray-500">昨收</span>
          <div className="font-medium">{fmtPrice(latest?.close ? latest.close / (1 + (latest.pct_chg || 0) / 100) : 0)}</div>
        </div>
        <div>
          <span className="text-gray-500">成交量</span>
          <div className="font-medium">{fmtVolume(latest?.vol)}</div>
        </div>
        <div>
          <span className="text-gray-500">成交额</span>
          <div className="font-medium">{fmtMoney(latest?.amount)}</div>
        </div>
        <div>
          <span className="text-gray-500">振幅</span>
          <div className="font-medium">{latest?.amplitude}%</div>
        </div>
      </div>

      {/* K线图 */}
      <div className="h-[400px] mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            onMouseMove={(e: any) => {
              if (e.activePayload) {
                setHoverData(e.activePayload[0].payload);
              }
            }}
            onMouseLeave={() => setHoverData(null)}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis 
              domain={['auto', 'auto']}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => v.toFixed(2)}
            />
            <ReTooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-white border rounded-lg p-2 shadow-lg text-xs">
                      <div className="font-medium mb-1">{d.fullDate}</div>
                      <div>开: {fmtPrice(d.open)}</div>
                      <div>高: {fmtPrice(d.high)}</div>
                      <div>低: {fmtPrice(d.low)}</div>
                      <div>收: {fmtPrice(d.close)}</div>
                      <div className={pctColor(d.pct_chg)}>涨跌: {fmtPct(d.pct_chg)}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* 蜡烛图效果 - 使用柱状图模拟 */}
            <Bar 
              dataKey="low" 
              fill="transparent" 
              stroke="transparent"
            />
            <Bar 
              dataKey="high" 
              fill="transparent"
            />
            {/* 简化版：使用线图展示 */}
            <Line
              type="monotone"
              dataKey="close"
              stroke="#2563eb"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── 资金流向面板 ────────────────────────────────────────────────────────────
function MoneyFlowPanel({ tsCode }: { tsCode: string }) {
  const [data, setData] = useState<MoneyFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'dc' | 'ths'>('dc');

  useEffect(() => {
    async function fetchData() {
      // 先尝试获取 DC 数据（东方财富）
      const { data: dcData } = await supabase
        .from('stock_moneyflow')
        .select('*')
        .eq('ts_code', tsCode)
        .eq('source', 'dc')
        .order('trade_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (dcData) {
        setData(dcData);
        setSource('dc');
      } else {
        // 如果没有 DC 数据，尝试获取 THS 数据（同花顺）
        const { data: thsData } = await supabase
          .from('stock_moneyflow')
          .select('*')
          .eq('ts_code', tsCode)
          .eq('source', 'ths')
          .order('trade_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (thsData) {
          setData(thsData);
          setSource('ths');
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8">加载中...</div>;
  if (!data) return <div className="text-center py-8 text-gray-400">暂无数据</div>;

  const netInflow = data.net_mf_amount;
  const mainBuy = (data.buy_elg_amount || 0) + (data.buy_lg_amount || 0);
  const mainSell = (data.sell_elg_amount || 0) + (data.sell_lg_amount || 0);
  const retailBuy = (data.buy_md_amount || 0) + (data.buy_sm_amount || 0);
  const retailSell = (data.sell_md_amount || 0) + (data.sell_sm_amount || 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">主力净流入</span>
          <span className="text-xs text-gray-400">({source === 'dc' ? '东方财富' : '同花顺'})</span>
        </div>
        <span className={`text-xl font-bold ${netInflow > 0 ? 'text-red-500' : 'text-green-500'}`}>
          {netInflow > 0 ? '+' : ''}{fmtMoney(netInflow)}
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-red-50">
          <CardContent className="p-3">
            <div className="text-sm text-gray-500">主力买入</div>
            <div className="text-lg font-bold text-red-600">{fmtMoney(mainBuy)}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardContent className="p-3">
            <div className="text-sm text-gray-500">主力卖出</div>
            <div className="text-lg font-bold text-green-600">{fmtMoney(mainSell)}</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardContent className="p-3">
            <div className="text-sm text-gray-500">散户买入</div>
            <div className="text-lg font-bold text-blue-600">{fmtMoney(retailBuy)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50">
          <CardContent className="p-3">
            <div className="text-sm text-gray-500">散户卖出</div>
            <div className="text-lg font-bold text-gray-600">{fmtMoney(retailSell)}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── 基本面面板 ──────────────────────────────────────────────────────────────
function FundamentalsPanel({ tsCode }: { tsCode: string }) {
  const [data, setData] = useState<StockDailyBasic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data: basicData } = await supabase
        .from('stock_daily_basic')
        .select('*')
        .eq('ts_code', tsCode)
        .order('trade_date', { ascending: false })
        .limit(1)
        .single();
      
      setData(basicData);
      setLoading(false);
    }
    fetchData();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8">加载中...</div>;
  if (!data) return <div className="text-center py-8 text-gray-400">暂无数据</div>;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1">
        <div className="text-sm text-gray-500">市盈率(TTM)</div>
        <div className="text-lg font-medium">{data.pe_ttm?.toFixed(2) ?? '--'}</div>
      </div>
      <div className="space-y-1">
        <div className="text-sm text-gray-500">市净率</div>
        <div className="text-lg font-medium">{data.pb?.toFixed(2) ?? '--'}</div>
      </div>
      <div className="space-y-1">
        <div className="text-sm text-gray-500">总市值</div>
        <div className="text-lg font-medium">{fmtMoney(data.total_mv * 10000)}</div>
      </div>
      <div className="space-y-1">
        <div className="text-sm text-gray-500">流通市值</div>
        <div className="text-lg font-medium">{fmtMoney(data.circ_mv * 10000)}</div>
      </div>
      <div className="space-y-1">
        <div className="text-sm text-gray-500">换手率</div>
        <div className="text-lg font-medium">{data.turnover_rate?.toFixed(2) ?? '--'}%</div>
      </div>
      <div className="space-y-1">
        <div className="text-sm text-gray-500">量比</div>
        <div className="text-lg font-medium">{data.volume_ratio?.toFixed(2) ?? '--'}</div>
      </div>
    </div>
  );
}

// ─── 财务趋势面板 ────────────────────────────────────────────────────────────
function FinaTrendPanel({ tsCode }: { tsCode: string }) {
  const [data, setData] = useState<FinaIndicator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data: finaData } = await supabase
        .from('stock_fina_indicator')
        .select('end_date, roe, debt_to_assets, grossprofit_margin, netprofit_margin, netprofit_yoy, or_yoy')
        .eq('ts_code', tsCode)
        .like('end_date', '%-12-31')
        .order('end_date', { ascending: false })
        .limit(5);
      
      setData(finaData || []);
      setLoading(false);
    }
    fetchData();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8">加载中...</div>;
  if (data.length === 0) return <div className="text-center py-8 text-gray-400">暂无数据</div>;

  return (
    <div className="space-y-4">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <span className="text-gray-500">{item.end_date?.slice(0, 4)}年报</span>
          <div className="flex gap-6 text-sm">
            <span>ROE: <span className="font-medium">{item.roe?.toFixed(2) ?? '--'}%</span></span>
            <span>毛利率: <span className="font-medium">{item.grossprofit_margin?.toFixed(2) ?? '--'}%</span></span>
            <span>净利率: <span className="font-medium">{item.netprofit_margin?.toFixed(2) ?? '--'}%</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 公告面板 ─────────────────────────────────────────────────────────────────
function AnnouncementPanel({ tsCode }: { tsCode: string }) {
  const [data, setData] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data: annData } = await supabase
        .from('stock_announcement')
        .select('title, ann_date, url')
        .eq('ts_code', tsCode)
        .order('ann_date', { ascending: false })
        .limit(10);
      
      setData(annData || []);
      setLoading(false);
    }
    fetchData();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8">加载中...</div>;
  if (data.length === 0) return <div className="text-center py-8 text-gray-400">暂无公告</div>;

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {data.map((item, idx) => (
        <a
          key={idx}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <div className="text-sm font-medium text-gray-900 line-clamp-1">{item.title}</div>
          <div className="text-xs text-gray-400 mt-1">{item.ann_date}</div>
        </a>
      ))}
    </div>
  );
}

// ─── 股东面板 ─────────────────────────────────────────────────────────────────
function HoldersPanel({ tsCode }: { tsCode: string }) {
  const [data, setData] = useState<StockHolder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data: latestDate } = await supabase
        .from('stock_holders')
        .select('end_date')
        .eq('ts_code', tsCode)
        .order('end_date', { ascending: false })
        .limit(1)
        .single();

      if (latestDate) {
        const { data: holdersData } = await supabase
          .from('stock_holders')
          .select('holder_name, hold_ratio, holder_type')
          .eq('ts_code', tsCode)
          .eq('end_date', latestDate.end_date)
          .order('hold_ratio', { ascending: false })
          .limit(10);
        
        // 去重
        const holderMap = new Map<string, StockHolder>();
        holdersData?.forEach(h => {
          const existing = holderMap.get(h.holder_name);
          if (!existing || h.hold_ratio > existing.hold_ratio) {
            holderMap.set(h.holder_name, h);
          }
        });
        
        setData(Array.from(holderMap.values()));
      }
      setLoading(false);
    }
    fetchData();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8">加载中...</div>;
  if (data.length === 0) return <div className="text-center py-8 text-gray-400">暂无数据</div>;

  const typeLabels: Record<string, string> = {
    '国资局': '国有',
    '投资公司': '机构',
    '一般企业': '企业',
    '个人': '个人',
  };

  return (
    <div className="space-y-2">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-5">{idx + 1}</span>
            <span className="text-sm">{item.holder_name}</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              {typeLabels[item.holder_type] || item.holder_type}
            </Badge>
            <span className="text-sm font-medium">{item.hold_ratio?.toFixed(2)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 公司画像面板 ────────────────────────────────────────────────────────────
function CompanyProfilePanel({ tsCode }: { tsCode: string }) {
  const [data, setData] = useState<CompanyInfo | null>(null);
  const [aiData, setAiData] = useState<CompanyAIAnalysis | null>(null);
  const [managers, setManagers] = useState<CompanyManager[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      // 获取基础信息
      const { data: companyData } = await supabase
        .from('stock_company_info')
        .select('*')
        .eq('ts_code', tsCode)
        .single();
      
      // 获取AI分析
      const { data: aiAnalysis } = await supabase
        .from('stock_company_ai_analysis')
        .select('*')
        .eq('ts_code', tsCode)
        .maybeSingle();
      
      // 获取管理层信息
      const { data: managersData } = await supabase
        .from('stock_company_managers')
        .select('*')
        .eq('ts_code', tsCode)
        .order('begin_date', { ascending: false })
        .limit(10);
      
      setData(companyData);
      setAiData(aiAnalysis);
      setManagers(managersData || []);
      setLoading(false);
    }
    fetchData();
  }, [tsCode]);

  if (loading) return <div className="text-center py-8">加载中...</div>;

  return (
    <div className="space-y-6">
      {/* 基本信息 */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Building2 size={16} /> 公司基本信息
          {data?.industry && (
            <Badge variant="secondary" className="text-xs">{data.industry}</Badge>
          )}
        </h4>
        {data ? (
          <div className="space-y-4">
            {/* 核心信息 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-gray-500">股票名称：</span>{data.name || '--'}</div>
              <div><span className="text-gray-500">股票代码：</span>{data.symbol || '--'}</div>
              <div><span className="text-gray-500">市场类型：</span>{data.market || '--'}</div>
              <div><span className="text-gray-500">所属行业：</span>{data.industry || '--'}</div>
            </div>
            
            {/* 上市信息 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-gray-500">上市日期：</span>{data.list_date || '--'}</div>
              <div><span className="text-gray-500">交易所：</span>{data.exchange || '--'}</div>
              <div><span className="text-gray-500">上市状态：</span>{data.list_status === 'L' ? '上市' : data.list_status || '--'}</div>
              <div><span className="text-gray-500">沪深港通：</span>{data.is_hs === 'N' ? '否' : data.is_hs || '--'}</div>
            </div>
            
            {/* 工商信息 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-gray-500">公司全称：</span>{data.com_name || '--'}</div>
              <div><span className="text-gray-500">成立日期：</span>{data.setup_date || '--'}</div>
              <div><span className="text-gray-500">注册资本：</span>{data.reg_capital ? fmtMoney(data.reg_capital) : '--'}</div>
              <div><span className="text-gray-500">员工人数：</span>{data.employees ? `${data.employees}人` : '--'}</div>
            </div>
            
            {/* 地址信息 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">注册地址：</span>{data.province}{data.city}</div>
              <div><span className="text-gray-500">办公地址：</span>{data.office || '--'}</div>
            </div>
            
            {/* 实控人信息 */}
            {(data.act_name || data.act_ent_type) && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">实控人：</span>{data.act_name || '--'}</div>
                <div><span className="text-gray-500">企业性质：</span>{data.act_ent_type || '--'}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">暂无数据</div>
        )}
      </div>

      {/* 主营业务 */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Activity size={16} /> 主营业务
        </h4>
        {data?.main_business ? (
          <p className="text-sm text-gray-700 leading-relaxed">{data.main_business}</p>
        ) : (
          <div className="text-gray-400 text-sm">暂无数据</div>
        )}
      </div>

      {/* 公司简介 */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <FileText size={16} /> 公司简介
        </h4>
        {data?.introduction ? (
          <p className="text-sm text-gray-700 leading-relaxed">{data.introduction}</p>
        ) : (
          <div className="text-gray-400 text-sm">暂无数据</div>
        )}
      </div>

      {/* 联系方式 */}
      {data && (
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Globe size={16} /> 联系方式
          </h4>
          <div className="space-y-2 text-sm">
            {data.website && (
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-gray-400" />
                <a href={data.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {data.website}
                </a>
              </div>
            )}
            {data.email && (
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-gray-400" />
                <span>{data.email}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 管理层 */}
      {(data?.chairman || data?.manager || data?.secretary || managers.length > 0) && (
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <User size={16} /> 管理层
          </h4>
          
          {/* 核心管理层（来自 stock_company） */}
          {(data?.chairman || data?.manager || data?.secretary) && (
            <div className="grid grid-cols-3 gap-3 text-sm mb-4">
              {data.chairman && (
                <div className="bg-gray-50 p-3 rounded-lg text-center">
                  <div className="text-gray-500 text-xs">董事长</div>
                  <div className="font-medium">{data.chairman}</div>
                </div>
              )}
              {data.manager && (
                <div className="bg-gray-50 p-3 rounded-lg text-center">
                  <div className="text-gray-500 text-xs">总经理</div>
                  <div className="font-medium">{data.manager}</div>
                </div>
              )}
              {data.secretary && (
                <div className="bg-gray-50 p-3 rounded-lg text-center">
                  <div className="text-gray-500 text-xs">董秘</div>
                  <div className="font-medium">{data.secretary}</div>
                </div>
              )}
            </div>
          )}
          
          {/* 详细管理层列表（来自 stock_company_managers） */}
          {managers.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 mb-2">高管团队详情</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {managers.map((manager, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded-lg text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">{manager.name}</span>
                        {manager.edu && (
                          <span className="text-xs text-gray-500 ml-2">{manager.edu}</span>
                        )}
                      </div>
                      {manager.begin_date && (
                        <span className="text-xs text-gray-400">
                          上任: {manager.begin_date}
                        </span>
                      )}
                    </div>
                    {manager.resume && (
                      <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {manager.resume}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 数据来源标注 */}
      <div className="flex items-center gap-4 text-xs text-gray-400 border-t pt-4">
        <span>数据来源：</span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-400"></div>
          Tushare Pro
        </span>
        {aiData && (
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-purple-400"></div>
            AI 深度分析
          </span>
        )}
      </div>

      {/* AI 分析部分 */}
      <div className="border-t pt-6 mt-6">
        <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Activity size={16} className="text-purple-500" /> 
          AI 智能分析
          {aiData?.ai_analyzed_at && (
            <span className="text-xs text-gray-400 font-normal">
              (分析于 {new Date(aiData.ai_analyzed_at).toLocaleDateString()})
            </span>
          )}
        </h4>
        
        {aiData ? (
          <div className="space-y-4">
            {aiData.moat && (
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-purple-700 mb-2">护城河分析</div>
                <p className="text-sm text-gray-700 leading-relaxed">{aiData.moat}</p>
              </div>
            )}
            {aiData.competitive_advantage && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-blue-700 mb-2">竞争优势</div>
                <p className="text-sm text-gray-700 leading-relaxed">{aiData.competitive_advantage}</p>
              </div>
            )}
            {aiData.risk_factors && (
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-red-700 mb-2">风险因素</div>
                <p className="text-sm text-gray-700 leading-relaxed">{aiData.risk_factors}</p>
              </div>
            )}
            {aiData.growth_potential && (
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-green-700 mb-2">成长潜力</div>
                <p className="text-sm text-gray-700 leading-relaxed">{aiData.growth_potential}</p>
              </div>
            )}
            {aiData.industry_position && (
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-orange-700 mb-2">行业地位</div>
                <p className="text-sm text-gray-700 leading-relaxed">{aiData.industry_position}</p>
              </div>
            )}
            {aiData.valuation_analysis && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-700 mb-2">估值分析</div>
                <p className="text-sm text-gray-700 leading-relaxed">{aiData.valuation_analysis}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <div className="text-gray-400 text-sm mb-2">AI 分析数据待生成</div>
            <div className="text-xs text-gray-300">系统将自动分析公司基本面、行业地位和风险因素</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面组件 ──────────────────────────────────────────────────────────────
export default function StockDetail() {
  const params = useParams<{ ts_code: string }>();
  const search = useSearch();
  const tsCode = params.ts_code || '';
  const from = new URLSearchParams(search).get('from') || 'dashboard';

  const [stock, setStock] = useState<StockMeta | null>(null);
  const [klineData, setKlineData] = useState<StockDaily[]>([]);
  const [klinePeriod, setKlinePeriod] = useState<'day' | 'week' | 'month'>('day');
  const [intradayFreq, setIntradayFreq] = useState<'1min' | '5min' | '15min' | '30min' | '60min'>('5min');
  const [activeChartTab, setActiveChartTab] = useState<'kline' | 'intraday'>('kline');
  const [loading, setLoading] = useState(true);

  // 获取股票基本信息和K线数据
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      
      // 获取股票基本信息
      const { data: stockData } = await supabase
        .from('stock_meta')
        .select('*')
        .eq('ts_code', tsCode)
        .single();
      
      setStock(stockData);
      setLoading(false);
    }
    
    if (tsCode) {
      fetchData();
    }
  }, [tsCode]);

  // 根据周期获取K线数据
  useEffect(() => {
    async function fetchKlineData() {
      if (!tsCode || activeChartTab !== 'kline') return;
      
      let tableName = 'stock_daily';
      let limit = 120;
      
      switch (klinePeriod) {
        case 'week':
          tableName = 'stock_weekly';
          limit = 52; // 52周
          break;
        case 'month':
          tableName = 'stock_monthly';
          limit = 24; // 24个月
          break;
        default:
          tableName = 'stock_daily';
          limit = 120; // 120天
      }
      
      const { data } = await supabase
        .from(tableName)
        .select('trade_date, open, high, low, close, vol, amount, pct_chg')
        .eq('ts_code', tsCode)
        .order('trade_date', { ascending: false })
        .limit(limit);
      
      setKlineData(data || []);
    }
    
    fetchKlineData();
  }, [tsCode, klinePeriod, activeChartTab]);

  // 获取分时数据
  useEffect(() => {
    async function fetchIntradayData() {
      if (!tsCode || activeChartTab !== 'intraday') return;
      
      // 获取最近5个交易日的分时数据
      const { data } = await supabase
        .from('stock_mins')
        .select('trade_date, trade_time, open, high, low, close, vol, amount')
        .eq('ts_code', tsCode)
        .eq('freq', intradayFreq)
        .order('trade_date', { ascending: false })
        .order('trade_time', { ascending: false })
        .limit(240); // 约5个交易日
      
      // 转换为与K线数据兼容的格式
      const formattedData = (data || []).map(d => ({
        trade_date: `${d.trade_date} ${d.trade_time}`,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        vol: d.vol,
        amount: d.amount,
        pct_chg: 0 // 分时数据没有涨跌幅
      })).reverse();
      
      setKlineData(formattedData);
    }
    
    fetchIntradayData();
  }, [tsCode, intradayFreq, activeChartTab]);

  // 返回路径
  const backPath = from === 'topdown' ? '/topdown' : '/dashboard';
  const backText = from === 'topdown' ? '返回选股' : '返回驾驶舱';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-4">股票不存在</div>
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

      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href={backPath}>
              <Button variant="ghost" size="sm" className="gap-1">
                <ArrowLeft size={16} />
                {backText}
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-bold">{stock.name_cn}</h1>
              <div className="text-sm text-gray-400">{stock.ts_code} · {stock.industry}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{stock.market}</Badge>
            <Badge variant="outline">{stock.area}</Badge>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-12 gap-4">
          {/* 左侧：K线图 */}
          <div className="col-span-8">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 size={18} />
                    行情走势
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Tabs value={activeChartTab} onValueChange={(v) => setActiveChartTab(v as any)}>
                      <TabsList className="h-8">
                        <TabsTrigger value="intraday" className="text-xs px-3">分时</TabsTrigger>
                        <TabsTrigger value="kline" className="text-xs px-3">K线</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {activeChartTab === 'kline' ? (
                      <Tabs value={klinePeriod} onValueChange={(v) => setKlinePeriod(v as any)}>
                        <TabsList className="h-8">
                          <TabsTrigger value="day" className="text-xs px-2">日K</TabsTrigger>
                          <TabsTrigger value="week" className="text-xs px-2">周K</TabsTrigger>
                          <TabsTrigger value="month" className="text-xs px-2">月K</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    ) : (
                      <Tabs value={intradayFreq} onValueChange={(v) => setIntradayFreq(v as any)}>
                        <TabsList className="h-8">
                          <TabsTrigger value="1min" className="text-xs px-2">1分</TabsTrigger>
                          <TabsTrigger value="5min" className="text-xs px-2">5分</TabsTrigger>
                          <TabsTrigger value="15min" className="text-xs px-2">15分</TabsTrigger>
                          <TabsTrigger value="30min" className="text-xs px-2">30分</TabsTrigger>
                          <TabsTrigger value="60min" className="text-xs px-2">60分</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <TradingViewChart 
                  data={klineData} 
                  period={activeChartTab === 'intraday' ? 'intraday' : klinePeriod} 
                />
              </CardContent>
            </Card>

            {/* 财务趋势 */}
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp size={18} />
                  财务趋势（年报）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FinaTrendPanel tsCode={tsCode} />
              </CardContent>
            </Card>

            {/* 公告 */}
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText size={18} />
                  最新公告
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AnnouncementPanel tsCode={tsCode} />
              </CardContent>
            </Card>
          </div>

          {/* 右侧：信息面板 */}
          <div className="col-span-4 space-y-4">
            {/* 基本面 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity size={18} />
                  估值指标
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FundamentalsPanel tsCode={tsCode} />
              </CardContent>
            </Card>

            {/* 资金流向 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign size={18} />
                  资金流向
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyFlowPanel tsCode={tsCode} />
              </CardContent>
            </Card>

            {/* 股东 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users size={18} />
                  TOP10 股东
                </CardTitle>
              </CardHeader>
              <CardContent>
                <HoldersPanel tsCode={tsCode} />
              </CardContent>
            </Card>

            {/* 公司画像 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 size={18} />
                  公司画像
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CompanyProfilePanel tsCode={tsCode} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
