/**
 * TopDown.tsx — Top-Down 选股策略
 *
 * 三层递进结构：
 *   Layer 1: 宏观择时（indicator_values + index_daily）— 真实数据
 *   Layer 2: 板块轮动（sector_meta + sector_daily）— 真实数据（dc 系统）
 *   Layer 3: 个股精选（sector_stock_map + stock_meta + stock_daily）— 真实数据
 *
 * Layer 1 宏观状态矩阵已接入真实数据（REQ-159），评分规则见 docs/macro_matrix_scoring_rules.md。
 * Layer 2/3 已接入 Supabase 真实数据。
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearch, useLocation } from 'wouter';
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
  getSectorStocks, genStockKline, getStockBasePrice, genStockProfile,
  genStockFina, genStockAnnouncements,
  getSectorMacroMapping, benefitColor,
  genStockFinaTrend, genStockHolders,
  type MacroSignal, type MacroMatrix, type MatrixCell, type MatrixRegion,
  type SectorMeta, type StockMeta, type StockDaily, type BenefitLevel,
  type FinaTrendPoint, type StockHolder
} from '@/data/topdown-mock';
import {
  fetchSectorList, fetchSectorHistory, fetchSectorStocks,
  fetchMacroSnapshot, fetchIndexSnapshot, fetchRealMacroMatrix, fetchRealMacroMatrixUS,
  type RealSectorMeta, type RealSectorDaily,
  type MacroIndicatorValue, type IndexDailyBar,
  type RealMacroMatrix, type RealMatrixCell,
} from '@/lib/topdown-api';
import { supabase } from '@/lib/supabase';

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
  // v 单位：万元（Tushare stock_daily_basic.total_mv/circ_mv 原始单位）
  // 转换为亿：1亿 = 10000万元
  const yi = v / 10000;
  if (yi >= 10000) return `${(yi / 10000).toFixed(1)}万亿`;
  if (yi >= 1000) return `${(yi / 1000).toFixed(1)}千亿`;
  return `${yi.toFixed(1)}亿`;
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

// ─── 宏观矩阵展开详情面板 ────────────────────────────────────────────
// 支持 Mock 数据（MatrixCell）和真实数据（RealMatrixCell）两种格式
function CellExpandPanel({ cell, dimension, period }: {
  cell: MatrixCell | RealMatrixCell;
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

// ─── Layer 1: 宏观状态矩阵面板 ──────────────────────────────────────────────
// 评分规则：每个单元格 score = Σ(因子 raw_score × 权重)，规则详见 docs/macro_matrix_scoring_rules.md
function MacroPanel({ onNext }: { onNext: () => void }) {
  const [region, setRegion] = useState<MatrixRegion>('CN');
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  // 真实数据矩阵（CN + US 均接入真实数据）
  const [realMatrixCN, setRealMatrixCN] = useState<RealMacroMatrix | null>(null);
  const [realMatrixUS, setRealMatrixUS] = useState<RealMacroMatrix | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  useEffect(() => {
    setMatrixLoading(true);
    setMatrixError(null);
    const fetcher = region === 'CN' ? fetchRealMacroMatrix() : fetchRealMacroMatrixUS();
    fetcher
      .then(m => {
        if (region === 'CN') setRealMatrixCN(m);
        else setRealMatrixUS(m);
      })
      .catch(e => setMatrixError(e.message))
      .finally(() => setMatrixLoading(false));
  }, [region]);

  // 优先使用真实数据，回退到 Mock（保留 Mock 作为应急备份）
  const realMatrix = region === 'CN' ? realMatrixCN : realMatrixUS;
  const matrix = realMatrix ?? (region === 'CN' ? MACRO_MATRIX_CN : MACRO_MATRIX_US);

  const periods: { key: 'short' | 'mid' | 'long'; label: string; sub: string }[] = [
    { key: 'short', label: '短期', sub: '3-9 个月' },
    { key: 'mid',   label: '中期', sub: '2-3 年' },
    { key: 'long',  label: '长期', sub: '5-10 年' },
  ];

  const shortScore = matrix.summary.short.score;
  const isPositive = shortScore >= 60;;

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
          {/* 数据来源标签：加载中 / 真实数据 / 错误 / Mock */}
          {matrixLoading && (
            <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium animate-pulse">计算中...</span>
          )}
          {!matrixLoading && matrixError && (
            <span className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-medium" title={matrixError}>⚠ 数据异常</span>
          )}
          {!matrixLoading && !matrixError && realMatrix && (
            <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">✓ 真实数据</span>
          )}
          {!matrixLoading && !matrixError && !realMatrix && (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">⚠ Mock 备份</span>
          )}
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

