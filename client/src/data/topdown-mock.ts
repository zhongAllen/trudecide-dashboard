/**
 * topdown-mock.ts — Top-Down 选股 Demo Mock 数据
 *
 * 所有字段与数据库表结构完全一致，后续接库时只需替换数据源即可。
 *
 * 数据库字段对照：
 *   indicator_values: indicator_id, trade_date, publish_date, value, revision_seq, collected_at, region
 *   indicator_meta:   id, name_cn, category, unit, scale, region, frequency
 *   sector_meta:      id, name_cn, system, level, parent_id, idx_type, is_active
 *   sector_daily:     sector_id, trade_date, open, high, low, close, pct_change, vol, amount, up_num, down_num, avg_pe, total_mv, turnover_rate, leading_code, leading_name, leading_pct
 *   sector_stock_map: sector_id, ts_code, in_date, out_date, is_current, system
 *   stock_meta:       ts_code, symbol, name_cn, area, industry, market, list_date, is_active
 *   stock_daily:      ts_code, trade_date, open, high, low, close, pre_close, pct_chg, vol, amount, adj_factor, pe_ttm, pb, total_mv, circ_mv
 *   stock_daily_basic:ts_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio, pe, pe_ttm, pb, ps_ttm, dv_ratio, total_share, float_share, total_mv, circ_mv
 */

// ─── 类型定义（与数据库字段一一对应）─────────────────────────────────────────

export interface IndicatorMeta {
  id: string;
  name_cn: string;
  category: string;
  unit: string;
  scale: string | null;
  region: string;
  frequency: string;
}

export interface IndicatorValue {
  indicator_id: string;
  trade_date: string;
  publish_date: string | null;
  value: number;
  revision_seq: number;
  collected_at: string;
  region: string;
}

export interface SectorMeta {
  id: string;
  name_cn: string;
  system: string;
  level: number;
  parent_id: string | null;
  idx_type: string;
  is_active: boolean;
}

export interface SectorDaily {
  sector_id: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  pct_change: number;
  vol: number;
  amount: number | null;
  up_num: number | null;
  down_num: number | null;
  flat_num: number | null;
  avg_pe: number | null;
  total_mv: number | null;
  turnover_rate: number | null;
  leading_code: string | null;
  leading_name: string | null;
  leading_pct: number | null;
}

export interface SectorStockMap {
  sector_id: string;
  ts_code: string;
  in_date: string;
  out_date: string | null;
  is_current: boolean;
  system: string;
}

export interface StockMeta {
  ts_code: string;
  symbol: string;
  name_cn: string;
  area: string;
  industry: string;
  market: string;
  list_date: string;
  is_active: boolean;
}

export interface StockDaily {
  ts_code: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  pre_close: number;
  pct_chg: number;
  vol: number;
  amount: number;
  adj_factor: number | null;
  pe_ttm: number | null;
  pb: number | null;
  total_mv: number | null;
  circ_mv: number | null;
}

export interface StockDailyBasic {
  ts_code: string;
  trade_date: string;
  close: number;
  turnover_rate: number | null;
  turnover_rate_f: number | null;
  volume_ratio: number | null;
  pe: number | null;
  pe_ttm: number | null;
  pb: number | null;
  ps_ttm: number | null;
  dv_ratio: number | null;
  total_share: number | null;
  float_share: number | null;
  total_mv: number | null;
  circ_mv: number | null;
}

// ─── 宏观择时 Mock 数据 ────────────────────────────────────────────────────────

export const MACRO_INDICATORS: IndicatorMeta[] = [
  { id: 'gdp_yoy', name_cn: 'GDP同比增速', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'quarterly' },
  { id: 'pmi_mfg', name_cn: '制造业PMI', category: 'macro', unit: '点', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'cpi_yoy', name_cn: 'CPI同比', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'ppi_yoy', name_cn: 'PPI同比', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'm2_yoy', name_cn: 'M2同比增速', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'social_financing_yoy', name_cn: '社融同比增速', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'hs300_pe', name_cn: '沪深300 PE(TTM)', category: 'equity', unit: '倍', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'all_a_pe', name_cn: '全A市盈率', category: 'equity', unit: '倍', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'north_daily_turnover', name_cn: '北向资金净流入', category: 'equity', unit: '亿元', scale: '亿', region: 'CN', frequency: 'daily' },
  { id: 'rmb_usd', name_cn: '人民币兑美元', category: 'fx', unit: '元/美元', scale: null, region: 'CN', frequency: 'daily' },
];

