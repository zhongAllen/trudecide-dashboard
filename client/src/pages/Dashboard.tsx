import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import {
  TrendingUp, TrendingDown, Minus, Settings, RefreshCw,
  Newspaper, Globe, Map, BarChart3, Wallet, ChevronRight,
  Edit3, Check, X, Plus, AlertTriangle, ExternalLink,
  Tag, Clock, History, GitCommit
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LineChart, Line, ResponsiveContainer, Tooltip as ReTooltip, YAxis
} from 'recharts';
import { supabase } from '@/lib/supabase';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup
} from 'react-simple-maps';

// ─────────────────────────────────────────────
// 版本类型定义
// ─────────────────────────────────────────────
interface AppVersion {
  id: number;
  version: string;
  released_at: string;
  changes: string;
  author: string;
  is_major: boolean;
}

// ─────────────────────────────────────────────
// 版本徽章组件
// ─────────────────────────────────────────────
function VersionBadge() {
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<AppVersion | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVersions() {
      const { data } = await supabase
        .from('app_versions')
        .select('*')
        .order('released_at', { ascending: false });
      if (data && data.length > 0) {
        setVersions(data);
        setCurrentVersion(data[0]);
      }
      setLoading(false);
    }
    fetchVersions();
  }, []);

  // 格式化为北京时间
  const formatBJTime = (utcTime: string) => {
    const date = new Date(utcTime);
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="w-16 h-5 bg-gray-200 rounded animate-pulse" />;
  }

  if (!currentVersion) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowHistory(true)}
        className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors border border-blue-200"
        title="点击查看版本历史"
      >
        <Tag size={12} />
        <span>{currentVersion.version}</span>
      </button>

      {/* 版本历史弹窗 */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <History size={18} className="text-blue-600" />
                <h3 className="font-semibold text-gray-900">版本历史</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                <X size={16} />
              </Button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <div className="space-y-4">
                {versions.map((v, idx) => (
                  <div
                    key={v.id}
                    className={`relative pl-4 pb-4 ${idx !== versions.length - 1 ? 'border-l-2 border-gray-200' : ''}`}
                  >
                    {/* 时间线节点 */}
                    <div className={`absolute left-0 top-0 w-3 h-3 rounded-full -translate-x-[7px] ${
                      idx === 0 ? 'bg-blue-500 ring-4 ring-blue-100' : 'bg-gray-300'
                    }`} />

                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{v.version}</span>
                        {idx === 0 && (
                          <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">当前</Badge>
                        )}
                        {v.is_major && (
                          <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">重要</Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                      <Clock size={12} />
                      <span>{formatBJTime(v.released_at)}</span>
                      <span className="text-gray-300">·</span>
                      <GitCommit size={12} />
                      <span>{v.author}</span>
                    </div>

                    <p className="text-sm text-gray-700 leading-relaxed">{v.changes}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50">
              <Button className="w-full" onClick={() => setShowHistory(false)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────
interface Holding {
  id: number;
  ts_code: string;
  name_cn: string;
  cost_price: number;
  shares: number;
  strategy_note: string;
  source: string;
  is_active: boolean;
}

interface StockPrice {
  ts_code: string;
  close: number;
  pct_chg: number;
  trade_date: string;
}

interface IndicatorMeta {
  id: string;
  name_cn: string;
  category: string;
  unit: string;
  frequency: string;
}

interface IndicatorValue {
  indicator_id: string;
  trade_date: string;
  value: number;
}

interface GlobalIndex {
  ts_code: string;
  trade_date: string;
  close: number;
  pct_chg: number;
}

interface AreaStat {
  area: string;
  avg_pct_chg: number;
  stock_count: number;
}

interface NewsItem {
  date?: string;
  pub_time?: string;
  title: string;
  content?: string;
  src?: string;
}

interface DashboardConfig {
  user_id: string;
  indicator_ids: string[];
  layout: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// 全局指数配置（与 index_daily 中实际存在的 ts_code 对齐）
// ─────────────────────────────────────────────
const GLOBAL_INDICES = [
  { ts_code: '000001.SH', label: '上证指数', country: 'CN', coords: [116.4, 39.9] as [number, number] },
  { ts_code: '000300.SH', label: '沪深300', country: 'CN', coords: [121.5, 31.2] as [number, number] },
  { ts_code: 'HSI', label: '恒生指数', country: 'HK', coords: [114.2, 22.3] as [number, number] },
  { ts_code: 'N225', label: '日经225', country: 'JP', coords: [139.7, 35.7] as [number, number] },
  { ts_code: 'DJI', label: '道琼斯', country: 'US', coords: [-74.0, 40.7] as [number, number] },
  { ts_code: 'SPX', label: '标普500', country: 'US', coords: [-87.6, 41.8] as [number, number] },
  { ts_code: 'FTSE', label: '富时100', country: 'UK', coords: [-0.1, 51.5] as [number, number] },
  { ts_code: 'GDAXI', label: '德国DAX', country: 'DE', coords: [8.7, 50.1] as [number, number] },
];

// 默认指标配置
const DEFAULT_INDICATOR_IDS = ['pmi_mfg', 'cpi_yoy', 'm2_yoy', 'lpr_1y', 'bond_yield_10y', 'north_net_flow'];

// 中国省份名称映射（stock_meta.area → 地图 GeoJSON name）
const PROVINCE_MAP: Record<string, string> = {
  '上海': '上海市', '北京': '北京市', '浙江': '浙江省', '江苏': '江苏省',
  '深圳': '广东省', '广东': '广东省', '山东': '山东省', '湖北': '湖北省',
  '四川': '四川省', '安徽': '安徽省', '福建': '福建省', '湖南': '湖南省',
  '河南': '河南省', '陕西': '陕西省', '重庆': '重庆市', '天津': '天津市',
  '辽宁': '辽宁省', '吉林': '吉林省', '黑龙江': '黑龙江省', '河北': '河北省',
  '山西': '山西省', '内蒙古': '内蒙古自治区', '广西': '广西壮族自治区',
  '海南': '海南省', '贵州': '贵州省', '云南': '云南省', '西藏': '西藏自治区',
  '甘肃': '甘肃省', '青海': '青海省', '宁夏': '宁夏回族自治区',
  '新疆': '新疆维吾尔自治区', '江西': '江西省', '其他': '',
};

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────
function fmtPct(v: number | null | undefined, digits = 2) {
  if (v == null) return '—';
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}%` : `${s}%`;
}

function fmtPrice(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toFixed(2);
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
  return v.toFixed(2);
}

function pctColor(v: number | null | undefined) {
  if (v == null) return 'text-gray-500';
  if (v > 0) return 'text-red-500';
  if (v < 0) return 'text-green-600';
  return 'text-gray-500';
}

function pctBg(v: number) {
  if (v > 2) return '#ef4444';
  if (v > 0.5) return '#f97316';
  if (v > 0) return '#fca5a5';
  if (v < -2) return '#16a34a';
  if (v < -0.5) return '#22c55e';
  if (v < 0) return '#86efac';
  return '#e5e7eb';
}

// ─────────────────────────────────────────────
// 子组件：迷你折线图
// ─────────────────────────────────────────────
function MiniChart({ data, color = '#3b82f6' }: { data: number[]; color?: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={chartData}>
        <YAxis domain={['auto', 'auto']} hide />
        <ReTooltip
          formatter={(v: number) => [v.toFixed(2), '']}
          contentStyle={{ fontSize: 10, padding: '2px 6px' }}
        />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────
// 子组件：指标卡片
// ─────────────────────────────────────────────
function IndicatorCard({
  meta, values, onRemove, editMode
}: {
  meta: IndicatorMeta;
  values: IndicatorValue[];
  onRemove?: () => void;
  editMode: boolean;
}) {
  const latest = values[0];
  const prev = values[1];
  const change = latest && prev ? latest.value - prev.value : null;
  const chartData = [...values].reverse().map(v => v.value);

  const unitLabel = meta.unit || '';
  const catColor: Record<string, string> = {
    macro: 'bg-blue-50 text-blue-700',
    equity: 'bg-purple-50 text-purple-700',
    fx: 'bg-orange-50 text-orange-700',
  };

  return (
    <Card className="relative hover:shadow-md transition-shadow">
      {editMode && (
        <button
          onClick={onRemove}
          className="absolute -top-2 -right-2 z-10 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
        >
          <X size={10} />
        </button>
      )}
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">{meta.name_cn}</p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg font-bold text-gray-900">
                {latest ? latest.value.toFixed(2) : '—'}
              </span>
              <span className="text-xs text-gray-400">{unitLabel}</span>
            </div>
          </div>
          <Badge className={`text-xs ${catColor[meta.category] || 'bg-gray-50 text-gray-600'} border-0 ml-1`}>
            {meta.category}
          </Badge>
        </div>
        {change != null && (
          <div className={`text-xs mb-1 ${change > 0 ? 'text-red-500' : change < 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {change > 0 ? '▲' : change < 0 ? '▼' : '—'} {Math.abs(change).toFixed(2)} 环比
          </div>
        )}
        {chartData.length > 1 && (
          <MiniChart data={chartData} color={change != null && change >= 0 ? '#ef4444' : '#16a34a'} />
        )}
        <p className="text-xs text-gray-400 mt-1">
          {latest?.trade_date?.slice(0, 7) || '—'} · {meta.frequency}
        </p>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────
export default function Dashboard() {
  // 数据状态
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [stockPrices, setStockPrices] = useState<Record<string, StockPrice>>({});
  const [indicatorMetas, setIndicatorMetas] = useState<IndicatorMeta[]>([]);
  const [indicatorValues, setIndicatorValues] = useState<Record<string, IndicatorValue[]>>({});
  const [globalIndices, setGlobalIndices] = useState<Record<string, GlobalIndex>>({});
  const [areaStats, setAreaStats] = useState<AreaStat[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [flashNews, setFlashNews] = useState<NewsItem[]>([]);
  const [configIndicatorIds, setConfigIndicatorIds] = useState<string[]>(DEFAULT_INDICATOR_IDS);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // UI 状态
  const [editMode, setEditMode] = useState(false);
  const [showIndicatorPicker, setShowIndicatorPicker] = useState(false);
  const [activeNewsTab, setActiveNewsTab] = useState<'cctv' | 'flash'>('cctv');

  // ─── 加载配置 ───
  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from('dashboard_config')
      .select('indicator_ids')
      .eq('user_id', 'default')
      .single();
    if (data?.indicator_ids && Array.isArray(data.indicator_ids)) {
      setConfigIndicatorIds(data.indicator_ids);
    }
  }, []);

  // ─── 保存配置 ───
  const saveConfig = useCallback(async (ids: string[]) => {
    await supabase
      .from('dashboard_config')
      .upsert({ user_id: 'default', indicator_ids: ids, updated_at: new Date().toISOString() });
  }, []);

  // ─── 加载持仓 ───
  const loadHoldings = useCallback(async () => {
    const { data } = await supabase
      .from('portfolio_holdings')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    setHoldings(data || []);
    return data || [];
  }, []);

  // ─── 加载股价（持仓股票） ───
  const loadStockPrices = useCallback(async (tsCodes: string[]) => {
    if (tsCodes.length === 0) return;
    const { data: latestDate } = await supabase
      .from('stock_daily')
      .select('trade_date')
      .order('trade_date', { ascending: false })
      .limit(1);
    if (!latestDate?.[0]) return;
    const td = latestDate[0].trade_date;
    const { data } = await supabase
      .from('stock_daily')
      .select('ts_code, close, pct_chg, trade_date')
      .in('ts_code', tsCodes)
      .eq('trade_date', td);
    const map: Record<string, StockPrice> = {};
    (data || []).forEach(r => { map[r.ts_code] = r; });
    setStockPrices(map);
  }, []);

  // ─── 加载指标元数据 ───
  const loadIndicatorMetas = useCallback(async () => {
    const { data } = await supabase
      .from('indicator_meta')
      .select('id, name_cn, category, unit, frequency')
      .eq('region', 'CN')
      .order('category');
    setIndicatorMetas(data || []);
  }, []);

  // ─── 加载指标值 ───
  const loadIndicatorValues = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data } = await supabase
      .from('indicator_values')
      .select('indicator_id, trade_date, value')
      .in('indicator_id', ids)
      .order('trade_date', { ascending: false })
      .limit(ids.length * 24); // 每个指标最多24期
    const map: Record<string, IndicatorValue[]> = {};
    (data || []).forEach(r => {
      if (!map[r.indicator_id]) map[r.indicator_id] = [];
      if (map[r.indicator_id].length < 24) map[r.indicator_id].push(r);
    });
    setIndicatorValues(map);
  }, []);

  // ─── 加载全球指数 ───
  const loadGlobalIndices = useCallback(async () => {
    const codes = GLOBAL_INDICES.map(i => i.ts_code);
    const { data } = await supabase
      .from('index_daily')
      .select('ts_code, trade_date, close, pct_chg')
      .in('ts_code', codes)
      .order('trade_date', { ascending: false })
      .limit(codes.length * 3);
    const map: Record<string, GlobalIndex> = {};
    (data || []).forEach(r => {
      if (!map[r.ts_code]) map[r.ts_code] = r;
    });
    setGlobalIndices(map);
  }, []);

  // ─── 加载省份涨跌（中国地图热力） ───
  const loadAreaStats = useCallback(async () => {
    // 获取最新交易日
    const { data: latestDate } = await supabase
      .from('stock_daily')
      .select('trade_date')
      .order('trade_date', { ascending: false })
      .limit(1);
    if (!latestDate?.[0]) return;
    const td = latestDate[0].trade_date;

    // 获取该日所有股票涨跌幅
    const { data: daily } = await supabase
      .from('stock_daily')
      .select('ts_code, pct_chg')
      .eq('trade_date', td)
      .not('pct_chg', 'is', null);

    if (!daily || daily.length === 0) return;

    // 获取股票省份信息
    const tsCodes = daily.map(r => r.ts_code);
    // 分批查询（避免 URL 过长）
    const batchSize = 500;
    const areaMap: Record<string, string> = {};
    for (let i = 0; i < tsCodes.length; i += batchSize) {
      const batch = tsCodes.slice(i, i + batchSize);
      const { data: meta } = await supabase
        .from('stock_meta')
        .select('ts_code, area')
        .in('ts_code', batch)
        .not('area', 'is', null);
      (meta || []).forEach(r => { areaMap[r.ts_code] = r.area; });
    }

    // 按省份聚合
    const areaData: Record<string, { sum: number; count: number }> = {};
    daily.forEach(r => {
      const area = areaMap[r.ts_code];
      if (!area || area === '其他') return;
      if (!areaData[area]) areaData[area] = { sum: 0, count: 0 };
      areaData[area].sum += r.pct_chg;
      areaData[area].count += 1;
    });

    const stats: AreaStat[] = Object.entries(areaData)
      .map(([area, { sum, count }]) => ({
        area,
        avg_pct_chg: sum / count,
        stock_count: count,
      }))
      .sort((a, b) => b.avg_pct_chg - a.avg_pct_chg);
    setAreaStats(stats);
  }, []);

  // ─── 加载新闻联播 ───
  const loadNews = useCallback(async () => {
    const { data } = await supabase
      .from('cctv_news')
      .select('date, title, content')
      .order('date', { ascending: false })
      .limit(20);
    setNews((data || []).map(r => ({ date: r.date, title: r.title, content: r.content })));
  }, []);

  // ─── 加载实时财经新闻（AI摘要源） ───
  const loadFlashNews = useCallback(async () => {
    const { data } = await supabase
      .from('news')
      .select('pub_time, title, source')
      .order('pub_time', { ascending: false })
      .limit(30);
    setFlashNews((data || []).map(r => ({
      pub_time: r.pub_time,
      title: r.title,
      src: r.source || '财经快讯'
    })));
  }, []);

  // ─── 初始化加载 ───
  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadConfig(),
      loadIndicatorMetas(),
      loadGlobalIndices(),
      loadAreaStats(),
      loadNews(),
      loadFlashNews(),
    ]);
    const holdingsData = await loadHoldings();
    if (holdingsData.length > 0) {
      await loadStockPrices(holdingsData.map(h => h.ts_code));
    }
    setLoading(false);
    setLastUpdated(new Date().toLocaleTimeString('zh-CN'));
  }, [loadConfig, loadIndicatorMetas, loadGlobalIndices, loadAreaStats, loadNews, loadFlashNews, loadHoldings, loadStockPrices]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 当配置的指标 ID 变化时，重新加载指标值
  useEffect(() => {
    if (configIndicatorIds.length > 0) {
      loadIndicatorValues(configIndicatorIds);
    }
  }, [configIndicatorIds, loadIndicatorValues]);

  // ─── 计算持仓汇总 ───
  const holdingSummary = holdings.map(h => {
    const price = stockPrices[h.ts_code];
    const currentPrice = price?.close ?? h.cost_price;
    const pnl = (currentPrice - h.cost_price) * h.shares;
    const pnlPct = ((currentPrice - h.cost_price) / h.cost_price) * 100;
    const marketValue = currentPrice * h.shares;
    return { ...h, currentPrice, pnl, pnlPct, marketValue, pct_chg: price?.pct_chg ?? 0 };
  });

  const totalMarketValue = holdingSummary.reduce((s, h) => s + h.marketValue, 0);
  const totalPnl = holdingSummary.reduce((s, h) => s + h.pnl, 0);
  const totalCost = holdingSummary.reduce((s, h) => s + h.cost_price * h.shares, 0);
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  // ─── 指标配置操作 ───
  const handleRemoveIndicator = (id: string) => {
    const newIds = configIndicatorIds.filter(i => i !== id);
    setConfigIndicatorIds(newIds);
    saveConfig(newIds);
  };

  const handleAddIndicator = (id: string) => {
    if (configIndicatorIds.includes(id)) return;
    const newIds = [...configIndicatorIds, id];
    setConfigIndicatorIds(newIds);
    saveConfig(newIds);
  };

  // ─── 地图颜色 ───
  const getProvinceColor = (geoName: string) => {
    const stat = areaStats.find(s => {
      const mapped = PROVINCE_MAP[s.area];
      return mapped === geoName || s.area === geoName;
    });
    if (!stat) return '#f3f4f6';
    return pctBg(stat.avg_pct_chg);
  };

  const getProvinceTooltip = (geoName: string) => {
    const stat = areaStats.find(s => {
      const mapped = PROVINCE_MAP[s.area];
      return mapped === geoName || s.area === geoName;
    });
    if (!stat) return geoName;
    return `${stat.area}: ${fmtPct(stat.avg_pct_chg)} (${stat.stock_count}家)`;
  };

  // ─────────────────────────────────────────────
  // 渲染
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="text-blue-600" size={20} />
          <span className="font-semibold text-gray-900">Trudecide 驾驶舱</span>
          <VersionBadge />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">更新于 {lastUpdated}</span>
          <Button variant="ghost" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Link href="/admin/data">
            <Button variant="outline" size="sm" className="text-xs">数据资产</Button>
          </Link>
          <Link href="/knowledge">
            <Button variant="outline" size="sm" className="text-xs">知识库</Button>
          </Link>
          <Link href="/topdown">
            <Button variant="outline" size="sm" className="text-xs">选股</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 py-4 space-y-4">

        {/* ─── 区域 1：顶部摘要栏 ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 总市值 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet size={14} className="text-blue-500" />
                <span className="text-xs text-gray-500">持仓总市值</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {holdings.length > 0 ? fmtMoney(totalMarketValue) : <span className="text-gray-400 text-base">暂无持仓</span>}
              </div>
              {holdings.length > 0 && (
                <div className="text-xs text-gray-400 mt-1">{holdings.length} 只股票</div>
              )}
            </CardContent>
          </Card>

          {/* 今日盈亏 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {totalPnl >= 0 ? <TrendingUp size={14} className="text-red-500" /> : <TrendingDown size={14} className="text-green-600" />}
                <span className="text-xs text-gray-500">累计盈亏</span>
              </div>
              <div className={`text-2xl font-bold ${holdings.length > 0 ? pctColor(totalPnl) : 'text-gray-400'}`}>
                {holdings.length > 0 ? fmtMoney(totalPnl) : '—'}
              </div>
              {holdings.length > 0 && (
                <div className={`text-xs mt-1 ${pctColor(totalPnlPct)}`}>{fmtPct(totalPnlPct)}</div>
              )}
            </CardContent>
          </Card>

          {/* 沪深300 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Globe size={14} className="text-blue-500" />
                <span className="text-xs text-gray-500">沪深300</span>
              </div>
              {globalIndices['000300.SH'] ? (
                <>
                  <div className="text-2xl font-bold text-gray-900">
                    {fmtPrice(globalIndices['000300.SH'].close)}
                  </div>
                  <div className={`text-xs mt-1 ${pctColor(globalIndices['000300.SH'].pct_chg)}`}>
                    {fmtPct(globalIndices['000300.SH'].pct_chg)} · {globalIndices['000300.SH'].trade_date}
                  </div>
                </>
              ) : (
                <div className="text-gray-400 text-base">—</div>
              )}
            </CardContent>
          </Card>

          {/* 上证指数 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Globe size={14} className="text-purple-500" />
                <span className="text-xs text-gray-500">上证指数</span>
              </div>
              {globalIndices['000001.SH'] ? (
                <>
                  <div className="text-2xl font-bold text-gray-900">
                    {fmtPrice(globalIndices['000001.SH'].close)}
                  </div>
                  <div className={`text-xs mt-1 ${pctColor(globalIndices['000001.SH'].pct_chg)}`}>
                    {fmtPct(globalIndices['000001.SH'].pct_chg)} · {globalIndices['000001.SH'].trade_date}
                  </div>
                </>
              ) : (
                <div className="text-gray-400 text-base">—</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── 区域 2+3：持仓 + 指标看板 ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* 持仓表现（左 2/5） */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wallet size={14} className="text-blue-500" />
                当前持仓
              </CardTitle>
              <Link href="/dashboard/holdings">
                <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7">
                  管理持仓 <ChevronRight size={12} />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {holdings.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Wallet size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-400">暂无持仓记录</p>
                  <Link href="/dashboard/holdings">
                    <Button variant="outline" size="sm" className="mt-3 text-xs">
                      <Plus size={12} className="mr-1" /> 添加持仓
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">股票</th>
                        <th className="text-right px-2 py-2 text-gray-500 font-medium">现价</th>
                        <th className="text-right px-2 py-2 text-gray-500 font-medium">今日</th>
                        <th className="text-right px-4 py-2 text-gray-500 font-medium">盈亏</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdingSummary.map(h => (
                        <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <Link href={`/stock/${h.ts_code}?from=dashboard`}>
                              <div className="cursor-pointer group">
                                <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{h.name_cn || h.ts_code}</div>
                                <div className="text-gray-400 group-hover:text-blue-400 transition-colors">{h.ts_code}</div>
                                {h.strategy_note && (
                                  <div className="text-gray-400 truncate max-w-[120px]" title={h.strategy_note}>
                                    {h.strategy_note}
                                  </div>
                                )}
                              </div>
                            </Link>
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <div className="font-medium">{fmtPrice(h.currentPrice)}</div>
                            <div className="text-gray-400">成本 {fmtPrice(h.cost_price)}</div>
                          </td>
                          <td className={`px-2 py-2.5 text-right font-medium ${pctColor(h.pct_chg)}`}>
                            {fmtPct(h.pct_chg)}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-medium ${pctColor(h.pnl)}`}>
                            <div>{fmtMoney(h.pnl)}</div>
                            <div className="text-xs">{fmtPct(h.pnlPct)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {holdings.length > 0 && (
                      <tfoot>
                        <tr className="bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-600">合计</td>
                          <td className="px-2 py-2 text-right text-gray-600">{fmtMoney(totalMarketValue)}</td>
                          <td className="px-2 py-2"></td>
                          <td className={`px-4 py-2 text-right font-bold ${pctColor(totalPnl)}`}>
                            <div>{fmtMoney(totalPnl)}</div>
                            <div className="text-xs">{fmtPct(totalPnlPct)}</div>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 可配置指标看板（右 3/5） */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 size={14} className="text-blue-500" />
                关注指标
                <Badge variant="outline" className="text-xs">{configIndicatorIds.length} 个</Badge>
              </CardTitle>
              <div className="flex gap-1">
                {editMode ? (
                  <>
                    <Button
                      variant="ghost" size="sm"
                      className="text-xs text-blue-600 h-7"
                      onClick={() => setShowIndicatorPicker(true)}
                    >
                      <Plus size={12} className="mr-1" /> 添加指标
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="text-xs text-green-600 h-7"
                      onClick={() => setEditMode(false)}
                    >
                      <Check size={12} className="mr-1" /> 完成
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost" size="sm"
                    className="text-xs text-gray-500 h-7"
                    onClick={() => setEditMode(true)}
                  >
                    <Edit3 size={12} className="mr-1" /> 编辑
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {configIndicatorIds.map(id => {
                    const meta = indicatorMetas.find(m => m.id === id);
                    if (!meta) return null;
                    return (
                      <IndicatorCard
                        key={id}
                        meta={meta}
                        values={indicatorValues[id] || []}
                        editMode={editMode}
                        onRemove={() => handleRemoveIndicator(id)}
                      />
                    );
                  })}
                  {editMode && (
                    <button
                      onClick={() => setShowIndicatorPicker(true)}
                      className="h-24 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors"
                    >
                      <Plus size={20} />
                      <span className="text-xs mt-1">添加指标</span>
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── 区域 4：双地图 ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* 全球市场气泡地图 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe size={14} className="text-blue-500" />
                全球主要市场
                <span className="text-xs text-gray-400 font-normal">气泡大小 = 指数点位，颜色 = 涨跌</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="h-52 bg-gray-50 rounded-lg overflow-hidden">
                <ComposableMap
                  projectionConfig={{ scale: 130, center: [30, 20] }}
                  width={800}
                  height={400}
                  style={{ width: '100%', height: '100%' }}
                >
                  <ZoomableGroup zoom={1} center={[30, 20]}>
                    <Geographies geography="/world-110m.json">
                      {({ geographies }) =>
                        geographies.map(geo => (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill="#e5e7eb"
                            stroke="#fff"
                            strokeWidth={0.5}
                            style={{ default: { outline: 'none' }, hover: { outline: 'none', fill: '#d1d5db' }, pressed: { outline: 'none' } }}
                          />
                        ))
                      }
                    </Geographies>
                    {GLOBAL_INDICES.map(idx => {
                      const data = globalIndices[idx.ts_code];
                      if (!data) return null;
                      const color = data.pct_chg > 0 ? '#ef4444' : data.pct_chg < 0 ? '#16a34a' : '#9ca3af';
                      const radius = Math.max(8, Math.min(20, Math.abs(data.close) / 500));
                      return (
                        <Marker key={idx.ts_code} coordinates={idx.coords}>
                          <circle r={radius} fill={color} fillOpacity={0.8} stroke="#fff" strokeWidth={1} />
                          <text
                            textAnchor="middle"
                            y={-radius - 3}
                            style={{ fontSize: 8, fill: '#374151', fontWeight: 600 }}
                          >
                            {idx.label}
                          </text>
                          <text
                            textAnchor="middle"
                            y={radius + 10}
                            style={{ fontSize: 7, fill: color }}
                          >
                            {fmtPct(data.pct_chg)}
                          </text>
                        </Marker>
                      );
                    })}
                  </ZoomableGroup>
                </ComposableMap>
              </div>
              {/* 指数列表 */}
              <div className="mt-2 grid grid-cols-4 gap-1">
                {GLOBAL_INDICES.map(idx => {
                  const data = globalIndices[idx.ts_code];
                  return (
                    <div key={idx.ts_code} className="text-center p-1 rounded bg-gray-50">
                      <div className="text-xs text-gray-500 truncate">{idx.label}</div>
                      <div className="text-xs font-medium text-gray-900">
                        {data ? data.close.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '—'}
                      </div>
                      <div className={`text-xs ${data ? pctColor(data.pct_chg) : 'text-gray-400'}`}>
                        {data ? fmtPct(data.pct_chg) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 中国省份热力图 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Map size={14} className="text-blue-500" />
                A股省份热力图
                <span className="text-xs text-gray-400 font-normal">按注册地省份平均涨跌幅着色</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="h-52 bg-gray-50 rounded-lg overflow-hidden">
                <ComposableMap
                  projection="geoMercator"
                  projectionConfig={{ scale: 600, center: [105, 36] }}
                  width={800}
                  height={600}
                  style={{ width: '100%', height: '100%' }}
                >
                  <Geographies geography="/china-provinces-topo.json">
                    {({ geographies }) =>
                      geographies.map(geo => {
                        // TopoJSON 中省份名是"北京市"，数据库 area 字段是"北京"，做前缀匹配
                        const fullName = geo.properties.name || '';
                        const shortName = fullName.replace(/[市省自治区维吾尔回族壮族]/g, '').replace('特别行政区', '').trim();
                        const color = getProvinceColor(fullName) || getProvinceColor(shortName);
                        const tooltip = getProvinceTooltip(fullName) || getProvinceTooltip(shortName);
                        const name = fullName;
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill={color}
                            stroke="#fff"
                            strokeWidth={0.5}
                            title={tooltip}
                            style={{
                              default: { outline: 'none' },
                              hover: { outline: 'none', opacity: 0.8, cursor: 'pointer' },
                              pressed: { outline: 'none' }
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>
                </ComposableMap>
              </div>
              {/* 图例 + Top5 */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <div className="flex gap-0.5">
                    {['#16a34a', '#22c55e', '#86efac', '#e5e7eb', '#fca5a5', '#f97316', '#ef4444'].map(c => (
                      <div key={c} className="w-4 h-3 rounded-sm" style={{ background: c }} />
                    ))}
                  </div>
                  <span>跌多 → 涨多</span>
                </div>
                <div className="flex gap-2">
                  {areaStats.slice(0, 3).map(s => (
                    <div key={s.area} className="text-xs text-center">
                      <div className="text-gray-600">{s.area}</div>
                      <div className={pctColor(s.avg_pct_chg)}>{fmtPct(s.avg_pct_chg)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── 区域 5：新闻大事件快览 ─── */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Newspaper size={14} className="text-blue-500" />
              近期大事件快览
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant={activeNewsTab === 'cctv' ? 'default' : 'ghost'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setActiveNewsTab('cctv')}
              >
                新闻联播
              </Button>
              <Button
                variant={activeNewsTab === 'flash' ? 'default' : 'ghost'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setActiveNewsTab('flash')}
              >
                AI 摘要
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeNewsTab === 'cctv' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {news.length === 0 ? (
                  <div className="col-span-3 text-center py-6 text-gray-400 text-sm">
                    暂无新闻数据
                  </div>
                ) : (
                  news.slice(0, 9).map((item, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 line-clamp-2 leading-snug">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400">{item.date || item.pub_time}</span>
                            <Badge variant="outline" className="text-xs py-0 h-4 text-gray-400">新闻联播</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* 实时财经快讯 */
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-blue-600 text-white text-xs">实时快讯</Badge>
                    <span className="text-xs text-gray-400">
                      {flashNews.length > 0 && flashNews[0].pub_time
                        ? new Date(flashNews[0].pub_time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '—'} · 来自新闻数据库
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">最新市场动态</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {flashNews.length === 0 ? (
                      <div className="text-sm text-gray-400 py-2">暂无实时新闻</div>
                    ) : (
                      flashNews.slice(0, 8).map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <Badge className="bg-gray-100 text-gray-600 border-0 text-xs flex-shrink-0">
                            {item.src || '快讯'}
                          </Badge>
                          <p className="text-sm text-gray-700 line-clamp-2">{item.title}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Newspaper size={12} />
                  <span>实时采集自多个财经数据源，每日更新</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ─── 指标选择器弹窗 ─── */}
      {showIndicatorPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">选择关注指标</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowIndicatorPicker(false)}>
                <X size={16} />
              </Button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {['macro', 'equity', 'fx'].map(cat => {
                const catMetas = indicatorMetas.filter(m => m.category === cat);
                const catLabel = { macro: '宏观经济', equity: '股市/资金', fx: '汇率/外部' }[cat];
                return (
                  <div key={cat} className="mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{catLabel}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {catMetas.map(m => {
                        const selected = configIndicatorIds.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            onClick={() => selected ? handleRemoveIndicator(m.id) : handleAddIndicator(m.id)}
                            className={`text-left p-2 rounded-lg border text-xs transition-colors ${
                              selected
                                ? 'border-blue-400 bg-blue-50 text-blue-700'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            }`}
                          >
                            <div className="font-medium">{m.name_cn}</div>
                            <div className="text-gray-400 mt-0.5">{m.unit} · {m.frequency}</div>
                            {selected && <Check size={10} className="text-blue-500 mt-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t">
              <Button className="w-full" onClick={() => setShowIndicatorPicker(false)}>
                确认（已选 {configIndicatorIds.length} 个）
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