// ─── 板块过义 K 线图（支持真实数据） ────────────────────────────────────────────
function SectorMiniKline({ sectorId, trend, history }: {
  sectorId: string;
  trend: number;
  history?: RealSectorDaily[];
}) {
  const [data, setData] = useState<{ v: number }[]>([]);
  useEffect(() => {
    if (history && history.length > 0) {
      setData(history.slice(-20).map(d => ({ v: d.close ?? 0 })));
    } else {
      fetchSectorHistory(sectorId, 20).then(h => {
        setData(h.map(d => ({ v: d.close ?? 0 })));
      });
    }
  }, [sectorId, history]);
  const color = trend > 1 ? UP_COLOR : trend < -1 ? DOWN_COLOR : FLAT_COLOR;
  if (data.length === 0) return <div className="h-8" />;
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
        <defs>
          <linearGradient id={`sg-${sectorId.replace(/[.]/g, '_')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sg-${sectorId.replace(/[.]/g, '_')})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Layer 2: 板块轮动面板（真实数据） ────────────────────────────────────────────
type SectorFilter = 'all' | '行业板块' | '概念板块' | '风格板块';

function SectorPanel({ onSelectSector }: { onSelectSector: (s: RealSectorMeta) => void }) {
  const [filter, setFilter] = useState<SectorFilter>('行业板块');
  const [sortBy, setSortBy] = useState<'pct' | 'mv' | 'turnover'>('pct');
  const [search, setSearch] = useState('');
  const [showMacroSummary, setShowMacroSummary] = useState(true);
  const [sectors, setSectors] = useState<Array<RealSectorMeta & { latest: RealSectorDaily | null }>>([]);
  const [loading, setLoading] = useState(true);

  // 加载真实板块数据
  useEffect(() => {
    setLoading(true);
    fetchSectorList().then(data => {
      setSectors(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // 当前宏观总结论（来自 MACRO_MATRIX_CN.summary）
  const macroShort = MACRO_MATRIX_CN.summary.short;
  const macroMid = MACRO_MATRIX_CN.summary.mid;

  const filtered = sectors
    .filter(s => filter === 'all' || s.idx_type === filter)
    .filter(s => !search || s.name_cn.includes(search))
    .sort((a, b) => {
      if (sortBy === 'pct') return (b.latest?.pct_change ?? 0) - (a.latest?.pct_change ?? 0);
      if (sortBy === 'mv') return (b.latest?.total_mv ?? 0) - (a.latest?.total_mv ?? 0);
      return (b.latest?.turnover_rate ?? 0) - (a.latest?.turnover_rate ?? 0);
    });

  // 今日涨跌分布
  const upCount = sectors.filter(s => (s.latest?.pct_change ?? 0) > 0).length;
  const downCount = sectors.filter(s => (s.latest?.pct_change ?? 0) < 0).length;
  const flatCount = sectors.length - upCount - downCount;

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
          <span className="text-xs text-gray-400">
            {loading ? '加载中...' : `${filtered.length} 个板块`}
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
            <Activity className="w-4 h-4 mr-2 animate-spin" />正在加载真实数据...
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {filtered.slice(0, 50).map((s, i) => {
              const pct = s.latest?.pct_change ?? 0;
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
                    {s.latest?.turnover_rate != null && (
                      <span className="text-xs text-gray-400 tabular-nums w-16 text-right flex-shrink-0">
                        换{s.latest.turnover_rate.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
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
  const _roe = fina.roe ?? 0;
  const _gpm = fina.grossprofit_margin ?? 0;
  const roeScore = Math.min(Math.max((_roe - 5) / 25 * 15, 0), 15);
  const marginScore = Math.min(Math.max((_gpm - 10) / 50 * 15, 0), 15);
  const profitQuality = parseFloat((roeScore + marginScore).toFixed(1));

  // 成长性（30分）：净利润增速 15分 + 营收增速 15分
  const _npYoy = fina.netprofit_yoy ?? 0;
  const _orYoy = fina.or_yoy ?? 0;
  const npGrowthScore = Math.min(Math.max((_npYoy + 10) / 60 * 15, 0), 15);
  const revGrowthScore = Math.min(Math.max((_orYoy + 5) / 40 * 15, 0), 15);
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

// ─── Layer 3: 个股精选面板（真实数据） ──────────────────────────────────────────────────

/**
 * 真实数据版 GARP 评分（REQ-158 + REQ-159 PE(TTM) null 方案 A）
 *
 * PE(TTM) null 处理规则（方案 A）：
 *   1. 亏损股（roe < 0 或 netprofit_yoy 极低）：估值分项直接给 0 分，并标记 isLoss=true
 *      理由：亏损股的 PE 无意义（分母为负），不应当作“估值合理”处理
 *   2. 盈利但 PE 为 null（新股、数据缺失）：用传入的行业中位数 PE 代替，并标记 usedMedianPe=true
 *      理由：盈利股的 PE 缺失是数据问题，用行业中位数是最小化偏差的合理方案
 *
 * 评分权重：盈利质量 30% + 成长性 30% + 估值合理性 25% + 资金关注度 15%
 */
function calcRealGarpScore(
  quote: {
    pct_chg: number; pe_ttm: number | null; pb: number | null;
    turnover_rate: number | null;
  },
  fina: {
    roe: number | null; grossprofit_margin: number | null;
    netprofit_yoy: number | null; or_yoy: number | null;
  },
  mf: { net_amount: number | null } | null,
  /** 行业中位数 PE，用于盈利但 pe_ttm 为 null 的情况 */
  sectorMedianPe: number = 30
): {
  total: number;
  profitQuality: number;
  growth: number;
  valuation: number;
  moneyflow: number;
  isLoss: boolean;        // 亏损股标记（估值分项为 0）
  usedMedianPe: boolean;  // 是否使用了行业中位数 PE 代替
} {
  const roe = fina.roe ?? 0;
  const gpm = fina.grossprofit_margin ?? 0;
  const npYoy = fina.netprofit_yoy ?? 0;
  const orYoy = fina.or_yoy ?? 0;
  const pb = quote.pb ?? 3;
  const tr = quote.turnover_rate ?? 1;
  const netAmt = mf?.net_amount ?? 0;

  // ─── 盈利质量（30分）：ROE 15分 + 毛利率 15分 ───
  const roeScore = Math.min(Math.max((roe - 5) / 25 * 15, 0), 15);
  const marginScore = Math.min(Math.max((gpm - 10) / 50 * 15, 0), 15);
  const profitQuality = parseFloat((roeScore + marginScore).toFixed(1));

  // ─── 成长性（30分）：净利润增速 15分 + 营收增速 15分 ───
  const npGrowthScore = Math.min(Math.max((npYoy + 10) / 60 * 15, 0), 15);
  const revGrowthScore = Math.min(Math.max((orYoy + 5) / 40 * 15, 0), 15);
  const growth = parseFloat((npGrowthScore + revGrowthScore).toFixed(1));

  // ─── 估值合理性（25分）：PE 15分 + PB 10分 ───
  // 方案 A 处理：亏损股估值分项为 0，盈利但 PE 缺失用行业中位数
  const isLoss = roe < 0; // 亏损判断：ROE 为负则认定为亏损股
  let valuation: number;
  let usedMedianPe = false;

  if (isLoss) {
    // 亏损股：估值分项直接给 0 分
    // 理由：亏损股的 PE 无意义，不应认为估值合理
    valuation = 0;
  } else {
    // 盈利股：判断 PE 是否有效
    let effectivePe: number;
    if (quote.pe_ttm !== null && quote.pe_ttm > 0) {
      effectivePe = quote.pe_ttm; // 正常 PE
    } else {
      // PE 为 null 或负数（数据缺失）：用行业中位数
      effectivePe = sectorMedianPe;
      usedMedianPe = true;
    }
    const peScore = Math.min(Math.max((50 - effectivePe) / 35 * 15, 0), 15);
    const pbScore = Math.min(Math.max((8 - pb) / 6 * 10, 0), 10);
    valuation = parseFloat((peScore + pbScore).toFixed(1));
  }

  // ─── 资金关注度（15分）：大单净流入 10分 + 换手率适中 5分 ───
  const netFlowScore = Math.min(Math.max((netAmt + 1000) / 5000 * 10, 0), 10);
  // 换手率 1-3% 为最优区间，过低或过高均扭分
  const trScore = tr >= 1 && tr <= 3 ? 5 : tr < 1 ? tr / 1 * 5 : Math.max(5 - (tr - 3) * 0.5, 0);
  const moneyflow = parseFloat((netFlowScore + trScore).toFixed(1));

  const total = parseFloat((profitQuality + growth + valuation + moneyflow).toFixed(1));
  return { total, profitQuality, growth, valuation, moneyflow, isLoss, usedMedianPe };
}

function StockListPanel({ sector, onSelectStock }: {
  sector: RealSectorMeta;
  onSelectStock: (s: StockMeta) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [realStocks, setRealStocks] = useState<Awaited<ReturnType<typeof fetchSectorStocks>>>([]);

  // 筛选状态
  const [sortBy, setSortBy] = useState<'garp' | 'pct' | 'pe' | 'roe' | 'growth' | 'flow'>('garp');
  const [filterMode, setFilterMode] = useState<'default' | 'custom'>('default');
  const [minRoe, setMinRoe] = useState(0);
  const [maxPe, setMaxPe] = useState(100);
  const [minGrowth, setMinGrowth] = useState(-50);
  const [showGarpDetail, setShowGarpDetail] = useState<string | null>(null);

  // 板块宏观映射
  const mapping = getSectorMacroMapping(sector.name_cn);

  // 加载真实个股数据
  useEffect(() => {
    setLoading(true);
    fetchSectorStocks(sector.id).then(data => {
      setRealStocks(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [sector.id]);

  // 计算行业中位数 PE（用于 PE(TTM) null 方案 A 中的盈利新股代替）
  // 只取 pe_ttm > 0 的样本，排除亏损股和数据缺失
  const validPeList = realStocks
    .map(s => s.quote.pe_ttm)
    .filter((pe): pe is number => pe !== null && pe > 0 && pe < 500)
    .sort((a, b) => a - b);
  const sectorMedianPe = validPeList.length > 0
    ? validPeList[Math.floor(validPeList.length / 2)]
    : 30; // 无数据时用 30 倍作为默认中位数

  // 构建评分数据
  const scored = realStocks.map(({ meta, quote, fina, moneyflow }) => ({
    meta,
    quote,
    fina,
    moneyflow,
    // 传入行业中位数 PE，实施方案 A
    garp: calcRealGarpScore(quote, fina, moneyflow, sectorMedianPe),
  }));

  const sorted = [...scored]
    .filter(s => filterMode === 'default' || (
      (s.fina.roe ?? 0) >= minRoe &&
      (s.quote.pe_ttm ?? 999) <= maxPe &&
      (s.fina.netprofit_yoy ?? -999) >= minGrowth
    ))
    .sort((a, b) => {
      switch (sortBy) {
        case 'garp': return b.garp.total - a.garp.total;
        case 'pct': return b.quote.pct_chg - a.quote.pct_chg;
        case 'pe': return (a.quote.pe_ttm ?? 999) - (b.quote.pe_ttm ?? 999);
        case 'roe': return (b.fina.roe ?? 0) - (a.fina.roe ?? 0);
        case 'growth': return (b.fina.netprofit_yoy ?? -999) - (a.fina.netprofit_yoy ?? -999);
        case 'flow': return (b.moneyflow?.net_amount ?? 0) - (a.moneyflow?.net_amount ?? 0);
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
          <span className="text-xs text-gray-400">{sector.idx_type} · {loading ? '...' : `${realStocks.length} 只成分股`}</span>
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
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
            <Activity className="w-4 h-4 mr-2 animate-spin" />正在加载成分股数据...
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">暂无数据</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sorted.map(({ meta, quote, fina, moneyflow: mf, garp }, i) => {
              const roe = fina.roe ?? 0;
              const npYoy = fina.netprofit_yoy ?? 0;
              const netAmt = mf?.net_amount ?? 0;
              return (
                <div key={meta.ts_code} className="group">
                  <button
                    onClick={() => onSelectStock(meta as unknown as StockMeta)}
                    className="w-full grid grid-cols-[1.5fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_1.2fr] gap-0 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                        <span className="text-sm font-semibold text-gray-900">{meta.name_cn}</span>
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
                        onClick={e => { e.stopPropagation(); setShowGarpDetail(showGarpDetail === meta.ts_code ? null : meta.ts_code); }}
                        className="ml-1 text-[10px] text-gray-400 hover:text-blue-500"
                      >
                        {showGarpDetail === meta.ts_code ? '▲' : '▼'}
                      </button>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold tabular-nums" style={{ color: pctColor(quote.pct_chg) }}>
                        {fmtPct(quote.pct_chg)}
                      </span>
                    </div>
                    {/* PE(TTM) 显示：方案 A 标注亏损和中位数代替 */}
                    <div className="text-right text-sm tabular-nums">
                      {garp.isLoss ? (
                        <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">亏损</span>
                      ) : garp.usedMedianPe ? (
                        <span className="text-gray-400" title={`PE 数据缺失，已用行业中位数 ${sectorMedianPe.toFixed(1)}倍代替`}>
                          ~{sectorMedianPe.toFixed(0)}<span className="text-[9px] text-gray-300">≈</span>
                        </span>
                      ) : (
                        <span className="text-gray-600">{quote.pe_ttm != null ? quote.pe_ttm.toFixed(1) : '-'}</span>
                      )}
                    </div>
                    <div className="text-right text-sm tabular-nums" style={{ color: roe >= 15 ? '#ef4444' : roe >= 8 ? '#f97316' : '#94a3b8' }}>
                      {roe.toFixed(1)}
                    </div>
                    <div className="text-right text-sm tabular-nums" style={{ color: npYoy >= 20 ? '#ef4444' : npYoy >= 0 ? '#f97316' : '#22c55e' }}>
                      {fmtPct(npYoy, 1)}
                    </div>
                    <div className="text-right text-sm tabular-nums" style={{ color: netAmt >= 0 ? '#ef4444' : '#22c55e' }}>
                      {netAmt >= 0 ? '+' : ''}{fmtNum(netAmt, 0)}
                    </div>
                  </button>
                  {/* GARP 得分明细展开 */}
                  {showGarpDetail === meta.ts_code && (
                    <div className="px-4 pb-3 bg-amber-50 border-t border-amber-100">
                      <div className="text-[10px] text-amber-700 font-semibold mb-1.5">GARP 得分构成（总分 {garp.total}）</div>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: '盈利质量', score: garp.profitQuality, max: 30, desc: `ROE ${roe.toFixed(1)}% + 毛利率 ${(fina.grossprofit_margin ?? 0).toFixed(1)}%`, color: '#ef4444' },
                          { label: '成长性', score: garp.growth, max: 30, desc: `净利增速 ${fmtPct(npYoy, 1)} + 营收增速 ${fmtPct(fina.or_yoy ?? 0, 1)}`, color: '#f97316' },
                          { label: '估值合理性', score: garp.valuation, max: 25, desc: `PE ${quote.pe_ttm != null ? quote.pe_ttm.toFixed(1) : '-'}倍 + PB ${quote.pb != null ? quote.pb.toFixed(2) : '-'}倍`, color: '#3b82f6' },
                          { label: '资金关注度', score: garp.moneyflow, max: 15, desc: `净流入 ${fmtNum(netAmt, 0)}万 + 换手率 ${(quote.turnover_rate ?? 0).toFixed(2)}%`, color: '#8b5cf6' },
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
                      {/* PE(TTM) null 方案 A 注释 */}
                      {garp.isLoss && (
                        <div className="mt-1 text-[9px] text-red-500 bg-red-50 rounded px-1.5 py-1">
                          ⚠ 亏损股：ROE &lt; 0，PE(TTM) 无意义，估值分项已给 0 分（方案 A）
                        </div>
                      )}
                      {garp.usedMedianPe && !garp.isLoss && (
                        <div className="mt-1 text-[9px] text-amber-600 bg-amber-50 rounded px-1.5 py-1">
                          ℹ PE(TTM) 数据缺失，已用当前板块中位数 PE（{sectorMedianPe.toFixed(1)}倍）代替计算估值分（方案 A）
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
export default function TopDown() {
  const [activeLayer, setActiveLayer] = useState<1 | 2 | 3>(1);
  const [selectedSector, setSelectedSector] = useState<RealSectorMeta | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // 处理 URL 参数：如果带有 ?stock=xxx，自动跳转到股票详情页
  const search = useSearch();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (initialLoadDone) return;

    const params = new URLSearchParams(search);
    const stockCode = params.get('stock');

    if (stockCode) {
      // 直接跳转到统一的股票详情页面
      setLocation(`/stock/${stockCode}?from=topdown`);
      return;
    } else {
      setInitialLoadDone(true);
    }
  }, [search, initialLoadDone, setLocation]);

  const handleSelectSector = useCallback((s: RealSectorMeta) => {
    setSelectedSector(s);
    setActiveLayer(3);
  }, []);

  const handleSelectStock = useCallback((s: StockMeta) => {
    // 跳转到统一的股票详情页面
    setLocation(`/stock/${s.ts_code}?from=topdown`);
  }, [setLocation]);

  const handleBackToMacro = () => { setActiveLayer(1); setSelectedSector(null); };
  const handleBackToSector = () => { setActiveLayer(2); setSelectedSector(null); };

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
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-1 rounded">板块/个股 真实数据</span>
              <span className="bg-white/10 px-2 py-1 rounded">宏观指标 Mock</span>
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
                  onClick={() => setActiveLayer(3)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeLayer === 3 ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <Star className="w-3.5 h-3.5" /> {selectedSector.name_cn}
                </button>
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

          {/* Layer 3: 个股精选 */}
          {activeLayer === 3 && selectedSector && (
            <div className="grid gap-6">
              <StockListPanel sector={selectedSector} onSelectStock={handleSelectStock} />
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