// 最近12个月宏观数据（indicator_values 格式）
function genMonthlyValues(id: string, baseVal: number, trend: number, volatility: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(2026, 2 - i, 1);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const noise = (Math.random() - 0.5) * volatility;
    result.push({
      indicator_id: id,
      trade_date: dateStr,
      publish_date: dateStr,
      value: parseFloat((baseVal + trend * (11 - i) / 11 + noise).toFixed(2)),
      revision_seq: 0,
      collected_at: '2026-03-01T00:00:00Z',
      region: 'CN',
    });
  }
  return result;
}

export const MACRO_VALUES: Record<string, IndicatorValue[]> = {
  gdp_yoy: genMonthlyValues('gdp_yoy', 4.8, 0.3, 0.2),
  pmi_mfg: genMonthlyValues('pmi_mfg', 49.8, 0.5, 0.4),
  cpi_yoy: genMonthlyValues('cpi_yoy', 0.1, 0.2, 0.15),
  ppi_yoy: genMonthlyValues('ppi_yoy', -2.1, 0.8, 0.3),
  m2_yoy: genMonthlyValues('m2_yoy', 7.0, 0.5, 0.3),
  social_financing_yoy: genMonthlyValues('social_financing_yoy', 8.1, 0.4, 0.4),
  hs300_pe: genMonthlyValues('hs300_pe', 11.5, 0.8, 0.5),
  all_a_pe: genMonthlyValues('all_a_pe', 15.2, 0.6, 0.4),
  north_daily_turnover: genMonthlyValues('north_daily_turnover', 45.2, 8.0, 15.0),
  rmb_usd: genMonthlyValues('rmb_usd', 7.28, -0.05, 0.02),
};

// 宏观择时信号（综合打分）
export interface MacroSignal {
  dimension: string;
  signal: 'bullish' | 'neutral' | 'bearish';
  score: number; // 0-100
  desc: string;
  indicators: string[];
}

export const MACRO_SIGNALS: MacroSignal[] = [
  {
    dimension: '经济增长',
    signal: 'bullish',
    score: 68,
    desc: 'GDP同比5.1%，PMI连续2月回升至50.2，经济动能温和修复',
    indicators: ['gdp_yoy', 'pmi_mfg'],
  },
  {
    dimension: '通胀与货币',
    signal: 'neutral',
    score: 52,
    desc: 'CPI温和，PPI仍负但收窄，M2/社融增速回升，流动性宽松',
    indicators: ['cpi_yoy', 'ppi_yoy', 'm2_yoy', 'social_financing_yoy'],
  },
  {
    dimension: '市场估值',
    signal: 'bullish',
    score: 72,
    desc: '沪深300 PE(TTM)约12倍，处历史25%分位，估值偏低',
    indicators: ['hs300_pe', 'all_a_pe'],
  },
  {
    dimension: '资金面',
    signal: 'neutral',
    score: 55,
    desc: '北向资金近期净流入，但汇率压力仍存，外资态度谨慎',
    indicators: ['north_daily_turnover', 'rmb_usd'],
  },
];

// ─── 板块轮动 Mock 数据 ────────────────────────────────────────────────────────

