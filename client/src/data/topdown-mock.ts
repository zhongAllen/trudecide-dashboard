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
  { id: 'lpr_1y', name_cn: 'LPR 1年期', category: 'rate', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'bond_10y', name_cn: '10年期国债收益率', category: 'rate', unit: '%', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'dr007', name_cn: 'DR007', category: 'rate', unit: '%', scale: null, region: 'CN', frequency: 'daily' },
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
  lpr_1y: genMonthlyValues('lpr_1y', 3.1, -0.05, 0.01),
  bond_10y: genMonthlyValues('bond_10y', 2.3, -0.1, 0.05),
  dr007: genMonthlyValues('dr007', 1.8, -0.05, 0.05),
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
  { id: 'ths_882201.TI', name_cn: '汽车', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_882301.TI', name_cn: '电力', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_882401.TI', name_cn: '钢铁', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_882501.TI', name_cn: '农林牧渔', system: 'ths', level: 1, parent_id: null, idx_type: '行业板块', is_active: true },
  // 概念板块
  { id: 'ths_c_ai.TI', name_cn: 'AI大模型', system: 'ths', level: 1, parent_id: null, idx_type: '概念板块', is_active: true },
  { id: 'ths_c_robot.TI', name_cn: '人形机器人', system: 'ths', level: 1, parent_id: null, idx_type: '概念板块', is_active: true },
  { id: 'ths_c_huawei.TI', name_cn: '华为概念', system: 'ths', level: 1, parent_id: null, idx_type: '概念板块', is_active: true },
  { id: 'ths_c_lowalt.TI', name_cn: '低空经济', system: 'ths', level: 1, parent_id: null, idx_type: '概念板块', is_active: true },
  { id: 'ths_c_quantum.TI', name_cn: '量子计算', system: 'ths', level: 1, parent_id: null, idx_type: '概念板块', is_active: true },
  // 风格板块
  { id: 'ths_s_large.TI', name_cn: '大盘蓝筹', system: 'ths', level: 1, parent_id: null, idx_type: '风格板块', is_active: true },
  { id: 'ths_s_small.TI', name_cn: '中小成长', system: 'ths', level: 1, parent_id: null, idx_type: '风格板块', is_active: true },
  { id: 'ths_s_value.TI', name_cn: '价值', system: 'ths', level: 1, parent_id: null, idx_type: '风格板块', is_active: true },
  { id: 'ths_s_growth.TI', name_cn: '成长', system: 'ths', level: 1, parent_id: null, idx_type: '风格板块', is_active: true },
];

