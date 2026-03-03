/**
 * DataAdmin.tsx — 数据采集管理后台
 *
 * 功能：
 *   - 展示所有数据表的采集目标、当前数据量、进度、最新数据日期
 *   - 数据质量指标：空表警告、数据陈旧警告、覆盖率
 *   - 采集脚本状态：脚本名称、调度说明
 *   - 按分类分组展示（宏观/行情/财务/新闻/研报/事件）
 *
 * 架构：纯前端，通过 Supabase RPC get_table_row_counts() 高效获取行数
 *       （避免 count=exact 在大表上超时），再按需查询最新日期
 */

import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'wouter';
import {
  ArrowLeft, RefreshCw, Database, CheckCircle2, AlertTriangle,
  XCircle, Clock, TrendingUp, FileText, BarChart3, Newspaper,
  BookOpen, Globe, ChevronDown, ChevronRight, Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';

// ── Supabase 连接 ──────────────────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SUPA_HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
};

// ── 类型定义 ───────────────────────────────────────────────────────────────────
interface TableStat {
  table: string;
  count: number | null;       // null=加载中, -1=表不存在
  latestDate: string | null;
  status: 'ok' | 'empty' | 'stale' | 'error' | 'loading';
  errorMsg?: string;
}

interface DataSource {
  id: string;
  label: string;
  description: string;
  table: string;
  dateField?: string;
  targetCount?: number;
  targetDesc?: string;
  script?: string;
  scheduleDesc?: string;
  reqId?: string;
  staleThresholdDays?: number;
  notes?: string;
}

interface DataGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  sources: DataSource[];
}