export const SECTOR_META_LIST: SectorMeta[] = [
  { id: 'ths_881101.TI', name_cn: '银行', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881102.TI', name_cn: '保险', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881103.TI', name_cn: '证券', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881201.TI', name_cn: '医药生物', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881202.TI', name_cn: '医疗器械', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881301.TI', name_cn: '新能源', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881302.TI', name_cn: '光伏', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881303.TI', name_cn: '储能', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881401.TI', name_cn: '半导体', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881402.TI', name_cn: '消费电子', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881403.TI', name_cn: '人工智能', system: 'ths', level: 1, parent_id: null, idx_type: '概念板块', is_active: true },
  { id: 'ths_881501.TI', name_cn: '白酒', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881502.TI', name_cn: '食品饮料', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881601.TI', name_cn: '房地产', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881602.TI', name_cn: '建筑材料', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881701.TI', name_cn: '军工', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881801.TI', name_cn: '有色金属', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881901.TI', name_cn: '化工', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_882001.TI', name_cn: '机械设备', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_882101.TI', name_cn: '传媒', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
];

// 生成板块近期日线数据（sector_daily 格式）
function genSectorDaily(sectorId: string, baseClose: number, trend: number): SectorDaily[] {
  const result: SectorDaily[] = [];
  let close = baseClose;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(2026, 2, 3 - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const pct = (Math.random() - 0.48 + trend * 0.01) * 2;
    const preClose = close;
    close = parseFloat((close * (1 + pct / 100)).toFixed(3));
    const open = parseFloat((preClose * (1 + (Math.random() - 0.5) * 0.005)).toFixed(3));
    const high = parseFloat((Math.max(open, close) * (1 + Math.random() * 0.008)).toFixed(3));
    const low = parseFloat((Math.min(open, close) * (1 - Math.random() * 0.008)).toFixed(3));
    result.push({
      sector_id: sectorId,
      trade_date: dateStr,
      open, high, low, close,
      pct_change: parseFloat(pct.toFixed(2)),
      vol: Math.round(1e8 + Math.random() * 5e8),
      amount: null,
      up_num: Math.round(20 + Math.random() * 60),
      down_num: Math.round(10 + Math.random() * 50),
      flat_num: Math.round(5 + Math.random() * 20),
      avg_pe: parseFloat((15 + Math.random() * 20).toFixed(1)),
      total_mv: parseFloat((500 + Math.random() * 2000).toFixed(0)),
      turnover_rate: parseFloat((1 + Math.random() * 4).toFixed(2)),
      leading_code: null,
      leading_name: null,
      leading_pct: null,
    });
  }
  return result;
}

// 板块趋势配置（trend > 0 上涨，< 0 下跌）
const SECTOR_TRENDS: Record<string, { base: number; trend: number }> = {
  'ths_881101.TI': { base: 1200, trend: 2.5 },
  'ths_881102.TI': { base: 1050, trend: 1.8 },
  'ths_881103.TI': { base: 980, trend: 3.2 },
  'ths_881201.TI': { base: 1350, trend: -0.5 },
  'ths_881202.TI': { base: 890, trend: 1.2 },
  'ths_881301.TI': { base: 760, trend: -1.5 },
  'ths_881302.TI': { base: 680, trend: -2.1 },
  'ths_881303.TI': { base: 920, trend: 0.8 },
  'ths_881401.TI': { base: 1580, trend: 4.5 },
  'ths_881402.TI': { base: 1120, trend: 3.8 },
  'ths_881403.TI': { base: 2350, trend: 6.2 },
  'ths_881501.TI': { base: 1680, trend: -0.8 },
  'ths_881502.TI': { base: 1240, trend: 0.3 },
  'ths_881601.TI': { base: 820, trend: -3.2 },
  'ths_881602.TI': { base: 760, trend: -1.8 },
  'ths_881701.TI': { base: 1450, trend: 2.1 },
  'ths_881801.TI': { base: 1180, trend: 1.5 },
  'ths_881901.TI': { base: 890, trend: -0.3 },
  'ths_882001.TI': { base: 1020, trend: 0.9 },
  'ths_882101.TI': { base: 740, trend: 1.4 },
};

export const SECTOR_DAILY_MAP: Record<string, SectorDaily[]> = Object.fromEntries(
  SECTOR_META_LIST.map((s) => {
    const cfg = SECTOR_TRENDS[s.id] ?? { base: 1000, trend: 0 };
    return [s.id, genSectorDaily(s.id, cfg.base, cfg.trend)];
  })
);

// 获取板块最新日线（用于排行）
export function getSectorLatest(sectorId: string): SectorDaily | null {
  const arr = SECTOR_DAILY_MAP[sectorId];
  return arr ? arr[arr.length - 1] : null;
}

// ─── 个股 Mock 数据 ────────────────────────────────────────────────────────────

// 每个板块对应的个股列表（sector_stock_map 格式）
export const SECTOR_STOCKS: Record<string, StockMeta[]> = {
  'ths_881401.TI': [ // 半导体
    { ts_code: '603501.SH', symbol: '603501', name_cn: '韦尔股份', area: '上海', industry: '半导体', market: '主板', list_date: '2017-04-28', is_active: true },
    { ts_code: '688981.SH', symbol: '688981', name_cn: '中芯国际', area: '上海', industry: '半导体', market: '科创板', list_date: '2020-07-16', is_active: true },
    { ts_code: '002049.SZ', symbol: '002049', name_cn: '紫光国微', area: '北京', industry: '半导体', market: '主板', list_date: '2004-08-20', is_active: true },
    { ts_code: '688012.SH', symbol: '688012', name_cn: '中微公司', area: '上海', industry: '半导体', market: '科创板', list_date: '2019-07-22', is_active: true },
    { ts_code: '300661.SZ', symbol: '300661', name_cn: '圣邦股份', area: '北京', industry: '半导体', market: '创业板', list_date: '2017-08-04', is_active: true },
    { ts_code: '688008.SH', symbol: '688008', name_cn: '澜起科技', area: '上海', industry: '半导体', market: '科创板', list_date: '2019-08-06', is_active: true },
    { ts_code: '688041.SH', symbol: '688041', name_cn: '海光信息', area: '天津', industry: '半导体', market: '科创板', list_date: '2022-08-12', is_active: true },
    { ts_code: '688396.SH', symbol: '688396', name_cn: '华润微', area: '无锡', industry: '半导体', market: '科创板', list_date: '2020-02-27', is_active: true },
  ],
  'ths_881403.TI': [ // 人工智能
    { ts_code: '002230.SZ', symbol: '002230', name_cn: '科大讯飞', area: '安徽', industry: 'AI', market: '主板', list_date: '2008-05-12', is_active: true },
    { ts_code: '688111.SH', symbol: '688111', name_cn: '金山办公', area: '北京', industry: 'AI', market: '科创板', list_date: '2019-11-18', is_active: true },
    { ts_code: '300144.SZ', symbol: '300144', name_cn: '宋城演艺', area: '浙江', industry: 'AI', market: '创业板', list_date: '2010-12-09', is_active: true },
    { ts_code: '688065.SH', symbol: '688065', name_cn: '凯赛生物', area: '上海', industry: 'AI', market: '科创板', list_date: '2020-08-12', is_active: true },
    { ts_code: '000977.SZ', symbol: '000977', name_cn: '浪潮信息', area: '山东', industry: 'AI', market: '主板', list_date: '1997-09-05', is_active: true },
    { ts_code: '300496.SZ', symbol: '300496', name_cn: '中科创达', area: '北京', industry: 'AI', market: '创业板', list_date: '2016-08-01', is_active: true },
  ],
  'ths_881101.TI': [ // 银行
    { ts_code: '000001.SZ', symbol: '000001', name_cn: '平安银行', area: '深圳', industry: '银行', market: '主板', list_date: '1991-04-03', is_active: true },
    { ts_code: '600036.SH', symbol: '600036', name_cn: '招商银行', area: '深圳', industry: '银行', market: '主板', list_date: '2002-04-09', is_active: true },
    { ts_code: '601318.SH', symbol: '601318', name_cn: '中国平安', area: '深圳', industry: '银行', market: '主板', list_date: '2007-03-01', is_active: true },
    { ts_code: '600016.SH', symbol: '600016', name_cn: '民生银行', area: '北京', industry: '银行', market: '主板', list_date: '2000-12-19', is_active: true },
    { ts_code: '601166.SH', symbol: '601166', name_cn: '兴业银行', area: '福建', industry: '银行', market: '主板', list_date: '2007-02-05', is_active: true },
    { ts_code: '600000.SH', symbol: '600000', name_cn: '浦发银行', area: '上海', industry: '银行', market: '主板', list_date: '1999-11-10', is_active: true },
  ],
  'ths_881103.TI': [ // 证券
    { ts_code: '600030.SH', symbol: '600030', name_cn: '中信证券', area: '北京', industry: '证券', market: '主板', list_date: '2003-01-06', is_active: true },
    { ts_code: '000776.SZ', symbol: '000776', name_cn: '广发证券', area: '广东', industry: '证券', market: '主板', list_date: '1994-09-29', is_active: true },
    { ts_code: '601688.SH', symbol: '601688', name_cn: '华泰证券', area: '江苏', industry: '证券', market: '主板', list_date: '2010-02-26', is_active: true },
    { ts_code: '600837.SH', symbol: '600837', name_cn: '海通证券', area: '上海', industry: '证券', market: '主板', list_date: '1994-02-24', is_active: true },
    { ts_code: '002736.SZ', symbol: '002736', name_cn: '国信证券', area: '深圳', industry: '证券', market: '主板', list_date: '2014-12-29', is_active: true },
  ],
};

// 默认板块（其他板块用通用数据）
function genDefaultStocks(sectorId: string): StockMeta[] {
  const meta = SECTOR_META_LIST.find(s => s.id === sectorId);
  const name = meta?.name_cn ?? '未知';
  return [
    { ts_code: '000001.SZ', symbol: '000001', name_cn: `${name}龙头A`, area: '上海', industry: name, market: '主板', list_date: '2010-01-01', is_active: true },
    { ts_code: '000002.SZ', symbol: '000002', name_cn: `${name}龙头B`, area: '北京', industry: name, market: '主板', list_date: '2012-01-01', is_active: true },
    { ts_code: '000003.SZ', symbol: '000003', name_cn: `${name}成长C`, area: '深圳', industry: name, market: '创业板', list_date: '2015-01-01', is_active: true },
    { ts_code: '000004.SZ', symbol: '000004', name_cn: `${name}新锐D`, area: '杭州', industry: name, market: '科创板', list_date: '2020-01-01', is_active: true },
  ];
}

export function getSectorStocks(sectorId: string): StockMeta[] {
  return SECTOR_STOCKS[sectorId] ?? genDefaultStocks(sectorId);
}

// ─── 个股日线 Mock 数据 ────────────────────────────────────────────────────────

// 生成个股K线（stock_daily 格式）
export function genStockKline(tsCode: string, baseClose: number, period: 'daily' | 'weekly' | 'monthly', bars = 120): StockDaily[] {
  const result: StockDaily[] = [];
  let close = baseClose;
  const stepDays = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const volatility = period === 'daily' ? 0.025 : period === 'weekly' ? 0.04 : 0.06;

  for (let i = bars; i >= 1; i--) {
    const d = new Date(2026, 2, 3);
    d.setDate(d.getDate() - i * stepDays);
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const pct = (Math.random() - 0.48) * volatility * 100;
    const preClose = close;
    close = parseFloat((close * (1 + pct / 100)).toFixed(2));
    if (close < 1) close = 1;
    const open = parseFloat((preClose * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2));
    const high = parseFloat((Math.max(open, close) * (1 + Math.random() * 0.015)).toFixed(2));
    const low = parseFloat((Math.min(open, close) * (1 - Math.random() * 0.015)).toFixed(2));
    result.push({
      ts_code: tsCode,
      trade_date: dateStr,
      open, high, low, close,
      pre_close: preClose,
      pct_chg: parseFloat(pct.toFixed(2)),
      vol: Math.round(1e6 + Math.random() * 5e7),
      amount: parseFloat((close * (1e6 + Math.random() * 5e7) / 1e4).toFixed(2)),
      adj_factor: null,
      pe_ttm: parseFloat((15 + Math.random() * 30).toFixed(1)),
      pb: parseFloat((1.5 + Math.random() * 4).toFixed(2)),
      total_mv: parseFloat((baseClose * 1e8 * (0.8 + Math.random() * 0.4) / 1e8).toFixed(2)),
      circ_mv: null,
    });
  }
  return result;
}

// 个股基础价格映射
const STOCK_BASE_PRICES: Record<string, number> = {
  '603501.SH': 85.2,
  '688981.SH': 52.8,
  '002049.SZ': 68.5,
  '688012.SH': 95.3,
  '300661.SZ': 185.6,
  '688008.SH': 42.1,
  '688041.SH': 78.9,
  '688396.SH': 35.6,
  '002230.SZ': 38.5,
  '688111.SH': 268.4,
  '000977.SZ': 28.6,
  '300496.SZ': 62.3,
  '000001.SZ': 11.2,
  '600036.SH': 38.5,
  '601318.SH': 42.8,
  '600016.SH': 4.85,
  '601166.SH': 18.6,
  '600000.SH': 8.92,
  '600030.SH': 25.8,
  '000776.SZ': 18.5,
  '601688.SH': 16.8,
  '600837.SH': 9.25,
  '002736.SZ': 12.6,
};

export function getStockBasePrice(tsCode: string): number {
  return STOCK_BASE_PRICES[tsCode] ?? 30 + Math.random() * 50;
}

// 个股基础信息（用于详情面板）
export interface StockProfile {
  ts_code: string;
  name_cn: string;
  industry: string;
  market: string;
  pe_ttm: number;
  pb: number;
  total_mv: number; // 亿元
  circ_mv: number;  // 亿元
  turnover_rate: number; // %
  volume_ratio: number;
  pct_chg_today: number;
  close_today: number;
  high_52w: number;
  low_52w: number;
}

export function genStockProfile(meta: StockMeta): StockProfile {
  const basePrice = getStockBasePrice(meta.ts_code);
  const pct = (Math.random() - 0.45) * 6;
  return {
    ts_code: meta.ts_code,
    name_cn: meta.name_cn,
    industry: meta.industry,
    market: meta.market,
    pe_ttm: parseFloat((15 + Math.random() * 40).toFixed(1)),
    pb: parseFloat((1.2 + Math.random() * 5).toFixed(2)),
    total_mv: parseFloat((basePrice * 5e8 / 1e8).toFixed(1)),
    circ_mv: parseFloat((basePrice * 3e8 / 1e8).toFixed(1)),
    turnover_rate: parseFloat((0.5 + Math.random() * 5).toFixed(2)),
    volume_ratio: parseFloat((0.8 + Math.random() * 2).toFixed(2)),
    pct_chg_today: parseFloat(pct.toFixed(2)),
    close_today: parseFloat((basePrice * (1 + pct / 100)).toFixed(2)),
    high_52w: parseFloat((basePrice * 1.6).toFixed(2)),
    low_52w: parseFloat((basePrice * 0.65).toFixed(2)),
  };
}

// ─── 宏观状态矩阵 Mock 数据 ──────────────────────────────────────────────────────
// 对应数据库：indicator_values（region 字段区分 CN/US）
// 时间维度：短期（3-9月）/ 中期（2-3年）/ 长期（5-10年）
// 状态标签：扩张/复苏/中性/收缩/过热/低估/合理/高估/宽松/适度宽松/偏紧/强刺激/温和宽松

export type MatrixRegion = 'CN' | 'US';
export type MatrixPeriod = 'short' | 'mid' | 'long';

export interface MatrixCell {
  status: string;             // 状态标签（中文）
  score: number;              // 0-100 评分
  trend: 'up' | 'down' | 'flat'; // 趋势方向（用于小箭头）
  desc: string;               // 简短说明（tooltip）
  indicators: string[];       // 对应的 indicator_id 列表（indicator_values.indicator_id）
  data_quality: 'ok' | 'warn' | 'mock'; // 数据质量（mock=测试数据）
}

export interface MacroMatrixRow {
  dimension: string;           // 维度名称
  a_stock_corr: '正相关' | '负相关' | '弱相关'; // 对A股影响方向
  short: MatrixCell;           // 短期（3-9个月）
  mid: MatrixCell;             // 中期（2-3年）
  long: MatrixCell;            // 长期（5-10年）
}

export interface MacroMatrix {
  region: MatrixRegion;
  snapshot_date: string;       // 快照日期（YYYYMM，对应 indicator_values.trade_date）
  model_version: string;
  rows: MacroMatrixRow[];
  summary: {                   // 综合评估行
    short: MatrixCell;
    mid: MatrixCell;
    long: MatrixCell;
  };
}

// 中国宏观状态矩阵（CN）
export const MACRO_MATRIX_CN: MacroMatrix = {
  region: 'CN',
  snapshot_date: '202603',
  model_version: 'v1',
  rows: [
    {
      dimension: '宏观经济',
      a_stock_corr: '正相关',
      short: {
        status: '扩张',
        score: 80,
        trend: 'up',
        desc: 'GDP同比5.1%，PMI连续2月回升至50.2，工业增加值加速，经济动能温和扩张',
        indicators: ['gdp_yoy', 'pmi_mfg'],
        data_quality: 'mock',
      },
      mid: {
        status: '复苏',
        score: 62,
        trend: 'up',
        desc: '内需修复节奏偏慢，出口承压，中期复苏路径仍存不确定性',
        indicators: ['gdp_yoy', 'pmi_mfg'],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '人口结构、债务周期等长期因素制约潜在增速，中性判断',
        indicators: ['gdp_yoy'],
        data_quality: 'mock',
      },
    },
    {
      dimension: '流动性',
      a_stock_corr: '正相关',
      short: {
        status: '宽松',
        score: 75,
        trend: 'up',
        desc: 'M2同比7.5%，社融增速回升，LPR处历史低位，银行间流动性充裕',
        indicators: ['m2_yoy', 'social_financing_yoy'],
        data_quality: 'mock',
      },
      mid: {
        status: '适度宽松',
        score: 68,
        trend: 'flat',
        desc: '货币政策空间仍有，但汇率约束限制进一步宽松幅度',
        indicators: ['m2_yoy', 'rmb_usd'],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 55,
        trend: 'flat',
        desc: '利率中枢长期下行趋势确立，但债务扩张空间收窄',
        indicators: ['m2_yoy'],
        data_quality: 'mock',
      },
    },
    {
      dimension: '政策与预期',
      a_stock_corr: '正相关',
      short: {
        status: '温和宽松',
        score: 70,
        trend: 'up',
        desc: '财政赤字率提升至4%，专项债加速发行，地产收储政策持续落地',
        indicators: ['social_financing_yoy'],
        data_quality: 'mock',
      },
      mid: {
        status: '强刺激',
        score: 78,
        trend: 'up',
        desc: '政策组合拳力度超预期，科技+消费双轮驱动，市场预期明显改善',
        indicators: ['social_financing_yoy'],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 52,
        trend: 'flat',
        desc: '结构性改革推进，但外部环境不确定性长期存在',
        indicators: [],
        data_quality: 'mock',
      },
    },
    {
      dimension: '市场估值情绪',
      a_stock_corr: '正相关',
      short: {
        status: '合理',
        score: 55,
        trend: 'flat',
        desc: '沪深300 PE(TTM)约12倍，处历史25%分位，短期估值合理偏低',
        indicators: ['hs300_pe', 'all_a_pe'],
        data_quality: 'mock',
      },
      mid: {
        status: '低估',
        score: 65,
        trend: 'up',
        desc: '全A市盈率15.7倍，处历史30%分位以下，中期具备较强安全边际',
        indicators: ['hs300_pe', 'all_a_pe'],
        data_quality: 'mock',
      },
      long: {
        status: '低估',
        score: 72,
        trend: 'up',
        desc: '与全球主要市场相比，A股长期估值折价明显，具备配置价值',
        indicators: ['hs300_pe'],
        data_quality: 'mock',
      },
    },
  ],
  summary: {
    short: {
      status: '复苏',
      score: 70,
      trend: 'up',
      desc: '短期宏观环境偏多，经济扩张+流动性宽松+政策发力，建议积极配置',
      indicators: [],
      data_quality: 'mock',
    },
    mid: {
      status: '复苏',
      score: 68,
      trend: 'up',
      desc: '中期复苏路径确立，但节奏存在不确定性，建议均衡配置',
      indicators: [],
      data_quality: 'mock',
    },
    long: {
      status: '中性',
      score: 57,
      trend: 'flat',
      desc: '长期结构性机会存在，但整体中性，建议精选赛道',
      indicators: [],
      data_quality: 'mock',
    },
  },
};

// 美国宏观状态矩阵（US）
export const MACRO_MATRIX_US: MacroMatrix = {
  region: 'US',
  snapshot_date: '202603',
  model_version: 'v1',
  rows: [
    {
      dimension: '宏观经济',
      a_stock_corr: '弱相关',
      short: { status: '中性', score: 52, trend: 'down', desc: 'GDP增速放缓至1.8%，制造业PMI收缩，软着陆预期动摇', indicators: [], data_quality: 'mock' },
      mid: { status: '收缩', score: 38, trend: 'down', desc: '高利率滞后效应显现，信贷收紧，衰退风险上升', indicators: [], data_quality: 'mock' },
      long: { status: '中性', score: 55, trend: 'flat', desc: '美国经济韧性长期存在，AI产业革命提供新动能', indicators: [], data_quality: 'mock' },
    },
    {
      dimension: '流动性',
      a_stock_corr: '负相关',
      short: { status: '偏紧', score: 35, trend: 'up', desc: '联储维持高利率，但降息预期升温，流动性边际改善', indicators: [], data_quality: 'mock' },
      mid: { status: '适度宽松', score: 60, trend: 'up', desc: '降息周期开启后中期改善，对风险资产有利', indicators: [], data_quality: 'mock' },
      long: { status: '中性', score: 50, trend: 'flat', desc: '利率中枢高于疫情前，流动性长期中性', indicators: [], data_quality: 'mock' },
    },
    {
      dimension: '政策与预期',
      a_stock_corr: '弱相关',
      short: { status: '中性偏松', score: 58, trend: 'flat', desc: '财政刺激有限，大选年政策不确定性上升', indicators: [], data_quality: 'mock' },
      mid: { status: '中性', score: 50, trend: 'flat', desc: '两党政策分歧加大，监管不确定性制约投资', indicators: [], data_quality: 'mock' },
      long: { status: '中性', score: 52, trend: 'flat', desc: '美国政策周期性强，长期中性判断', indicators: [], data_quality: 'mock' },
    },
    {
      dimension: '市场估值情绪',
      a_stock_corr: '弱相关',
      short: { status: '高估', score: 32, trend: 'down', desc: '标普500 PE约22倍，处历史75%分位，估值偏高，风险溢价压缩', indicators: [], data_quality: 'mock' },
      mid: { status: '合理', score: 50, trend: 'flat', desc: 'AI驱动盈利增长支撑估值，中期合理', indicators: [], data_quality: 'mock' },
      long: { status: '合理', score: 55, trend: 'flat', desc: '长期盈利增长支撑，但估值扩张空间有限', indicators: [], data_quality: 'mock' },
    },
  ],
  summary: {
    short: { status: '中性', score: 44, trend: 'down', desc: '短期美国宏观偏弱，高估值+经济放缓，建议低配美股', indicators: [], data_quality: 'mock' },
    mid: { status: '复苏', score: 55, trend: 'up', desc: '降息周期开启后中期改善，可逐步增配', indicators: [], data_quality: 'mock' },
    long: { status: '中性', score: 53, trend: 'flat', desc: '长期中性，AI产业机会与高估值风险并存', indicators: [], data_quality: 'mock' },
  },
};
