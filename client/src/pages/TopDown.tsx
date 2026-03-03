/**
 * TopDown.tsx — Top-Down 选股策略 Demo
 *
 * 三层递进结构：
 *   Layer 1: 宏观择时（indicator_values + indicator_meta）
 *   Layer 2: 板块轮动（sector_meta + sector_daily）
 *   Layer 3: 个股精选（sector_stock_map + stock_meta + stock_daily）
 *
 * 当前为 Mock 数据模式，字段与数据库完全一致。
 * 接库时：将 MOCK_DATA 替换为 Supabase REST API 调用即可。
 *
 * K线数据源：
 *   - 日/周/月：stock_daily 表（Mock）
 *   - T日分时（5min/30min/1h）：新浪财经实时接口
 *     https://quotes.sina.com.cn/cn/sh/minute/[code].json
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'wouter';
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus, ChevronRight,
  BarChart2, Activity, Globe, Layers, Star, RefreshCw,
  ArrowUpRight, ArrowDownRight, Info, X, Search
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, ReferenceLine, Area, AreaChart
} from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MACRO_SIGNALS, MACRO_VALUES, MACRO_INDICATORS,
  MACRO_MATRIX_CN, MACRO_MATRIX_US,
  SECTOR_META_LIST, SECTOR_DAILY_MAP, getSectorLatest,
  getSectorStocks, genStockKline, getStockBasePrice, genStockProfile,
  type MacroSignal, type MacroMatrix, type MatrixCell, type MatrixRegion,
  type SectorMeta, type StockMeta, type StockDaily
} from '@/data/topdown-mock';

// ─── 颜色常量 ──────────────────────────────────────────────────────────────────
const UP_COLOR   = '#ef4444';
const DOWN_COLOR = '#22c55e';
const FLAT_COLOR = '#94a3b8';

function pctColor(v: number) {
  if (v > 0.01) return UP_COLOR;
  if (v < -0.01) return DOWN_COLOR;
  return FLAT_COLOR;
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────
function fmtPct(v: number, digits = 2) {
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(digits)}%`;
}
function fmtNum(v: number, digits = 2) {
  return v.toLocaleString('zh-CN', { maximumFractionDigits: digits });
}
function fmtMv(v: number) {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万亿`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}千亿`;
  return `${v.toFixed(0)}亿`;
}

// ─── 宏观信号徽章 ─────────────────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: MacroSignal['signal'] }) {
  if (signal === 'bullish') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <TrendingUp className="w-3 h-3" /> 偏多
    </span>
  );
  if (signal === 'bearish') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
      <TrendingDown className="w-3 h-3" /> 偏空
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
      <Minus className="w-3 h-3" /> 中性
    </span>
  );
}

// ─── 宏观指标迷你折线图 ───────────────────────────────────────────────────────
function MiniLineChart({ indicatorId, color = '#3b82f6' }: { indicatorId: string; color?: string }) {
  const values = MACRO_VALUES[indicatorId] ?? [];
  const data = values.slice(-12).map(v => ({ v: v.value, d: v.trade_date.slice(0, 7) }));
  if (data.length === 0) return <div className="h-12 bg-gray-50 rounded" />;
  const min = Math.min(...data.map(d => d.v));
  const max = Math.max(...data.map(d => d.v));
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`grad-${indicatorId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={[min * 0.98, max * 1.02]} hide />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#grad-${indicatorId})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── 矩阵单元格评分颜色 ──────────────────────────────────────────────────────
function cellScoreColor(score: number): string {
  if (score >= 70) return '#ef4444'; // 红色偏多
  if (score >= 55) return '#f59e0b'; // 橙色中性偏多
  if (score >= 45) return '#94a3b8'; // 灰色中性
  if (score >= 30) return '#3b82f6'; // 蓝色中性偏空
  return '#22c55e'; // 绿色偏空
}

// 矩阵单元格背景色（浅色版）
function cellBgClass(score: number): string {
  if (score >= 70) return 'bg-red-50 border-red-100';
  if (score >= 55) return 'bg-amber-50 border-amber-100';
  if (score >= 45) return 'bg-gray-50 border-gray-100';
  if (score >= 30) return 'bg-blue-50 border-blue-100';
  return 'bg-green-50 border-green-100';
}

// 矩阵单元格状态标签颜色
function cellStatusClass(score: number): string {
  if (score >= 70) return 'text-red-700 bg-red-100';
  if (score >= 55) return 'text-amber-700 bg-amber-100';
  if (score >= 45) return 'text-gray-600 bg-gray-100';
  if (score >= 30) return 'text-blue-700 bg-blue-100';
  return 'text-green-700 bg-green-100';
}

// 趋势箭头
function TrendArrow({ trend }: { trend: MatrixCell['trend'] }) {
  if (trend === 'up') return <ArrowUpRight className="w-3 h-3 text-red-500" />;
  if (trend === 'down') return <ArrowDownRight className="w-3 h-3 text-green-600" />;
  return <Minus className="w-3 h-3 text-gray-400" />;
}

// 数据质量标记
function DataQualityBadge({ quality }: { quality: MatrixCell['data_quality'] }) {
  if (quality === 'mock') return (
    <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0 rounded font-medium">测试</span>
  );
  if (quality === 'warn') return (
    <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0 rounded font-medium">⚠</span>
  );
  return null;
}

// ─── Layer 1: 宏观状态矩阵面板 ───────────────────────────────────────────────
function MacroPanel({ onNext }: { onNext: () => void }) {
  const [region, setRegion] = useState<MatrixRegion>('CN');
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const matrix: MacroMatrix = region === 'CN' ? MACRO_MATRIX_CN : MACRO_MATRIX_US;

  const periods: { key: 'short' | 'mid' | 'long'; label: string; sub: string }[] = [
    { key: 'short', label: '短期', sub: '3-9 个月' },
    { key: 'mid',   label: '中期', sub: '2-3 年' },
    { key: 'long',  label: '长期', sub: '5-10 年' },
  ];

  // 综合评分（取短期 summary 分数）
  const shortScore = matrix.summary.short.score;
  const isPositive = shortScore >= 60;

  return (
    <div className="space-y-3">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900">宏观状态矩阵</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs">
                基于 indicator_values 表中的宏观指标，对四个维度在三个时间周期内进行综合评估。
                评分 0-100，≥70 偏多（红），45-70 中性（灰/橙），≤45 偏空（绿/蓝）。
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2">
          {/* 地区切换 */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setRegion('CN')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                region === 'CN' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🇨🇳 中国
            </button>
            <button
              onClick={() => setRegion('US')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                region === 'US' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🇺🇸 美国
            </button>
          </div>
          <span className="text-xs text-gray-400">快照: {matrix.snapshot_date} 模型: {matrix.model_version}</span>
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">⚠ 测试数据</span>
        </div>
      </div>

      {/* 矩阵表格 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* 表头 */}
        <div className="grid grid-cols-[140px_80px_1fr_1fr_1fr] bg-gray-50 border-b border-gray-200">
          <div className="px-3 py-2.5 text-xs font-semibold text-gray-500">维度</div>
          <div className="px-2 py-2.5 text-xs font-semibold text-gray-500 text-center">对A股影响</div>
          {periods.map(p => (
            <div key={p.key} className="px-3 py-2.5 text-center border-l border-gray-200">
              <div className="text-xs font-bold text-gray-700">{p.label}</div>
              <div className="text-[10px] text-gray-400">{p.sub}</div>
            </div>
          ))}
        </div>

        {/* 数据行 */}
        {matrix.rows.map((row, ri) => (
          <div key={row.dimension} className={`grid grid-cols-[140px_80px_1fr_1fr_1fr] border-b border-gray-100 ${
            ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
          }`}>
            {/* 维度名称 */}
            <div className="px-3 py-3 flex items-center">
              <span className="text-sm font-semibold text-gray-800">{row.dimension}</span>
            </div>
            {/* 对A股影响 */}
            <div className="px-2 py-3 flex items-center justify-center">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                row.a_stock_corr === '正相关' ? 'text-emerald-700 bg-emerald-50' :
                row.a_stock_corr === '负相关' ? 'text-rose-700 bg-rose-50' :
                'text-gray-500 bg-gray-100'
              }`}>
                {row.a_stock_corr}
              </span>
            </div>
            {/* 三个时间周期单元格 */}
            {periods.map(p => {
              const cell = row[p.key];
              const cellKey = `${row.dimension}-${p.key}`;
              const isExpanded = expandedCell === cellKey;
              return (
                <div
                  key={p.key}
                  className={`px-3 py-3 border-l border-gray-100 cursor-pointer transition-all hover:brightness-95 ${
                    cellBgClass(cell.score)
                  }`}
                  onClick={() => setExpandedCell(isExpanded ? null : cellKey)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${cellStatusClass(cell.score)}`}>
                      {cell.status}
                    </span>
                    <div className="flex items-center gap-1">
                      <TrendArrow trend={cell.trend} />
                      <DataQualityBadge quality={cell.data_quality} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 bg-white/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${cell.score}%`, background: cellScoreColor(cell.score) }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums" style={{ color: cellScoreColor(cell.score) }}>
                      {cell.score}
                    </span>
                  </div>
                  {/* 展开详情 */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-white/50">
                      <p className="text-[11px] text-gray-600 leading-relaxed">{cell.desc}</p>
                      {cell.indicators.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {cell.indicators.slice(0, 2).map(id => {
                            const meta = MACRO_INDICATORS.find(m => m.id === id);
                            const vals = MACRO_VALUES[id] ?? [];
                            const latest = vals[vals.length - 1];
                            return (
                              <div key={id} className="bg-white/70 rounded p-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500">{meta?.name_cn ?? id}</span>
                                  <span className="text-[11px] font-bold text-gray-800">
                                    {latest ? `${latest.value}${meta?.unit ?? ''}` : '—'}
                                  </span>
                                </div>
                                <MiniLineChart indicatorId={id} color={cellScoreColor(cell.score)} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* 综合评估行 */}
        <div className="grid grid-cols-[140px_80px_1fr_1fr_1fr] bg-gray-100/80 border-t-2 border-gray-300">
          <div className="px-3 py-3 flex items-center">
            <span className="text-sm font-bold text-gray-700">综合评估</span>
          </div>
          <div className="px-2 py-3 flex items-center justify-center">
            <span className="text-[10px] text-gray-400">—</span>
          </div>
          {periods.map(p => {
            const cell = matrix.summary[p.key];
            return (
              <div key={p.key} className={`px-3 py-3 border-l border-gray-200 ${cellBgClass(cell.score)}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${cellStatusClass(cell.score)}`}>
                    {cell.status}
                  </span>
                  <TrendArrow trend={cell.trend} />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${cell.score}%`, background: cellScoreColor(cell.score) }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums" style={{ color: cellScoreColor(cell.score) }}>
                    {cell.score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 进入板块轮动按钮 */}
      <button
        onClick={onNext}
        className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
          isPositive
            ? 'bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-200'
            : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
        }`}
      >
        {isPositive ? (
          <><TrendingUp className="w-4 h-4" /> 宏观偏多，进入板块轮动 <ChevronRight className="w-4 h-4" /></>
        ) : (
          <><TrendingDown className="w-4 h-4" /> 宏观偏弱，谨慎进入板块轮动 <ChevronRight className="w-4 h-4" /></>
        )}
      </button>
    </div>
  );
}

// ─── Layer 2: 板块轮动面板 ────────────────────────────────────────────────────
type SectorFilter = 'all' | '行业板块' | '概念板块' | '风格板块';

function SectorPanel({ onSelectSector }: { onSelectSector: (s: SectorMeta) => void }) {
  const [filter, setFilter] = useState<SectorFilter>('行业板块');
  const [sortBy, setSortBy] = useState<'pct' | 'mv' | 'turnover'>('pct');
  const [search, setSearch] = useState('');

  const filtered = SECTOR_META_LIST
    .filter(s => filter === 'all' || s.idx_type === filter)
    .filter(s => !search || s.name_cn.includes(search))
    .map(s => {
      const latest = getSectorLatest(s.id);
      return { ...s, latest };
    })
    .sort((a, b) => {
      if (sortBy === 'pct') return (b.latest?.pct_change ?? 0) - (a.latest?.pct_change ?? 0);
      if (sortBy === 'mv') return (b.latest?.total_mv ?? 0) - (a.latest?.total_mv ?? 0);
      return (b.latest?.turnover_rate ?? 0) - (a.latest?.turnover_rate ?? 0);
    });

  return (
    <div className="space-y-3">
      {/* 过滤栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {(['行业板块', '概念板块', '风格板块', 'all'] as SectorFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {f === 'all' ? '全部' : f}
            </button>
          ))}
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 ml-auto">
          {[['pct', '涨跌幅'], ['mv', '市值'], ['turnover', '换手率']] .map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSortBy(k as typeof sortBy)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${sortBy === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索板块"
            className="pl-6 pr-3 py-1 text-xs border border-gray-200 rounded-lg bg-white w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* 板块热力图 + 列表 */}
      <div className="grid grid-cols-4 gap-1.5">
        {filtered.slice(0, 20).map(s => {
          const pct = s.latest?.pct_change ?? 0;
          const intensity = Math.min(Math.abs(pct) / 5, 1);
          const bg = pct > 0
            ? `rgba(239,68,68,${0.1 + intensity * 0.5})`
            : pct < 0
              ? `rgba(34,197,94,${0.1 + intensity * 0.5})`
              : 'rgba(148,163,184,0.1)';
          return (
            <button
              key={s.id}
              onClick={() => onSelectSector(s)}
              className="relative p-2 rounded-lg border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all text-left group"
              style={{ background: bg }}
            >
              <div className="text-xs font-semibold text-gray-800 truncate">{s.name_cn}</div>
              <div className="text-sm font-bold mt-0.5" style={{ color: pctColor(pct) }}>
                {fmtPct(pct)}
              </div>
              {s.latest?.turnover_rate && (
                <div className="text-xs text-gray-400">换手 {s.latest.turnover_rate.toFixed(1)}%</div>
              )}
              <ChevronRight className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300 group-hover:text-blue-400 transition-colors" />
            </button>
          );
        })}
      </div>

      {/* 板块排行榜 */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">板块排行（今日）</span>
          <span className="text-xs text-gray-400">{filtered.length} 个板块</span>
        </div>
        <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
          {filtered.slice(0, 15).map((s, i) => {
            const pct = s.latest?.pct_change ?? 0;
            return (
              <button
                key={s.id}
                onClick={() => onSelectSector(s)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left group"
              >
                <span className="text-xs text-gray-400 w-4 text-center">{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-gray-800">{s.name_cn}</span>
                <span className="text-xs text-gray-400">{s.idx_type}</span>
                <span className="text-sm font-bold w-16 text-right tabular-nums" style={{ color: pctColor(pct) }}>
                  {fmtPct(pct)}
                </span>
                {s.latest?.up_num && (
                  <span className="text-xs text-gray-400 w-16 text-right">
                    <span className="text-red-500">{s.latest.up_num}↑</span>
                    <span className="text-gray-300 mx-1">/</span>
                    <span className="text-green-600">{s.latest.down_num}↓</span>
                  </span>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 transition-colors" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Layer 3: 个股精选面板 ────────────────────────────────────────────────────
function StockListPanel({ sector, onSelectStock }: {
  sector: SectorMeta;
  onSelectStock: (s: StockMeta) => void;
}) {
  const stocks = getSectorStocks(sector.id);
  const profiles = stocks.map(s => genStockProfile(s));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="text-sm font-semibold text-gray-800">{sector.name_cn}</span>
        <span className="text-xs text-gray-400">{sector.idx_type} · {stocks.length} 只成分股</span>
      </div>
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 gap-0 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
          <span className="col-span-2">股票</span>
          <span className="text-right">今日涨跌</span>
          <span className="text-right">现价</span>
          <span className="text-right">PE(TTM)</span>
          <span className="text-right">换手率</span>
          <span className="text-right">总市值</span>
        </div>
        <div className="divide-y divide-gray-50">
          {profiles.map((p, i) => {
            const meta = stocks[i];
            return (
              <button
                key={p.ts_code}
                onClick={() => onSelectStock(meta)}
                className="w-full grid grid-cols-7 gap-0 px-4 py-3 hover:bg-blue-50 transition-colors text-left group"
              >
                <div className="col-span-2">
                  <div className="text-sm font-semibold text-gray-900">{p.name_cn}</div>
                  <div className="text-xs text-gray-400 font-mono">{meta.symbol}</div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold tabular-nums" style={{ color: pctColor(p.pct_chg_today) }}>
                    {fmtPct(p.pct_chg_today)}
                  </span>
                </div>
                <div className="text-right text-sm font-medium text-gray-800 tabular-nums">
                  {p.close_today.toFixed(2)}
                </div>
                <div className="text-right text-sm text-gray-600 tabular-nums">{p.pe_ttm.toFixed(1)}</div>
                <div className="text-right text-sm text-gray-600 tabular-nums">{p.turnover_rate.toFixed(2)}%</div>
                <div className="text-right text-sm text-gray-600">{fmtMv(p.total_mv)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── K线图组件 ────────────────────────────────────────────────────────────────
type KlinePeriod = 'daily' | 'weekly' | 'monthly';
type IntradayPeriod = '5min' | '30min' | '60min';

// 新浪财经分时数据接口（T日实时）
// 接口：https://quotes.sina.com.cn/cn/sh/minute/[code].json
// 字段：time, price, volume, amount
interface SinaMinuteBar {
  time: string;   // "09:30"
  price: number;
  volume: number;
  amount: number;
}

// Mock 分时数据（模拟新浪财经返回格式）
function genIntradayData(basePrice: number, period: IntradayPeriod): SinaMinuteBar[] {
  const result: SinaMinuteBar[] = [];
  const stepMinutes = period === '5min' ? 5 : period === '30min' ? 30 : 60;
  const startHour = 9, startMin = 30;
  let price = basePrice;
  let totalMinutes = 0;

  while (totalMinutes < 240) { // 4小时交易时间
    const absMinutes = startHour * 60 + startMin + totalMinutes;
    const h = Math.floor(absMinutes / 60);
    const m = absMinutes % 60;
    // 跳过午休 11:30-13:00
    if (h === 11 && m >= 30) { totalMinutes += stepMinutes; continue; }
    if (h === 12) { totalMinutes += stepMinutes; continue; }
    if (h >= 15) break;

    const pct = (Math.random() - 0.49) * 0.8;
    price = parseFloat((price * (1 + pct / 100)).toFixed(2));
    if (price < 1) price = 1;
    result.push({
      time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      price,
      volume: Math.round(1e4 + Math.random() * 5e5),
      amount: parseFloat((price * (1e4 + Math.random() * 5e5) / 1e4).toFixed(2)),
    });
    totalMinutes += stepMinutes;
  }
  return result;
}

// 自定义 K 线 Tooltip
function KlineTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: StockDaily & { isUp?: boolean } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-800 text-white text-xs rounded-lg p-2.5 shadow-xl border border-slate-700">
      <div className="font-mono text-gray-300 mb-1">{d.trade_date}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-gray-400">开</span><span className="tabular-nums">{d.open?.toFixed(2)}</span>
        <span className="text-gray-400">高</span><span className="text-red-400 tabular-nums">{d.high?.toFixed(2)}</span>
        <span className="text-gray-400">低</span><span className="text-green-400 tabular-nums">{d.low?.toFixed(2)}</span>
        <span className="text-gray-400">收</span><span className="tabular-nums">{d.close?.toFixed(2)}</span>
        <span className="text-gray-400">涨跌</span><span className="tabular-nums" style={{ color: pctColor(d.pct_chg ?? 0) }}>{fmtPct(d.pct_chg ?? 0)}</span>
      </div>
    </div>
  );
}

// 分时图 Tooltip
function IntradayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SinaMinuteBar }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-800 text-white text-xs rounded-lg p-2 shadow-xl">
      <div className="font-mono text-gray-300">{d.time}</div>
      <div className="mt-1">价格 <span className="font-bold">{d.price.toFixed(2)}</span></div>
      <div>成交量 <span className="font-bold">{fmtNum(d.volume, 0)}</span></div>
    </div>
  );
}

function KlineChart({ tsCode, basePrice }: { tsCode: string; basePrice: number }) {
  const [klinePeriod, setKlinePeriod] = useState<KlinePeriod>('daily');
  const [intradayPeriod, setIntradayPeriod] = useState<IntradayPeriod>('5min');
  const [isIntraday, setIsIntraday] = useState(false);
  const [klineData, setKlineData] = useState<StockDaily[]>([]);
  const [intradayData, setIntradayData] = useState<SinaMinuteBar[]>([]);

  useEffect(() => {
    setKlineData(genStockKline(tsCode, basePrice, klinePeriod, klinePeriod === 'daily' ? 120 : klinePeriod === 'weekly' ? 80 : 60));
  }, [tsCode, basePrice, klinePeriod]);

  useEffect(() => {
    if (isIntraday) {
      setIntradayData(genIntradayData(basePrice, intradayPeriod));
    }
  }, [isIntraday, basePrice, intradayPeriod]);

  // 计算 K 线显示数据（添加 isUp 标记）
  const chartData = klineData.map(d => ({
    ...d,
    isUp: d.close >= d.open,
    // recharts 不直接支持蜡烛图，用 Bar 模拟：bodyLow/bodyHigh
    bodyLow: Math.min(d.open, d.close),
    bodyHigh: Math.max(d.open, d.close),
    bodySize: Math.abs(d.close - d.open),
    wickLow: d.low,
    wickHigh: d.high,
  }));

  const latestClose = klineData[klineData.length - 1]?.close ?? basePrice;
  const firstClose = klineData[0]?.close ?? basePrice;
  const totalPct = ((latestClose - firstClose) / firstClose) * 100;

  return (
    <div className="space-y-3">
      {/* 周期切换 */}
      <div className="flex items-center gap-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {[
            { key: 'intraday', label: '分时' },
            { key: 'daily', label: '日K' },
            { key: 'weekly', label: '周K' },
            { key: 'monthly', label: '月K' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                if (key === 'intraday') setIsIntraday(true);
                else { setIsIntraday(false); setKlinePeriod(key as KlinePeriod); }
              }}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                (key === 'intraday' && isIntraday) || (key !== 'intraday' && !isIntraday && klinePeriod === key)
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {isIntraday && (
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {(['5min', '30min', '60min'] as IntradayPeriod[]).map(p => (
              <button
                key={p}
                onClick={() => setIntradayPeriod(p)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${intradayPeriod === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {!isIntraday && (
          <span className="text-xs text-gray-400 ml-auto">
            区间涨跌：<span className="font-bold" style={{ color: pctColor(totalPct) }}>{fmtPct(totalPct)}</span>
          </span>
        )}
        {isIntraday && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full ml-auto">
            📡 Mock 分时（接库后接新浪财经实时）
          </span>
        )}
      </div>

      {/* 分时图 */}
      {isIntraday && (
        <div className="bg-slate-900 rounded-xl p-3">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={intradayData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="price" domain={['auto', 'auto']} tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} width={50} />
              <YAxis yAxisId="vol" orientation="right" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} width={40} />
              <ReTooltip content={<IntradayTooltip />} />
              <ReferenceLine yAxisId="price" y={basePrice} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
              <Bar yAxisId="vol" dataKey="volume" fill="rgba(148,163,184,0.3)" radius={[1, 1, 0, 0]} />
              <Line yAxisId="price" type="monotone" dataKey="price" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* K线图（用折线+柱状图模拟蜡烛图效果） */}
      {!isIntraday && (
        <div className="bg-slate-900 rounded-xl p-3">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData.slice(-60)} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="trade_date"
                tick={{ fill: '#94a3b8', fontSize: 9 }}
                tickLine={false}
                interval="preserveStartEnd"
                tickFormatter={v => v?.slice(4, 8) ?? ''}
              />
              <YAxis yAxisId="price" domain={['auto', 'auto']} tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} width={50} />
              <YAxis yAxisId="vol" orientation="right" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} width={40} />
              <ReTooltip content={<KlineTooltip />} />
              {/* 成交量柱 */}
              <Bar yAxisId="vol" dataKey="vol" radius={[1, 1, 0, 0]}>
                {chartData.slice(-60).map((d, i) => (
                  <Cell key={i} fill={d.isUp ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'} />
                ))}
              </Bar>
              {/* 收盘价折线 */}
              <Line yAxisId="price" type="monotone" dataKey="close" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
              {/* 最高/最低价参考线 */}
              <ReferenceLine yAxisId="price" y={Math.max(...chartData.slice(-60).map(d => d.high))} stroke="rgba(239,68,68,0.3)" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="price" y={Math.min(...chartData.slice(-60).map(d => d.low))} stroke="rgba(34,197,94,0.3)" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── 个股详情面板 ─────────────────────────────────────────────────────────────
function StockDetailPanel({ stock, onClose }: { stock: StockMeta; onClose: () => void }) {
  const profile = genStockProfile(stock);
  const basePrice = getStockBasePrice(stock.ts_code);

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-gray-900">{stock.name_cn}</h3>
            <span className="text-sm text-gray-400 font-mono">{stock.symbol}</span>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{stock.market}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-3xl font-bold tabular-nums text-gray-900">{profile.close_today.toFixed(2)}</span>
            <span className="text-lg font-bold tabular-nums" style={{ color: pctColor(profile.pct_chg_today) }}>
              {profile.pct_chg_today > 0 ? <ArrowUpRight className="inline w-5 h-5" /> : <ArrowDownRight className="inline w-5 h-5" />}
              {fmtPct(profile.pct_chg_today)}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* 关键指标卡片 */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'PE(TTM)', value: profile.pe_ttm.toFixed(1) + '倍' },
          { label: 'PB', value: profile.pb.toFixed(2) + '倍' },
          { label: '换手率', value: profile.turnover_rate.toFixed(2) + '%' },
          { label: '量比', value: profile.volume_ratio.toFixed(2) },
          { label: '总市值', value: fmtMv(profile.total_mv) },
          { label: '流通市值', value: fmtMv(profile.circ_mv) },
          { label: '52周高', value: profile.high_52w.toFixed(2) },
          { label: '52周低', value: profile.low_52w.toFixed(2) },
        ].map(item => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-2.5 text-center">
            <div className="text-xs text-gray-400">{item.label}</div>
            <div className="text-sm font-bold text-gray-800 mt-0.5">{item.value}</div>
          </div>
        ))}
      </div>

      {/* K线图 */}
      <KlineChart tsCode={stock.ts_code} basePrice={basePrice} />
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function TopDown() {
  const [activeLayer, setActiveLayer] = useState<1 | 2 | 3>(1);
  const [selectedSector, setSelectedSector] = useState<SectorMeta | null>(null);
  const [selectedStock, setSelectedStock] = useState<StockMeta | null>(null);

  const handleSelectSector = useCallback((s: SectorMeta) => {
    setSelectedSector(s);
    setSelectedStock(null);
    setActiveLayer(3);
  }, []);

  const handleSelectStock = useCallback((s: StockMeta) => {
    setSelectedStock(s);
  }, []);

  const handleBackToMacro = () => { setActiveLayer(1); setSelectedSector(null); setSelectedStock(null); };
  const handleBackToSector = () => { setActiveLayer(2); setSelectedSector(null); setSelectedStock(null); };
  const handleBackToStockList = () => { setSelectedStock(null); };

  return (
    <TooltipProvider>
      <Helmet><title>Top-Down 选股 | Trudecide</title></Helmet>
      <div className="min-h-screen bg-gray-50">
        {/* ── Header ── */}
        <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-4 shadow-lg sticky top-0 z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <button className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
                  <ArrowLeft className="w-4 h-4" /> 返回
                </button>
              </Link>
              <div className="w-px h-5 bg-white/20" />
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <h1 className="text-lg font-bold">Top-Down 选股策略</h1>
                <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">DEMO</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <span className="bg-white/10 px-2 py-1 rounded">Mock 数据 · 字段与数据库一致</span>
            </div>
          </div>
        </header>

        {/* ── 面包屑导航 ── */}
        <div className="bg-white border-b border-gray-100 px-6 py-2.5 sticky top-[64px] z-30 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 text-sm">
            <button
              onClick={handleBackToMacro}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeLayer === 1 ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <Globe className="w-3.5 h-3.5" /> 宏观择时
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <button
              onClick={handleBackToSector}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeLayer === 2 ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> 板块轮动
            </button>
            {selectedSector && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                <button
                  onClick={handleBackToStockList}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeLayer === 3 && !selectedStock ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <Star className="w-3.5 h-3.5" /> {selectedSector.name_cn}
                </button>
              </>
            )}
            {selectedStock && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-semibold">
                  <Activity className="w-3.5 h-3.5" /> {selectedStock.name_cn}
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── 主内容区 ── */}
        <main className="max-w-7xl mx-auto px-6 py-6">
          {/* 三步骤进度指示 */}
          <div className="flex items-center gap-0 mb-6 bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
            {[
              { step: 1, icon: <Globe className="w-4 h-4" />, label: '宏观择时', desc: '判断当前市场环境' },
              { step: 2, icon: <BarChart2 className="w-4 h-4" />, label: '板块轮动', desc: '找到强势板块' },
              { step: 3, icon: <Star className="w-4 h-4" />, label: '个股精选', desc: '精选板块内个股' },
            ].map(({ step, icon, label, desc }, i) => {
              const isActive = activeLayer === step;
              const isDone = activeLayer > step;
              return (
                <div key={step} className="flex items-center flex-1">
                  <button
                    onClick={() => {
                      if (step === 1) handleBackToMacro();
                      else if (step === 2) handleBackToSector();
                    }}
                    className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive ? 'bg-blue-600 text-white' : isDone ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400'}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isActive ? 'bg-white/20' : isDone ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      {isDone ? '✓' : step}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-1.5 font-semibold text-sm">{icon}{label}</div>
                      <div className={`text-xs ${isActive ? 'text-white/70' : 'text-gray-400'}`}>{desc}</div>
                    </div>
                  </button>
                  {i < 2 && <ChevronRight className={`w-4 h-4 flex-shrink-0 mx-1 ${isDone ? 'text-blue-400' : 'text-gray-200'}`} />}
                </div>
              );
            })}
          </div>

          {/* Layer 1: 宏观择时 */}
          {activeLayer === 1 && (
            <div>
              <MacroPanel onNext={() => setActiveLayer(2)} />
            </div>
          )}

          {/* Layer 2: 板块轮动 */}
          {activeLayer === 2 && (
            <div>
              <SectorPanel onSelectSector={handleSelectSector} />
            </div>
          )}

          {/* Layer 3: 个股精选 + 个股详情 */}
          {activeLayer === 3 && selectedSector && (
            <div className={`grid gap-6 ${selectedStock ? 'grid-cols-5' : 'grid-cols-1'}`}>
              {/* 个股列表 */}
              <div className={selectedStock ? 'col-span-2' : 'col-span-1'}>
                <StockListPanel sector={selectedSector} onSelectStock={handleSelectStock} />
              </div>
              {/* 个股详情 */}
              {selectedStock && (
                <div className="col-span-3 bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                  <StockDetailPanel stock={selectedStock} onClose={handleBackToStockList} />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