// ── 数据源配置（基于实际数据库表名） ──────────────────────────────────────────
const DATA_GROUPS: DataGroup[] = [
  {
    id: 'macro',
    label: '宏观指标',
    icon: <Globe className="w-4 h-4" />,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    sources: [
      {
        id: 'indicator_meta',
        label: '指标元数据',
        description: '所有宏观指标的静态属性定义（名称/单位/来源/频率）',
        table: 'indicator_meta',
        targetCount: 800,
        targetDesc: '~800 个指标',
        script: 'collect_macro_cn.py',
        scheduleDesc: '手动维护',
        reqId: 'REQ-029',
        staleThresholdDays: 30,
      },
      {
        id: 'indicator_values',
        label: '宏观指标数值',
        description: '全球24国宏观时序数据（GDP/CPI/PPI/PMI/M2/政策利率/汇率等）',
        table: 'indicator_values',
        dateField: 'trade_date',
        targetCount: 500000,
        targetDesc: '~50万条（24国×多指标×多年）',
        script: 'collect_macro_cn.py',
        scheduleDesc: '每月1日自动更新',
        reqId: 'REQ-029/031',
        staleThresholdDays: 35,
        notes: 'CN月度指标已切换Tushare，US/EU/JP等通过AKShare/WB采集',
      },
    ],
  },
  {
    id: 'market',
    label: '行情数据',
    icon: <TrendingUp className="w-4 h-4" />,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    sources: [
      {
        id: 'index_daily',
        label: '指数日线行情',
        description: 'A股全量指数（SSE/SZSE/CSI/SW约5000+）+ 国际主要指数（12个）',
        table: 'index_daily',
        dateField: 'trade_date',
        targetCount: 3000000,
        targetDesc: '~300万条（全量历史）',
        script: 'collect_index_daily.py',
        scheduleDesc: '每交易日收盘后自动更新',
        reqId: 'REQ-064',
        staleThresholdDays: 5,
      },
      {
        id: 'stock_daily',
        label: '个股日线行情',
        description: 'A股个股OHLCV日线数据（全市场约5000只）',
        table: 'stock_daily',
        dateField: 'trade_date',
        targetCount: 5000000,
        targetDesc: '~500万条（全量历史）',
        script: 'collect_stock_daily.py',
        scheduleDesc: '每交易日收盘后自动更新',
        reqId: 'REQ-048',
        staleThresholdDays: 5,
      },
      {
        id: 'stock_daily_basic',
        label: '个股每日估值',
        description: 'PE/PB/市值/换手率等每日估值指标（全市场）',
        table: 'stock_daily_basic',
        dateField: 'trade_date',
        targetCount: 10000000,
        targetDesc: '~1000万条（全量历史）',
        script: 'collect_stock_daily_basic.py',
        scheduleDesc: '每交易日收盘后自动更新',
        reqId: 'REQ-049',
        staleThresholdDays: 5,
      },
      {
        id: 'sector_daily',
        label: '板块/概念日线',
        description: '行业板块、概念板块、通达信/东方财富指数日线行情',
        table: 'sector_daily',
        dateField: 'trade_date',
        targetCount: 1500000,
        targetDesc: '~150万条（全量历史）',
        script: 'collect_sector_data.py',
        scheduleDesc: '每交易日收盘后自动更新',
        reqId: 'REQ-058',
        staleThresholdDays: 5,
      },
      {
        id: 'stock_moneyflow',
        label: '个股资金流向',
        description: '个股大/中/小单资金流向（东方财富/同花顺双源）',
        table: 'stock_moneyflow',
        dateField: 'trade_date',
        targetCount: 12000000,
        targetDesc: '~1200万条（全量历史）',
        script: 'collect_stock_moneyflow.py',
        scheduleDesc: '每交易日收盘后自动更新',
        reqId: 'REQ-054',
        staleThresholdDays: 5,
      },
    ],
  },
  {
    id: 'financial',
    label: '财务数据',
    icon: <BarChart3 className="w-4 h-4" />,
    color: 'text-violet-700',
    bgColor: 'bg-violet-50',
    sources: [
      {
        id: 'stock_income',
        label: '利润表',
        description: '全市场A股历史利润表（85字段全存）',
        table: 'stock_income',
        dateField: 'end_date',
        targetCount: 250000,
        targetDesc: '~25万条（全量历史）',
        script: 'collect_stock_financial.py',
        scheduleDesc: '每季报季更新（3/4/8/10月）',
        reqId: 'REQ-050',
        staleThresholdDays: 90,
      },
      {
        id: 'stock_balance',
        label: '资产负债表',
        description: '全市场A股历史资产负债表（152字段全存）',
        table: 'stock_balance',
        dateField: 'end_date',
        targetCount: 250000,
        targetDesc: '~25万条（全量历史）',
        script: 'collect_stock_financial.py',
        scheduleDesc: '每季报季更新（3/4/8/10月）',
        reqId: 'REQ-051',
        staleThresholdDays: 90,
      },
      {
        id: 'stock_cashflow',
        label: '现金流量表',
        description: '全市场A股历史现金流量表（97字段全存）',
        table: 'stock_cashflow',
        dateField: 'end_date',
        targetCount: 250000,
        targetDesc: '~25万条（全量历史）',
        script: 'collect_stock_financial.py',
        scheduleDesc: '每季报季更新（3/4/8/10月）',
        reqId: 'REQ-052',
        staleThresholdDays: 90,
      },
      {
        id: 'stock_fina_indicator',
        label: '财务指标（衍生）',
        description: 'ROE/毛利率/资产负债率/FCF等108个衍生财务指标（含TTM/单季）',
        table: 'stock_fina_indicator',
        dateField: 'end_date',
        targetCount: 250000,
        targetDesc: '~25万条（全量历史）',
        script: 'collect_stock_fina_indicator.py',
        scheduleDesc: '每季报季更新（3/4/8/10月）',
        reqId: 'REQ-053',
        staleThresholdDays: 90,
      },
    ],
  },
  {
    id: 'news',
    label: '新闻/公告',
    icon: <Newspaper className="w-4 h-4" />,
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    sources: [
      {
        id: 'news',
        label: '新闻快讯',
        description: '9大来源新闻（新浪/华尔街见闻/同花顺/东方财富/财联社/第一财经等）',
        table: 'news',
        dateField: 'pub_time',
        targetCount: 500000,
        targetDesc: '~50万条（2018至今）',
        script: 'collect_news.py',
        scheduleDesc: '每日两次增量更新',
        reqId: 'REQ-065',
        staleThresholdDays: 2,
      },
      {
        id: 'stock_announcement',
        label: '上市公司公告',
        description: '全市场A股上市公司公告（含年报/季报/重大事项）',
        table: 'stock_announcement',
        dateField: 'ann_date',
        targetCount: 1000000,
        targetDesc: '~100万条（全量历史）',
        script: 'collect_stock_announcement.py',
        scheduleDesc: '每日增量更新',
        reqId: 'REQ-066',
        staleThresholdDays: 3,
      },
      {
        id: 'cctv_news',
        label: '新闻联播文字稿',
        description: '央视新闻联播文字稿（政策信号分析用）',
        table: 'cctv_news',
        dateField: 'date',
        targetCount: 3000,
        targetDesc: '~3000条（2017至今）',
        script: 'collect_cctv_news.py',
        scheduleDesc: '每日增量更新',
        reqId: 'REQ-067',
        staleThresholdDays: 3,
      },
    ],
  },
  {
    id: 'research',
    label: '研报/荐股',
    icon: <FileText className="w-4 h-4" />,
    color: 'text-rose-700',
    bgColor: 'bg-rose-50',
    sources: [
      {
        id: 'broker_recommend',
        label: '券商月度金股',
        description: '各大券商每月推荐的重点股票（月度金股池）',
        table: 'broker_recommend',
        dateField: 'month',
        targetCount: 15000,
        targetDesc: '~1.5万条（2020至今）',
        script: 'collect_broker_recommend.py',
        scheduleDesc: '每月初自动更新',
        reqId: 'REQ-069',
        staleThresholdDays: 35,
        notes: '已采集202510~202603共6个月，8,701条，每月初自动更新',
      },
      {
        id: 'reports',
        label: '券商研究报告',
        description: '个股/行业/宏观研报（三层宽表：原始信息+AI提取+回测验证）',
        table: 'reports',
        dateField: 'publish_date',
        targetCount: 80000,
        targetDesc: '~8万条（2025至今，东方财富+Tushare）',
        script: 'collect_reports_eastmoney.py',
        scheduleDesc: '每日09:00增量采集（东方财富无限制，Tushare每天5次）',
        reqId: 'REQ-076',
        staleThresholdDays: 3,
        notes: '已采集2025-01至今：个股18,001条 / 行业23,172条 / 宏观13,816条，共~55,000条',
      },
    ],
  },
  {
    id: 'calendar',
    label: '事件日历',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-50',
    sources: [
      {
        id: 'economic_events',
        label: 'Forex Factory 经济日历',
        description: '全球重要经济事件（非农/CPI/央行会议等），含重要性等级和预期值',
        table: 'economic_events',
        dateField: 'event_timestamp',
        targetCount: 500,
        targetDesc: '~500条/年（滚动维护）',
        script: 'collect_ff_calendar.py',
        scheduleDesc: '每日08:00自动更新本周数据',
        reqId: 'REQ-044~047',
        staleThresholdDays: 2,
        notes: '已完成本周128条，每日增量UPSERT',
      },
    ],
  },
];