// 生成板块近期日线数据（sector_daily 格式）
function genSectorDaily(sectorId: string, baseClose: number, trend: number): SectorDaily[] {
  const result: SectorDaily[] = [];
  let close = baseClose;
  for (let i = 59; i >= 0; i--) {
    const d = new Date(2026, 2, 3 - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const pct = (Math.random() - 0.48 + trend * 0.01) * 2;
    const preClose = close;
    close = parseFloat((close * (1 + pct / 100)).toFixed(3));
    const open = parseFloat((preClose * (1 + (Math.random() - 0.5) * 0.005)).toFixed(3));
    const high = parseFloat((Math.max(open, close) * (1 + Math.random() * 0.008)).toFixed(3));
    const low = parseFloat((Math.min(open, close) * (1 - Math.random() * 0.008)).toFixed(3));
    const upNum = Math.round(15 + Math.random() * 20);
    const downNum = Math.round(10 + Math.random() * 15);
    result.push({
      sector_id: sectorId,
      trade_date: dateStr,
      open, high, low, close,
      pct_change: parseFloat(pct.toFixed(2)),
      vol: Math.round(1e8 + Math.random() * 5e8),
      amount: parseFloat((close * (1e8 + Math.random() * 5e8) / 1e4).toFixed(2)),
      up_num: upNum,
      down_num: downNum,
      flat_num: Math.round(2 + Math.random() * 5),
      avg_pe: parseFloat((15 + Math.random() * 20).toFixed(1)),
      total_mv: parseFloat((1000 + Math.random() * 5000).toFixed(1)),
      turnover_rate: parseFloat((0.5 + Math.random() * 3).toFixed(2)),
      leading_code: null,
      leading_name: null,
      leading_pct: parseFloat((pct + Math.random() * 2).toFixed(2)),
    });
  }
  return result;
}

// 板块趋势参数（trend > 0 偏多，< 0 偏空）
const SECTOR_TRENDS: Record<string, { base: number; trend: number }> = {
  'ths_881101.TI': { base: 1200, trend: 2 },   // 银行 偏多
  'ths_881102.TI': { base: 980, trend: 1.5 },   // 保险
  'ths_881103.TI': { base: 1450, trend: 3 },    // 证券 强势
  'ths_881201.TI': { base: 2100, trend: -0.5 }, // 医药 偏弱
  'ths_881202.TI': { base: 1800, trend: 0.5 },  // 医疗器械
  'ths_881301.TI': { base: 1600, trend: -1 },   // 新能源 偏弱
  'ths_881302.TI': { base: 1200, trend: -1.5 }, // 光伏 弱
  'ths_881303.TI': { base: 900, trend: 1 },     // 储能
  'ths_881401.TI': { base: 3200, trend: 4 },    // 半导体 强势
  'ths_881402.TI': { base: 2800, trend: 3.5 },  // 消费电子 强势
  'ths_881403.TI': { base: 4500, trend: 5 },    // 人工智能 最强
  'ths_881501.TI': { base: 1900, trend: -0.5 }, // 白酒 偏弱
  'ths_881502.TI': { base: 1500, trend: 0 },    // 食品饮料
  'ths_881601.TI': { base: 800, trend: -2 },    // 房地产 弱
  'ths_881602.TI': { base: 700, trend: -1 },    // 建筑材料 弱
  'ths_881701.TI': { base: 2200, trend: 2.5 },  // 军工 偏多
  'ths_881801.TI': { base: 1700, trend: 1 },    // 有色金属
  'ths_881901.TI': { base: 1100, trend: 0.5 },  // 化工
  'ths_882001.TI': { base: 1300, trend: 1.5 },  // 机械设备
  'ths_882101.TI': { base: 900, trend: 2 },     // 传媒
  'ths_882201.TI': { base: 1600, trend: 3 },    // 汽车 偏多
  'ths_882301.TI': { base: 1100, trend: 0.5 },  // 电力
  'ths_882401.TI': { base: 800, trend: -0.5 },  // 钢铁
  'ths_882501.TI': { base: 600, trend: 0 },     // 农林牧渔
  'ths_c_ai.TI':   { base: 5000, trend: 6 },    // AI大模型 最强
  'ths_c_robot.TI':{ base: 3500, trend: 5 },    // 人形机器人 强
  'ths_c_huawei.TI':{ base: 2800, trend: 3 },   // 华为概念
  'ths_c_lowalt.TI':{ base: 2200, trend: 2.5 }, // 低空经济
  'ths_c_quantum.TI':{ base: 1800, trend: 4 },  // 量子计算
  'ths_s_large.TI':{ base: 1500, trend: 1 },    // 大盘蓝筹
  'ths_s_small.TI':{ base: 1200, trend: 2 },    // 中小成长
  'ths_s_value.TI':{ base: 1400, trend: 0.5 },  // 价值
  'ths_s_growth.TI':{ base: 1800, trend: 3 },   // 成长
};

// 缓存板块日线数据
const SECTOR_DAILY_CACHE: Record<string, SectorDaily[]> = {};

export function getSectorDailyList(sectorId: string): SectorDaily[] {
  if (!SECTOR_DAILY_CACHE[sectorId]) {
    const params = SECTOR_TRENDS[sectorId] ?? { base: 1000, trend: 0 };
    SECTOR_DAILY_CACHE[sectorId] = genSectorDaily(sectorId, params.base, params.trend);
  }
  return SECTOR_DAILY_CACHE[sectorId];
}

export const SECTOR_DAILY_MAP: Record<string, SectorDaily[]> = new Proxy({}, {
  get(_, sectorId: string) {
    return getSectorDailyList(sectorId);
  }
});

export function getSectorLatest(sectorId: string): SectorDaily | null {
  const list = getSectorDailyList(sectorId);
  return list[list.length - 1] ?? null;
}

// ─── 个股 Mock 数据 ────────────────────────────────────────────────────────────

// 板块 → 成分股映射
const SECTOR_STOCKS: Record<string, StockMeta[]> = {
  'ths_881401.TI': [
    { ts_code: '603501.SH', symbol: '603501', name_cn: '韦尔股份', area: '上海', industry: '半导体', market: 'SH', list_date: '20170508', is_active: true },
    { ts_code: '002049.SZ', symbol: '002049', name_cn: '紫光国微', area: '北京', industry: '半导体', market: 'SZ', list_date: '20040105', is_active: true },
    { ts_code: '688012.SH', symbol: '688012', name_cn: '中微公司', area: '上海', industry: '半导体', market: 'SH', list_date: '20190722', is_active: true },
    { ts_code: '688981.SH', symbol: '688981', name_cn: '中芯国际', area: '上海', industry: '半导体', market: 'SH', list_date: '20200716', is_active: true },
    { ts_code: '300782.SZ', symbol: '300782', name_cn: '卓胜微', area: '广东', industry: '半导体', market: 'SZ', list_date: '20190712', is_active: true },
    { ts_code: '688256.SH', symbol: '688256', name_cn: '寒武纪', area: '北京', industry: '半导体', market: 'SH', list_date: '20200720', is_active: true },
  ],
  'ths_881403.TI': [
    { ts_code: '300059.SZ', symbol: '300059', name_cn: '东方财富', area: '上海', industry: '互联网', market: 'SZ', list_date: '20100301', is_active: true },
    { ts_code: '002230.SZ', symbol: '002230', name_cn: '科大讯飞', area: '安徽', industry: 'AI', market: 'SZ', list_date: '20080201', is_active: true },
    { ts_code: '688111.SH', symbol: '688111', name_cn: '金山办公', area: '北京', industry: '软件', market: 'SH', list_date: '20191118', is_active: true },
    { ts_code: '300014.SZ', symbol: '300014', name_cn: '亿纬锂能', area: '广东', industry: '新能源', market: 'SZ', list_date: '20100101', is_active: true },
    { ts_code: '688041.SH', symbol: '688041', name_cn: '海光信息', area: '天津', industry: '半导体', market: 'SH', list_date: '20220822', is_active: true },
  ],
  'ths_881402.TI': [
    { ts_code: '002415.SZ', symbol: '002415', name_cn: '海康威视', area: '浙江', industry: '电子', market: 'SZ', list_date: '20100528', is_active: true },
    { ts_code: '002241.SZ', symbol: '002241', name_cn: '歌尔股份', area: '山东', industry: '电子', market: 'SZ', list_date: '20080924', is_active: true },
    { ts_code: '002475.SZ', symbol: '002475', name_cn: '立讯精密', area: '广东', industry: '电子', market: 'SZ', list_date: '20100910', is_active: true },
    { ts_code: '603501.SH', symbol: '603501', name_cn: '韦尔股份', area: '上海', industry: '半导体', market: 'SH', list_date: '20170508', is_active: true },
    { ts_code: '300433.SZ', symbol: '300433', name_cn: '蓝思科技', area: '湖南', industry: '电子', market: 'SZ', list_date: '20150318', is_active: true },
  ],
  'ths_881101.TI': [
    { ts_code: '601398.SH', symbol: '601398', name_cn: '工商银行', area: '北京', industry: '银行', market: 'SH', list_date: '20061027', is_active: true },
    { ts_code: '601288.SH', symbol: '601288', name_cn: '农业银行', area: '北京', industry: '银行', market: 'SH', list_date: '20100715', is_active: true },
    { ts_code: '600036.SH', symbol: '600036', name_cn: '招商银行', area: '广东', industry: '银行', market: 'SH', list_date: '20020409', is_active: true },
    { ts_code: '601166.SH', symbol: '601166', name_cn: '兴业银行', area: '福建', industry: '银行', market: 'SH', list_date: '20070201', is_active: true },
    { ts_code: '600000.SH', symbol: '600000', name_cn: '浦发银行', area: '上海', industry: '银行', market: 'SH', list_date: '19991110', is_active: true },
  ],
  'ths_881103.TI': [
    { ts_code: '600030.SH', symbol: '600030', name_cn: '中信证券', area: '北京', industry: '证券', market: 'SH', list_date: '20030106', is_active: true },
    { ts_code: '601688.SH', symbol: '601688', name_cn: '华泰证券', area: '江苏', industry: '证券', market: 'SH', list_date: '20100209', is_active: true },
    { ts_code: '000776.SZ', symbol: '000776', name_cn: '广发证券', area: '广东', industry: '证券', market: 'SZ', list_date: '20100830', is_active: true },
    { ts_code: '601995.SH', symbol: '601995', name_cn: '中金公司', area: '北京', industry: '证券', market: 'SH', list_date: '20201102', is_active: true },
    { ts_code: '600999.SH', symbol: '600999', name_cn: '招商证券', area: '广东', industry: '证券', market: 'SH', list_date: '20090923', is_active: true },
  ],
  'ths_881701.TI': [
    { ts_code: '600760.SH', symbol: '600760', name_cn: '中航沈飞', area: '辽宁', industry: '军工', market: 'SH', list_date: '19961015', is_active: true },
    { ts_code: '002414.SZ', symbol: '002414', name_cn: '高德红外', area: '湖北', industry: '军工', market: 'SZ', list_date: '20100118', is_active: true },
    { ts_code: '600893.SH', symbol: '600893', name_cn: '航发动力', area: '陕西', industry: '军工', market: 'SH', list_date: '19961016', is_active: true },
    { ts_code: '002179.SZ', symbol: '002179', name_cn: '中航光电', area: '陕西', industry: '军工', market: 'SZ', list_date: '20080229', is_active: true },
    { ts_code: '688596.SH', symbol: '688596', name_cn: '正帆科技', area: '上海', industry: '军工', market: 'SH', list_date: '20210423', is_active: true },
  ],
  'ths_c_ai.TI': [
    { ts_code: '002230.SZ', symbol: '002230', name_cn: '科大讯飞', area: '安徽', industry: 'AI', market: 'SZ', list_date: '20080201', is_active: true },
    { ts_code: '688111.SH', symbol: '688111', name_cn: '金山办公', area: '北京', industry: '软件', market: 'SH', list_date: '20191118', is_active: true },
    { ts_code: '688041.SH', symbol: '688041', name_cn: '海光信息', area: '天津', industry: '半导体', market: 'SH', list_date: '20220822', is_active: true },
    { ts_code: '300059.SZ', symbol: '300059', name_cn: '东方财富', area: '上海', industry: '互联网', market: 'SZ', list_date: '20100301', is_active: true },
    { ts_code: '603605.SH', symbol: '603605', name_cn: '珀莱雅', area: '浙江', industry: '消费', market: 'SH', list_date: '20170228', is_active: true },
  ],
  'ths_c_robot.TI': [
    { ts_code: '300024.SZ', symbol: '300024', name_cn: '机器人', area: '辽宁', industry: '机械', market: 'SZ', list_date: '20100114', is_active: true },
    { ts_code: '688169.SH', symbol: '688169', name_cn: '石头科技', area: '北京', industry: '家电', market: 'SH', list_date: '20200218', is_active: true },
    { ts_code: '300496.SZ', symbol: '300496', name_cn: '中科创达', area: '北京', industry: '软件', market: 'SZ', list_date: '20160629', is_active: true },
    { ts_code: '002747.SZ', symbol: '002747', name_cn: '埃斯顿', area: '江苏', industry: '机械', market: 'SZ', list_date: '20150218', is_active: true },
    { ts_code: '688007.SH', symbol: '688007', name_cn: '光峰科技', area: '广东', industry: '电子', market: 'SH', list_date: '20190822', is_active: true },
  ],
};

// 默认成分股（未配置的板块）
const DEFAULT_STOCKS: StockMeta[] = [
  { ts_code: '000001.SZ', symbol: '000001', name_cn: '平安银行', area: '广东', industry: '银行', market: 'SZ', list_date: '19910403', is_active: true },
  { ts_code: '000002.SZ', symbol: '000002', name_cn: '万科A', area: '广东', industry: '房地产', market: 'SZ', list_date: '19910129', is_active: true },
  { ts_code: '600519.SH', symbol: '600519', name_cn: '贵州茅台', area: '贵州', industry: '白酒', market: 'SH', list_date: '20010827', is_active: true },
  { ts_code: '601318.SH', symbol: '601318', name_cn: '中国平安', area: '广东', industry: '保险', market: 'SH', list_date: '20070301', is_active: true },
  { ts_code: '000858.SZ', symbol: '000858', name_cn: '五粮液', area: '四川', industry: '白酒', market: 'SZ', list_date: '19980427', is_active: true },
];

export function getSectorStocks(sectorId: string): StockMeta[] {
  return SECTOR_STOCKS[sectorId] ?? DEFAULT_STOCKS;
}

// 股票基础价格（用于生成 K 线数据）
const STOCK_BASE_PRICES: Record<string, number> = {
  '603501.SH': 85.2,
  '002049.SZ': 42.8,
  '688012.SH': 68.5,
  '688981.SH': 52.3,
  '300782.SZ': 78.9,
  '688256.SH': 145.6,
  '300059.SZ': 18.5,
  '002230.SZ': 32.4,
  '688111.SH': 225.8,
  '300014.SZ': 28.6,
  '688041.SH': 98.5,
  '002415.SZ': 32.8,
  '002241.SZ': 15.6,
  '002475.SZ': 38.9,
  '300433.SZ': 22.5,
  '601398.SH': 5.82,
  '601288.SH': 4.25,
  '600036.SH': 38.5,
  '601166.SH': 18.2,
  '600000.SH': 9.85,
  '600030.SH': 22.8,
  '601688.SH': 15.6,
  '000776.SZ': 18.2,
  '601995.SH': 42.5,
  '600999.SH': 14.8,
  '600760.SH': 68.5,
  '002414.SZ': 35.6,
  '600893.SH': 28.9,
  '002179.SZ': 45.2,
  '688596.SH': 22.5,
  '300024.SZ': 18.5,
  '688169.SH': 285.6,
  '300496.SZ': 65.8,
  '002747.SZ': 28.5,
  '688007.SH': 12.5,
  '000001.SZ': 12.5,
  '000002.SZ': 8.2,
  '600519.SH': 1685.0,
  '601318.SH': 45.8,
  '000858.SZ': 128.5,
};

export function getStockBasePrice(tsCode: string): number {
  return STOCK_BASE_PRICES[tsCode] ?? 50.0;
}

// 生成股票 K 线数据（stock_daily 格式）
export function genStockKline(
  tsCode: string,
  basePrice: number,
  period: 'daily' | 'weekly' | 'monthly',
  count: number = 120
): StockDaily[] {
  const result: StockDaily[] = [];
  let close = basePrice;
  const baseDate = new Date(2026, 2, 3);

  for (let i = count - 1; i >= 0; i--) {
    let d: Date;
    if (period === 'daily') {
      d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
    } else if (period === 'weekly') {
      d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i * 7);
    } else {
      d = new Date(baseDate);
      d.setMonth(baseDate.getMonth() - i);
    }

    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const pct = (Math.random() - 0.49) * (period === 'daily' ? 4 : period === 'weekly' ? 8 : 12);
    const preClose = close;
    close = parseFloat((close * (1 + pct / 100)).toFixed(2));
    if (close < 1) close = 1;
    const open = parseFloat((preClose * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2));
    const high = parseFloat((Math.max(open, close) * (1 + Math.random() * 0.02)).toFixed(2));
    const low = parseFloat((Math.min(open, close) * (1 - Math.random() * 0.02)).toFixed(2));
    const vol = Math.round(1e6 + Math.random() * 5e7);

    result.push({
      ts_code: tsCode,
      trade_date: dateStr,
      open, high, low, close,
      pre_close: preClose,
      pct_chg: parseFloat(pct.toFixed(2)),
      vol,
      amount: parseFloat((close * vol / 1e4).toFixed(2)),
      adj_factor: null,
      pe_ttm: parseFloat((15 + Math.random() * 20).toFixed(1)),
      pb: parseFloat((1.5 + Math.random() * 3).toFixed(2)),
      total_mv: parseFloat((close * (1e8 + Math.random() * 1e10) / 1e8).toFixed(2)),
      circ_mv: null,
    });
  }
  return result;
}

