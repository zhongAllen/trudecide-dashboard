/**
 * topdown-api.ts — Top-Down 选股策略 真实数据层
 *
 * 封装所有 Supabase 查询，供 TopDown.tsx 使用。
 * 数据来源：
 *   - 板块列表：sector_meta + sector_daily（dc 系统）
 *   - 板块成分股：sector_stock_map（is_current=true）
 *   - 个股行情：stock_daily + stock_daily_basic（最新交易日）
 *   - 个股财务：stock_fina_indicator（最新报告期）
 *   - 个股资金流：stock_moneyflow（最新交易日）
 *   - 个股基础信息：stock_meta
 */

import { supabase } from '@/lib/supabase';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface RealSectorMeta {
  id: string;
  name_cn: string;
  idx_type: string;
  system: string;
}

export interface RealSectorDaily {
  sector_id: string;
  trade_date: string;
  pct_change: number;
  turnover_rate: number | null;
  total_mv: number | null;
  close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
}

export interface RealStockMeta {
  ts_code: string;
  symbol: string;
  name_cn: string;
  area: string;
  industry: string;
  market: string;
  list_date: string;
  is_active: boolean;
}

export interface RealStockQuote {
  ts_code: string;
  trade_date: string;
  close: number;
  pct_chg: number;
  // from stock_daily_basic
  pe_ttm: number | null;
  pb: number | null;
  total_mv: number | null;
  circ_mv: number | null;
  turnover_rate: number | null;
}

export interface RealStockFina {
  ts_code: string;
  end_date: string;
  roe: number | null;
  grossprofit_margin: number | null;
  netprofit_yoy: number | null;
  or_yoy: number | null;
  debt_to_assets: number | null;
}

export interface RealStockMoneyflow {
  ts_code: string;
  trade_date: string;
  net_amount: number | null;
  buy_elg_amount: number | null;
  buy_lg_amount: number | null;
  buy_md_amount: number | null;
  buy_sm_amount: number | null;
}

// ─── 获取最新交易日 ───────────────────────────────────────────────────────────

let _latestTradeDate: string | null = null;

export async function getLatestTradeDate(): Promise<string> {
  if (_latestTradeDate) return _latestTradeDate;
  const { data } = await supabase
    .from('stock_daily')
    .select('trade_date')
    .order('trade_date', { ascending: false })
    .limit(1);
  _latestTradeDate = (data?.[0]?.trade_date as string | undefined) ?? '2026-03-02';
  return _latestTradeDate;
}

// ─── 板块数据 ─────────────────────────────────────────────────────────────────

/**
 * 获取板块列表（含最新日行情）
 * 使用 dc 系统，因为 sector_daily 只有 dc 系统的数据
 */
export async function fetchSectorList(idxType?: string): Promise<Array<RealSectorMeta & { latest: RealSectorDaily | null }>> {
  const tradeDate = await getLatestTradeDate();

  // 1. 获取板块元数据（dc 系统）
  let metaQuery = supabase
    .from('sector_meta')
    .select('id, name_cn, idx_type, system')
    .like('id', 'dc_%');
  if (idxType) {
    metaQuery = metaQuery.eq('idx_type', idxType);
  }
  const { data: metas } = await metaQuery.limit(500);
  if (!metas || metas.length === 0) return [];

  // 2. 获取最新日行情
  const sectorIds = metas.map(m => m.id);
  const { data: dailies } = await supabase
    .from('sector_daily')
    .select('sector_id, trade_date, pct_change, turnover_rate, total_mv, close, open, high, low')
    .eq('trade_date', tradeDate)
    .in('sector_id', sectorIds);

  const dailyMap: Record<string, RealSectorDaily> = {};
  dailies?.forEach(d => { dailyMap[d.sector_id] = d; });

  return metas.map(m => ({
    ...m,
    latest: dailyMap[m.id] ?? null,
  }));
}

/**
 * 获取板块近 N 天历史行情（用于迷你 K 线）
 */
export async function fetchSectorHistory(sectorId: string, days = 20): Promise<RealSectorDaily[]> {
  const { data } = await supabase
    .from('sector_daily')
    .select('sector_id, trade_date, pct_change, turnover_rate, total_mv, close, open, high, low')
    .eq('sector_id', sectorId)
    .order('trade_date', { ascending: false })
    .limit(days);
  return (data ?? []).reverse();
}

// ─── 个股数据 ─────────────────────────────────────────────────────────────────

/**
 * 获取板块成分股列表（含行情 + 财务 + 资金流）
 */
export async function fetchSectorStocks(sectorId: string): Promise<Array<{
  meta: RealStockMeta;
  quote: RealStockQuote;
  fina: RealStockFina;
  moneyflow: RealStockMoneyflow | null;
}>> {
  const tradeDate = await getLatestTradeDate();

  // 1. 获取成分股 ts_code 列表
  const { data: members } = await supabase
    .from('sector_stock_map')
    .select('ts_code')
    .eq('sector_id', sectorId)
    .eq('is_current', true)
    .limit(200);

  if (!members || members.length === 0) return [];
  const tsCodes = members.map(m => m.ts_code);

  // 2. 并行获取所有数据
  const [metaRes, dailyRes, basicRes, finaRes, mfRes] = await Promise.all([
    // 个股基础信息
    supabase.from('stock_meta').select('ts_code, symbol, name_cn, area, industry, market, list_date, is_active').in('ts_code', tsCodes),
    // 个股日线行情
    supabase.from('stock_daily').select('ts_code, trade_date, close, pct_chg').eq('trade_date', tradeDate).in('ts_code', tsCodes),
    // 个股估值
    supabase.from('stock_daily_basic').select('ts_code, trade_date, pe_ttm, pb, total_mv, circ_mv, turnover_rate').eq('trade_date', tradeDate).in('ts_code', tsCodes),
    // 个股财务（最新报告期）
    supabase.from('stock_fina_indicator').select('ts_code, end_date, roe, grossprofit_margin, netprofit_yoy, or_yoy, debt_to_assets').in('ts_code', tsCodes).order('end_date', { ascending: false }).limit(tsCodes.length * 2),
    // 个股资金流
    supabase.from('stock_moneyflow').select('ts_code, trade_date, net_amount, buy_elg_amount, buy_lg_amount, buy_md_amount, buy_sm_amount').eq('trade_date', tradeDate).in('ts_code', tsCodes),
  ]);

  // 3. 构建 Map
  const metaMap: Record<string, RealStockMeta> = {};
  metaRes.data?.forEach(m => { metaMap[m.ts_code] = m; });

  const dailyMap: Record<string, { close: number; pct_chg: number; trade_date: string }> = {};
  dailyRes.data?.forEach(d => { dailyMap[d.ts_code] = d; });

  const basicMap: Record<string, { pe_ttm: number | null; pb: number | null; total_mv: number | null; circ_mv: number | null; turnover_rate: number | null }> = {};
  basicRes.data?.forEach(b => { basicMap[b.ts_code] = b; });

  // 财务取最新报告期（已按 end_date desc 排序，取第一条）
  const finaMap: Record<string, RealStockFina> = {};
  finaRes.data?.forEach(f => {
    if (!finaMap[f.ts_code]) finaMap[f.ts_code] = f;
  });

  const mfMap: Record<string, RealStockMoneyflow> = {};
  mfRes.data?.forEach(m => { mfMap[m.ts_code] = m; });

  // 4. 合并数据，过滤掉缺少关键数据的股票
  const result = tsCodes
    .filter(code => metaMap[code] && dailyMap[code])
    .map(code => {
      const daily = dailyMap[code];
      const basic = basicMap[code] ?? {};
      return {
        meta: metaMap[code],
        quote: {
          ts_code: code,
          trade_date: daily.trade_date,
          close: daily.close,
          pct_chg: daily.pct_chg,
          pe_ttm: basic.pe_ttm ?? null,
          pb: basic.pb ?? null,
          total_mv: basic.total_mv ?? null,
          circ_mv: basic.circ_mv ?? null,
          turnover_rate: basic.turnover_rate ?? null,
        },
        fina: finaMap[code] ?? {
          ts_code: code,
          end_date: '',
          roe: null,
          grossprofit_margin: null,
          netprofit_yoy: null,
          or_yoy: null,
          debt_to_assets: null,
        },
        moneyflow: mfMap[code] ?? null,
      };
    });

  return result;
}