// ── 工具函数 ───────────────────────────────────────────────────────────────────

/** 通过 RPC 一次性获取所有表的行数（基于 pg_stat_user_tables，无超时风险） */
async function fetchAllTableCounts(): Promise<Record<string, number>> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_table_row_counts`,
    {
      method: 'POST',
      headers: SUPA_HEADERS,
      body: JSON.stringify({}),
    }
  );
  if (!resp.ok) throw new Error(`RPC failed: ${resp.status}`);
  const data: Array<{ table_name: string; row_count: number }> = await resp.json();
  const map: Record<string, number> = {};
  data.forEach((row) => { map[row.table_name] = Number(row.row_count); });
  return map;
}

/** 查询表的最新日期 */
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
  } catch {
    return null;
  }
}

/** 计算距今天数 */
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/** 格式化数字（带千分位） */
function fmtNum(n: number | null): string {
  if (n === null) return '—';
  if (n === -1) return '表不存在';
  if (n < 0) return '—';
  return n.toLocaleString('zh-CN');
}

/** 格式化日期 */
function fmtDate(s: string | null): string {
  if (!s) return '—';
  return s.slice(0, 10);
}

/** 计算进度百分比 */
function calcProgress(count: number | null, target?: number): number | null {
  if (count === null || count <= 0 || !target) return null;
  return Math.min(100, Math.round((count / target) * 100));
}

// ── 状态徽章 ───────────────────────────────────────────────────────────────────
function StatusBadge({ status, count }: { status: TableStat['status']; count: number | null }) {
  if (status === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <RefreshCw className="w-3 h-3 animate-spin" /> 加载中
      </span>
    );
  }
  if (status === 'error' || count === -1) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
        <XCircle className="w-3 h-3" /> 表不存在
      </span>
    );
  }
  if (status === 'empty' || count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" /> 空表
      </span>
    );
  }
  if (status === 'stale') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" /> 数据陈旧
      </span>
    );
  }
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
        {/* 左侧：名称 + 描述 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{source.label}</span>
            {source.reqId && (
              <span className="text-xs text-gray-400 font-mono">{source.reqId}</span>
            )}
            <StatusBadge status={stat.status} count={stat.count} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{source.description}</p>
          {source.notes && (
            <p className="text-xs text-blue-600 mt-0.5 italic">{source.notes}</p>
          )}
        </div>

        {/* 右侧：数据量 */}
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold text-gray-800 tabular-nums">
            {stat.status === 'loading' ? (
              <span className="text-gray-300">—</span>
            ) : (
              fmtNum(stat.count)
            )}
          </div>
          {source.targetDesc && (
            <div className="text-xs text-gray-400">目标：{source.targetDesc}</div>
          )}
        </div>
      </div>

      {/* 进度条（仅有明确数量时显示） */}
      {progress !== null && <ProgressBar pct={progress} />}

      {/* 底部元信息行 */}
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
        {source.script && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Database className="w-3 h-3" />
            <code className="font-mono">{source.script}</code>
          </span>
        )}
        {source.scheduleDesc && (
          <span className="text-xs text-gray-400">
            🕐 {source.scheduleDesc}
          </span>
        )}
      </div>
    </div>
  );
}

// ── 分组卡片 ───────────────────────────────────────────────────────────────────
function GroupCard({
  group,
  stats,
  defaultOpen = true,
}: {
  group: DataGroup;
  stats: Record<string, TableStat>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const groupStats = group.sources.map((s) => stats[s.id] ?? { table: s.table, count: null, latestDate: null, status: 'loading' as const });
  const totalOk = groupStats.filter((s) => s.status === 'ok').length;
  const totalEmpty = groupStats.filter((s) => s.status === 'empty' || s.count === 0).length;
  const totalError = groupStats.filter((s) => s.status === 'error' || s.count === -1).length;
  const totalStale = groupStats.filter((s) => s.status === 'stale').length;
  const totalRows = groupStats.reduce((sum, s) => {
    if (s.count && s.count > 0) return sum + s.count;
    return sum;
  }, 0);

  return (
    <Card className="overflow-hidden border-gray-200 shadow-sm">
      <button
        className="w-full text-left"
        onClick={() => setOpen(!open)}
      >
        <CardHeader className={`py-3 px-4 ${group.bgColor} border-b border-gray-100`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={group.color}>{group.icon}</span>
              <CardTitle className={`text-sm font-semibold ${group.color}`}>
                {group.label}
              </CardTitle>
              <span className="text-xs text-gray-500">
                {group.sources.length} 个数据源 · 共 {totalRows > 0 ? totalRows.toLocaleString('zh-CN') : '—'} 条
              </span>
            </div>
            <div className="flex items-center gap-2">
              {totalError > 0 && (
                <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                  {totalError} 表缺失
                </span>
              )}
              {totalEmpty > 0 && (
                <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                  {totalEmpty} 空表
                </span>
              )}
              {totalStale > 0 && (
                <span className="text-xs text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
                  {totalStale} 陈旧
                </span>
              )}
              {totalOk === group.sources.length && totalOk > 0 && (
                <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  全部正常
                </span>
              )}
              {open ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
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
function SummaryCards({ stats }: { stats: Record<string, TableStat> }) {
  const allSources = DATA_GROUPS.flatMap((g) => g.sources);
  const allStats = allSources.map((s) => stats[s.id]).filter(Boolean) as TableStat[];
  const loaded = allStats.filter((s) => s.status !== 'loading');
  const ok = loaded.filter((s) => s.status === 'ok').length;
  const empty = loaded.filter((s) => s.status === 'empty' || s.count === 0).length;
  const error = loaded.filter((s) => s.status === 'error' || (s.count !== null && s.count === -1)).length;
  const stale = loaded.filter((s) => s.status === 'stale').length;
  const totalRows = loaded.reduce((sum, s) => sum + (s.count && s.count > 0 ? s.count : 0), 0);
  const healthPct = loaded.length > 0 ? Math.round((ok / loaded.length) * 100) : 0;

  const cards = [
    {
      label: '总数据量',
      value: totalRows > 0 ? totalRows.toLocaleString('zh-CN') : '—',
      sub: `${allSources.length} 个数据源`,
      icon: <Database className="w-5 h-5 text-blue-500" />,
      bg: 'bg-blue-50',
    },
    {
      label: '正常',
      value: String(ok),
      sub: `${healthPct}% 健康率`,
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
      bg: 'bg-emerald-50',
    },
    {
      label: '空表',
      value: String(empty),
      sub: '需要采集',
      icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
      bg: 'bg-amber-50',
    },
    {
      label: '表缺失/陈旧',
      value: String(error + stale),
      sub: `${error} 缺失 · ${stale} 陈旧`,
      icon: <XCircle className="w-5 h-5 text-red-500" />,
      bg: 'bg-red-50',
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
  const [stats, setStats] = useState<Record<string, TableStat>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);

    // 初始化为 loading 状态
    const initStats: Record<string, TableStat> = {};
    DATA_GROUPS.forEach((g) =>
      g.sources.forEach((s) => {
        initStats[s.id] = { table: s.table, count: null, latestDate: null, status: 'loading' };
      })
    );
    setStats({ ...initStats });

    try {
      // 1. 一次性获取所有表的行数（高效，无超时风险）
      const countMap = await fetchAllTableCounts();

      // 2. 并发查询所有有 dateField 的表的最新日期
      const allSources = DATA_GROUPS.flatMap((g) => g.sources);
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
        if (result.status === 'fulfilled') {
          dateMap[result.value.id] = result.value.latestDate;
        } else {
          dateMap[source.id] = null;
        }
      });

      // 3. 组合结果，计算状态
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
    }

    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <TooltipProvider>
      <Helmet>
        <title>数据管理后台 | Trudecide</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* ── Header ── */}
        <header className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-4 shadow-md">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <button className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                  返回看板
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
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <Link href="/knowledge">
                <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 px-3 py-1.5 rounded-lg transition-all text-sm">
                  <BookOpen className="w-4 h-4" />
                  知识库
                </button>
              </Link>
            </div>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="max-w-6xl mx-auto px-6 py-6">
          {/* 说明横幅 */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6 text-sm text-blue-700">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              本页面实时查询 Supabase 数据库，展示所有数据采集目标的当前状态。
              行数通过 <code className="font-mono text-xs bg-blue-100 px-1 rounded">pg_stat_user_tables</code> 统计视图获取（估算值，误差 &lt;1%）。
              <span className="text-blue-500 ml-1">进度条基于预估目标量，仅供参考。</span>
            </div>
          </div>

          {/* 汇总卡片 */}
          <SummaryCards stats={stats} />

          {/* 分组列表 */}
          <div className="flex flex-col gap-4">
            {DATA_GROUPS.map((group, i) => (
              <GroupCard
                key={group.id}
                group={group}
                stats={stats}
                defaultOpen={i < 4}
              />
            ))}
          </div>

          {/* 底部说明 */}
          <div className="mt-6 text-xs text-gray-400 text-center">
            数据来源：Supabase · 采集脚本：scripts/ · 调度：Manus Schedule · 行数统计：pg_stat_user_tables（估算）
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
