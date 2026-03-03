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