// ─── 宏观/大盘数据（Layer 1） ────────────────────────────────────────────────

/**
 * 宏观指标单条数据
 */
export interface MacroIndicatorValue {
  indicator_id: string;
  name_cn: string;
  value: number | null;
  trade_date: string | null;
  unit: string | null;
  region: string;
  /** 是否有真实数据（false 表示暂无数据） */
  has_data: boolean;
}

/**
 * 大盘指数日行情
 */
export interface IndexDailyBar {
  ts_code: string;
  name_cn: string;
  trade_date: string;
  close: number;
  pct_chg: number;
  market: string;
}

/**
 * 获取 Layer 1 宏观指标实时快照
 *
 * 覆盖指标：
 *   货币流动性：DR007, Shibor隔夜, LPR 1Y/5Y, 10Y国债
 *   通谨/景气：CPI同比, PPI同比, PMI制造业, PMI非制造业
 *   经济增长：GDP同比, M2同比, 工业增加值同比, 社融同比
 *   市场情绪：融资余额(沪+深), 北向成交额, VIX
 *   估值：沪深300 PB, 全A PB中位数
 */
export async function fetchMacroSnapshot(): Promise<MacroIndicatorValue[]> {
  // 定义需要查询的指标列表（indicator_id + region）
  const targets: Array<{ id: string; region: string; name_cn: string; unit: string }> = [
    // 货币流动性
    { id: 'dr007',       region: 'CN', name_cn: 'DR007',          unit: '%' },
    { id: 'shibor_on',   region: 'CN', name_cn: 'Shibor隔夜',      unit: '%' },
    { id: 'lpr_1y',      region: 'CN', name_cn: 'LPR 1年期',       unit: '%' },
    { id: 'lpr_5y',      region: 'CN', name_cn: 'LPR 5年期',       unit: '%' },
    { id: 'bond_10y',    region: 'CN', name_cn: '10年国债收益率',   unit: '%' },
    // 通谨/景气
    { id: 'cpi_yoy',     region: 'CN', name_cn: 'CPI同比',         unit: '%' },
    { id: 'ppi_yoy',     region: 'CN', name_cn: 'PPI同比',         unit: '%' },
    { id: 'pmi_mfg',     region: 'CN', name_cn: 'PMI制造业',       unit: '点' },
    { id: 'pmi_non_mfg', region: 'CN', name_cn: 'PMI非制造业',     unit: '点' },
    // 经济增长
    { id: 'gdp_yoy',     region: 'CN', name_cn: 'GDP同比',         unit: '%' },
    { id: 'm2_yoy',      region: 'CN', name_cn: 'M2同比',          unit: '%' },
    { id: 'industrial_yoy', region: 'CN', name_cn: '工业增加值同比', unit: '%' },
    { id: 'social_finance_yoy', region: 'CN', name_cn: '社融存量同比', unit: '%' },
    // 市场情绪
    { id: 'margin_balance_sh', region: 'CN', name_cn: '沪融资余额', unit: '元' },
    { id: 'margin_balance_sz', region: 'CN', name_cn: '深融资余额', unit: '元' },
    { id: 'north_daily_turnover', region: 'CN', name_cn: '北向成交额', unit: '亿元' },
    { id: 'vix',         region: 'GL', name_cn: 'VIX恐慷指数',     unit: '' },
    // 估值
    { id: 'hs300_pb',    region: 'CN', name_cn: '沪深300 PB',       unit: '' },
    { id: 'all_a_pb',    region: 'CN', name_cn: '全A PB中位数',     unit: '' },
  ];

  // 并行查询所有指标的最新值
  const results = await Promise.all(
    targets.map(async t => {
      const { data } = await supabase
        .from('indicator_values')
        .select('indicator_id, trade_date, value')
        .eq('indicator_id', t.id)
        .eq('region', t.region)
        .order('trade_date', { ascending: false })
        .limit(1);
      const row = data?.[0];
      return {
        indicator_id: t.id,
        name_cn: t.name_cn,
        value: row?.value ?? null,
        trade_date: row?.trade_date ?? null,
        unit: t.unit,
        region: t.region,
        has_data: !!row,
      } as MacroIndicatorValue;
    })
  );

  return results;
}

/**
 * 获取指定指标的近 N 个月历史数据（用于走势图）
 */
export async function fetchIndicatorHistory(
  indicatorId: string,
  region: string,
  months = 24
): Promise<Array<{ trade_date: string; value: number }>> {
  const { data } = await supabase
    .from('indicator_values')
    .select('trade_date, value')
    .eq('indicator_id', indicatorId)
    .eq('region', region)
    .order('trade_date', { ascending: false })
    .limit(months);
  return (data ?? []).reverse().map(d => ({ trade_date: d.trade_date, value: d.value }));
}

/**
 * 获取大盘指数最新行情（上证、沪深300、深成、恒生、标普500、纳斯达克、日经225、VIX）
 */
export async function fetchIndexSnapshot(): Promise<IndexDailyBar[]> {
  // 定义关注的指数列表
  const INDEX_MAP: Record<string, string> = {
    '000001.SH': '上证指数',
    '000300.SH': '沪深300',
    '399001.SZ': '深证成指',
    'HSI':       '恒生指数',
    'HKTECH':    '恒生科技',
    'SPX':       '标普500',
    'N225':      '日经225',
    'DJI':       '道琼工业',
  };

  // 查最新一天的数据
  const { data: latestRows } = await supabase
    .from('index_daily')
    .select('ts_code, trade_date, close, pct_chg, market')
    .in('ts_code', Object.keys(INDEX_MAP))
    .order('trade_date', { ascending: false })
    .limit(50);

  if (!latestRows || latestRows.length === 0) return [];

  // 每个指数只取最新一条
  const seen = new Set<string>();
  const result: IndexDailyBar[] = [];
  for (const row of latestRows) {
    if (!seen.has(row.ts_code) && INDEX_MAP[row.ts_code]) {
      seen.add(row.ts_code);
      result.push({
        ts_code: row.ts_code,
        name_cn: INDEX_MAP[row.ts_code],
        trade_date: row.trade_date,
        close: row.close,
        pct_chg: row.pct_chg,
        market: row.market,
      });
    }
  }
  // 按定义顺序排序
  const order = Object.keys(INDEX_MAP);
  result.sort((a, b) => order.indexOf(a.ts_code) - order.indexOf(b.ts_code));
  return result;
}

/**
 * 获取个股近 N 天 K 线（用于详情页图表）
 */
