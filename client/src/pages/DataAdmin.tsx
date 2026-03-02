/**
 * DataAdmin.tsx — 数据采集管理后台
 *
 * REQ-135: 动态化改造（数据源配置从 collect_target 表加载）
 * REQ-037 v2.0: 三维数据质量展示（及时性 T / 完整性 C / 准确性 A）
 *
 * 架构：
 *   - collect_target 表提供分组/标签/表名/日期字段/目标量/质量状态等元数据
 *   - pg_stat_user_tables RPC 高效获取行数（无超时风险）
 *   - quality_status / quality_summary 字段由 run_all_sources_check.py 定期写入
 *   - 三维质量圆点：T（及时性）C（完整性）A（准确性）
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'wouter';
import {
  ArrowLeft, RefreshCw, Database, CheckCircle2, AlertTriangle,
  XCircle, Clock, TrendingUp, FileText, BarChart3, Newspaper,
  BookOpen, Globe, ChevronDown, ChevronRight, Info, Calendar,
  Users, AlertCircle, ShieldCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── Supabase 连接 ──────────────────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SUPA_HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
};

// ── 类型定义 ───────────────────────────────────────────────────────────────────
interface QualityDim {
  status: 'ok' | 'warning' | 'error' | 'unknown';
  issues: Array<{ level: string; rule: string; message: string }>;
}

interface QualitySummary {
  checked_at?: string;
  row_count?: number;
  latest_date?: string;
  timeliness?: QualityDim;
  completeness?: QualityDim;
  accuracy?: QualityDim;
  error_count?: number;
  warning_count?: number;
}

interface CollectTargetRow {
  id: number;
  module: string;
  label: string | null;
  group_id: string | null;
  group_label: string | null;
  description: string | null;
  table_name: string | null;
  date_field: string | null;
  target_value: number | null;
  target_logic: string | null;
  req_id: string | null;
  schedule_desc: string | null;
  is_active: boolean;
  note: string | null;
  quality_status: 'ok' | 'warning' | 'error' | 'unknown' | null;
  last_checked_at: string | null;
  quality_summary: QualitySummary | null;
}

interface DataSource {
  id: string;
  label: string;
  description: string;
  table: string;
  dateField?: string;
  targetCount?: number;
  targetDesc?: string;
  scheduleDesc?: string;
  reqId?: string;
  staleThresholdDays?: number;
  notes?: string;
  qualityStatus: 'ok' | 'warning' | 'error' | 'unknown';
  lastCheckedAt: string | null;
  qualitySummary: QualitySummary | null;
}

interface DataGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  sources: DataSource[];
}

interface TableStat {
  table: string;
  count: number | null;
  latestDate: string | null;
  status: 'ok' | 'empty' | 'stale' | 'error' | 'loading';
  errorMsg?: string;
}

// ── 分组图标/颜色映射 ──────────────────────────────────────────────────────────
const GROUP_STYLE: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  macro:        { icon: <Globe className="w-4 h-4" />,      color: 'text-blue-700',    bgColor: 'bg-blue-50' },
  market:       { icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  financial:    { icon: <BarChart3 className="w-4 h-4" />,  color: 'text-violet-700',  bgColor: 'bg-violet-50' },
  news:         { icon: <Newspaper className="w-4 h-4" />,  color: 'text-orange-700',  bgColor: 'bg-orange-50' },
  research:     { icon: <FileText className="w-4 h-4" />,   color: 'text-rose-700',    bgColor: 'bg-rose-50' },
  calendar:     { icon: <Calendar className="w-4 h-4" />,   color: 'text-cyan-700',    bgColor: 'bg-cyan-50' },
  stock_events: { icon: <Users className="w-4 h-4" />,      color: 'text-indigo-700',  bgColor: 'bg-indigo-50' },
};
const DEFAULT_GROUP_STYLE = {
  icon: <Database className="w-4 h-4" />,
  color: 'text-gray-700',
  bgColor: 'bg-gray-50',
};

// ── 三维质量圆点颜色 ───────────────────────────────────────────────────────────
const DIM_DOT_COLOR: Record<string, string> = {
  ok:      'bg-emerald-500',
  warning: 'bg-amber-400',
  error:   'bg-red-500',
  unknown: 'bg-gray-300',
};

// ── 从 collect_target 加载数据源配置 ──────────────────────────────────────────
async function fetchDataGroups(): Promise<DataGroup[]> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/collect_target?is_active=eq.true&order=group_id,id&select=*`,
    { headers: SUPA_HEADERS }
  );
  if (!resp.ok) throw new Error(`fetch collect_target failed: ${resp.status}`);
  const rows: CollectTargetRow[] = await resp.json();

  const groupMap: Record<string, { label: string; sources: DataSource[] }> = {};
  const groupOrder: string[] = [];

  rows.forEach((row) => {
    const gid = row.group_id ?? 'other';
    const glabel = row.group_label ?? '其他';
    if (!groupMap[gid]) {
      groupMap[gid] = { label: glabel, sources: [] };
      groupOrder.push(gid);
    }
    let staleThresholdDays = 3;
    const sd = row.schedule_desc ?? '';
    if (sd.includes('月')) staleThresholdDays = 35;
    else if (sd.includes('季')) staleThresholdDays = 90;
    else if (sd.includes('年')) staleThresholdDays = 365;
    else if (sd.includes('周')) staleThresholdDays = 7;

    groupMap[gid].sources.push({
      id: row.module,
      label: row.label ?? row.module,
      description: row.description ?? '',
      table: row.table_name ?? row.module,
      dateField: row.date_field ?? undefined,
      targetCount: row.target_value ?? undefined,
      targetDesc: row.target_value ? `目标 ${row.target_value.toLocaleString('zh-CN')} 条` : undefined,
      scheduleDesc: row.schedule_desc ?? undefined,
      reqId: row.req_id ?? undefined,
      staleThresholdDays,
      notes: row.note ?? undefined,
      qualityStatus: row.quality_status ?? 'unknown',
      lastCheckedAt: row.last_checked_at ?? null,
      qualitySummary: row.quality_summary ?? null,
    });
  });

  return groupOrder.map((gid) => {
    const style = GROUP_STYLE[gid] ?? DEFAULT_GROUP_STYLE;
    return {
      id: gid,
      label: groupMap[gid].label,
      icon: style.icon,
      color: style.color,
      bgColor: style.bgColor,
      sources: groupMap[gid].sources,
    };
  });
}

// ── 工具函数 ───────────────────────────────────────────────────────────────────
async function fetchAllTableCounts(): Promise<Record<string, number>> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_table_row_counts`,
    { method: 'POST', headers: SUPA_HEADERS, body: JSON.stringify({}) }
  );
  if (!resp.ok) throw new Error(`RPC failed: ${resp.status}`);
  const data: Array<{ table_name: string; row_count: number }> = await resp.json();
  const map: Record<string, number> = {};
  data.forEach((row) => { map[row.table_name] = Number(row.row_count); });
  return map;
}

async function fetchLatestDate(table: string, dateField: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=${dateField}&order=${dateField}.desc&limit=1`,
      { headers: SUPA_HEADERS }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0][dateField] ?? null;
  } catch { return null; }
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((new Date().getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtNum(n: number | null): string {
  if (n === null) return '—';
  if (n === -1) return '表不存在';
  if (n < 0) return '—';
  return n.toLocaleString('zh-CN');
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return s.slice(0, 10);
}

function calcProgress(count: number | null, target?: number): number | null {
  if (count === null || count <= 0 || !target) return null;
  return Math.min(100, Math.round((count / target) * 100));
}

// ── 三维质量圆点组件 ───────────────────────────────────────────────────────────
function QualityDots({ source }: { source: DataSource }) {
  const summary = source.qualitySummary;
  if (!summary) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" title="未检查" />
        <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" title="未检查" />
        <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" title="未检查" />
      </span>
    );
  }

  const dims: Array<{ key: keyof QualitySummary; label: string; abbr: string }> = [
    { key: 'timeliness',   label: '及时性', abbr: 'T' },
    { key: 'completeness', label: '完整性', abbr: 'C' },
    { key: 'accuracy',     label: '准确性', abbr: 'A' },
  ];

  const checkedAt = summary.checked_at
    ? new Date(summary.checked_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '未知';

  return (
    <span className="inline-flex items-center gap-1.5">
      {dims.map(({ key, label, abbr }) => {
        const dim = summary[key] as QualityDim | undefined;
        const st = dim?.status ?? 'unknown';
        const issues = dim?.issues ?? [];
        const dotColor = DIM_DOT_COLOR[st] ?? 'bg-gray-300';
        const issueText = issues.length > 0
          ? issues.map(i => i.message).join('\n')
          : '无问题';

        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 cursor-default">
                <span className={`w-2 h-2 rounded-full ${dotColor} inline-block`} />
                <span className="text-xs text-gray-400 font-mono leading-none">{abbr}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              <div className="font-semibold mb-1">{label}（{abbr}）— {st.toUpperCase()}</div>
              <div className="whitespace-pre-wrap text-gray-300">{issueText}</div>
              <div className="text-gray-500 mt-1">检查时间：{checkedAt}</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

// ── 综合质量徽章 ───────────────────────────────────────────────────────────────
function QualityBadge({ status }: { status: DataSource['qualityStatus'] }) {
  if (status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
      <ShieldCheck className="w-3 h-3" /> 质量正常
    </span>
  );
  if (status === 'warning') return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
      <AlertTriangle className="w-3 h-3" /> 质量警告
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> 质量异常
    </span>
  );
  return null;
}

// ── 状态徽章 ───────────────────────────────────────────────────────────────────
function StatusBadge({ status, count }: { status: TableStat['status']; count: number | null }) {
  if (status === 'loading') return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <RefreshCw className="w-3 h-3 animate-spin" /> 加载中
    </span>
  );
  if (status === 'error' || count === -1) return (
    <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> 表不存在
    </span>
  );
  if (status === 'empty' || count === 0) return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
      <AlertTriangle className="w-3 h-3" /> 空表
    </span>
  );
  if (status === 'stale') return (
    <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" /> 数据陈旧
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> 正常
    </span>
  );
}

// ── 进度条 ─────────────────────────────────────────────────────────────────────
function ProgressBar({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── 单条数据源行 ───────────────────────────────────────────────────────────────
function DataSourceRow({ source, stat }: { source: DataSource; stat: TableStat }) {
  const progress = calcProgress(stat.count, source.targetCount);
  const days = daysSince(stat.latestDate);
  return (
    <div className="flex flex-col gap-1 py-3 px-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{source.label}</span>
            {source.reqId && <span className="text-xs text-gray-400 font-mono">{source.reqId}</span>}
            <StatusBadge status={stat.status} count={stat.count} />
            {/* 质量异常时额外显示质量徽章 */}
            {(source.qualityStatus === 'error' || source.qualityStatus === 'warning') && (
              <QualityBadge status={source.qualityStatus} />
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{source.description}</p>
          {source.notes && <p className="text-xs text-blue-600 mt-0.5 italic">{source.notes}</p>}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold text-gray-800 tabular-nums">
            {stat.status === 'loading' ? <span className="text-gray-300">—</span> : fmtNum(stat.count)}
          </div>
          {source.targetDesc && <div className="text-xs text-gray-400">{source.targetDesc}</div>}
        </div>
      </div>
      {progress !== null && <ProgressBar pct={progress} />}
      <div className="flex items-center gap-4 mt-0.5 flex-wrap">
        {stat.latestDate && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            最新：{fmtDate(stat.latestDate)}
            {days !== null && days > 0 && (
              <span className={days > (source.staleThresholdDays ?? 3) ? 'text-orange-500' : 'text-gray-400'}>
                （{days}天前）
              </span>
            )}
          </span>
        )}
        {source.scheduleDesc && (
          <span className="text-xs text-gray-400">🕐 {source.scheduleDesc}</span>
        )}
        {/* 三维质量圆点 */}
        <QualityDots source={source} />
      </div>
    </div>
  );
}

