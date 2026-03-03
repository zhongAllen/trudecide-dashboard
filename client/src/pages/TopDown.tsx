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
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'wouter';
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus, ChevronRight,
  BarChart2, Activity, Globe, Layers, Star, 
  ArrowUpRight, ArrowDownRight, Info, X, Search,
  ChevronDown, ChevronUp, DollarSign, Zap
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, ReferenceLine, Area, AreaChart
} from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MACRO_SIGNALS, MACRO_VALUES, MACRO_INDICATORS,
  MACRO_MATRIX_CN, MACRO_MATRIX_US,
  SECTOR_META_LIST, getSectorLatest, getSectorDailyList,
  getSectorStocks, genStockKline, getStockBasePrice, genStockProfile,
  genStockFina, genStockAnnouncements,
  getSectorMacroMapping, benefitColor,
  genStockFinaTrend, genStockHolders,
  type MacroSignal, type MacroMatrix, type MatrixCell, type MatrixRegion,
  type SectorMeta, type StockMeta, type StockDaily, type BenefitLevel,
  type FinaTrendPoint, type StockHolder
} from '@/data/topdown-mock';

// ─── 颜色常量 ──────────────────────────────────────────────────────────────────
const UP_COLOR   = '#ef4444';
const DOWN_COLOR = '#22c55e';
const FLAT_COLOR = '#94a3b8';

// ─── 分数段常量表（唯一数据源，REQ-145）─────────────────────────────────────────
// 收起时的 status label、展开后的分数段说明，均从此表派生，保证一致性
export const SCORE_BANDS = [
  { lo: 85, hi: 100, label: '极强',    color: '#dc2626' },
  { lo: 70, hi: 84,  label: '偏强',    color: '#ea580c' },
  { lo: 55, hi: 69,  label: '中性偏强', color: '#d97706' },
  { lo: 45, hi: 54,  label: '中性',    color: '#6b7280' },
  { lo: 30, hi: 44,  label: '中性偏弱', color: '#0284c7' },
  { lo: 15, hi: 29,  label: '偏弱',    color: '#2563eb' },
  { lo: 0,  hi: 14,  label: '极弱',    color: '#1d4ed8' },
] as const;

export type ScoreBand = typeof SCORE_BANDS[number];