// 生成个股画像（综合 stock_daily + stock_daily_basic）
export function genStockProfile(stock: StockMeta) {
  const base = getStockBasePrice(stock.ts_code);
  const pct = (Math.random() - 0.48) * 6;
  const close = parseFloat((base * (1 + pct / 100)).toFixed(2));
  return {
    ts_code: stock.ts_code,
    name_cn: stock.name_cn,
    close_today: close,
    pct_chg_today: parseFloat(pct.toFixed(2)),
    pe_ttm: parseFloat((15 + Math.random() * 25).toFixed(1)),
    pb: parseFloat((1.5 + Math.random() * 4).toFixed(2)),
    ps_ttm: parseFloat((2 + Math.random() * 5).toFixed(2)),
    turnover_rate: parseFloat((0.5 + Math.random() * 5).toFixed(2)),
    volume_ratio: parseFloat((0.8 + Math.random() * 2).toFixed(2)),
    total_mv: parseFloat((close * (5e7 + Math.random() * 5e9) / 1e8).toFixed(1)),
    circ_mv: parseFloat((close * (3e7 + Math.random() * 3e9) / 1e8).toFixed(1)),
    high_52w: parseFloat((base * (1.2 + Math.random() * 0.3)).toFixed(2)),
    low_52w: parseFloat((base * (0.6 + Math.random() * 0.2)).toFixed(2)),
    // 资金流向（模拟 moneyflow 格式）
    net_mf_amount: parseFloat(((Math.random() - 0.45) * 5000).toFixed(2)), // 万元
    buy_lg_amount: parseFloat((Math.random() * 8000).toFixed(2)),
    sell_lg_amount: parseFloat((Math.random() * 6000).toFixed(2)),
    buy_md_amount: parseFloat((Math.random() * 3000).toFixed(2)),
    sell_md_amount: parseFloat((Math.random() * 2500).toFixed(2)),
    buy_sm_amount: parseFloat((Math.random() * 1500).toFixed(2)),
    sell_sm_amount: parseFloat((Math.random() * 1200).toFixed(2)),
  };
}