// ── 分组卡片 ───────────────────────────────────────────────────────────────────
function GroupCard({ group, stats, defaultOpen = true }: {
  group: DataGroup; stats: Record<string, TableStat>; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const groupStats = group.sources.map(
    (s) => stats[s.id] ?? { table: s.table, count: null, latestDate: null, status: 'loading' as const }
  );
  const totalOk    = groupStats.filter((s) => s.status === 'ok').length;
  const totalEmpty = groupStats.filter((s) => s.status === 'empty' || s.count === 0).length;
  const totalError = groupStats.filter((s) => s.status === 'error' || s.count === -1).length;
  const totalStale = groupStats.filter((s) => s.status === 'stale').length;
  const totalRows  = groupStats.reduce((sum, s) => sum + (s.count && s.count > 0 ? s.count : 0), 0);
  // 质量告警统计
  const qualityErrors   = group.sources.filter((s) => s.qualityStatus === 'error').length;
  const qualityWarnings = group.sources.filter((s) => s.qualityStatus === 'warning').length;

  return (
    <Card className="overflow-hidden border-gray-200 shadow-sm">
      <button className="w-full text-left" onClick={() => setOpen(!open)}>
        <CardHeader className={`${group.bgColor} py-3 px-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={group.color}>{group.icon}</span>
              <CardTitle className={`text-sm font-semibold ${group.color}`}>{group.label}</CardTitle>
              <span className="text-xs text-gray-500">
                {group.sources.length} 个数据源 · {totalRows > 0 ? totalRows.toLocaleString('zh-CN') + ' 条' : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {totalError > 0 && <span className="text-xs text-red-700 bg-red-50 px-1.5 py-0.5 rounded">{totalError} 缺失</span>}
              {totalEmpty > 0 && <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">{totalEmpty} 空表</span>}
              {totalStale > 0 && <span className="text-xs text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">{totalStale} 陈旧</span>}
              {qualityErrors > 0 && <span className="text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded border border-red-200">{qualityErrors} 质量异常</span>}
              {qualityWarnings > 0 && <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">{qualityWarnings} 质量警告</span>}
              {totalOk === group.sources.length && totalOk > 0 && qualityErrors === 0 && qualityWarnings === 0 && (
                <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">全部正常</span>
              )}
              {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </div>
          </div>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="p-0">
          {group.sources.map((source) => (
            <DataSourceRow
              key={source.id}
              source={source}
              stat={stats[source.id] ?? { table: source.table, count: null, latestDate: null, status: 'loading' }}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ── 汇总统计卡片 ───────────────────────────────────────────────────────────────
function SummaryCards({ groups, stats }: { groups: DataGroup[]; stats: Record<string, TableStat> }) {
  const allSources = groups.flatMap((g) => g.sources);
  const allStats   = allSources.map((s) => stats[s.id]).filter(Boolean) as TableStat[];
  const loaded     = allStats.filter((s) => s.status !== 'loading');
  const ok         = loaded.filter((s) => s.status === 'ok').length;
  const empty      = loaded.filter((s) => s.status === 'empty' || s.count === 0).length;
  const error      = loaded.filter((s) => s.status === 'error' || (s.count !== null && s.count === -1)).length;
  const stale      = loaded.filter((s) => s.status === 'stale').length;
  const totalRows  = loaded.reduce((sum, s) => sum + (s.count && s.count > 0 ? s.count : 0), 0);
  const healthPct  = loaded.length > 0 ? Math.round((ok / loaded.length) * 100) : 0;
  // 质量统计
  const qualityErrors   = allSources.filter((s) => s.qualityStatus === 'error').length;
  const qualityWarnings = allSources.filter((s) => s.qualityStatus === 'warning').length;
  const qualityOk       = allSources.filter((s) => s.qualityStatus === 'ok').length;
  const qualityChecked  = allSources.filter((s) => s.qualityStatus !== 'unknown').length;

  const cards = [
    {
      label: '总数据量', value: totalRows > 0 ? totalRows.toLocaleString('zh-CN') : '—',
      sub: `${allSources.length} 个数据源`, icon: <Database className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50'
    },
    {
      label: '数据正常', value: String(ok),
      sub: `${healthPct}% 健康率`, icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50'
    },
    {
      label: '空表/缺失/陈旧', value: String(empty + error + stale),
      sub: `${error} 缺失 · ${empty} 空表 · ${stale} 陈旧`, icon: <XCircle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50'
    },
    {
      label: '质量检查',
      value: qualityChecked > 0 ? `${qualityOk}/${qualityChecked}` : '—',
      sub: qualityErrors > 0 ? `${qualityErrors} 异常 · ${qualityWarnings} 警告` : qualityWarnings > 0 ? `${qualityWarnings} 警告` : '全部正常',
      icon: <ShieldCheck className="w-5 h-5 text-violet-500" />,
      bg: qualityErrors > 0 ? 'bg-red-50' : qualityWarnings > 0 ? 'bg-amber-50' : 'bg-violet-50'
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className={`${c.bg} rounded-xl p-4 flex items-start gap-3`}>
          <div className="mt-0.5">{c.icon}</div>
          <div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{c.value}</div>
            <div className="text-xs font-medium text-gray-700">{c.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────
export default function DataAdmin() {
  const [groups, setGroups]           = useState<DataGroup[]>([]);
  const [stats, setStats]             = useState<Record<string, TableStat>>({});
  const [loading, setLoading]         = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setConfigError(null);
    try {
      // 1. 从 collect_target 动态加载数据源配置（含质量字段）
      setConfigLoading(true);
      const loadedGroups = await fetchDataGroups();
      setGroups(loadedGroups);
      setConfigLoading(false);

      // 2. 初始化 loading 状态
      const initStats: Record<string, TableStat> = {};
      loadedGroups.forEach((g) =>
        g.sources.forEach((s) => {
          initStats[s.id] = { table: s.table, count: null, latestDate: null, status: 'loading' };
        })
      );
      setStats({ ...initStats });

      // 3. 一次性获取所有表行数
      const countMap = await fetchAllTableCounts();

      // 4. 并发查询最新日期
      const allSources = loadedGroups.flatMap((g) => g.sources);
      const dateResults = await Promise.allSettled(
        allSources.map(async (source) => {
          if (!source.dateField) return { id: source.id, latestDate: null };
          const count = countMap[source.table] ?? -1;
          if (count <= 0) return { id: source.id, latestDate: null };
          const latestDate = await fetchLatestDate(source.table, source.dateField);
          return { id: source.id, latestDate };
        })
      );
      const dateMap: Record<string, string | null> = {};
      dateResults.forEach((result, i) => {
        const source = allSources[i];
        dateMap[source.id] = result.status === 'fulfilled' ? result.value.latestDate : null;
      });

      // 5. 组合结果，计算状态
      const newStats: Record<string, TableStat> = {};
      allSources.forEach((source) => {
        const count = source.table in countMap ? countMap[source.table] : -1;
        const latestDate = dateMap[source.id] ?? null;
        let status: TableStat['status'] = 'ok';
        if (count === -1) {
          status = 'error';
        } else if (count === 0) {
          status = 'empty';
        } else if (latestDate) {
          const days = daysSince(latestDate);
          const threshold = source.staleThresholdDays ?? 3;
          if (days !== null && days > threshold) status = 'stale';
        }
        newStats[source.id] = { table: source.table, count, latestDate, status };
      });
      setStats(newStats);
    } catch (err) {
      console.error('loadAll error:', err);
      setConfigError(err instanceof Error ? err.message : '加载失败');
    }
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <TooltipProvider>
      <Helmet><title>数据管理后台 | Trudecide</title></Helmet>
      <div className="min-h-screen bg-gray-50">
        {/* ── Header ── */}
        <header className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-4 shadow-md">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <button className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors">
                  <ArrowLeft className="w-4 h-4" /> 返回看板
                </button>
              </Link>
              <div className="w-px h-5 bg-white/20" />
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-300" />
                <h1 className="text-lg font-semibold">数据采集管理后台</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {lastRefresh && (
                <span className="text-xs text-white/50">
                  上次刷新：{lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              <button
                onClick={loadAll}
                disabled={loading}
                className="flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/30 text-white px-3 py-1.5 rounded-lg transition-all text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
              </button>
              <Link href="/knowledge">
                <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 px-3 py-1.5 rounded-lg transition-all text-sm">
                  <BookOpen className="w-4 h-4" /> 知识库
                </button>
              </Link>
            </div>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6 text-sm text-blue-700">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              本页面实时查询 Supabase 数据库，展示所有数据采集目标的当前状态。
              行数通过 <code className="font-mono text-xs bg-blue-100 px-1 rounded">pg_stat_user_tables</code> 统计视图获取（估算值，误差 &lt;1%）。
              数据源配置由 <code className="font-mono text-xs bg-blue-100 px-1 rounded">collect_target</code> 表驱动，新增采集脚本后在该表登记即可自动显示。
              三维质量标签（<span className="font-mono">T</span> 及时性 / <span className="font-mono">C</span> 完整性 / <span className="font-mono">A</span> 准确性）由定期检查脚本写入，鼠标悬停可查看详情。
            </div>
          </div>

          {configError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>加载数据源配置失败：{configError}</span>
            </div>
          )}

          {!configLoading && <SummaryCards groups={groups} stats={stats} />}

          {configLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 正在加载数据源配置...
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group, i) => (
                <GroupCard key={group.id} group={group} stats={stats} defaultOpen={i < 4} />
              ))}
            </div>
          )}

          <div className="mt-6 text-xs text-gray-400 text-center">
            数据来源：Supabase · 配置中心：collect_target 表 · 采集脚本：scripts/ · 行数统计：pg_stat_user_tables（估算）
            · 质量检查：run_all_sources_check.py（REQ-037）
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