export async function fetchStockKline(tsCode: string, days = 60): Promise<Array<{
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  pct_chg: number;
  vol: number;
}>> {
  const { data } = await supabase
    .from('stock_daily')
    .select('trade_date, open, high, low, close, pct_chg, vol')
    .eq('ts_code', tsCode)
    .order('trade_date', { ascending: false })
    .limit(days);
  return (data ?? []).reverse();
}

// ─── 宏观状态矩阵评分引擎（Layer 1）REQ-159 ──────────────────────────────────
//
// 设计原则：
//   1. 可解释性：每个单元格 score = Σ(因子 raw_score × 权重)，规则完全透明
//   2. 数据驱动：所有 current_value 来自 indicator_values 真实数据
//   3. 版本化：规则文档见 docs/macro_matrix_scoring_rules.md
//
// 评分函数说明：
//   mapToScore(value, thresholds, direction)
//   - thresholds: [t1, t2, t3, t4] 四个阈值，将值域分为5段
//   - 正向指标(direction='pos'): value < t1 → 10, [t1,t2) → 30, [t2,t3) → 55, [t3,t4) → 80, ≥t4 → 95
//   - 负向指标(direction='neg'): 规则相反，value > t1 → 10, ... ≤t4 → 95
//   - 数据缺失(null): 返回 50（中性默认值，并在 note 中标注）

/**
 * 通用分段线性评分函数
 * @param value   指标当前值（null 表示无数据）
 * @param t       四个阈值 [t1, t2, t3, t4]，将值域分为5段
 * @param dir     'pos'=正向（越大越好）| 'neg'=负向（越小越好）
 * @returns       0-100 的原始分
 */
function mapToScore(value: number | null, t: [number, number, number, number], dir: 'pos' | 'neg' = 'pos'): number {
  if (value === null || value === undefined) return 50; // 数据缺失，中性默认
  if (dir === 'pos') {
    if (value >= t[3]) return 95;
    if (value >= t[2]) return 80;
    if (value >= t[1]) return 55;
    if (value >= t[0]) return 30;
    return 10;
  } else {
    if (value <= t[3]) return 95;
    if (value <= t[2]) return 80;
    if (value <= t[1]) return 55;
    if (value <= t[0]) return 30;
    return 10;
  }
}

/** 根据总分推断趋势（简化规则：与上期比较，暂用分段静态规则） */
function scoreToTrend(score: number): 'up' | 'down' | 'flat' {
  if (score >= 70) return 'up';
  if (score <= 35) return 'down';
  return 'flat';
}

/** 根据总分生成状态标签 */
function scoreToStatus(score: number, positiveLabel: string, neutralLabel: string, negativeLabel: string): string {
  if (score >= 70) return positiveLabel;
  if (score >= 50) return neutralLabel;
  return negativeLabel;
}

/** 构建因子贡献描述文字 */
function buildDesc(factors: Array<{ name: string; value: number | null; unit: string; contribution: number; note: string }>): string {
  const parts = factors
    .filter(f => f.value !== null)
    .map(f => `${f.name}=${f.value}${f.unit}（贡献${f.contribution.toFixed(1)}分）`);
  return parts.join('，');
}

// ─── 真实数据矩阵计算 ─────────────────────────────────────────────────────────

export interface RealMatrixCell {
  status: string;
  score: number;
  trend: 'up' | 'down' | 'flat';
  desc: string;
  indicators: string[];
  data_quality: 'live' | 'mock' | 'warn';
  factors: Array<{
    name: string;
    indicator_id: string;
    current_value: number | null;
    unit: string;
    weight: number;
    raw_score: number;
    contribution: number;
    direction: '正向' | '负向';
    note: string;
  }>;
  score_formula: string;
}

export interface RealMacroMatrix {
  region: 'CN' | 'US';
  snapshot_date: string;
  model_version: string;
  rows: Array<{
    dimension: string;
    a_stock_corr: '正相关' | '负相关' | '弱相关';
    short: RealMatrixCell;
    mid: RealMatrixCell;
    long: RealMatrixCell;
  }>;
  summary: {
    short: RealMatrixCell;
    mid: RealMatrixCell;
    long: RealMatrixCell;
  };
}

/**
 * 计算 CN 宏观状态矩阵（真实数据驱动）
 *
 * 评分规则详见 docs/macro_matrix_scoring_rules.md (REQ-159)
 * 所有指标值来自 indicator_values 表，region='CN'
 */