// ─── 宏观状态矩阵类型定义 ─────────────────────────────────────────────────────

export type MatrixRegion = 'CN' | 'US';

export interface MatrixCell {
  status: string;           // 状态标签（如"扩张"、"宽松"）
  score: number;            // 综合评分 0-100
  trend: 'up' | 'down' | 'flat';
  desc: string;             // 详细描述
  indicators: string[];     // 关联的 indicator_id 列表
  data_quality: 'live' | 'mock' | 'warn';
}

export interface MacroMatrixRow {
  dimension: string;        // 维度名称
  a_stock_corr: '正相关' | '负相关' | '弱相关';
  short: MatrixCell;        // 短期（3-9个月）
  mid: MatrixCell;          // 中期（2-3年）
  long: MatrixCell;         // 长期（5-10年）
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
    // ── 维度1：经济周期位置 ──────────────────────────────────────────────────
    // 数据来源：pmi_mfg, pmi_non_mfg, gdp_yoy, gdp_qoq, industrial_yoy,
    //           retail_yoy, fai_yoy, export_yoy, import_yoy, unemployment_rate
    {
      dimension: '经济周期位置',
      a_stock_corr: '正相关',
      short: {
        status: '扩张',
        score: 80,
        trend: 'up',
        desc: 'PMI连续2月回升至50.2，工业增加值同比+5.8%，GDP同比5.1%，零售同比+4.2%，经济动能温和扩张',
        indicators: ['pmi_mfg', 'pmi_non_mfg', 'gdp_yoy', 'industrial_yoy', 'retail_yoy'],
        data_quality: 'mock',
      },
      mid: {
        status: '复苏',
        score: 62,
        trend: 'up',
        desc: '内需修复节奏偏慢，出口同比-2.1%受外部压制，固投同比+3.5%，中期复苏路径存不确定性',
        indicators: ['gdp_yoy', 'gdp_qoq', 'fai_yoy', 'export_yoy', 'import_yoy', 'unemployment_rate'],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '人口结构老龄化、债务周期高位等长期因素制约潜在增速，长期中性判断',
        indicators: ['gdp_yoy', 'gdp_per_capita', 'unemployment_rate'],
        data_quality: 'mock',
      },
    },
    // ── 维度2：货币政策信号 ──────────────────────────────────────────────────
    // 数据来源：lpr_1y, lpr_5y, dr007, dr001, shibor_on, shibor_1w,
    //           bond_10y, bond_10y_real
    {
      dimension: '货币政策信号',
      a_stock_corr: '正相关',
      short: {
        status: '宽松',
        score: 75,
        trend: 'up',
        desc: 'LPR 1Y=3.1%（历史低位），DR007=1.8%，债券10年期=2.3%，货币政策明确宽松取向',
        indicators: ['lpr_1y', 'lpr_5y', 'dr007', 'dr001', 'shibor_on', 'shibor_1w', 'bond_10y'],
        data_quality: 'mock',
      },
      mid: {
        status: '适度宽松',
        score: 68,
        trend: 'flat',
        desc: '实际利率bond_10y_real=0.8%，汇率约束（rmb_usd=7.25）限制进一步宽松幅度',
        indicators: ['bond_10y', 'bond_10y_real', 'rmb_usd', 'lpr_1y'],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 55,
        trend: 'flat',
        desc: '利率中枢长期下行趋势确立，但债务扩张空间收窄，长期中性',
        indicators: ['bond_10y', 'bond_10y_real', 'lpr_1y'],
        data_quality: 'mock',
      },
    },
    // ── 维度3：政策底确认 ────────────────────────────────────────────────────
    // 数据来源：social_finance, social_finance_yoy, new_loans, m2_yoy
    //           （政策新闻/监管动向暂无结构化数据，接库后接 news/announcement）
    {
      dimension: '政策底确认',
      a_stock_corr: '正相关',
      short: {
        status: '温和宽松',
        score: 70,
        trend: 'up',
        desc: '社融增量同比多增1.2万亿，新增贷款1.5万亿，财政赤字率提升至4%，专项债加速发行',
        indicators: ['social_finance', 'social_finance_yoy', 'new_loans', 'm2_yoy'],
        data_quality: 'mock',
      },
      mid: {
        status: '强刺激',
        score: 78,
        trend: 'up',
        desc: '政策组合拳力度超预期（货币+财政+地产），科技+消费双轮驱动，市场预期明显改善',
        indicators: ['social_finance_yoy', 'm2_yoy', 'new_loans'],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 52,
        trend: 'flat',
        desc: '结构性改革持续推进，但外部环境不确定性和债务约束限制长期政策空间',
        indicators: ['social_finance_yoy', 'm2_yoy'],
        data_quality: 'mock',
      },
    },
    // ── 维度4：流动性环境 ────────────────────────────────────────────────────
    // 数据来源：m2_yoy, m2_level, social_finance_yoy, north_net_flow,
    //           north_daily_turnover, north_turnover_ratio_daily,
    //           sh_market_turnover, sz_market_turnover, total_market_turnover,
    //           margin_balance_sh, margin_balance_sz
    {
      dimension: '流动性环境',
      a_stock_corr: '正相关',
      short: {
        status: '充裕',
        score: 72,
        trend: 'up',
        desc: 'M2同比7.5%，全A日成交额1.2万亿，北向净流入+85亿，融资余额1.85万亿，资金面活跃',
        indicators: ['m2_yoy', 'total_market_turnover', 'north_net_flow', 'north_daily_turnover', 'margin_balance_sh', 'margin_balance_sz'],
        data_quality: 'mock',
      },
      mid: {
        status: '适度充裕',
        score: 65,
        trend: 'flat',
        desc: '社融存量同比8.2%，北向成交占比6.8%，中期流动性适度充裕，支撑市场运行',
        indicators: ['social_financing_yoy', 'north_daily_turnover', 'm2_yoy'],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 55,
        trend: 'flat',
        desc: '人民币国际化推进，但资本账户管制限制外资长期流入规模，长期中性',
        indicators: ['m2_yoy', 'rmb_usd', 'north_daily_turnover'],
        data_quality: 'mock',
      },
    },
    // ── 维度5：外部环境 ──────────────────────────────────────────────────────
    // 数据来源：rmb_usd, trade_balance, export_yoy, import_yoy
    //           （美联储政策/地缘政治暂无结构化数据，接库后接 global 指标）
    {
      dimension: '外部环境',
      a_stock_corr: '正相关',
      short: {
        status: '中性偏压',
        score: 45,
        trend: 'down',
        desc: '人民币兑美元7.25，贸易顺差收窄，关税摩擦升温，外部冲击处于可控但偏压状态',
        indicators: ['rmb_usd', 'trade_balance', 'export_yoy', 'import_yoy'],
        data_quality: 'mock',
      },
      mid: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '贸易多元化布局推进，东南亚出口替代效应显现，中期外部压力边际缓解',
        indicators: ['trade_balance', 'export_yoy', 'import_yoy', 'rmb_usd'],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 48,
        trend: 'flat',
        desc: '全球化格局重塑，中国在全球供应链中的地位调整是长期变量，中性判断',
        indicators: ['trade_balance', 'export_yoy', 'rmb_usd'],
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

// 美国宏观状态矩阵（US）— 同样使用 5 维度框架
export const MACRO_MATRIX_US: MacroMatrix = {
  region: 'US',
  snapshot_date: '202603',
  model_version: 'v1',
  rows: [
    // ── 维度1：经济周期位置 ──────────────────────────────────────────────────
    {
      dimension: '经济周期位置',
      a_stock_corr: '弱相关',
      short: {
        status: '放缓',
        score: 42,
        trend: 'down',
        desc: 'GDP增速放缓至1.8%，制造业PMI收缩至47.8，非农就业增速下滑，软着陆预期动摇',
        indicators: [],
        data_quality: 'mock',
      },
      mid: {
        status: '收缩',
        score: 35,
        trend: 'down',
        desc: '高利率滞后效应显现，信贷收紧，消费支出放缓，衰退风险上升至35%',
        indicators: [],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 55,
        trend: 'flat',
        desc: '美国经济韧性长期存在，AI产业革命提供新动能，长期潜在增速约2%',
        indicators: [],
        data_quality: 'mock',
      },
    },
    // ── 维度2：货币政策信号 ──────────────────────────────────────────────────
    {
      dimension: '货币政策信号',
      a_stock_corr: '负相关',
      short: {
        status: '偏紧',
        score: 35,
        trend: 'up',
        desc: '联邦基金利率5.25-5.5%维持高位，但降息预期升温（CME FedWatch降息概率65%），流动性边际改善',
        indicators: [],
        data_quality: 'mock',
      },
      mid: {
        status: '适度宽松',
        score: 60,
        trend: 'up',
        desc: '降息周期预计2025年开启，中期利率下行对风险资产有利，美债收益率曲线趋于正常化',
        indicators: [],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '利率中枢高于疫情前（2-3% vs 0-0.25%），流动性长期中性，QT持续缩表',
        indicators: [],
        data_quality: 'mock',
      },
    },
    // ── 维度3：政策底确认 ────────────────────────────────────────────────────
    {
      dimension: '政策底确认',
      a_stock_corr: '弱相关',
      short: {
        status: '中性偏松',
        score: 55,
        trend: 'flat',
        desc: '财政刺激有限（赤字率6.5%），大选年政策不确定性上升，IRA/芯片法案持续落地',
        indicators: [],
        data_quality: 'mock',
      },
      mid: {
        status: '中性',
        score: 48,
        trend: 'flat',
        desc: '两党政策分歧加大，监管不确定性制约投资，AI/清洁能源政策存在分歧',
        indicators: [],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 52,
        trend: 'flat',
        desc: '美国政策周期性强，产业政策（芯片/AI）长期支撑科技创新，但财政可持续性存疑',
        indicators: [],
        data_quality: 'mock',
      },
    },
    // ── 维度4：流动性环境 ────────────────────────────────────────────────────
    {
      dimension: '流动性环境',
      a_stock_corr: '负相关',
      short: {
        status: '偏紧',
        score: 38,
        trend: 'up',
        desc: 'M2同比-1.2%，银行信贷标准收紧，但货币市场基金规模创历史新高（6.2万亿美元）',
        indicators: [],
        data_quality: 'mock',
      },
      mid: {
        status: '改善',
        score: 58,
        trend: 'up',
        desc: '降息周期开启后货币市场资金将回流风险资产，中期流动性改善预期明确',
        indicators: [],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '美元储备货币地位长期稳定，但去美元化趋势缓慢推进，长期流动性中性',
        indicators: [],
        data_quality: 'mock',
      },
    },
    // ── 维度5：外部环境 ──────────────────────────────────────────────────────
    {
      dimension: '外部环境',
      a_stock_corr: '弱相关',
      short: {
        status: '偏压',
        score: 38,
        trend: 'down',
        desc: '地缘政治风险（中东/乌克兰）持续，关税政策不确定性，美元指数高位（DXY=104）',
        indicators: [],
        data_quality: 'mock',
      },
      mid: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '盟友体系重构推进，供应链回流政策持续，中期外部环境趋于稳定',
        indicators: [],
        data_quality: 'mock',
      },
      long: {
        status: '中性偏强',
        score: 58,
        trend: 'flat',
        desc: '美国主导的全球秩序重塑，科技+军事优势长期维持，外部环境长期偏中性偏强',
        indicators: [],
        data_quality: 'mock',
      },
    },
  ],
  summary: {
    short: {
      status: '中性偏弱',
      score: 42,
      trend: 'down',
      desc: '短期美国宏观偏弱，高估值+经济放缓+流动性偏紧，对A股影响中性偏负',
      indicators: [],
      data_quality: 'mock',
    },
    mid: {
      status: '复苏',
      score: 50,
      trend: 'up',
      desc: '降息周期开启后中期改善，美股科技股对A股科技板块有示范效应',
      indicators: [],
      data_quality: 'mock',
    },
    long: {
      status: '中性',
      score: 53,
      trend: 'flat',
      desc: '长期中性，AI产业机会与高估值风险并存，对A股长期影响有限',
      indicators: [],
      data_quality: 'mock',
    },
  },
};