/** 根据分数返回对应的分数段（含 label / color） */
export function getScoreBand(score: number): ScoreBand {
  return SCORE_BANDS.find(b => score >= b.lo && score <= b.hi) ?? SCORE_BANDS[3];
}

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
function fmtAmount(v: number) {
  // v 单位：万元
  if (v >= 10000) return `${(v / 10000).toFixed(1)}亿`;
  return `${v.toFixed(0)}万`;
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
  if (data.length === 0) return <div className="h-10 bg-gray-50 rounded" />;
  const min = Math.min(...data.map(d => d.v));
  const max = Math.max(...data.map(d => d.v));
  return (
    <ResponsiveContainer width="100%" height={40}>
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

// ─── 矩阵单元格评分颜色（均从 SCORE_BANDS 派生，不允许单独修改）──────────────────────────────────────────────────────────────────
function cellScoreColor(score: number): string {
  return getScoreBand(score).color;
}

function cellBgClass(score: number): string {
  if (score >= 85) return 'bg-red-50 border-red-100';
  if (score >= 70) return 'bg-orange-50 border-orange-100';
  if (score >= 55) return 'bg-amber-50 border-amber-100';
  if (score >= 45) return 'bg-gray-50 border-gray-100';
  if (score >= 30) return 'bg-sky-50 border-sky-100';
  if (score >= 15) return 'bg-blue-50 border-blue-100';
  return 'bg-indigo-50 border-indigo-100';
}

function cellStatusClass(score: number): string {
  if (score >= 85) return 'text-red-700 bg-red-100';
  if (score >= 70) return 'text-orange-700 bg-orange-100';
  if (score >= 55) return 'text-amber-700 bg-amber-100';
  if (score >= 45) return 'text-gray-600 bg-gray-100';
  if (score >= 30) return 'text-sky-700 bg-sky-100';
  if (score >= 15) return 'text-blue-700 bg-blue-100';
  return 'text-indigo-700 bg-indigo-100';
}

/** 单元格收起时显示的定性标签：直接从 SCORE_BANDS 派生，不使用 cell.status 字段 */
function cellLabel(score: number): string {
  return getScoreBand(score).label;
}

function TrendArrow({ trend }: { trend: MatrixCell['trend'] }) {
  if (trend === 'up') return <ArrowUpRight className="w-3 h-3 text-red-500" />;
  if (trend === 'down') return <ArrowDownRight className="w-3 h-3 text-green-600" />;
  return <Minus className="w-3 h-3 text-gray-400" />;
}

function DataQualityBadge({ quality }: { quality: MatrixCell['data_quality'] }) {
  if (quality === 'mock') return (
    <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0 rounded font-medium">测试</span>
  );
  if (quality === 'warn') return (
    <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0 rounded font-medium">⚠</span>
  );
  return null;
}

// ─── 宏观矩阵展开详情面板 ────────────────────────────────────────────────────
function CellExpandPanel({ cell, dimension, period }: {
  cell: MatrixCell;
  dimension: string;
  period: string;
}) {
  const [activeTab, setActiveTab] = useState<'factors' | 'indicators'>('factors');
  const scoreColor = cellScoreColor(cell.score);
  const hasFactor = cell.factors && cell.factors.length > 0;

  return (
    <div className="mt-2 pt-2 border-t border-white/50 space-y-2">
      {/* 描述 */}
      <p className="text-[11px] text-gray-700 leading-relaxed">{cell.desc}</p>

      {/* REQ-145: 切换标签 */}
      {hasFactor && (
        <div className="flex gap-1 text-[10px]">
          {(['factors', 'indicators'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                activeTab === tab ? 'text-white' : 'bg-white/60 text-gray-500 hover:bg-white/80'
              }`}
              style={activeTab === tab ? { backgroundColor: scoreColor } : {}}
            >
              {tab === 'factors' ? '得分构成' : '关联指标'}
            </button>
          ))}
        </div>
      )}

      {/* REQ-145: 因子贡献表格 */}
      {hasFactor && activeTab === 'factors' && (
        <div className="space-y-1.5">
          {cell.score_formula && (
            <div className="bg-white/70 rounded-lg px-2.5 py-1.5 border border-white/60">
              <div className="text-[9px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">得分公式</div>
              <div className="text-[10px] text-gray-600 font-mono leading-relaxed">{cell.score_formula}</div>
            </div>
          )}
          {/* 分数段说明 */}
          <div className="bg-white/70 rounded-lg px-2.5 py-2 border border-white/60">
            <div className="text-[9px] text-gray-400 font-medium uppercase tracking-wide mb-1.5">分数段说明（满分100）</div>
            <div className="flex gap-1 flex-wrap">
              {SCORE_BANDS.map(band => {
                const score = cell.score;
                const isActive = score >= band.lo && score <= band.hi;
                return (
                  <div
                    key={`${band.lo}-${band.hi}`}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border transition-all ${
                      isActive ? 'ring-1 ring-offset-0' : 'opacity-50'
                    }`}
                    style={{
                      backgroundColor: isActive ? band.color + '22' : '#f3f4f6',
                      borderColor: isActive ? band.color : '#e5e7eb',
                      color: isActive ? band.color : '#9ca3af',
                      ringColor: isActive ? band.color : 'transparent',
                    }}
                  >
                    {isActive && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: band.color }} />}
                    <span>{band.lo}–{band.hi}</span>
                    <span className="font-bold">{band.label}</span>
                    {isActive && <span className="ml-0.5 font-bold">← {score}分</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white/70 rounded-lg overflow-hidden border border-white/60">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-2 py-1 text-gray-400 font-medium">因子</th>
                  <th className="text-right px-2 py-1 text-gray-400 font-medium">当前值</th>
                  <th className="text-right px-2 py-1 text-gray-400 font-medium">权重</th>
                  <th className="text-right px-2 py-1 text-gray-400 font-medium">贡献分</th>
                </tr>
              </thead>
              <tbody>
                {cell.factors!.map((f, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white/40' : ''}>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          f.direction === '正向' ? 'bg-red-400' :
                          f.direction === '负向' ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        <span className="text-gray-700 font-medium">{f.name}</span>
                      </div>
                      {f.note && <div className="text-[9px] text-gray-400 ml-2.5 mt-0.5 leading-tight">{f.note}</div>}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-600 font-mono whitespace-nowrap">
                      {f.current_value !== null ? `${f.current_value}${f.unit}` : '—'}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-500">
                      {Math.round(f.weight * 100)}%
                    </td>
                    <td className="px-2 py-1 text-right font-bold" style={{ color: scoreColor }}>
                      +{f.contribution.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-white/60">
                  <td className="px-2 py-1 text-gray-500 font-medium" colSpan={3}>综合得分</td>
                  <td className="px-2 py-1 text-right font-bold text-sm" style={{ color: scoreColor }}>
                    {cell.score}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 关联指标面板 */}
      {(!hasFactor || activeTab === 'indicators') && (
        <>
          {cell.indicators.length > 0 ? (
            <div className="space-y-1.5">
              <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">关联指标</div>
              {cell.indicators.slice(0, 3).map(id => {
                const meta = MACRO_INDICATORS.find(m => m.id === id);
                const vals = MACRO_VALUES[id] ?? [];
                const latest = vals[vals.length - 1];
                const prev = vals[vals.length - 2];
                const change = latest && prev ? latest.value - prev.value : null;
                return (
                  <div key={id} className="bg-white/80 rounded-lg p-2 border border-white/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-500 font-medium">{meta?.name_cn ?? id}</span>
                      <div className="flex items-center gap-1">
                        {change !== null && (
                          <span className="text-[10px]" style={{ color: change > 0 ? UP_COLOR : change < 0 ? DOWN_COLOR : FLAT_COLOR }}>
                            {change > 0 ? '▲' : change < 0 ? '▼' : '—'}{Math.abs(change).toFixed(2)}
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-gray-800">
                          {latest ? `${latest.value}${meta?.unit ?? ''}` : '—'}
                        </span>
                      </div>
                    </div>
                    {vals.length > 0 && <MiniLineChart indicatorId={id} color={scoreColor} />}
                  </div>
                );
              })}
              {cell.indicators.length > 3 && (
                <div className="text-[10px] text-gray-400 text-center">
                  + {cell.indicators.length - 3} 个指标（接库后显示）
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-gray-400 bg-white/50 rounded p-2 text-center">
              暂无结构化指标数据，接库后接入
            </div>
          )}
        </>
      )}
    </div>
  );
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
                基于 indicator_values 表中的宏观指标，对五个维度在三个时间周期内进行综合评估。
                评分 0-100，≥70 偏多（红），45-70 中性（灰/橙），≤45 偏空（绿/蓝）。
                点击单元格可展开详细指标数据。
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => { setRegion('CN'); setExpandedCell(null); }}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                region === 'CN' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🇨🇳 中国
            </button>
            <button
              onClick={() => { setRegion('US'); setExpandedCell(null); }}
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
                  } ${isExpanded ? 'ring-1 ring-inset ring-blue-300' : ''}`}
                  onClick={() => setExpandedCell(isExpanded ? null : cellKey)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${cellStatusClass(cell.score)}`}>
                      {cellLabel(cell.score)}
                    </span>
                    <div className="flex items-center gap-1">
                      <TrendArrow trend={cell.trend} />
                      <DataQualityBadge quality={cell.data_quality} />
                      {isExpanded
                        ? <ChevronUp className="w-3 h-3 text-blue-400" />
                        : <ChevronDown className="w-3 h-3 text-gray-300" />
                      }
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
                    <CellExpandPanel cell={cell} dimension={row.dimension} period={p.key} />
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
                    {cellLabel(cell.score)}
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
                <p className="text-[10px] text-gray-500 mt-1 leading-relaxed line-clamp-2">{cell.desc}</p>
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

// ─── 板块迷你 K 线图 ──────────────────────────────────────────────────────────
function SectorMiniKline({ sectorId, trend }: { sectorId: string; trend: number }) {
  const data = getSectorDailyList(sectorId).slice(-20).map(d => ({
    v: d.close,
    pct: d.pct_change,
  }));
  const color = trend > 1 ? UP_COLOR : trend < -1 ? DOWN_COLOR : FLAT_COLOR;
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
        <defs>
          <linearGradient id={`sg-${sectorId.replace(/\./g, '_')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sg-${sectorId.replace(/\./g, '_')})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Layer 2: 板块轮动面板 ────────────────────────────────────────────────────
type SectorFilter = 'all' | '行业板块' | '概念板块' | '风格板块';

function SectorPanel({ onSelectSector }: { onSelectSector: (s: SectorMeta) => void }) {
  const [filter, setFilter] = useState<SectorFilter>('行业板块');
  const [sortBy, setSortBy] = useState<'pct' | 'mv' | 'turnover'>('pct');
  const [search, setSearch] = useState('');
  const [showMacroSummary, setShowMacroSummary] = useState(true);

  // 当前宏观总结论（来自 MACRO_MATRIX_CN.summary）
  const macroShort = MACRO_MATRIX_CN.summary.short;
  const macroMid = MACRO_MATRIX_CN.summary.mid;

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

  // 今日涨跌分布
  const allSectors = SECTOR_META_LIST.map(s => getSectorLatest(s.id));
  const upCount = allSectors.filter(s => (s?.pct_change ?? 0) > 0).length;
  const downCount = allSectors.filter(s => (s?.pct_change ?? 0) < 0).length;
  const flatCount = allSectors.length - upCount - downCount;

  return (
    <div className="space-y-3">
      {/* REQ-144: 宏观总结论摘要条 */}
      {showMacroSummary && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold text-blue-700">宏观底色（当前快照）</span>
              <span className="text-[10px] text-blue-400">— 以下板块推荐基于此判断</span>
            </div>
            <button onClick={() => setShowMacroSummary(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] text-gray-400 font-medium">短期（3-9月）</span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: macroShort.score >= 65 ? '#ef4444' : macroShort.score >= 50 ? '#f97316' : '#94a3b8' }}
                >
                  {macroShort.status}
                </span>
                <span className="text-[10px] font-bold ml-auto" style={{ color: macroShort.score >= 65 ? '#ef4444' : '#94a3b8' }}>
                  {macroShort.score}分
                </span>
              </div>
              <p className="text-[10px] text-gray-600 leading-relaxed">{macroShort.desc}</p>
            </div>
            <div className="bg-white/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] text-gray-400 font-medium">中期（2-3年）</span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: macroMid.score >= 65 ? '#ef4444' : macroMid.score >= 50 ? '#f97316' : '#94a3b8' }}
                >
                  {macroMid.status}
                </span>
                <span className="text-[10px] font-bold ml-auto" style={{ color: macroMid.score >= 65 ? '#ef4444' : '#94a3b8' }}>
                  {macroMid.score}分
                </span>
              </div>
              <p className="text-[10px] text-gray-600 leading-relaxed">{macroMid.desc}</p>
            </div>
          </div>
        </div>
      )}

      {/* 市场情绪概览 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{upCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">上涨板块</div>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-500">{flatCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">平盘板块</div>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{downCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">下跌板块</div>
        </div>
      </div>

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
          {[['pct', '涨跌幅'], ['mv', '市值'], ['turnover', '换手率']].map(([k, label]) => (
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

      {/* 板块热力图 */}
      <div className="grid grid-cols-5 gap-1.5">
        {filtered.slice(0, 20).map(s => {
          const pct = s.latest?.pct_change ?? 0;
          const intensity = Math.min(Math.abs(pct) / 5, 1);
          const bg = pct > 0
            ? `rgba(239,68,68,${0.08 + intensity * 0.45})`
            : pct < 0
              ? `rgba(34,197,94,${0.08 + intensity * 0.45})`
              : 'rgba(148,163,184,0.08)';
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
              <SectorMiniKline sectorId={s.id} trend={pct} />
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
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {filtered.slice(0, 20).map((s, i) => {
            const pct = s.latest?.pct_change ?? 0;
            const dailyList = getSectorDailyList(s.id);
            const prev5 = dailyList.slice(-6, -1);
            const avg5pct = prev5.length > 0
              ? prev5.reduce((sum, d) => sum + d.pct_change, 0) / prev5.length
              : 0;
            const mapping = getSectorMacroMapping(s.name_cn);
            return (
              <button
                key={s.id}
                onClick={() => onSelectSector(s)}
                className="w-full px-4 py-2.5 hover:bg-blue-50 transition-colors text-left group"
              >
                <div className="flex items-center gap-0">
                  <span className="text-xs text-gray-400 w-6 text-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-800">{s.name_cn}</span>
                      <span className="text-xs text-gray-400">{s.idx_type}</span>
                      {mapping && (
                        <>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                            style={{ backgroundColor: benefitColor(mapping.short_benefit) }}
                          >
                            短{mapping.short_benefit}
                          </span>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                            style={{ backgroundColor: benefitColor(mapping.mid_benefit), opacity: 0.75 }}
                          >
                            中{mapping.mid_benefit}
                          </span>
                        </>
                      )}
                    </div>
                    {mapping && (
                      <p className="text-[10px] text-gray-500 mt-0.5 truncate">{mapping.short_reason}</p>
                    )}
                  </div>
                  <span className="text-sm font-bold tabular-nums ml-2 flex-shrink-0" style={{ color: pctColor(pct) }}>
                    {fmtPct(pct)}
                  </span>
                  <div className="w-20 px-1 flex-shrink-0">
                    <SectorMiniKline sectorId={s.id} trend={pct} />
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums w-16 text-right flex-shrink-0">
                    5日{fmtPct(avg5pct, 1)}
                  </span>
                  {s.latest?.up_num ? (
                    <span className="text-xs w-14 text-right flex-shrink-0">
                      <span className="text-red-500">{s.latest.up_num}↑</span>
                      <span className="text-gray-300 mx-0.5">/</span>
                      <span className="text-green-600">{s.latest.down_num}↓</span>
                    </span>
                  ) : <span className="w-14" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── GARP 评分计算（硬编码规则，保证一致性）─────────────────────────────────────
// 权重：盈利质量30% + 成长性30% + 估值合理性25% + 资金关注度15%
function calcGarpScore(profile: ReturnType<typeof genStockProfile>, fina: ReturnType<typeof genStockFina>['fina']): {
  total: number;
  profitQuality: number;  // 盈利质量（ROE + 毛利率）
  growth: number;         // 成长性（净利润增速 + 营收增速）
  valuation: number;      // 估值合理性（PE/PB 行业相对分位）
  moneyflow: number;      // 资金关注度（大单净流入 + 换手率）
} {
  // 盈利质量（30分）：ROE 15分 + 毛利率 15分
  const roeScore = Math.min(Math.max((fina.roe - 5) / 25 * 15, 0), 15);
  const marginScore = Math.min(Math.max((fina.grossprofit_margin - 10) / 50 * 15, 0), 15);
  const profitQuality = parseFloat((roeScore + marginScore).toFixed(1));

  // 成长性（30分）：净利润增速 15分 + 营收增速 15分
  const npGrowthScore = Math.min(Math.max((fina.netprofit_yoy + 10) / 60 * 15, 0), 15);
  const revGrowthScore = Math.min(Math.max((fina.or_yoy + 5) / 40 * 15, 0), 15);
  const growth = parseFloat((npGrowthScore + revGrowthScore).toFixed(1));

  // 估值合理性（25分）：PE 合理性 15分 + PB 合理性 10分
  // PE < 15 满分，PE > 50 0分，线性插值
  const peScore = Math.min(Math.max((50 - profile.pe_ttm) / 35 * 15, 0), 15);
  const pbScore = Math.min(Math.max((8 - profile.pb) / 6 * 10, 0), 10);
  const valuation = parseFloat((peScore + pbScore).toFixed(1));

  // 资金关注度（15分）：大单净流入 10分 + 换手率适中 5分
  const netFlowScore = Math.min(Math.max((profile.net_amount + 1000) / 5000 * 10, 0), 10);
  // 换手率 1-3% 为最优区间，过低或过高均扣分
  const trScore = profile.turnover_rate >= 1 && profile.turnover_rate <= 3
    ? 5
    : profile.turnover_rate < 1
      ? profile.turnover_rate / 1 * 5
      : Math.max(5 - (profile.turnover_rate - 3) * 0.5, 0);
  const moneyflow = parseFloat((netFlowScore + trScore).toFixed(1));

  const total = parseFloat((profitQuality + growth + valuation + moneyflow).toFixed(1));
  return { total, profitQuality, growth, valuation, moneyflow };
}

// ─── Layer 3: 个股精选面板 ────────────────────────────────────────────────────
function StockListPanel({ sector, onSelectStock }: {
  sector: SectorMeta;
  onSelectStock: (s: StockMeta) => void;
}) {
  const stocks = getSectorStocks(sector.id);
  const profiles = stocks.map(s => genStockProfile(s));
  const finas = stocks.map(s => genStockFina(s.ts_code).fina);

  // GARP 评分
  const scored = profiles.map((p, i) => ({
    meta: stocks[i],
    profile: p,
    fina: finas[i],
    garp: calcGarpScore(p, finas[i]),
  }));

  // 筛选状态
  const [sortBy, setSortBy] = useState<'garp' | 'pct' | 'pe' | 'roe' | 'growth' | 'flow'>('garp');
  const [filterMode, setFilterMode] = useState<'default' | 'custom'>('default');
  const [minRoe, setMinRoe] = useState(0);
  const [maxPe, setMaxPe] = useState(100);
  const [minGrowth, setMinGrowth] = useState(-50);
  const [showGarpDetail, setShowGarpDetail] = useState<string | null>(null);

  // 板块宏观映射
  const mapping = getSectorMacroMapping(sector.name_cn);

  const sorted = [...scored]
    .filter(s => filterMode === 'default' || (
      s.fina.roe >= minRoe &&
      s.profile.pe_ttm <= maxPe &&
      s.fina.netprofit_yoy >= minGrowth
    ))
    .sort((a, b) => {
      switch (sortBy) {
        case 'garp': return b.garp.total - a.garp.total;
        case 'pct': return b.profile.pct_chg_today - a.profile.pct_chg_today;
        case 'pe': return a.profile.pe_ttm - b.profile.pe_ttm;
        case 'roe': return b.fina.roe - a.fina.roe;
        case 'growth': return b.fina.netprofit_yoy - a.fina.netprofit_yoy;
        case 'flow': return b.profile.net_amount - a.profile.net_amount;
        default: return 0;
      }
    });

  return (
    <div className="space-y-3">
      {/* 板块标题 + 宏观受益说明 */}
      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-sm font-semibold text-gray-800">{sector.name_cn}</span>
          <span className="text-xs text-gray-400">{sector.idx_type} · {stocks.length} 只成分股</span>
          {mapping && (
            <>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white ml-1"
                style={{ backgroundColor: benefitColor(mapping.short_benefit) }}
              >
                短期{mapping.short_benefit}
              </span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: benefitColor(mapping.mid_benefit), opacity: 0.8 }}
              >
                中期{mapping.mid_benefit}
              </span>
            </>
          )}
        </div>
        {mapping && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-orange-50 rounded-lg px-2.5 py-1.5">
              <div className="text-[10px] text-orange-600 font-semibold mb-0.5">短期逻辑</div>
              <p className="text-[10px] text-gray-600 leading-relaxed">{mapping.short_reason}</p>
            </div>
            <div className="bg-blue-50 rounded-lg px-2.5 py-1.5">
              <div className="text-[10px] text-blue-600 font-semibold mb-0.5">中期逻辑</div>
              <p className="text-[10px] text-gray-600 leading-relaxed">{mapping.mid_reason}</p>
            </div>
          </div>
        )}
        {mapping && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <span className="text-[10px] text-gray-400">受益逻辑：</span>
            <span className="text-[10px] text-gray-600">{mapping.logic}</span>
          </div>
        )}
      </div>

      {/* 筛选控制栏 */}
      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gray-700">排序方式</span>
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-wrap">
            {([
              ['garp', 'GARP综合'],
              ['pct', '今日涨跌'],
              ['pe', 'PE低→高'],
              ['roe', 'ROE高→低'],
              ['growth', '净利增速'],
              ['flow', '资金流入'],
            ] as [typeof sortBy, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className={`px-2 py-0.5 text-xs rounded-md font-medium transition-all ${
                  sortBy === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setFilterMode('default')}
              className={`px-2 py-0.5 text-xs rounded-md font-medium transition-all ${
                filterMode === 'default' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              默认
            </button>
            <button
              onClick={() => setFilterMode('custom')}
              className={`px-2 py-0.5 text-xs rounded-md font-medium transition-all ${
                filterMode === 'custom' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              自定义筛选
            </button>
          </div>
        </div>
        {filterMode === 'custom' && (
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="text-[10px] text-gray-500">ROE ≥ (%)</label>
              <input
                type="number"
                value={minRoe}
                onChange={e => setMinRoe(Number(e.target.value))}
                className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">PE ≤ (倍)</label>
              <input
                type="number"
                value={maxPe}
                onChange={e => setMaxPe(Number(e.target.value))}
                className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">净利增速 ≥ (%)</label>
              <input
                type="number"
                value={minGrowth}
                onChange={e => setMinGrowth(Number(e.target.value))}
                className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* GARP 评分说明 */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-amber-500" />
          <span className="text-[10px] font-semibold text-amber-700">GARP 默认评分规则（满分100分）</span>
        </div>
        <div className="grid grid-cols-4 gap-1 mt-1.5">
          {[
            { label: '盈利质量', weight: '30%', desc: 'ROE + 毛利率', color: 'text-red-600' },
            { label: '成长性', weight: '30%', desc: '净利增速 + 营收增速', color: 'text-orange-600' },
            { label: '估值合理', weight: '25%', desc: 'PE + PB 相对分位', color: 'text-blue-600' },
            { label: '资金关注', weight: '15%', desc: '大单净流入 + 换手率', color: 'text-purple-600' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg px-2 py-1.5">
              <div className={`text-[10px] font-bold ${item.color}`}>{item.label} <span className="text-gray-400">{item.weight}</span></div>
              <div className="text-[9px] text-gray-500 mt-0.5">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 个股列表 */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1.5fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_1.2fr] gap-0 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
          <span>股票</span>
          <span className="text-right">GARP</span>
          <span className="text-right">今日涨跌</span>
          <span className="text-right">PE(TTM)</span>
          <span className="text-right">ROE(%)</span>
          <span className="text-right">净利增速</span>
          <span className="text-right">资金净流入(万)</span>
        </div>
        <div className="divide-y divide-gray-50">
          {sorted.map(({ meta, profile: p, fina, garp }, i) => (
            <div key={p.ts_code} className="group">
              <button
                onClick={() => onSelectStock(meta)}
                className="w-full grid grid-cols-[1.5fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_1.2fr] gap-0 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                    <span className="text-sm font-semibold text-gray-900">{p.name_cn}</span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono ml-5">{meta.symbol}</div>
                </div>
                {/* GARP 综合评分 */}
                <div className="text-right">
                  <div
                    className="inline-flex items-center justify-center w-10 h-6 rounded-md text-xs font-bold text-white"
                    style={{
                      backgroundColor: garp.total >= 70 ? '#ef4444' : garp.total >= 55 ? '#f97316' : garp.total >= 40 ? '#94a3b8' : '#22c55e'
                    }}
                  >
                    {garp.total.toFixed(0)}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setShowGarpDetail(showGarpDetail === p.ts_code ? null : p.ts_code); }}
                    className="ml-1 text-[10px] text-gray-400 hover:text-blue-500"
                  >
                    {showGarpDetail === p.ts_code ? '▲' : '▼'}
                  </button>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold tabular-nums" style={{ color: pctColor(p.pct_chg_today) }}>
                    {fmtPct(p.pct_chg_today)}
                  </span>
                </div>
                <div className="text-right text-sm text-gray-600 tabular-nums">{p.pe_ttm.toFixed(1)}</div>
                <div className="text-right text-sm tabular-nums" style={{ color: fina.roe >= 15 ? '#ef4444' : fina.roe >= 8 ? '#f97316' : '#94a3b8' }}>
                  {fina.roe.toFixed(1)}
                </div>
                <div className="text-right text-sm tabular-nums" style={{ color: fina.netprofit_yoy >= 20 ? '#ef4444' : fina.netprofit_yoy >= 0 ? '#f97316' : '#22c55e' }}>
                  {fmtPct(fina.netprofit_yoy, 1)}
                </div>
                <div className="text-right text-sm tabular-nums" style={{ color: p.net_amount >= 0 ? '#ef4444' : '#22c55e' }}>
                  {p.net_amount >= 0 ? '+' : ''}{fmtNum(p.net_amount, 0)}
                </div>
              </button>
              {/* GARP 得分明细展开 */}
              {showGarpDetail === p.ts_code && (
                <div className="px-4 pb-3 bg-amber-50 border-t border-amber-100">
                  <div className="text-[10px] text-amber-700 font-semibold mb-1.5">GARP 得分构成（总分 {garp.total}）</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '盈利质量', score: garp.profitQuality, max: 30, desc: `ROE ${fina.roe.toFixed(1)}% + 毛利率 ${fina.grossprofit_margin.toFixed(1)}%`, color: '#ef4444' },
                      { label: '成长性', score: garp.growth, max: 30, desc: `净利增速 ${fmtPct(fina.netprofit_yoy, 1)} + 营收增速 ${fmtPct(fina.or_yoy, 1)}`, color: '#f97316' },
                      { label: '估值合理性', score: garp.valuation, max: 25, desc: `PE ${p.pe_ttm.toFixed(1)}倍 + PB ${p.pb.toFixed(2)}倍`, color: '#3b82f6' },
                      { label: '资金关注度', score: garp.moneyflow, max: 15, desc: `净流入 ${fmtNum(p.net_amount, 0)}万 + 换手率 ${p.turnover_rate.toFixed(2)}%`, color: '#8b5cf6' },
                    ].map(item => (
                      <div key={item.label} className="bg-white rounded-lg px-2 py-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold" style={{ color: item.color }}>{item.label}</span>
                          <span className="text-[10px] font-bold text-gray-700">{item.score}/{item.max}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1 mb-1">
                          <div
                            className="h-1 rounded-full"
                            style={{ width: `${(item.score / item.max) * 100}%`, backgroundColor: item.color }}
                          />
                        </div>
                        <div className="text-[9px] text-gray-500">{item.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 text-[9px] text-gray-400">
                    综合得分 = {garp.profitQuality}（盈利质量）+ {garp.growth}（成长性）+ {garp.valuation}（估值）+ {garp.moneyflow}（资金）= <strong>{garp.total}</strong>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── K线图组件 ────────────────────────────────────────────────────────────────
type KlinePeriod = 'daily' | 'weekly' | 'monthly';
type IntradayPeriod = '5min' | '30min' | '60min';

interface SinaMinuteBar {
  time: string;
  price: number;
  volume: number;
  amount: number;
}

function genIntradayData(basePrice: number, period: IntradayPeriod): SinaMinuteBar[] {
  const result: SinaMinuteBar[] = [];
  const stepMinutes = period === '5min' ? 5 : period === '30min' ? 30 : 60;
  const startHour = 9, startMin = 30;
  let price = basePrice;
  let totalMinutes = 0;

  while (totalMinutes < 240) {
    const absMinutes = startHour * 60 + startMin + totalMinutes;
    const h = Math.floor(absMinutes / 60);
    const m = absMinutes % 60;
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

  const chartData = klineData.map(d => ({
    ...d,
    isUp: d.close >= d.open,
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
              <Bar yAxisId="vol" dataKey="vol" radius={[1, 1, 0, 0]}>
                {chartData.slice(-60).map((d, i) => (
                  <Cell key={i} fill={d.isUp ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'} />
                ))}
              </Bar>
              <Line yAxisId="price" type="monotone" dataKey="close" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
              <ReferenceLine yAxisId="price" y={Math.max(...chartData.slice(-60).map(d => d.high))} stroke="rgba(239,68,68,0.3)" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="price" y={Math.min(...chartData.slice(-60).map(d => d.low))} stroke="rgba(34,197,94,0.3)" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── 资金流向面板 ─────────────────────────────────────────────────────────────
// 字段对应 stock_moneyflow 表：net_amount, buy_elg_amount, buy_lg_amount, buy_md_amount, buy_sm_amount
function MoneyFlowPanel({ profile }: { profile: ReturnType<typeof genStockProfile> }) {
  const netFlow = profile.net_amount;   // stock_moneyflow.net_amount（万元）
  const isNetIn = netFlow > 0;

  const items = [
    { label: '特大单', buy: profile.buy_elg_amount, sell: profile.sell_elg_amount, color: '#7c3aed' },
    { label: '大单',   buy: profile.buy_lg_amount,  sell: profile.sell_lg_amount,  color: '#ef4444' },
    { label: '中单',   buy: profile.buy_md_amount,  sell: profile.sell_md_amount,  color: '#f59e0b' },
    { label: '小单',   buy: profile.buy_sm_amount,  sell: profile.sell_sm_amount,  color: '#94a3b8' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-700">资金流向</span>
        <span className="text-xs text-gray-400">（Mock · 接库后接 stock_moneyflow 表）</span>
      </div>
      {/* 净流入汇总 */}
      <div className={`rounded-lg p-3 flex items-center justify-between ${isNetIn ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100'}`}>
        <span className="text-sm text-gray-600">今日净流入</span>
        <span className="text-lg font-bold tabular-nums" style={{ color: isNetIn ? UP_COLOR : DOWN_COLOR }}>
          {isNetIn ? '+' : ''}{fmtAmount(netFlow)}
        </span>
      </div>
      {/* 分类流向 */}
      <div className="space-y-1.5">
        {items.map(item => {
          const net = item.buy - item.sell;
          const maxVal = Math.max(item.buy, item.sell);
          return (
            <div key={item.label} className="bg-gray-50 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-600">{item.label}</span>
                <span className="text-xs font-bold tabular-nums" style={{ color: net > 0 ? UP_COLOR : DOWN_COLOR }}>
                  净{net > 0 ? '流入' : '流出'} {fmtAmount(Math.abs(net))}
                </span>
              </div>
              <div className="flex gap-1 h-2">
                <div className="flex-1 bg-gray-200 rounded-full overflow-hidden flex justify-end">
                  <div
                    className="h-full rounded-full bg-red-400"
                    style={{ width: `${(item.buy / maxVal) * 100}%` }}
                  />
                </div>
                <div className="flex-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-400"
                    style={{ width: `${(item.sell / maxVal) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-red-500">买 {fmtAmount(item.buy)}</span>
                <span className="text-[10px] text-green-600">卖 {fmtAmount(item.sell)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 基本面面板（stock_daily_basic 格式）───────────────────────────────────────────
function FundamentalsPanel({ profile }: { profile: ReturnType<typeof genStockProfile> }) {
  const items = [
    { label: 'PE(TTM)', value: profile.pe_ttm.toFixed(1), unit: '倍', field: 'pe_ttm' },
    { label: 'PB', value: profile.pb.toFixed(2), unit: '倍', field: 'pb' },
    { label: 'PS(TTM)', value: profile.ps_ttm.toFixed(2), unit: '倍', field: 'ps_ttm' },
    { label: '股息率', value: profile.dv_ratio.toFixed(2), unit: '%', field: 'dv_ratio' },
    { label: '换手率', value: profile.turnover_rate.toFixed(2), unit: '%', field: 'turnover_rate' },
    { label: '量比', value: profile.volume_ratio.toFixed(2), unit: '', field: 'volume_ratio' },
    { label: '总市値', value: fmtMv(profile.total_mv), unit: '', field: 'total_mv' },
    { label: '流通市値', value: fmtMv(profile.circ_mv), unit: '', field: 'circ_mv' },
    { label: '52周高', value: profile.high_52w.toFixed(2), unit: '', field: 'high_52w' },
    { label: '52周低', value: profile.low_52w.toFixed(2), unit: '', field: 'low_52w' },
  ];
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 flex items-center gap-1">
        <span className="bg-amber-50 border border-amber-200 text-amber-600 px-1.5 py-0.5 rounded font-medium">数据来源</span>
        stock_daily_basic 表（Mock，接库后实时更新）
      </div>
      <div className="grid grid-cols-5 gap-2">
        {items.map(item => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-gray-400 font-mono">{item.field}</div>
            <div className="text-xs text-gray-400 mt-0.5">{item.label}</div>
            <div className="text-sm font-bold text-gray-800 mt-1">{item.value}<span className="text-xs text-gray-400">{item.unit}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 财务面板（stock_fina_indicator + stock_income + stock_balance 格式）───────────────────
function FinancialPanel({ tsCode }: { tsCode: string }) {
  const { fina, income, balance } = genStockFina(tsCode);

  function fmtFinaNum(v: number | null, unit = '亿'): string {
    if (v === null) return '—';
    if (unit === '亿') return (v / 1e8).toFixed(2) + '亿';
    if (unit === '%') return v.toFixed(2) + '%';
    return v.toFixed(4);
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-400 flex items-center gap-1">
        <span className="bg-amber-50 border border-amber-200 text-amber-600 px-1.5 py-0.5 rounded font-medium">数据来源</span>
        stock_fina_indicator / stock_income / stock_balance（Mock，报告期更新）
        <span className="ml-auto text-gray-400">2025年年报 {fina.end_date}</span>
      </div>

      {/* 核心财务指标 */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-2">盈利能力（stock_fina_indicator）</div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'ROE', value: fmtFinaNum(fina.roe, '%'), field: 'roe', highlight: (fina.roe ?? 0) > 15 },
            { label: 'ROA', value: fmtFinaNum(fina.roa, '%'), field: 'roa', highlight: false },
            { label: '毛利率', value: fmtFinaNum(fina.grossprofit_margin, '%'), field: 'grossprofit_margin', highlight: false },
            { label: '净利率', value: fmtFinaNum(fina.netprofit_margin, '%'), field: 'netprofit_margin', highlight: false },
            { label: '资负率', value: fmtFinaNum(fina.debt_to_assets, '%'), field: 'debt_to_assets', highlight: (fina.debt_to_assets ?? 0) > 70 },
            { label: '流动比率', value: fina.current_ratio?.toFixed(2) ?? '—', field: 'current_ratio', highlight: false },
            { label: '归母净利同比', value: fmtFinaNum(fina.netprofit_yoy, '%'), field: 'netprofit_yoy', highlight: (fina.netprofit_yoy ?? 0) > 20 },
            { label: '营收同比', value: fmtFinaNum(fina.or_yoy, '%'), field: 'or_yoy', highlight: (fina.or_yoy ?? 0) > 15 },
          ].map(item => (
            <div key={item.label} className={`rounded-lg p-2.5 text-center border ${
              item.highlight ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
            }`}>
              <div className="text-[10px] text-gray-400 font-mono">{item.field}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
              <div className={`text-sm font-bold mt-1 ${item.highlight ? 'text-red-600' : 'text-gray-800'}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 利润表摘要 */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-2">利润表摘要（stock_income）</div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '营业总收入', value: fmtFinaNum(income.total_revenue), field: 'total_revenue' },
            { label: '营业利润', value: fmtFinaNum(income.operate_profit), field: 'operate_profit' },
            { label: '归母净利润', value: fmtFinaNum(income.n_income_attr_p), field: 'n_income_attr_p' },
            { label: '研发费用', value: fmtFinaNum(income.rd_exp), field: 'rd_exp' },
            { label: 'EBIT', value: fmtFinaNum(income.ebit), field: 'ebit' },
            { label: 'EBITDA', value: fmtFinaNum(income.ebitda), field: 'ebitda' },
            { label: '基本每股收益', value: income.basic_eps?.toFixed(4) ?? '—', field: 'basic_eps' },
            { label: '净利润', value: fmtFinaNum(income.n_income), field: 'n_income' },
          ].map(item => (
            <div key={item.label} className="bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-gray-400 font-mono">{item.field}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
              <div className="text-sm font-bold text-gray-800 mt-1">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 资产负债表摘要 */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-2">资产负债表摘要（stock_balance）</div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '总资产', value: fmtFinaNum(balance.total_assets), field: 'total_assets' },
            { label: '总负债', value: fmtFinaNum(balance.total_liab), field: 'total_liab' },
            { label: '归母净资产', value: fmtFinaNum(balance.total_hldr_eqy_exc_min_int), field: 'total_hldr_eqy_exc_min_int' },
            { label: '货币资金', value: fmtFinaNum(balance.money_cap), field: 'money_cap' },
            { label: '应收账款', value: fmtFinaNum(balance.accounts_receiv), field: 'accounts_receiv' },
            { label: '存货', value: fmtFinaNum(balance.inventories), field: 'inventories' },
            { label: '长期借款', value: fmtFinaNum(balance.lt_borr), field: 'lt_borr' },
            { label: '短期借款', value: fmtFinaNum(balance.st_borr), field: 'st_borr' },
          ].map(item => (
            <div key={item.label} className="bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-gray-400 font-mono">{item.field}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
              <div className="text-sm font-bold text-gray-800 mt-1">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 公告面板（stock_announcement 格式）───────────────────────────────────────────────────
function AnnouncementPanel({ tsCode, nameCn }: { tsCode: string; nameCn: string }) {
  const announcements = genStockAnnouncements(tsCode, nameCn);
  const typeLabel: Record<string, { label: string; color: string }> = {
    annual:  { label: '年报', color: 'bg-red-50 text-red-700 border-red-200' },
    semi:    { label: '半年报', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    quarter: { label: '季报', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    other:   { label: '临时公告', color: 'bg-gray-50 text-gray-600 border-gray-200' },
  };
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 flex items-center gap-1">
        <span className="bg-amber-50 border border-amber-200 text-amber-600 px-1.5 py-0.5 rounded font-medium">数据来源</span>
        stock_announcement 表（Mock，接库后实时同步巨潮财经公告）
      </div>
      <div className="space-y-2">
        {announcements.map((ann, i) => {
          const t = typeLabel[ann.ann_type] ?? typeLabel.other;
          return (
            <div key={i} className="bg-white border border-gray-100 rounded-lg p-3 hover:border-blue-200 hover:shadow-sm transition-all">
              <div className="flex items-start gap-2">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${t.color}`}>{t.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 font-medium leading-snug">{ann.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400 font-mono">{ann.ann_date}</span>
                    {ann.url && (
                      <a
                        href={ann.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        查看原文 ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-gray-400 text-center py-2">展示最近 6 条公告，接库后可按时间/类型过滤</div>
    </div>
  );
}

// ─── 财务趋势面板 ────────────────────────────────────────────────────────────
function FinaTrendPanel({ tsCode }: { tsCode: string }) {
  const [mode, setMode] = useState<'quarterly' | 'annual'>('quarterly');
  const [chartType, setChartType] = useState<'growth' | 'roe' | 'margin'>('growth');
  const data = genStockFinaTrend(tsCode, mode);

  const chartConfig = {
    growth: {
      title: '营收 & 净利润增速（同比 %）',
      lines: [
        { key: 'revenue_yoy', name: '营收同比', color: '#3b82f6' },
        { key: 'profit_yoy', name: '净利润同比', color: '#ef4444' },
      ],
      unit: '%',
    },
    roe: {
      title: 'ROE 趋势（%）',
      lines: [
        { key: 'roe', name: 'ROE', color: '#f59e0b' },
        { key: 'debt_ratio', name: '资产负债率', color: '#94a3b8' },
      ],
      unit: '%',
    },
    margin: {
      title: '盈利能力趋势（%）',
      lines: [
        { key: 'gross_margin', name: '毛利率', color: '#10b981' },
        { key: 'net_margin', name: '净利率', color: '#8b5cf6' },
      ],
      unit: '%',
    },
  };

  const cfg = chartConfig[chartType];

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 flex items-center gap-1">
        <span className="bg-amber-50 border border-amber-200 text-amber-600 px-1.5 py-0.5 rounded font-medium">数据来源</span>
        stock_fina_indicator + stock_income（Mock，报告期更新）
      </div>

      {/* 控制栏 */}
      <div className="flex items-center justify-between">
        {/* 周期切换 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setMode('quarterly')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
              mode === 'quarterly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >季度（近12期）</button>
          <button
            onClick={() => setMode('annual')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
              mode === 'annual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >年度（近8年）</button>
        </div>
        {/* 指标切换 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {(['growth', 'roe', 'margin'] as const).map(t => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                chartType === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'growth' ? '增速' : t === 'roe' ? 'ROE' : '利润率'}
            </button>
          ))}
        </div>
      </div>

      {/* 图表标题 */}
      <div className="text-xs font-semibold text-gray-600">{cfg.title}</div>

      {/* 折线图 */}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="period"
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              tickLine={false}
              interval={mode === 'quarterly' ? 1 : 0}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              width={38}
              tickFormatter={v => `${v}${cfg.unit}`}
            />
            <ReTooltip
              formatter={(value: number, name: string) => [`${value.toFixed(2)}${cfg.unit}`, name]}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            {chartType === 'growth' && (
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
            )}
            {cfg.lines.map(l => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={2}
                dot={{ r: 2, fill: l.color }}
                activeDot={{ r: 4 }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 数据表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left py-1.5 px-2 font-semibold text-gray-600">报告期</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-600">营收(亿)</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-600">净利润(亿)</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-600">营收同比</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-600">净利同比</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-600">ROE</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-600">毛利率</th>
            </tr>
          </thead>
          <tbody>
            {data.slice().reverse().map((d, i) => (
              <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50 ${i === 0 ? 'font-semibold bg-blue-50/30' : ''}`}>
                <td className="py-1 px-2 font-mono text-gray-600">{d.period}</td>
                <td className="py-1 px-2 text-right tabular-nums text-gray-800">{d.revenue.toFixed(2)}</td>
                <td className="py-1 px-2 text-right tabular-nums text-gray-800">{d.net_profit.toFixed(2)}</td>
                <td className="py-1 px-2 text-right tabular-nums" style={{ color: d.revenue_yoy >= 0 ? UP_COLOR : DOWN_COLOR }}>
                  {d.revenue_yoy >= 0 ? '+' : ''}{d.revenue_yoy.toFixed(2)}%
                </td>
                <td className="py-1 px-2 text-right tabular-nums" style={{ color: d.profit_yoy >= 0 ? UP_COLOR : DOWN_COLOR }}>
                  {d.profit_yoy >= 0 ? '+' : ''}{d.profit_yoy.toFixed(2)}%
                </td>
                <td className="py-1 px-2 text-right tabular-nums text-gray-700">{d.roe.toFixed(2)}%</td>
                <td className="py-1 px-2 text-right tabular-nums text-gray-700">{d.gross_margin.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 公司画布面板 ─────────────────────────────────────────────────────────────
function CompanyCanvasPanel({ stock }: { stock: StockMeta }) {
  const holders = genStockHolders(stock.ts_code);
  const typeColor: Record<string, string> = {
    state: 'bg-red-50 text-red-700 border-red-200',
    institution: 'bg-blue-50 text-blue-700 border-blue-200',
    individual: 'bg-gray-50 text-gray-600 border-gray-200',
    hk: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  const typeLabel: Record<string, string> = {
    state: '国有', institution: '机构', individual: '个人', hk: '港股通',
  };

  // 占位内容块
  const placeholderSections = [
    { title: '公司基本介绍', field: 'company_intro', hint: '主营业务、成立时间、上市时间、注册地、员工规模等基本信息' },
    { title: '业务模式', field: 'business_model', hint: '收入来源、客户结构、产品/服务体系、商业模式核心逻辑' },
    { title: '竞争壁垒', field: 'competitive_moat', hint: '核心竞争优势、行业地位、技术/品牌/规模/渠道壁垒' },
    { title: '风险因素', field: 'risk_factors', hint: '主要经营风险、行业风险、政策风险' },
  ];

  return (
    <div className="space-y-5">
      <div className="text-xs text-gray-400 flex items-center gap-1">
        <span className="bg-amber-50 border border-amber-200 text-amber-600 px-1.5 py-0.5 rounded font-medium">数据来源</span>
        stock_holders（Mock）+ 非结构化字段（待完善）
      </div>

      {/* 股东结构 */}
      <div>
        <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <span>前十大股东</span>
          <span className="text-gray-400 font-normal">（截至 2025-12-31）</span>
        </div>
        <div className="space-y-1.5">
          {holders.map((h, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-[10px] text-gray-400 font-mono w-4 flex-shrink-0">{i + 1}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${typeColor[h.holder_type]}`}>
                {typeLabel[h.holder_type]}
              </span>
              <span className="text-xs text-gray-800 flex-1 truncate">{h.holder_name}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-20 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-blue-400"
                    style={{ width: `${Math.min(h.hold_ratio / holders[0].hold_ratio * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums text-gray-700 w-12 text-right">{h.hold_ratio.toFixed(2)}%</span>
              </div>
            </div>
          ))}
        </div>
        {/* 股东类型汇总 */}
        <div className="mt-2 flex gap-3 text-[10px] text-gray-500">
          {(['state', 'institution', 'hk', 'individual'] as const).map(t => {
            const total = holders.filter(h => h.holder_type === t).reduce((s, h) => s + h.hold_ratio, 0);
            return total > 0 ? (
              <span key={t} className={`px-1.5 py-0.5 rounded border ${typeColor[t]}`}>
                {typeLabel[t]} {total.toFixed(2)}%
              </span>
            ) : null;
          })}
        </div>
      </div>

      {/* 非结构化占位内容 */}
      <div>
        <div className="text-xs font-semibold text-gray-700 mb-2">公司画像（待完善）</div>
        <div className="space-y-2">
          {placeholderSections.map(s => (
            <div key={s.field} className="border border-dashed border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-600">{s.title}</span>
                <span className="text-[10px] font-mono text-gray-300">{s.field}</span>
              </div>
              <div className="text-xs text-gray-400 italic">{s.hint}</div>
              <div className="mt-2 text-[10px] text-gray-300 bg-gray-50 rounded px-2 py-1">
                待填充 · 后续可通过管理界面录入或 AI 辅助生成
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 个股详情面板 ─────────────────────────────────────────────────────────────
function StockDetailPanel({ stock, onClose }: { stock: StockMeta; onClose: () => void }) {
  const profile = genStockProfile(stock);
  const basePrice = getStockBasePrice(stock.ts_code);
  const [activeTab, setActiveTab] = useState<'kline' | 'flow' | 'funda' | 'fina' | 'trend' | 'canvas' | 'ann'>('kline');

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-gray-900">{stock.name_cn}</h3>
            <span className="text-sm text-gray-400 font-mono">{stock.symbol}</span>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{stock.market}</span>
            <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{stock.industry}</span>
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

      {/* 头部关键指标卡片（常显） */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'PE(TTM)', value: profile.pe_ttm.toFixed(1) + '倍' },
          { label: 'PB', value: profile.pb.toFixed(2) + '倍' },
          { label: '换手率', value: profile.turnover_rate.toFixed(2) + '%' },
          { label: '总市値', value: fmtMv(profile.total_mv) },
        ].map(item => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-2.5 text-center">
            <div className="text-xs text-gray-400">{item.label}</div>
            <div className="text-sm font-bold text-gray-800 mt-0.5">{item.value}</div>
          </div>
        ))}
      </div>

      {/* 标签页切换（七个标签页） */}
      <div className="flex flex-wrap bg-gray-100 rounded-lg p-0.5 gap-0.5">
        <button
          onClick={() => setActiveTab('kline')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === 'kline' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Activity className="w-3.5 h-3.5" /> K线图
        </button>
        <button
          onClick={() => setActiveTab('flow')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === 'flow' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Zap className="w-3.5 h-3.5" /> 资金流向
        </button>
        <button
          onClick={() => setActiveTab('funda')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === 'funda' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <BarChart2 className="w-3.5 h-3.5" /> 基本面
        </button>
        <button
          onClick={() => setActiveTab('fina')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === 'fina' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <DollarSign className="w-3.5 h-3.5" /> 财务
        </button>
        <button
          onClick={() => setActiveTab('trend')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === 'trend' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <TrendingUp className="w-3.5 h-3.5" /> 财务趋势
        </button>
        <button
          onClick={() => setActiveTab('canvas')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === 'canvas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Globe className="w-3.5 h-3.5" /> 公司画布
        </button>
        <button
          onClick={() => setActiveTab('ann')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === 'ann' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Info className="w-3.5 h-3.5" /> 公告
        </button>
      </div>

      {/* 内容区 */}
      {activeTab === 'kline' && <KlineChart tsCode={stock.ts_code} basePrice={basePrice} />}
      {activeTab === 'flow' && <MoneyFlowPanel profile={profile} />}
      {activeTab === 'funda' && <FundamentalsPanel profile={profile} />}
      {activeTab === 'fina' && <FinancialPanel tsCode={stock.ts_code} />}
      {activeTab === 'trend' && <FinaTrendPanel tsCode={stock.ts_code} />}
      {activeTab === 'canvas' && <CompanyCanvasPanel stock={stock} />}
      {activeTab === 'ann' && <AnnouncementPanel tsCode={stock.ts_code} nameCn={stock.name_cn} />}
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
              <Globe className="w-3.5 h-3.5" /> 宏观/大盘
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <button
              onClick={handleBackToSector}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeLayer === 2 ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> 中观/板块
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
              { step: 1, icon: <Globe className="w-4 h-4" />, label: '宏观/大盘', desc: '判断当前市场环境' },
              { step: 2, icon: <BarChart2 className="w-4 h-4" />, label: '中观/板块', desc: '找到强势板块' },
              { step: 3, icon: <Star className="w-4 h-4" />, label: '微观/个股', desc: '精选板块内个股' },
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

          {/* Layer 1: 宏观/大盘 */}
          {activeLayer === 1 && (
            <div>
              <MacroPanel onNext={() => setActiveLayer(2)} />
            </div>
          )}

          {/* Layer 2: 中观/板块 */}
          {activeLayer === 2 && (
            <div>
              <SectorPanel onSelectSector={handleSelectSector} />
            </div>
          )}

          {/* Layer 3: 个股精选 + 个股详情 */}
          {activeLayer === 3 && selectedSector && (
            <div className={`grid gap-6 ${selectedStock ? 'grid-cols-5' : 'grid-cols-1'}`}>
              <div className={selectedStock ? 'col-span-2' : 'col-span-1'}>
                <StockListPanel sector={selectedSector} onSelectStock={handleSelectStock} />
              </div>
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