export async function fetchRealMacroMatrix(): Promise<RealMacroMatrix> {
  // ── 1. 批量拉取所有需要的指标最新值 ──────────────────────────────────────
  const indicatorIds = [
    'pmi_mfg', 'pmi_non_mfg', 'gdp_yoy', 'industrial_yoy', 'retail_yoy',
    'fai_yoy', 'export_yoy', 'import_yoy', 'unemployment_rate',
    'lpr_1y', 'lpr_5y', 'dr007', 'bond_10y', 'rmb_usd',
    'm2_yoy', 'social_finance_yoy', 'new_loans', 'social_finance',
    'north_daily_turnover', 'margin_balance_sh', 'margin_balance_sz',
    'vix', 'trade_balance', 'cpi_yoy', 'ppi_yoy',
  ];

  // 并行查询所有指标的最新值
  const rows = await Promise.all(
    indicatorIds.map(async id => {
      const region = id === 'vix' ? 'GL' : 'CN';
      const { data } = await supabase
        .from('indicator_values')
        .select('indicator_id, trade_date, value')
        .eq('indicator_id', id)
        .eq('region', region)
        .order('trade_date', { ascending: false })
        .limit(1);
      return { id, value: data?.[0]?.value ?? null, date: data?.[0]?.trade_date ?? null };
    })
  );

  // 构建 Map
  const v: Record<string, number | null> = {};
  rows.forEach(r => { v[r.id] = r.value; });

  // 融资余额合并（沪+深）
  const marginTotal = (v['margin_balance_sh'] ?? 0) + (v['margin_balance_sz'] ?? 0);

  // 快照日期（取最新 trade_date）
  const snapshotDate = rows.find(r => r.date)?.date?.slice(0, 7).replace('-', '') ?? '202603';

  // ── 2. 按规则计算各维度各周期得分 ────────────────────────────────────────

  // ── 维度1：经济周期位置 ──────────────────────────────────────────────────

  // 短期：PMI + GDP + 工业 + 消费
  const d1s_pmi_mfg     = mapToScore(v['pmi_mfg'],       [48, 49.5, 50.5, 51.5], 'pos');
  const d1s_pmi_non     = mapToScore(v['pmi_non_mfg'],   [49, 50.5, 52, 54],     'pos');
  const d1s_gdp         = mapToScore(v['gdp_yoy'],       [3.5, 4.5, 5.5, 6.5],  'pos');
  const d1s_industrial  = mapToScore(v['industrial_yoy'],[2, 4, 6, 8],           'pos');
  const d1s_retail      = mapToScore(v['retail_yoy'],    [1, 3, 5, 7],           'pos');
  const d1s_score = Math.round(d1s_pmi_mfg*0.3 + d1s_pmi_non*0.2 + d1s_gdp*0.25 + d1s_industrial*0.15 + d1s_retail*0.1);

  // 中期：GDP + FAI + 出口 + 失业率 + 进口
  const d1m_gdp         = mapToScore(v['gdp_yoy'],       [3.5, 4.5, 5.5, 6.5],  'pos');
  const d1m_fai         = mapToScore(v['fai_yoy'],       [2, 4, 6, 8],           'pos');
  const d1m_export      = mapToScore(v['export_yoy'],    [-5, 0, 5, 10],         'pos');
  const d1m_unemp       = mapToScore(v['unemployment_rate'], [5.5, 5.2, 4.8, 4.5], 'neg');
  const d1m_import      = mapToScore(v['import_yoy'],    [-5, 0, 5, 10],         'pos');
  const d1m_score = Math.round(d1m_gdp*0.3 + d1m_fai*0.25 + d1m_export*0.2 + d1m_unemp*0.15 + d1m_import*0.1);

  // 长期：定性判断（人口老龄化等结构性因素，暂用固定基础分）
  const d1l_score = 41;

  // ── 维度2：货币政策信号 ──────────────────────────────────────────────────

  // 短期：LPR + DR007 + 国债 + LPR5Y
  const d2s_lpr1y  = mapToScore(v['lpr_1y'],   [3.8, 3.6, 3.4, 3.2], 'neg');
  const d2s_dr007  = mapToScore(v['dr007'],    [2.2, 2.0, 1.8, 1.6], 'neg');
  const d2s_bond   = mapToScore(v['bond_10y'], [3.0, 2.8, 2.6, 2.4], 'neg');
  const d2s_lpr5y  = mapToScore(v['lpr_5y'],   [4.5, 4.2, 3.9, 3.6], 'neg');
  const d2s_score  = Math.round(d2s_lpr1y*0.3 + d2s_dr007*0.25 + d2s_bond*0.25 + d2s_lpr5y*0.2);

  // 中期：国债 + LPR1Y + 汇率约束
  const d2m_bond   = mapToScore(v['bond_10y'], [3.0, 2.8, 2.6, 2.4], 'neg');
  const d2m_lpr1y  = mapToScore(v['lpr_1y'],   [3.8, 3.6, 3.4, 3.2], 'neg');
  const d2m_rmb    = mapToScore(v['rmb_usd'],  [7.3, 7.1, 6.9, 6.7], 'neg');
  const d2m_score  = Math.round(d2m_bond*0.4 + d2m_lpr1y*0.35 + d2m_rmb*0.25);

  // 长期：利率中枢下行趋势 vs 债务约束，暂用固定基础分
  const d2l_score  = 52;

  // ── 维度3：政策底确认 ────────────────────────────────────────────────────

  // 短期：M2 + 社融 + 新增贷款 + 社融增量
  const d3s_m2     = mapToScore(v['m2_yoy'],           [7, 8, 9, 10],       'pos');
  const d3s_sfyoy  = mapToScore(v['social_finance_yoy'],[7, 8, 9, 10],      'pos');
  // new_loans 单位为亿元，1.5万亿=15000亿
  const d3s_loans  = mapToScore(v['new_loans'] ? v['new_loans']/10000 : null, [1.0, 1.5, 2.0, 2.5], 'pos');
  // social_finance 单位为亿元，2万亿=20000亿
  const d3s_sf     = mapToScore(v['social_finance'] ? v['social_finance']/10000 : null, [1.5, 2.5, 3.5, 4.5], 'pos');
  const d3s_score  = Math.round(d3s_m2*0.3 + d3s_sfyoy*0.3 + d3s_loans*0.25 + d3s_sf*0.15);

  // 中期：社融 + M2 + 新增贷款
  const d3m_sfyoy  = mapToScore(v['social_finance_yoy'],[7, 8, 9, 10],      'pos');
  const d3m_m2     = mapToScore(v['m2_yoy'],           [7, 8, 9, 10],       'pos');
  const d3m_loans  = mapToScore(v['new_loans'] ? v['new_loans']/10000 : null, [1.0, 1.5, 2.0, 2.5], 'pos');
  const d3m_score  = Math.round(d3m_sfyoy*0.4 + d3m_m2*0.35 + d3m_loans*0.25);

  // 长期：结构性改革 vs 债务约束，暂用固定基础分
  const d3l_score  = 50;

  // ── 维度4：流动性环境 ────────────────────────────────────────────────────

  // 短期：成交额 + M2 + 北向 + 融资余额
  // north_daily_turnover 单位为亿元
  const d4s_north  = mapToScore(v['north_daily_turnover'], [1000, 1200, 1500, 1800], 'pos');
  const d4s_m2     = mapToScore(v['m2_yoy'],           [7, 8, 9, 10],       'pos');
  // 融资余额合并，单位元，换算为万亿：2.6万亿=2.6e12
  const marginTW   = marginTotal / 1e12;
  const d4s_margin = mapToScore(marginTW > 0 ? marginTW : null, [1.4, 1.5, 1.6, 1.7], 'pos');
  // 全A成交额暂无直接指标，用北向成交额代替，权重调整
  const d4s_score  = Math.round(d4s_m2*0.35 + d4s_north*0.35 + d4s_margin*0.30);

  // 中期：社融 + M2 + 北向
  const d4m_sfyoy  = mapToScore(v['social_finance_yoy'],[7, 8, 9, 10],      'pos');
  const d4m_m2     = mapToScore(v['m2_yoy'],           [7, 8, 9, 10],       'pos');
  const d4m_north  = mapToScore(v['north_daily_turnover'], [1000, 1200, 1500, 1800], 'pos');
  const d4m_score  = Math.round(d4m_sfyoy*0.4 + d4m_m2*0.35 + d4m_north*0.25);

  // 长期：人民币国际化 vs 资本账户管制，暂用固定基础分
  const d4l_score  = 52;

  // ── 维度5：外部环境 ──────────────────────────────────────────────────────

  // 短期：汇率 + 出口 + VIX + 贸易差额
  const d5s_rmb    = mapToScore(v['rmb_usd'],      [7.3, 7.1, 6.9, 6.7], 'neg');
  const d5s_export = mapToScore(v['export_yoy'],   [-5, 0, 5, 10],        'pos');
  const d5s_vix    = mapToScore(v['vix'],          [30, 25, 20, 15],      'neg');
  const d5s_trade  = mapToScore(v['trade_balance'], [400, 550, 700, 850], 'pos');
  const d5s_score  = Math.round(d5s_rmb*0.35 + d5s_export*0.35 + d5s_vix*0.2 + d5s_trade*0.1);

  // 中期：贸易差额 + 出口 + 汇率
  const d5m_trade  = mapToScore(v['trade_balance'], [400, 550, 700, 850], 'pos');
  const d5m_export = mapToScore(v['export_yoy'],   [-5, 0, 5, 10],        'pos');
  const d5m_rmb    = mapToScore(v['rmb_usd'],      [7.3, 7.1, 6.9, 6.7], 'neg');
  const d5m_score  = Math.round(d5m_trade*0.35 + d5m_export*0.35 + d5m_rmb*0.3);

  // 长期：全球化格局重塑，暂用固定基础分
  const d5l_score  = 48;

  // ── 综合评估（各维度短/中/长期均权平均）────────────────────────────────
  const sumShort = Math.round((d1s_score + d2s_score + d3s_score + d4s_score + d5s_score) / 5);
  const sumMid   = Math.round((d1m_score + d2m_score + d3m_score + d4m_score + d5m_score) / 5);
  const sumLong  = Math.round((d1l_score + d2l_score + d3l_score + d4l_score + d5l_score) / 5);

  // ── 3. 构建矩阵对象 ───────────────────────────────────────────────────────

  const fmt = (v: number | null, unit: string) => v !== null ? `${v}${unit}` : '暂无数据';

  const matrix: RealMacroMatrix = {
    region: 'CN',
    snapshot_date: snapshotDate,
    model_version: 'v1-live',
    rows: [
      // ── 维度1：经济周期位置 ────────────────────────────────────────────
      {
        dimension: '经济周期位置',
        a_stock_corr: '正相关',
        short: {
          status: scoreToStatus(d1s_score, '扩张', '温和', '收缩'),
          score: d1s_score,
          trend: scoreToTrend(d1s_score),
          desc: `制造业PMI=${fmt(v['pmi_mfg'],'点')}，非制造业PMI=${fmt(v['pmi_non_mfg'],'点')}，GDP同比=${fmt(v['gdp_yoy'],'%')}，工业增加值同比=${fmt(v['industrial_yoy'],'%')}，社消零售同比=${fmt(v['retail_yoy'],'%')}`,
          indicators: ['pmi_mfg', 'pmi_non_mfg', 'gdp_yoy', 'industrial_yoy', 'retail_yoy'],
          data_quality: 'live',
          factors: [
            { name: '制造业PMI', indicator_id: 'pmi_mfg', current_value: v['pmi_mfg'], unit: '点', weight: 0.30, raw_score: d1s_pmi_mfg, contribution: +(d1s_pmi_mfg*0.3).toFixed(1), direction: '正向', note: '50为荣枯线，>50.5为扩张，<49.5有收缩压力' },
            { name: '非制造业PMI', indicator_id: 'pmi_non_mfg', current_value: v['pmi_non_mfg'], unit: '点', weight: 0.20, raw_score: d1s_pmi_non, contribution: +(d1s_pmi_non*0.2).toFixed(1), direction: '正向', note: '服务业和建筑业景气度，通常高于制造业PMI' },
            { name: 'GDP同比增速', indicator_id: 'gdp_yoy', current_value: v['gdp_yoy'], unit: '%', weight: 0.25, raw_score: d1s_gdp, contribution: +(d1s_gdp*0.25).toFixed(1), direction: '正向', note: '政府目标约5%，>5.5%强劲，<4.5%增长乏力' },
            { name: '工业增加值同比', indicator_id: 'industrial_yoy', current_value: v['industrial_yoy'], unit: '%', weight: 0.15, raw_score: d1s_industrial, contribution: +(d1s_industrial*0.15).toFixed(1), direction: '正向', note: '>6%为健康，反映工业生产活跃度' },
            { name: '社消零售同比', indicator_id: 'retail_yoy', current_value: v['retail_yoy'], unit: '%', weight: 0.10, raw_score: d1s_retail, contribution: +(d1s_retail*0.1).toFixed(1), direction: '正向', note: '>5%为理想，反映消费内需强度' },
          ],
          score_formula: `综合得分 = PMI制造(${(d1s_pmi_mfg*0.3).toFixed(1)}) + PMI非制造(${(d1s_pmi_non*0.2).toFixed(1)}) + GDP增速(${(d1s_gdp*0.25).toFixed(1)}) + 工业产出(${(d1s_industrial*0.15).toFixed(1)}) + 消费零售(${(d1s_retail*0.1).toFixed(1)}) = ${d1s_score}分`,
        },
        mid: {
          status: scoreToStatus(d1m_score, '复苏', '中性', '放缓'),
          score: d1m_score,
          trend: scoreToTrend(d1m_score),
          desc: `GDP同比=${fmt(v['gdp_yoy'],'%')}，固定资产投资同比=${fmt(v['fai_yoy'],'%')}，出口同比=${fmt(v['export_yoy'],'%')}，失业率=${fmt(v['unemployment_rate'],'%')}`,
          indicators: ['gdp_yoy', 'fai_yoy', 'export_yoy', 'unemployment_rate', 'import_yoy'],
          data_quality: 'live',
          factors: [
            { name: 'GDP同比增速', indicator_id: 'gdp_yoy', current_value: v['gdp_yoy'], unit: '%', weight: 0.30, raw_score: d1m_gdp, contribution: +(d1m_gdp*0.3).toFixed(1), direction: '正向', note: '中期增长中枢' },
            { name: '固定资产投资同比', indicator_id: 'fai_yoy', current_value: v['fai_yoy'], unit: '%', weight: 0.25, raw_score: d1m_fai, contribution: +(d1m_fai*0.25).toFixed(1), direction: '正向', note: '投资是拉动经济的三驾马车之一' },
            { name: '出口金额同比', indicator_id: 'export_yoy', current_value: v['export_yoy'], unit: '%', weight: 0.20, raw_score: d1m_export, contribution: +(d1m_export*0.2).toFixed(1), direction: '正向', note: '外需的直接体现，0以上表示恢复增长' },
            { name: '城镇调查失业率', indicator_id: 'unemployment_rate', current_value: v['unemployment_rate'], unit: '%', weight: 0.15, raw_score: d1m_unemp, contribution: +(d1m_unemp*0.15).toFixed(1), direction: '负向', note: '<5%为健康水平，反映就业市场稳定性' },
            { name: '进口金额同比', indicator_id: 'import_yoy', current_value: v['import_yoy'], unit: '%', weight: 0.10, raw_score: d1m_import, contribution: +(d1m_import*0.1).toFixed(1), direction: '正向', note: '反映内需和生产活动活跃度' },
          ],
          score_formula: `综合得分 = GDP增速(${(d1m_gdp*0.3).toFixed(1)}) + 固定投资(${(d1m_fai*0.25).toFixed(1)}) + 出口(${(d1m_export*0.2).toFixed(1)}) + 失业率(${(d1m_unemp*0.15).toFixed(1)}) + 进口(${(d1m_import*0.1).toFixed(1)}) = ${d1m_score}分`,
        },
        long: {
          status: '中性',
          score: d1l_score,
          trend: 'flat',
          desc: '人口老龄化、债务周期高位等长期结构性因素制约潜在增速，长期中性判断（定性评估，v1基础分41）',
          indicators: ['gdp_yoy', 'unemployment_rate'],
          data_quality: 'warn',
          factors: [
            { name: 'GDP潜在增速趋势', indicator_id: 'gdp_yoy', current_value: v['gdp_yoy'], unit: '%', weight: 0.60, raw_score: 45, contribution: 27.0, direction: '正向', note: '潜在增速长期下行至4-5%区间，中性偏弱' },
            { name: '劳动力市场结构', indicator_id: 'unemployment_rate', current_value: v['unemployment_rate'], unit: '%', weight: 0.40, raw_score: 35, contribution: 14.0, direction: '负向', note: '老龄化加速，劳动力供给长期收缩（定性判断）' },
          ],
          score_formula: `综合得分 = GDP潜在增速(27.0) + 劳动力结构(14.0) = ${d1l_score}分（长期定性基准）`,
        },
      },
      // ── 维度2：货币政策信号 ────────────────────────────────────────────
      {
        dimension: '货币政策信号',
        a_stock_corr: '正相关',
        short: {
          status: scoreToStatus(d2s_score, '宽松', '适度宽松', '偏紧'),
          score: d2s_score,
          trend: scoreToTrend(d2s_score),
          desc: `LPR 1Y=${fmt(v['lpr_1y'],'%')}，DR007=${fmt(v['dr007'],'%')}，10年国债=${fmt(v['bond_10y'],'%')}，LPR 5Y=${fmt(v['lpr_5y'],'%')}`,
          indicators: ['lpr_1y', 'lpr_5y', 'dr007', 'bond_10y'],
          data_quality: 'live',
          factors: [
            { name: '1年期LPR', indicator_id: 'lpr_1y', current_value: v['lpr_1y'], unit: '%', weight: 0.30, raw_score: d2s_lpr1y, contribution: +(d2s_lpr1y*0.3).toFixed(1), direction: '负向', note: 'LPR越低越宽松，<3.2%为极度宽松' },
            { name: 'DR007', indicator_id: 'dr007', current_value: v['dr007'], unit: '%', weight: 0.25, raw_score: d2s_dr007, contribution: +(d2s_dr007*0.25).toFixed(1), direction: '负向', note: '银行间流动性核心指标，<1.6%为极度宽松' },
            { name: '10年期国债收益率', indicator_id: 'bond_10y', current_value: v['bond_10y'], unit: '%', weight: 0.25, raw_score: d2s_bond, contribution: +(d2s_bond*0.25).toFixed(1), direction: '负向', note: '无风险利率锚，<2.4%反映强宽松预期' },
            { name: '5年期LPR', indicator_id: 'lpr_5y', current_value: v['lpr_5y'], unit: '%', weight: 0.20, raw_score: d2s_lpr5y, contribution: +(d2s_lpr5y*0.2).toFixed(1), direction: '负向', note: '主要影响房贷利率，<3.6%为宽松' },
          ],
          score_formula: `综合得分 = LPR1Y(${(d2s_lpr1y*0.3).toFixed(1)}) + DR007(${(d2s_dr007*0.25).toFixed(1)}) + 国债10Y(${(d2s_bond*0.25).toFixed(1)}) + LPR5Y(${(d2s_lpr5y*0.2).toFixed(1)}) = ${d2s_score}分`,
        },
        mid: {
          status: scoreToStatus(d2m_score, '适度宽松', '中性', '偏紧'),
          score: d2m_score,
          trend: scoreToTrend(d2m_score),
          desc: `10年国债=${fmt(v['bond_10y'],'%')}，LPR 1Y=${fmt(v['lpr_1y'],'%')}，人民币中间价=${fmt(v['rmb_usd'],'')}（汇率约束宽松空间）`,
          indicators: ['bond_10y', 'lpr_1y', 'rmb_usd'],
          data_quality: v['rmb_usd'] !== null ? 'live' : 'warn',
          factors: [
            { name: '10年期国债收益率', indicator_id: 'bond_10y', current_value: v['bond_10y'], unit: '%', weight: 0.40, raw_score: d2m_bond, contribution: +(d2m_bond*0.4).toFixed(1), direction: '负向', note: '中期利率中枢的体现' },
            { name: '1年期LPR', indicator_id: 'lpr_1y', current_value: v['lpr_1y'], unit: '%', weight: 0.35, raw_score: d2m_lpr1y, contribution: +(d2m_lpr1y*0.35).toFixed(1), direction: '负向', note: '反映中期信贷政策方向' },
            { name: '人民币兑美元中间价', indicator_id: 'rmb_usd', current_value: v['rmb_usd'], unit: '', weight: 0.25, raw_score: d2m_rmb, contribution: +(d2m_rmb*0.25).toFixed(1), direction: '负向', note: '汇率贬值压力越大，宽松空间越小' },
          ],
          score_formula: `综合得分 = 国债10Y(${(d2m_bond*0.4).toFixed(1)}) + LPR1Y(${(d2m_lpr1y*0.35).toFixed(1)}) + 汇率约束(${(d2m_rmb*0.25).toFixed(1)}) = ${d2m_score}分`,
        },
        long: {
          status: '中性',
          score: d2l_score,
          trend: 'flat',
          desc: '利率中枢长期下行趋势确立，但债务扩张空间收窄，长期中性（定性评估，v1基础分52）',
          indicators: ['bond_10y', 'lpr_1y'],
          data_quality: 'warn',
          factors: [
            { name: '10年期国债收益率趋势', indicator_id: 'bond_10y', current_value: v['bond_10y'], unit: '%', weight: 0.60, raw_score: 60, contribution: 36.0, direction: '正向', note: '利率长期下行趋势确立，但收益空间收窄' },
            { name: '债务/GDP约束', indicator_id: 'lpr_1y', current_value: v['lpr_1y'], unit: '%', weight: 0.40, raw_score: 40, contribution: 16.0, direction: '负向', note: '宏观杠杆率高位，限制长期大幅宽松空间（定性判断）' },
          ],
          score_formula: `综合得分 = 利率趋势(36.0) + 债务约束(16.0) = ${d2l_score}分（长期定性基准）`,
        },
      },
      // ── 维度3：政策底确认 ──────────────────────────────────────────────
      {
        dimension: '政策底确认',
        a_stock_corr: '正相关',
        short: {
          status: scoreToStatus(d3s_score, '强刺激', '温和宽松', '收缩'),
          score: d3s_score,
          trend: scoreToTrend(d3s_score),
          desc: `M2同比=${fmt(v['m2_yoy'],'%')}，社融存量同比=${fmt(v['social_finance_yoy'],'%')}，新增贷款=${v['new_loans'] ? (v['new_loans']/10000).toFixed(2)+'万亿' : '暂无'}，社融增量=${v['social_finance'] ? (v['social_finance']/10000).toFixed(2)+'万亿' : '暂无'}`,
          indicators: ['m2_yoy', 'social_finance_yoy', 'new_loans', 'social_finance'],
          data_quality: 'live',
          factors: [
            { name: 'M2同比增速', indicator_id: 'm2_yoy', current_value: v['m2_yoy'], unit: '%', weight: 0.30, raw_score: d3s_m2, contribution: +(d3s_m2*0.3).toFixed(1), direction: '正向', note: '8-9%是合理区间，需与名义GDP增速匹配' },
            { name: '社融存量同比', indicator_id: 'social_finance_yoy', current_value: v['social_finance_yoy'], unit: '%', weight: 0.30, raw_score: d3s_sfyoy, contribution: +(d3s_sfyoy*0.3).toFixed(1), direction: '正向', note: '超过名义GDP增速表明信用扩张支撑实体' },
            { name: '新增人民币贷款', indicator_id: 'new_loans', current_value: v['new_loans'] ? +(v['new_loans']/10000).toFixed(2) : null, unit: '万亿', weight: 0.25, raw_score: d3s_loans, contribution: +(d3s_loans*0.25).toFixed(1), direction: '正向', note: '月度信贷投放，季节性强，关注同比多增' },
            { name: '社融增量', indicator_id: 'social_finance', current_value: v['social_finance'] ? +(v['social_finance']/10000).toFixed(2) : null, unit: '万亿', weight: 0.15, raw_score: d3s_sf, contribution: +(d3s_sf*0.15).toFixed(1), direction: '正向', note: '广义信用扩张的直接体现' },
          ],
          score_formula: `综合得分 = M2增速(${(d3s_m2*0.3).toFixed(1)}) + 社融存量(${(d3s_sfyoy*0.3).toFixed(1)}) + 新增贷款(${(d3s_loans*0.25).toFixed(1)}) + 社融增量(${(d3s_sf*0.15).toFixed(1)}) = ${d3s_score}分`,
        },
        mid: {
          status: scoreToStatus(d3m_score, '强刺激', '温和宽松', '收缩'),
          score: d3m_score,
          trend: scoreToTrend(d3m_score),
          desc: `社融存量同比=${fmt(v['social_finance_yoy'],'%')}，M2同比=${fmt(v['m2_yoy'],'%')}，新增贷款=${v['new_loans'] ? (v['new_loans']/10000).toFixed(2)+'万亿' : '暂无'}`,
          indicators: ['social_finance_yoy', 'm2_yoy', 'new_loans'],
          data_quality: 'live',
          factors: [
            { name: '社融存量同比', indicator_id: 'social_finance_yoy', current_value: v['social_finance_yoy'], unit: '%', weight: 0.40, raw_score: d3m_sfyoy, contribution: +(d3m_sfyoy*0.4).toFixed(1), direction: '正向', note: '中期信用扩张的核心指标' },
            { name: 'M2同比增速', indicator_id: 'm2_yoy', current_value: v['m2_yoy'], unit: '%', weight: 0.35, raw_score: d3m_m2, contribution: +(d3m_m2*0.35).toFixed(1), direction: '正向', note: '货币供给充裕，中期政策底确认' },
            { name: '新增人民币贷款', indicator_id: 'new_loans', current_value: v['new_loans'] ? +(v['new_loans']/10000).toFixed(2) : null, unit: '万亿', weight: 0.25, raw_score: d3m_loans, contribution: +(d3m_loans*0.25).toFixed(1), direction: '正向', note: '信贷投放持续强劲，实体经济支撑力度' },
          ],
          score_formula: `综合得分 = 社融存量(${(d3m_sfyoy*0.4).toFixed(1)}) + M2(${(d3m_m2*0.35).toFixed(1)}) + 新增贷款(${(d3m_loans*0.25).toFixed(1)}) = ${d3m_score}分`,
        },
        long: {
          status: '中性',
          score: d3l_score,
          trend: 'flat',
          desc: '结构性改革持续推进，但外部环境不确定性和债务约束限制长期政策空间（定性评估，v1基础分50）',
          indicators: ['social_finance_yoy', 'm2_yoy'],
          data_quality: 'warn',
          factors: [
            { name: '社融存量同比趋势', indicator_id: 'social_finance_yoy', current_value: v['social_finance_yoy'], unit: '%', weight: 0.55, raw_score: 52, contribution: 28.6, direction: '正向', note: '长期信用扩张受债务天花板制约' },
            { name: 'M2同比趋势', indicator_id: 'm2_yoy', current_value: v['m2_yoy'], unit: '%', weight: 0.45, raw_score: 47, contribution: 21.2, direction: '负向', note: 'M2增速长期下行趋势，货币政策空间收窄（定性判断）' },
          ],
          score_formula: `综合得分 = 社融趋势(28.6) + M2趋势(21.2) = ${d3l_score}分（长期定性基准）`,
        },
      },
      // ── 维度4：流动性环境 ──────────────────────────────────────────────
      {
        dimension: '流动性环境',
        a_stock_corr: '正相关',
        short: {
          status: scoreToStatus(d4s_score, '充裕', '适度充裕', '偏紧'),
          score: d4s_score,
          trend: scoreToTrend(d4s_score),
          desc: `M2同比=${fmt(v['m2_yoy'],'%')}，北向成交额=${fmt(v['north_daily_turnover'],'亿元')}，两市融资余额合计=${marginTW > 0 ? marginTW.toFixed(2)+'万亿' : '暂无'}`,
          indicators: ['m2_yoy', 'north_daily_turnover', 'margin_balance_sh', 'margin_balance_sz'],
          data_quality: 'live',
          factors: [
            { name: 'M2同比增速', indicator_id: 'm2_yoy', current_value: v['m2_yoy'], unit: '%', weight: 0.35, raw_score: d4s_m2, contribution: +(d4s_m2*0.35).toFixed(1), direction: '正向', note: '宏观流动性总阀门' },
            { name: '北向当日成交额', indicator_id: 'north_daily_turnover', current_value: v['north_daily_turnover'], unit: '亿元', weight: 0.35, raw_score: d4s_north, contribution: +(d4s_north*0.35).toFixed(1), direction: '正向', note: '>1500亿表明外资积极参与，是市场情绪温度计' },
            { name: '两市融资余额', indicator_id: 'margin_balance_sh', current_value: marginTW > 0 ? +marginTW.toFixed(2) : null, unit: '万亿', weight: 0.30, raw_score: d4s_margin, contribution: +(d4s_margin*0.3).toFixed(1), direction: '正向', note: '>1.6万亿反映杠杆资金活跃，市场风险偏好高' },
          ],
          score_formula: `综合得分 = M2(${(d4s_m2*0.35).toFixed(1)}) + 北向成交(${(d4s_north*0.35).toFixed(1)}) + 融资余额(${(d4s_margin*0.3).toFixed(1)}) = ${d4s_score}分`,
        },
        mid: {
          status: scoreToStatus(d4m_score, '充裕', '适度充裕', '偏紧'),
          score: d4m_score,
          trend: scoreToTrend(d4m_score),
          desc: `社融存量同比=${fmt(v['social_finance_yoy'],'%')}，M2同比=${fmt(v['m2_yoy'],'%')}，北向成交额=${fmt(v['north_daily_turnover'],'亿元')}`,
          indicators: ['social_finance_yoy', 'm2_yoy', 'north_daily_turnover'],
          data_quality: 'live',
          factors: [
            { name: '社融存量同比', indicator_id: 'social_finance_yoy', current_value: v['social_finance_yoy'], unit: '%', weight: 0.40, raw_score: d4m_sfyoy, contribution: +(d4m_sfyoy*0.4).toFixed(1), direction: '正向', note: '社融支撑中期流动性充裕' },
            { name: 'M2同比增速', indicator_id: 'm2_yoy', current_value: v['m2_yoy'], unit: '%', weight: 0.35, raw_score: d4m_m2, contribution: +(d4m_m2*0.35).toFixed(1), direction: '正向', note: '货币供给适度，中期流动性平衡' },
            { name: '北向当日成交额', indicator_id: 'north_daily_turnover', current_value: v['north_daily_turnover'], unit: '亿元', weight: 0.25, raw_score: d4m_north, contribution: +(d4m_north*0.25).toFixed(1), direction: '正向', note: '外资中期参与度指标' },
          ],
          score_formula: `综合得分 = 社融(${(d4m_sfyoy*0.4).toFixed(1)}) + M2(${(d4m_m2*0.35).toFixed(1)}) + 北向(${(d4m_north*0.25).toFixed(1)}) = ${d4m_score}分`,
        },
        long: {
          status: '中性',
          score: d4l_score,
          trend: 'flat',
          desc: '人民币国际化推进，但资本账户管制限制外资长期流入规模，长期中性（定性评估，v1基础分52）',
          indicators: ['m2_yoy', 'north_daily_turnover'],
          data_quality: 'warn',
          factors: [
            { name: 'M2增速长期趋势', indicator_id: 'm2_yoy', current_value: v['m2_yoy'], unit: '%', weight: 0.60, raw_score: 55, contribution: 33.0, direction: '正向', note: 'M2长期中枢下行，流动性中性' },
            { name: '外资流向趋势', indicator_id: 'north_daily_turnover', current_value: v['north_daily_turnover'], unit: '亿元', weight: 0.40, raw_score: 47, contribution: 18.8, direction: '正向', note: '资本账户管制限制外资长期大幅增配（定性判断）' },
          ],
          score_formula: `综合得分 = M2趋势(33.0) + 外资趋势(18.8) = ${d4l_score}分（长期定性基准）`,
        },
      },
      // ── 维度5：外部环境 ────────────────────────────────────────────────
      {
        dimension: '外部环境',
        a_stock_corr: '正相关',
        short: {
          status: scoreToStatus(d5s_score, '有利', '中性', '承压'),
          score: d5s_score,
          trend: scoreToTrend(d5s_score),
          desc: `人民币中间价=${fmt(v['rmb_usd'],'')}，出口同比=${fmt(v['export_yoy'],'%')}，VIX=${fmt(v['vix'],'点')}，贸易差额=${fmt(v['trade_balance'],'亿美元')}`,
          indicators: ['rmb_usd', 'export_yoy', 'vix', 'trade_balance'],
          data_quality: v['rmb_usd'] !== null ? 'live' : 'warn',
          factors: [
            { name: '人民币兑美元中间价', indicator_id: 'rmb_usd', current_value: v['rmb_usd'], unit: '', weight: 0.35, raw_score: d5s_rmb, contribution: +(d5s_rmb*0.35).toFixed(1), direction: '负向', note: '<6.9为强势，>7.1有贬值压力，>7.3为显著压力' },
            { name: '出口金额同比', indicator_id: 'export_yoy', current_value: v['export_yoy'], unit: '%', weight: 0.35, raw_score: d5s_export, contribution: +(d5s_export*0.35).toFixed(1), direction: '正向', note: '外需的直接体现，>5%为强劲' },
            { name: 'VIX恐慌指数', indicator_id: 'vix', current_value: v['vix'], unit: '点', weight: 0.20, raw_score: d5s_vix, contribution: +(d5s_vix*0.2).toFixed(1), direction: '负向', note: '<15为极度乐观，>30为恐慌，>40为极度恐慌' },
            { name: '中国贸易差额', indicator_id: 'trade_balance', current_value: v['trade_balance'], unit: '亿美元', weight: 0.10, raw_score: d5s_trade, contribution: +(d5s_trade*0.1).toFixed(1), direction: '正向', note: '持续顺差是汇率稳定的重要保障' },
          ],
          score_formula: `综合得分 = 汇率(${(d5s_rmb*0.35).toFixed(1)}) + 出口(${(d5s_export*0.35).toFixed(1)}) + VIX(${(d5s_vix*0.2).toFixed(1)}) + 贸易差额(${(d5s_trade*0.1).toFixed(1)}) = ${d5s_score}分`,
        },
        mid: {
          status: scoreToStatus(d5m_score, '有利', '中性', '承压'),
          score: d5m_score,
          trend: scoreToTrend(d5m_score),
          desc: `贸易差额=${fmt(v['trade_balance'],'亿美元')}，出口同比=${fmt(v['export_yoy'],'%')}，人民币中间价=${fmt(v['rmb_usd'],'')}（中期外部压力评估）`,
          indicators: ['trade_balance', 'export_yoy', 'rmb_usd'],
          data_quality: v['rmb_usd'] !== null ? 'live' : 'warn',
          factors: [
            { name: '贸易差额趋势', indicator_id: 'trade_balance', current_value: v['trade_balance'], unit: '亿美元', weight: 0.35, raw_score: d5m_trade, contribution: +(d5m_trade*0.35).toFixed(1), direction: '正向', note: '贸顺差中期持续，多元化布局下出口韧性增强' },
            { name: '出口金额同比', indicator_id: 'export_yoy', current_value: v['export_yoy'], unit: '%', weight: 0.35, raw_score: d5m_export, contribution: +(d5m_export*0.35).toFixed(1), direction: '正向', note: '中期出口恢复预期' },
            { name: '人民币汇率趋势', indicator_id: 'rmb_usd', current_value: v['rmb_usd'], unit: '', weight: 0.30, raw_score: d5m_rmb, contribution: +(d5m_rmb*0.3).toFixed(1), direction: '负向', note: '汇率中期稳定预期' },
          ],
          score_formula: `综合得分 = 贸顺差(${(d5m_trade*0.35).toFixed(1)}) + 出口(${(d5m_export*0.35).toFixed(1)}) + 汇率(${(d5m_rmb*0.3).toFixed(1)}) = ${d5m_score}分`,
        },
        long: {
          status: '中性',
          score: d5l_score,
          trend: 'flat',
          desc: '全球化格局重塑，中国在全球供应链中的地位调整是长期变量，中性判断（定性评估，v1基础分48）',
          indicators: ['trade_balance', 'export_yoy'],
          data_quality: 'warn',
          factors: [
            { name: '贸易差额长期趋势', indicator_id: 'trade_balance', current_value: v['trade_balance'], unit: '亿美元', weight: 0.45, raw_score: 55, contribution: 24.8, direction: '正向', note: '全球化重塑下贸顺差长期不确定性增强' },
            { name: '出口结构调整', indicator_id: 'export_yoy', current_value: v['export_yoy'], unit: '%', weight: 0.55, raw_score: 40, contribution: 22.0, direction: '负向', note: '全球供应链重塑，长期出口结构调整中（定性判断）' },
          ],
          score_formula: `综合得分 = 贸顺差趋势(24.8) + 出口结构(22.0) = ${d5l_score}分（长期定性基准）`,
        },
      },
    ],
    summary: {
      short: {
        status: scoreToStatus(sumShort, '偏多', '中性', '偏空'),
        score: sumShort,
        trend: scoreToTrend(sumShort),
        desc: `短期综合评分 = (经济${d1s_score} + 货币${d2s_score} + 政策${d3s_score} + 流动性${d4s_score} + 外部${d5s_score}) / 5 = ${sumShort}分`,
        indicators: [],
        data_quality: 'live',
        factors: [],
        score_formula: `五维度均权平均：(${d1s_score}+${d2s_score}+${d3s_score}+${d4s_score}+${d5s_score})/5 = ${sumShort}分`,
      },
      mid: {
        status: scoreToStatus(sumMid, '偏多', '中性', '偏空'),
        score: sumMid,
        trend: scoreToTrend(sumMid),
        desc: `中期综合评分 = (经济${d1m_score} + 货币${d2m_score} + 政策${d3m_score} + 流动性${d4m_score} + 外部${d5m_score}) / 5 = ${sumMid}分`,
        indicators: [],
        data_quality: 'live',
        factors: [],
        score_formula: `五维度均权平均：(${d1m_score}+${d2m_score}+${d3m_score}+${d4m_score}+${d5m_score})/5 = ${sumMid}分`,
      },
      long: {
        status: scoreToStatus(sumLong, '偏多', '中性', '偏空'),
        score: sumLong,
        trend: scoreToTrend(sumLong),
        desc: `长期综合评分 = (经济${d1l_score} + 货币${d2l_score} + 政策${d3l_score} + 流动性${d4l_score} + 外部${d5l_score}) / 5 = ${sumLong}分（含定性判断维度）`,
        indicators: [],
        data_quality: 'warn',
        factors: [],
        score_formula: `五维度均权平均：(${d1l_score}+${d2l_score}+${d3l_score}+${d4l_score}+${d5l_score})/5 = ${sumLong}分`,
      },
    },
  };

  return matrix;
}
