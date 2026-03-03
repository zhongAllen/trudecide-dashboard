/**
 * topdown-mock.ts — Top-Down 选股 Demo Mock 数据
 *
 * 所有字段与数据库表结构完全一致，后续接库时只需替换数据源即可。
 *
 * 数据库字段对照：
 *   indicator_values: indicator_id, trade_date, publish_date, value, revision_seq, collected_at, region
 *   indicator_meta:   id, name_cn, category, unit, scale, region, frequency
 *   sector_meta:      id, name_cn, system, level, parent_id, idx_type, is_active
 *   sector_daily:     sector_id, trade_date, open, high, low, close, pct_change, vol, amount,
 *                     up_num, down_num, flat_num, avg_pe, total_mv, turnover_rate,
 *                     leading_code, leading_name, leading_pct
 *   sector_stock_map: sector_id, ts_code, in_date, out_date, is_current, system
 *   stock_meta:       ts_code, symbol, name_cn, area, industry, market, list_date, is_active
 *   stock_daily:      ts_code, trade_date, open, high, low, close, pre_close, pct_chg, vol, amount
 *   stock_daily_basic:ts_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio,
 *                     pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, total_share, float_share, total_mv, circ_mv
 *   stock_moneyflow:  ts_code, trade_date, source, net_amount, net_amount_rate,
 *                     buy_elg_amount, buy_elg_rate, buy_lg_amount, buy_lg_rate,
 *                     buy_md_amount, buy_md_rate, buy_sm_amount, buy_sm_rate
 *   stock_fina_indicator: ts_code, ann_date, end_date, eps, bps, roe, roa,
 *                     grossprofit_margin, netprofit_margin, debt_to_assets,
 *                     current_ratio, quick_ratio, basic_eps_yoy, netprofit_yoy, or_yoy
 *   stock_income:     ts_code, ann_date, end_date, total_revenue, revenue, operate_profit,
 *                     total_profit, n_income, n_income_attr_p, basic_eps, ebit, ebitda, rd_exp
 *   stock_balance:    ts_code, ann_date, end_date, total_assets, total_liab,
 *                     total_hldr_eqy_exc_min_int, money_cap, accounts_receiv, inventories, lt_borr, st_borr
 *   stock_announcement: ts_code, ann_date, ann_type, title, url, content, collected_at
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
  ps: number | null;
  ps_ttm: number | null;
  dv_ratio: number | null;
  total_share: number | null;
  float_share: number | null;
  total_mv: number | null;
  circ_mv: number | null;
}

// 资金流向（stock_moneyflow 格式）
export interface StockMoneyflow {
  ts_code: string;
  trade_date: string;
  source: string;
  net_amount: number | null;        // 净流入（万元）
  net_amount_rate: number | null;
  buy_elg_amount: number | null;    // 特大单买入（万元）
  buy_elg_rate: number | null;
  buy_lg_amount: number | null;     // 大单买入（万元）
  buy_lg_rate: number | null;
  buy_md_amount: number | null;     // 中单买入（万元）
  buy_md_rate: number | null;
  buy_sm_amount: number | null;     // 小单买入（万元）
  buy_sm_rate: number | null;
}

// 财务指标（stock_fina_indicator 格式）
export interface StockFinaIndicator {
  ts_code: string;
  ann_date: string;
  end_date: string;
  eps: number | null;               // 基本每股收益
  bps: number | null;               // 每股净资产
  roe: number | null;               // 净资产收益率(%)
  roa: number | null;               // 总资产净利率(%)
  grossprofit_margin: number | null; // 销售毛利率(%)
  netprofit_margin: number | null;   // 销售净利率(%)
  debt_to_assets: number | null;     // 资产负债率(%)
  current_ratio: number | null;      // 流动比率
  quick_ratio: number | null;        // 速动比率
  basic_eps_yoy: number | null;      // 基本每股收益同比(%)
  netprofit_yoy: number | null;      // 归母净利润同比(%)
  or_yoy: number | null;             // 营业收入同比(%)
}

// 利润表（stock_income 格式）
export interface StockIncome {
  ts_code: string;
  ann_date: string;
  end_date: string;
  total_revenue: number | null;      // 营业总收入
  revenue: number | null;            // 营业收入
  operate_profit: number | null;     // 营业利润
  total_profit: number | null;       // 利润总额
  n_income: number | null;           // 净利润
  n_income_attr_p: number | null;    // 归母净利润
  basic_eps: number | null;          // 基本每股收益
  ebit: number | null;               // 息税前利润
  ebitda: number | null;             // 息税折旧摊销前利润
  rd_exp: number | null;             // 研发费用
}

// 资产负债表（stock_balance 格式）
export interface StockBalance {
  ts_code: string;
  ann_date: string;
  end_date: string;
  total_assets: number | null;                   // 总资产
  total_liab: number | null;                     // 总负债
  total_hldr_eqy_exc_min_int: number | null;     // 归母净资产
  money_cap: number | null;                      // 货币资金
  accounts_receiv: number | null;                // 应收账款
  inventories: number | null;                    // 存货
  lt_borr: number | null;                        // 长期借款
  st_borr: number | null;                        // 短期借款
}

// 公告（stock_announcement 格式）
export interface StockAnnouncement {
  ts_code: string;
  ann_date: string;
  ann_type: string;   // annual/semi/quarter/other
  title: string;
  url: string | null;
  content: string | null;
  collected_at: string;
}

// ─── 宏观择时 Mock 数据 ────────────────────────────────────────────────────────
// 指标 id 和 name_cn 与 indicator_meta 表保持完全一致（region=CN）

export const MACRO_INDICATORS: IndicatorMeta[] = [
  // category: macro
  { id: 'gdp_yoy', name_cn: 'GDP同比增速', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'quarterly' },
  { id: 'gdp_qoq', name_cn: 'GDP季比增速', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'quarterly' },
  { id: 'pmi_mfg', name_cn: '制造业PMI', category: 'macro', unit: '点', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'pmi_non_mfg', name_cn: '非制造业PMI', category: 'macro', unit: '点', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'cpi_yoy', name_cn: 'CPI同比增速', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'cpi_mom', name_cn: 'CPI环比', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'ppi_yoy', name_cn: 'PPI同比增速', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'm2_yoy', name_cn: 'M2同比增速', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'm2_level', name_cn: 'M2余额', category: 'macro', unit: '亿元', scale: '亿', region: 'CN', frequency: 'monthly' },
  { id: 'social_finance_yoy', name_cn: '社融存量同比', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'social_finance_new', name_cn: '社会融资规模增量', category: 'macro', unit: '亿元', scale: '亿', region: 'CN', frequency: 'monthly' },
  { id: 'new_loans', name_cn: '新增人民币贷款', category: 'macro', unit: '亿元', scale: '亿', region: 'CN', frequency: 'monthly' },
  { id: 'export_yoy', name_cn: '出口金额同比', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'import_yoy', name_cn: '进口金额同比', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'fai_yoy', name_cn: '固定资产投资同比', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'industrial_yoy', name_cn: '工业增加值同比', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'retail_yoy', name_cn: '社会消费品零售总额同比', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'unemployment_rate', name_cn: '城镇调查失业率', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'trade_balance', name_cn: '中国贸易差额（美元口径）', category: 'macro', unit: '亿美元', scale: '亿', region: 'CN', frequency: 'monthly' },
  // category: macro（利率）
  { id: 'lpr_1y', name_cn: '1年期LPR', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'lpr_5y', name_cn: '5年期LPR', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'monthly' },
  { id: 'bond_10y', name_cn: '中国10年期国债收益率', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'dr007', name_cn: '银行间质押式回购利率DR007', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'dr001', name_cn: '银行间质押式回购利率DR001', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'shibor_on', name_cn: 'Shibor隔夜', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'shibor_1w', name_cn: 'Shibor1周', category: 'macro', unit: '%', scale: null, region: 'CN', frequency: 'daily' },
  // category: equity
  { id: 'hs300_pe', name_cn: '沪深300 PE（滚动TTM）', category: 'equity', unit: '倍', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'all_a_pe', name_cn: '上证市场平均市盈率', category: 'equity', unit: '倍', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'hs300_pb', name_cn: '沪深300 PB（加权）', category: 'equity', unit: '倍', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'all_a_pb', name_cn: '全A市场PB（等权中位数）', category: 'equity', unit: '倍', scale: null, region: 'CN', frequency: 'daily' },
  { id: 'north_net_flow', name_cn: '北向资金净流入', category: 'equity', unit: '亿元', scale: '亿', region: 'CN', frequency: 'daily' },
  { id: 'north_daily_turnover', name_cn: '北向当日成交总额', category: 'equity', unit: '亿元', scale: '亿', region: 'CN', frequency: 'daily' },
  { id: 'total_market_turnover', name_cn: '全A日成交额', category: 'equity', unit: '亿元', scale: '亿', region: 'CN', frequency: 'daily' },
  { id: 'margin_balance_sh', name_cn: '上交所融资余额', category: 'equity', unit: '亿元', scale: '亿', region: 'CN', frequency: 'daily' },
  { id: 'margin_balance_sz', name_cn: '深交所融资余额', category: 'equity', unit: '亿元', scale: '亿', region: 'CN', frequency: 'daily' },
  // category: fx
  { id: 'rmb_usd', name_cn: '人民币兑美元中间价', category: 'fx', unit: '元/百美元', scale: null, region: 'CN', frequency: 'daily' },
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
  gdp_qoq: genMonthlyValues('gdp_qoq', 1.2, 0.1, 0.1),
  pmi_mfg: genMonthlyValues('pmi_mfg', 49.8, 0.5, 0.4),
  pmi_non_mfg: genMonthlyValues('pmi_non_mfg', 50.5, 0.3, 0.3),
  cpi_yoy: genMonthlyValues('cpi_yoy', 0.1, 0.2, 0.15),
  cpi_mom: genMonthlyValues('cpi_mom', 0.0, 0.05, 0.1),
  ppi_yoy: genMonthlyValues('ppi_yoy', -2.1, 0.8, 0.3),
  m2_yoy: genMonthlyValues('m2_yoy', 7.0, 0.5, 0.3),
  m2_level: genMonthlyValues('m2_level', 3100000, 5000, 1000),
  social_finance_yoy: genMonthlyValues('social_finance_yoy', 8.1, 0.4, 0.4),
  social_finance_new: genMonthlyValues('social_finance_new', 15000, 500, 2000),
  new_loans: genMonthlyValues('new_loans', 12000, 300, 1500),
  export_yoy: genMonthlyValues('export_yoy', -2.1, 1.0, 1.5),
  import_yoy: genMonthlyValues('import_yoy', -1.5, 0.8, 1.2),
  fai_yoy: genMonthlyValues('fai_yoy', 3.5, 0.2, 0.3),
  industrial_yoy: genMonthlyValues('industrial_yoy', 5.8, 0.3, 0.4),
  retail_yoy: genMonthlyValues('retail_yoy', 4.2, 0.5, 0.5),
  unemployment_rate: genMonthlyValues('unemployment_rate', 5.1, -0.1, 0.1),
  trade_balance: genMonthlyValues('trade_balance', 850, -20, 50),
  lpr_1y: genMonthlyValues('lpr_1y', 3.1, -0.05, 0.01),
  lpr_5y: genMonthlyValues('lpr_5y', 3.6, -0.05, 0.01),
  bond_10y: genMonthlyValues('bond_10y', 2.3, -0.1, 0.05),
  dr007: genMonthlyValues('dr007', 1.8, -0.05, 0.05),
  dr001: genMonthlyValues('dr001', 1.6, -0.05, 0.05),
  shibor_on: genMonthlyValues('shibor_on', 1.65, -0.05, 0.05),
  shibor_1w: genMonthlyValues('shibor_1w', 1.85, -0.05, 0.05),
  hs300_pe: genMonthlyValues('hs300_pe', 11.5, 0.8, 0.5),
  all_a_pe: genMonthlyValues('all_a_pe', 15.2, 0.6, 0.4),
  hs300_pb: genMonthlyValues('hs300_pb', 1.28, 0.05, 0.03),
  all_a_pb: genMonthlyValues('all_a_pb', 1.65, 0.08, 0.05),
  north_net_flow: genMonthlyValues('north_net_flow', 45.2, 8.0, 15.0),
  north_daily_turnover: genMonthlyValues('north_daily_turnover', 850, 50, 100),
  total_market_turnover: genMonthlyValues('total_market_turnover', 12000, 500, 1000),
  margin_balance_sh: genMonthlyValues('margin_balance_sh', 9500, 200, 300),
  margin_balance_sz: genMonthlyValues('margin_balance_sz', 8800, 150, 250),
  rmb_usd: genMonthlyValues('rmb_usd', 728.5, -0.5, 0.2),
};

// ─── 宏观状态矩阵类型定义 ─────────────────────────────────────────────────────

export type MatrixRegion = 'CN' | 'US';

// REQ-145: 因子贡献透明化 — 每个因子的名称、当前值、权重、得分贡献
export interface ScoreFactor {
  name: string;         // 因子名称（如"制造业PMI"）
  indicator_id: string; // 对应 indicator_meta.id
  current_value: number | null; // 当前值
  unit: string;         // 单位（如"点"、"%"）
  weight: number;       // 权重（0-1，所有因子之和=1）
  raw_score: number;    // 该因子的原始评分（0-100）
  contribution: number; // 得分贡献 = raw_score × weight（保留1位小数）
  direction: '正向' | '负向'; // 对总分的影响方向
  note?: string;        // 简短说明（可选）
}

export interface MatrixCell {
  status: string;           // 状态标签（如"扩张"、"宽松"）
  score: number;            // 综合评分 0-100（= Σ factor.contribution）
  trend: 'up' | 'down' | 'flat';
  desc: string;             // 详细描述
  indicators: string[];     // 关联的 indicator_id 列表（与 indicator_meta.id 一致）
  data_quality: 'live' | 'mock' | 'warn';
  // REQ-145: 因子贡献明细（硬编码，保证输出一致性）
  factors?: ScoreFactor[];
  score_formula?: string;   // 得分计算公式说明（如"= PMI贡献(28) + GDP贡献(22) + ..."）
}

export interface MacroMatrixRow {
  dimension: string;        // 维度名称（与 indicator_meta.category 对应的业务分类）
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
// 维度名称与 indicator_meta.name_cn 保持一致
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
        desc: '制造业PMI连续2月回升至50.2，非制造业PMI=52.3，工业增加值同比+5.8%，GDP同比5.1%，零售同比+4.2%，经济动能温和扩张',
        indicators: ['pmi_mfg', 'pmi_non_mfg', 'gdp_yoy', 'industrial_yoy', 'retail_yoy'],
        data_quality: 'mock',
        // REQ-145: 因子贡献明细（权重之和=1，contribution之和≈score）
        factors: [
          { name: '制造业PMI', indicator_id: 'pmi_mfg', current_value: 50.2, unit: '点', weight: 0.30, raw_score: 85, contribution: 25.5, direction: '正向', note: 'PMI>50为扩张，50.2连续2月回升，信号强' },
          { name: '非制造业PMI', indicator_id: 'pmi_non_mfg', current_value: 52.3, unit: '点', weight: 0.20, raw_score: 90, contribution: 18.0, direction: '正向', note: '服务业景气度高，52.3为近年高位' },
          { name: 'GDP同比增速', indicator_id: 'gdp_yoy', current_value: 5.1, unit: '%', weight: 0.25, raw_score: 80, contribution: 20.0, direction: '正向', note: '5.1%高于政府目标5%，增长质量稳健' },
          { name: '工业增加值同比', indicator_id: 'industrial_yoy', current_value: 5.8, unit: '%', weight: 0.15, raw_score: 75, contribution: 11.3, direction: '正向', note: '工业产出加速，制造业回暖信号' },
          { name: '社会消费品零售同比', indicator_id: 'retail_yoy', current_value: 4.2, unit: '%', weight: 0.10, raw_score: 52, contribution: 5.2, direction: '正向', note: '消费偏弱，拖累整体评分' },
        ],
        score_formula: '综合得分 = PMI制造(25.5) + PMI非制造(18.0) + GDP增速(20.0) + 工业产出(11.3) + 消费零售(5.2) ≈ 80分',
      },
      mid: {
        status: '复苏',
        score: 62,
        trend: 'up',
        desc: '内需修复节奏偏慢，出口金额同比-2.1%受外部压制，固定资产投资同比+3.5%，中期复苏路径存不确定性',
        indicators: ['gdp_yoy', 'gdp_qoq', 'fai_yoy', 'export_yoy', 'import_yoy', 'unemployment_rate'],
        data_quality: 'mock',
        factors: [
          { name: 'GDP同比增速', indicator_id: 'gdp_yoy', current_value: 5.1, unit: '%', weight: 0.30, raw_score: 80, contribution: 24.0, direction: '正向', note: '中期增速预期维持5%左右' },
          { name: '固定资产投资同比', indicator_id: 'fai_yoy', current_value: 3.5, unit: '%', weight: 0.25, raw_score: 55, contribution: 13.8, direction: '正向', note: '投资增速偏低，制约中期复苏节奏' },
          { name: '出口金额同比', indicator_id: 'export_yoy', current_value: -2.1, unit: '%', weight: 0.20, raw_score: 35, contribution: 7.0, direction: '负向', note: '出口负增长，外需压制明显' },
          { name: '进口金额同比', indicator_id: 'import_yoy', current_value: 1.2, unit: '%', weight: 0.10, raw_score: 52, contribution: 5.2, direction: '正向', note: '进口微增，内需有所恢复' },
          { name: '失业率', indicator_id: 'unemployment_rate', current_value: 5.1, unit: '%', weight: 0.15, raw_score: 80, contribution: 12.0, direction: '正向', note: '就业市场稳定，5.1%处于合理区间' },
        ],
        score_formula: '综合得分 = GDP增速(24.0) + 固定投资(13.8) + 出口(7.0) + 进口(5.2) + 失业率(12.0) ≈ 62分',
      },
      long: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '人口结构老龄化、债务周期高位等长期因素制约潜在增速，长期中性判断',
        indicators: ['gdp_yoy', 'unemployment_rate'],
        data_quality: 'mock',
        factors: [
          { name: 'GDP潜在增速趋势', indicator_id: 'gdp_yoy', current_value: 5.1, unit: '%', weight: 0.60, raw_score: 55, contribution: 33.0, direction: '正向', note: '潜在增速长期下行至4-5%区间，中性' },
          { name: '劳动力市场结构', indicator_id: 'unemployment_rate', current_value: 5.1, unit: '%', weight: 0.40, raw_score: 42, contribution: 16.8, direction: '负向', note: '老龄化加速，劳动力供给长期收缩' },
        ],
        score_formula: '综合得分 = GDP潜在增速(33.0) + 劳动力结构(16.8) ≈ 50分（长期中性基准）',
      },
    },
    // ── 维度2：货币政策信号 ──────────────────────────────────────────────────
    // 数据来源：lpr_1y, lpr_5y, dr007, dr001, shibor_on, shibor_1w, bond_10y
    {
      dimension: '货币政策信号',
      a_stock_corr: '正相关',
      short: {
        status: '宽松',
        score: 75,
        trend: 'up',
        desc: '1年期LPR=3.1%（历史低位），銀行间质押式回购利率DR007=1.8%，中国10年期国债收益率=2.3%，货币政策明确宽松取向',
        indicators: ['lpr_1y', 'lpr_5y', 'dr007', 'dr001', 'shibor_on', 'shibor_1w', 'bond_10y'],
        data_quality: 'mock',
        factors: [
          { name: '1年期LPR', indicator_id: 'lpr_1y', current_value: 3.1, unit: '%', weight: 0.30, raw_score: 85, contribution: 25.5, direction: '正向', note: '3.1%处于历史低位，宽松信号明确' },
          { name: 'DR007质押式回购利率', indicator_id: 'dr007', current_value: 1.8, unit: '%', weight: 0.25, raw_score: 80, contribution: 20.0, direction: '正向', note: '1.8%处于宽松区间，资金面宽裕' },
          { name: '10年期国债收益率', indicator_id: 'bond_10y', current_value: 2.3, unit: '%', weight: 0.25, raw_score: 75, contribution: 18.8, direction: '正向', note: '2.3%偏低，宽松预期嵌入' },
          { name: '5年期LPR', indicator_id: 'lpr_5y', current_value: 3.6, unit: '%', weight: 0.20, raw_score: 55, contribution: 11.0, direction: '正向', note: '5年期LPR下降幅度有限，地产宽松空间受限' },
        ],
        score_formula: '综合得分 = LPR1Y(25.5) + DR007(20.0) + 国债10Y(18.8) + LPR5Y(11.0) ≈ 75分',
      },
      mid: {
        status: '适度宽松',
        score: 68,
        trend: 'flat',
        desc: '实际利率偏低，人民币兑美元中间价=7.25汇率约束限制进一步宽松幅度，中期适度宽松',
        indicators: ['bond_10y', 'rmb_usd', 'lpr_1y'],
        data_quality: 'mock',
        factors: [
          { name: '10年期国债收益率', indicator_id: 'bond_10y', current_value: 2.3, unit: '%', weight: 0.40, raw_score: 75, contribution: 30.0, direction: '正向', note: '利率中枢长期下行，中期宽松预期稳固' },
          { name: '1年期LPR', indicator_id: 'lpr_1y', current_value: 3.1, unit: '%', weight: 0.35, raw_score: 80, contribution: 28.0, direction: '正向', note: '中期宽松周期尚未结束' },
          { name: '人民币兑美元中间价', indicator_id: 'rmb_usd', current_value: 7.25, unit: '', weight: 0.25, raw_score: 40, contribution: 10.0, direction: '负向', note: '7.25偏弱，汇率压力限制宽松空间' },
        ],
        score_formula: '综合得分 = 国债10Y(30.0) + LPR1Y(28.0) + 汇率压力(-10.0拖累) ≈ 68分',
      },
      long: {
        status: '中性',
        score: 55,
        trend: 'flat',
        desc: '利率中枢长期下行趋势确立，但债务扩张空间收窄，长期中性',
        indicators: ['bond_10y', 'lpr_1y'],
        data_quality: 'mock',
        factors: [
          { name: '10年期国债收益率趋势', indicator_id: 'bond_10y', current_value: 2.3, unit: '%', weight: 0.60, raw_score: 60, contribution: 36.0, direction: '正向', note: '利率长期下行趋势确立，但收益空间收窄' },
          { name: '1年期LPR趋势', indicator_id: 'lpr_1y', current_value: 3.1, unit: '%', weight: 0.40, raw_score: 47, contribution: 18.8, direction: '负向', note: '长期宽松空间收窄，债务约束增强' },
        ],
        score_formula: '综合得分 = 国债趋势(36.0) + LPR趋势(18.8) ≈ 55分',
      },
    },
    // ── 维度3：政策底确认 ────────────────────────────────────────────────────
    // 数据来源：社会融资规模增量, 社融存量同比, 新增人民币贷款, M2同比增速
    {
      dimension: '政策底确认',
      a_stock_corr: '正相关',
      short: {
        status: '温和宽松',
        score: 70,
        trend: 'up',
        desc: '社会融资规模增量同比多增1.2万亿，新增人民币贷款1.5万亿，财政赤字率提升至4%，专项债加速发行',
        indicators: ['social_finance_new', 'social_finance_yoy', 'new_loans', 'm2_yoy'],
        data_quality: 'mock',
        factors: [
          { name: 'M2同比增速', indicator_id: 'm2_yoy', current_value: 7.5, unit: '%', weight: 0.30, raw_score: 72, contribution: 21.6, direction: '正向', note: '7.5%处于合理区间，货币投放力度适中' },
          { name: '社融存量同比', indicator_id: 'social_finance_yoy', current_value: 8.2, unit: '%', weight: 0.30, raw_score: 75, contribution: 22.5, direction: '正向', note: '8.2%超过名义GDP增速，信用扩张支撑实体' },
          { name: '新增人民币贷款', indicator_id: 'new_loans', current_value: 1.5, unit: '万亿', weight: 0.25, raw_score: 68, contribution: 17.0, direction: '正向', note: '1.5万亿新增贷款，信贷投放稳健' },
          { name: '社融增量', indicator_id: 'social_finance_new', current_value: 1.2, unit: '万亿', weight: 0.15, raw_score: 60, contribution: 9.0, direction: '正向', note: '社融增量同比多增，财政发力明显' },
        ],
        score_formula: '综合得分 = M2增速(21.6) + 社融存量(22.5) + 新增贷款(17.0) + 社融增量(9.0) ≈ 70分',
      },
      mid: {
        status: '强刺激',
        score: 78,
        trend: 'up',
        desc: '政策组合拳力度超预期（货币+财政+地产），科技+消费双轮驱动，社融存量同比+8.2%，市场预期明显改善',
        indicators: ['social_finance_yoy', 'm2_yoy', 'new_loans'],
        data_quality: 'mock',
        factors: [
          { name: '社融存量同比', indicator_id: 'social_finance_yoy', current_value: 8.2, unit: '%', weight: 0.40, raw_score: 85, contribution: 34.0, direction: '正向', note: '8.2%超预期，政策信用扩张力度大' },
          { name: 'M2同比增速', indicator_id: 'm2_yoy', current_value: 7.5, unit: '%', weight: 0.35, raw_score: 78, contribution: 27.3, direction: '正向', note: '货币供给充裕，中期政策底确认' },
          { name: '新增人民币贷款', indicator_id: 'new_loans', current_value: 1.5, unit: '万亿', weight: 0.25, raw_score: 67, contribution: 16.8, direction: '正向', note: '信贷投放持续强劲，实体经济支撑力度大' },
        ],
        score_formula: '综合得分 = 社融存量(34.0) + M2(27.3) + 新增贷款(16.8) ≈ 78分',
      },
      long: {
        status: '中性',
        score: 52,
        trend: 'flat',
        desc: '结构性改革持续推进，但外部环境不确定性和债务约束限制长期政策空间',
        indicators: ['social_finance_yoy', 'm2_yoy'],
        data_quality: 'mock',
        factors: [
          { name: '社融存量同比趋势', indicator_id: 'social_finance_yoy', current_value: 8.2, unit: '%', weight: 0.55, raw_score: 55, contribution: 30.3, direction: '正向', note: '长期信用扩张受债务天花板制约' },
          { name: 'M2同比趋势', indicator_id: 'm2_yoy', current_value: 7.5, unit: '%', weight: 0.45, raw_score: 48, contribution: 21.6, direction: '负向', note: 'M2增速长期下行趋势，货币政策空间收窄' },
        ],
        score_formula: '综合得分 = 社融趋势(30.3) + M2趋势(21.6) ≈ 52分',
      },
    },
    // ── 维度4：流动性环境 ────────────────────────────────────────────────────
    // 数据来源：M2同比增速, M2余额, 社融存量同比, 北向资金净流入, 北向当日成交总额,
    //           全A日成交额, 上交所融资余额, 深交所融资余额
    {
      dimension: '流动性环境',
      a_stock_corr: '正相关',
      short: {
        status: '充裕',
        score: 72,
        trend: 'up',
        desc: 'M2同比增速7.5%，全A日成交额1.2万亿，北向资金净流入+85亿，上交所融资余额1.85万亿，资金面活跃',
        indicators: ['m2_yoy', 'total_market_turnover', 'north_net_flow', 'north_daily_turnover', 'margin_balance_sh', 'margin_balance_sz'],
        data_quality: 'mock',
        factors: [
          { name: '全A日成交额', indicator_id: 'total_market_turnover', current_value: 1.2, unit: '万亿', weight: 0.30, raw_score: 80, contribution: 24.0, direction: '正向', note: '1.2万亿处于活跃区间，市场参与度高' },
          { name: 'M2同比增速', indicator_id: 'm2_yoy', current_value: 7.5, unit: '%', weight: 0.25, raw_score: 72, contribution: 18.0, direction: '正向', note: '货币供给充裕，市场流动性有支撑' },
          { name: '北向资金净流入', indicator_id: 'north_net_flow', current_value: 85, unit: '亿', weight: 0.25, raw_score: 75, contribution: 18.8, direction: '正向', note: '+85亿净流入，外资情绪积极' },
          { name: '融资余额', indicator_id: 'margin_balance_sh', current_value: 1.85, unit: '万亿', weight: 0.20, raw_score: 55, contribution: 11.0, direction: '正向', note: '1.85万亿融资余额，杠杆资金活跃' },
        ],
        score_formula: '综合得分 = 成交额(24.0) + M2(18.0) + 北向资金(18.8) + 融资余额(11.0) ≈ 72分',
      },
      mid: {
        status: '适度充裕',
        score: 65,
        trend: 'flat',
        desc: '社融存量同比8.2%，北向当日成交总额占全A比例6.8%，中期流动性适度充裕，支撑市场运行',
        indicators: ['social_finance_yoy', 'north_daily_turnover', 'm2_yoy'],
        data_quality: 'mock',
        factors: [
          { name: '社融存量同比', indicator_id: 'social_finance_yoy', current_value: 8.2, unit: '%', weight: 0.40, raw_score: 75, contribution: 30.0, direction: '正向', note: '社融支撑中期流动性充裕' },
          { name: 'M2同比增速', indicator_id: 'm2_yoy', current_value: 7.5, unit: '%', weight: 0.35, raw_score: 65, contribution: 22.8, direction: '正向', note: '货币供给适度，中期流动性平衡' },
          { name: '北向当日成交额占比', indicator_id: 'north_daily_turnover', current_value: 6.8, unit: '%', weight: 0.25, raw_score: 48, contribution: 12.0, direction: '负向', note: '6.8%占比偏低，外资中期参与度有限' },
        ],
        score_formula: '综合得分 = 社融(30.0) + M2(22.8) + 北向占比(12.0) ≈ 65分',
      },
      long: {
        status: '中性',
        score: 55,
        trend: 'flat',
        desc: '人民币国际化推进，但资本账户管制限制外资长期流入规模，长期中性',
        indicators: ['m2_yoy', 'rmb_usd', 'north_daily_turnover'],
        data_quality: 'mock',
        factors: [
          { name: 'M2增速长期趋势', indicator_id: 'm2_yoy', current_value: 7.5, unit: '%', weight: 0.50, raw_score: 58, contribution: 29.0, direction: '正向', note: 'M2长期中枢下行，流动性中性' },
          { name: '人民币汇率趋势', indicator_id: 'rmb_usd', current_value: 7.25, unit: '', weight: 0.30, raw_score: 42, contribution: 12.6, direction: '负向', note: '资本账户管制限制外资长期流入' },
          { name: '北向资金流向趋势', indicator_id: 'north_daily_turnover', current_value: 6.8, unit: '%', weight: 0.20, raw_score: 67, contribution: 13.4, direction: '正向', note: '外资长期配置有限增加空间' },
        ],
        score_formula: '综合得分 = M2趋势(29.0) + 汇率拖累(12.6) + 北向趋势(13.4) ≈ 55分',
      },
    },
    // ── 维度5：外部环境 ──────────────────────────────────────────────────────
    // 数据来源：人民币兑美元中间价, 中国贸易差额, 出口金额同比, 进口金额同比
    {
      dimension: '外部环境',
      a_stock_corr: '正相关',
      short: {
        status: '中性偏压',
        score: 45,
        trend: 'down',
        desc: '人民币兑美元中间价7.25，中国贸易差额收窄，关税摩擦升温，外部冲击处于可控但偏压状态',
        indicators: ['rmb_usd', 'trade_balance', 'export_yoy', 'import_yoy'],
        data_quality: 'mock',
        factors: [
          { name: '人民币兑美元中间价', indicator_id: 'rmb_usd', current_value: 7.25, unit: '', weight: 0.35, raw_score: 35, contribution: 12.3, direction: '负向', note: '7.25偏弱，汇率压力引发资本外流风险' },
          { name: '出口金额同比', indicator_id: 'export_yoy', current_value: -2.1, unit: '%', weight: 0.35, raw_score: 30, contribution: 10.5, direction: '负向', note: '出口负增长，外需弱化明显' },
          { name: '贸易差额', indicator_id: 'trade_balance', current_value: 680, unit: '亿美元', weight: 0.20, raw_score: 65, contribution: 13.0, direction: '正向', note: '贸顺差仍保持正常，对冲汇率压力' },
          { name: '进口金额同比', indicator_id: 'import_yoy', current_value: 1.2, unit: '%', weight: 0.10, raw_score: 50, contribution: 5.0, direction: '中性', note: '进口微增，内需恢复信号弱' },
        ],
        score_formula: '综合得分 = 汇率压力(12.3) + 出口负增(10.5) + 贸顺差支撑(13.0) + 进口(5.0) ≈ 45分',
      },
      mid: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '贸易多元化布局推进，东南亚出口替代效应显现，中期外部压力边际缓解',
        indicators: ['trade_balance', 'export_yoy', 'import_yoy', 'rmb_usd'],
        data_quality: 'mock',
        factors: [
          { name: '贸易差额趋势', indicator_id: 'trade_balance', current_value: 680, unit: '亿美元', weight: 0.35, raw_score: 65, contribution: 22.8, direction: '正向', note: '贸顺差中期持续，多元化布局下出口韧性增强' },
          { name: '出口金额同比', indicator_id: 'export_yoy', current_value: -2.1, unit: '%', weight: 0.35, raw_score: 45, contribution: 15.8, direction: '负向', note: '中期出口恢复预期温和，替代市场开拓中' },
          { name: '人民币汇率趋势', indicator_id: 'rmb_usd', current_value: 7.25, unit: '', weight: 0.30, raw_score: 38, contribution: 11.4, direction: '负向', note: '汇率中期稳定预期，压力边际缓解' },
        ],
        score_formula: '综合得分 = 贸顺差(22.8) + 出口恢复(15.8) + 汇率稳定(11.4) ≈ 50分',
      },
      long: {
        status: '中性',
        score: 48,
        trend: 'flat',
        desc: '全球化格局重塑，中国在全球供应链中的地位调整是长期变量，中性判断',
        indicators: ['trade_balance', 'export_yoy', 'rmb_usd'],
        data_quality: 'mock',
        factors: [
          { name: '贸易差额长期趋势', indicator_id: 'trade_balance', current_value: 680, unit: '亿美元', weight: 0.40, raw_score: 55, contribution: 22.0, direction: '正向', note: '全球化重塑下贸顺差长期不确定性增强' },
          { name: '出口结构调整', indicator_id: 'export_yoy', current_value: -2.1, unit: '%', weight: 0.35, raw_score: 42, contribution: 14.7, direction: '负向', note: '全球供应链重塑，长期出口结构调整中' },
          { name: '人民币汇率长期趋势', indicator_id: 'rmb_usd', current_value: 7.25, unit: '', weight: 0.25, raw_score: 45, contribution: 11.3, direction: '中性', note: '人民币汇率长期中性，国际化进程渐进' },
        ],
        score_formula: '综合得分 = 贸顺差趋势(22.0) + 出口结构(14.7) + 汇率长期(11.3) ≈ 48分',
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
    {
      dimension: '经济周期位置',
      a_stock_corr: '弱相关',
      short: {
        status: '放缓',
        score: 42,
        trend: 'down',
        desc: '美国GDP实际环比增速放缓至1.8%，美国服务业PMI收缩至47.8，非农就业增速下滑，软着陆预期动摇',
        indicators: ['gdp_qoq', 'pmi_non_mfg', 'industrial_yoy'],
        data_quality: 'mock',
      },
      mid: {
        status: '收缩',
        score: 35,
        trend: 'down',
        desc: '高利率滞后效应显现，信贷收紧，消费支出放缓，衰退风险上升至35%',
        indicators: ['gdp_qoq', 'industrial_yoy'],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 55,
        trend: 'flat',
        desc: '美国长期潜在增速约2%，AI技术革命带来生产力提升预期，长期中性偏乐观',
        indicators: [],
        data_quality: 'mock',
      },
    },
    {
      dimension: '货币政策信号',
      a_stock_corr: '负相关',
      short: {
        status: '偏紧',
        score: 35,
        trend: 'flat',
        desc: '联邦基金利率维持5.25-5.5%高位，实际利率约2.5%，货币政策仍处限制性区间',
        indicators: [],
        data_quality: 'mock',
      },
      mid: {
        status: '适度宽松',
        score: 60,
        trend: 'up',
        desc: '市场预期2026年降息2-3次，通胀回落至2.5%附近，货币政策转向预期升温',
        indicators: [],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '美联储长期中性利率约2.5-3%，利率中枢较疫情前抬升，长期中性',
        indicators: [],
        data_quality: 'mock',
      },
    },
    {
      dimension: '政策底确认',
      a_stock_corr: '弱相关',
      short: {
        status: '中性偏松',
        score: 55,
        trend: 'flat',
        desc: '美国政府债务/GDP超120%，财政扩张空间受限，但科技补贴（CHIPS法案）持续落地',
        indicators: ['govt_debt_gdp'],
        data_quality: 'mock',
      },
      mid: {
        status: '中性',
        score: 48,
        trend: 'flat',
        desc: '大选后政策不确定性上升，关税政策反复，财政可持续性存疑',
        indicators: [],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 52,
        trend: 'flat',
        desc: '美国制造业回流政策长期推进，但财政赤字约束政策空间，长期中性',
        indicators: [],
        data_quality: 'mock',
      },
    },
    {
      dimension: '流动性环境',
      a_stock_corr: '负相关',
      short: {
        status: '偏紧',
        score: 38,
        trend: 'flat',
        desc: '美联储缩表仍在进行，美元指数高位（DXY≈105），全球美元流动性偏紧',
        indicators: ['dxy'],
        data_quality: 'mock',
      },
      mid: {
        status: '改善',
        score: 58,
        trend: 'up',
        desc: '降息预期推动美债收益率下行，流动性环境中期改善，对风险资产形成支撑',
        indicators: [],
        data_quality: 'mock',
      },
      long: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '美元储备货币地位长期稳固，但去美元化趋势缓慢推进，长期中性',
        indicators: [],
        data_quality: 'mock',
      },
    },
    {
      dimension: '外部环境',
      a_stock_corr: '弱相关',
      short: {
        status: '偏压',
        score: 38,
        trend: 'down',
        desc: '中美贸易摩擦升温，关税政策反复，地缘政治风险（俄乌/台海）对全球市场形成压制',
        indicators: [],
        data_quality: 'mock',
      },
      mid: {
        status: '中性',
        score: 50,
        trend: 'flat',
        desc: '降息周期开启后新兴市场资金回流，全球贸易格局重塑中，中期外部环境中性',
        indicators: [],
        data_quality: 'mock',
      },
      long: {
        status: '中性偏强',
        score: 58,
        trend: 'up',
        desc: '美国AI产业机会与高估值风险并存，对A股长期影响有限',
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
      desc: '短期美国宏观偏弱，高利率+经济放缓，对A股影响中性偏负',
      indicators: [],
      data_quality: 'mock',
    },
    mid: {
      status: '复苏',
      score: 50,
      trend: 'up',
      desc: '降息周期开启后中期改善，美股科技股表现对A股示范效应显现，建议均衡配置',
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

// ─── 板块轮动 Mock 数据 ────────────────────────────────────────────────────────
// 板块 id 和 name_cn 与数据库 sector_meta 表保持完全一致
// 以下为 ths 二级行业板块（idx_type=行业板块，id=ths_881xxx.TI）
// 数据库 sector_daily 中有数据的板块（trade_date=2026-02-27 已验证）

export const SECTOR_META_LIST: SectorMeta[] = [
  // 金融
  { id: 'ths_881155.TI', name_cn: '银行', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881157.TI', name_cn: '证券', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881156.TI', name_cn: '保险', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881283.TI', name_cn: '多元金融', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  // 科技/电子
  { id: 'ths_881121.TI', name_cn: '半导体', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881124.TI', name_cn: '消费电子', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881122.TI', name_cn: '光学光电子', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881130.TI', name_cn: '计算机设备', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881272.TI', name_cn: '软件开发', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881271.TI', name_cn: 'IT服务', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881171.TI', name_cn: '自动化设备', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  // 新能源
  { id: 'ths_881279.TI', name_cn: '光伏设备', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881281.TI', name_cn: '电池', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881280.TI', name_cn: '风电设备', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881145.TI', name_cn: '电力', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881278.TI', name_cn: '电网设备', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  // 医药
  { id: 'ths_881144.TI', name_cn: '医疗器械', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881140.TI', name_cn: '化学制药', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881142.TI', name_cn: '生物制品', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881175.TI', name_cn: '医疗服务', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  // 消费
  { id: 'ths_881273.TI', name_cn: '白酒', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881133.TI', name_cn: '饮料制造', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881125.TI', name_cn: '汽车整车', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881126.TI', name_cn: '汽车零部件', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881131.TI', name_cn: '白色家电', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  // 军工
  { id: 'ths_881166.TI', name_cn: '军工装备', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881276.TI', name_cn: '军工电子', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  // 有色/资源
  { id: 'ths_881169.TI', name_cn: '贵金属', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881267.TI', name_cn: '能源金属', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881112.TI', name_cn: '钢铁', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  // 通信
  { id: 'ths_881129.TI', name_cn: '通信设备', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
  { id: 'ths_881162.TI', name_cn: '通信服务', system: 'ths', level: 2, parent_id: null, idx_type: '行业板块', is_active: true },
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
// base 为指数基准点，与数据库 sector_daily.close 对应
const SECTOR_TRENDS: Record<string, { base: number; trend: number }> = {
  // 金融
  'ths_881155.TI': { base: 1380, trend: 2 },     // 银行 偏多
  'ths_881157.TI': { base: 2850, trend: 3.5 },   // 证券 强势
  'ths_881156.TI': { base: 1680, trend: 1.5 },   // 保险
  'ths_881283.TI': { base: 1120, trend: 1 },     // 多元金融
  // 科技/电子
  'ths_881121.TI': { base: 3850, trend: 4.5 },   // 半导体 最强
  'ths_881124.TI': { base: 2650, trend: 3.5 },   // 消费电子 强势
  'ths_881122.TI': { base: 2180, trend: 3 },     // 光学光电子
  'ths_881130.TI': { base: 1950, trend: 2.5 },   // 计算机设备
  'ths_881272.TI': { base: 3200, trend: 4 },     // 软件开发 强势
  'ths_881271.TI': { base: 2800, trend: 4 },     // IT服务 强势
  'ths_881171.TI': { base: 2400, trend: 3.5 },   // 自动化设备 强势
  // 新能源
  'ths_881279.TI': { base: 1150, trend: -1 },    // 光伏设备 偏弱
  'ths_881281.TI': { base: 1320, trend: 1 },     // 电池
  'ths_881280.TI': { base: 980, trend: -0.5 },   // 风电设备 偏弱
  'ths_881145.TI': { base: 1580, trend: 0.5 },   // 电力
  'ths_881278.TI': { base: 1750, trend: 1.5 },   // 电网设备
  // 医药
  'ths_881144.TI': { base: 2100, trend: 0.5 },   // 医疗器械
  'ths_881140.TI': { base: 1680, trend: -0.5 },  // 化学制药 偏弱
  'ths_881142.TI': { base: 1920, trend: 1 },     // 生物制品
  'ths_881175.TI': { base: 1450, trend: 0.5 },   // 医疗服务
  // 消费
  'ths_881273.TI': { base: 2380, trend: -0.5 },  // 白酒 偏弱
  'ths_881133.TI': { base: 1280, trend: 0.5 },   // 饮料制造
  'ths_881125.TI': { base: 1850, trend: 3 },     // 汽车整车 偏多
  'ths_881126.TI': { base: 2150, trend: 4 },     // 汽车零部件 强势
  'ths_881131.TI': { base: 1680, trend: 2 },     // 白色家电 偏多
  // 军工
  'ths_881166.TI': { base: 2580, trend: 2.5 },   // 军工装备 偏多
  'ths_881276.TI': { base: 2250, trend: 3 },     // 军工电子 强势
  // 有色/资源
  'ths_881169.TI': { base: 2850, trend: 2 },     // 贵金属 偏多
  'ths_881267.TI': { base: 1050, trend: -1 },    // 能源金属 偏弱
  'ths_881112.TI': { base: 1180, trend: -0.5 },  // 钢铁 偏弱
  // 通信
  'ths_881129.TI': { base: 2150, trend: 2 },     // 通信设备 偏多
  'ths_881162.TI': { base: 1380, trend: 1 },     // 通信服务
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
// 成分股与数据库 sector_stock_map + stock_meta 保持一致

const SECTOR_STOCKS: Record<string, StockMeta[]> = {
  // 半导体（ths_881121.TI）— 数据库实际成分股（sector_stock_map, is_current=true）
  'ths_881121.TI': [
    { ts_code: '300661.SZ', symbol: '300661', name_cn: '圣邦股份', area: '北京', industry: '半导体', market: '创业板', list_date: '20170606', is_active: true },
    { ts_code: '688981.SH', symbol: '688981', name_cn: '中芯国际', area: '上海', industry: '半导体', market: '科创板', list_date: '20200716', is_active: true },
    { ts_code: '002049.SZ', symbol: '002049', name_cn: '紫光国微', area: '北京', industry: '半导体', market: '主板', list_date: '20040105', is_active: true },
    { ts_code: '688045.SH', symbol: '688045', name_cn: '必易微', area: '上海', industry: '半导体', market: '科创板', list_date: '20210823', is_active: true },
    { ts_code: '688123.SH', symbol: '688123', name_cn: '聚辰股份', area: '上海', industry: '半导体', market: '科创板', list_date: '20200730', is_active: true },
    { ts_code: '688416.SH', symbol: '688416', name_cn: '恒烁股份', area: '安徽', industry: '半导体', market: '科创板', list_date: '20211115', is_active: true },
    { ts_code: '300077.SZ', symbol: '300077', name_cn: '国民技术', area: '广东', industry: '半导体', market: '创业板', list_date: '20100331', is_active: true },
    { ts_code: '301297.SZ', symbol: '301297', name_cn: '鸿铭股份', area: '广东', industry: '半导体', market: '创业板', list_date: '20230313', is_active: true },
  ],
  // 银行（ths_881155.TI）— 数据库实际成分股
  'ths_881155.TI': [
    { ts_code: '601398.SH', symbol: '601398', name_cn: '工商银行', area: '北京', industry: '银行', market: '主板', list_date: '20061027', is_active: true },
    { ts_code: '601288.SH', symbol: '601288', name_cn: '农业银行', area: '北京', industry: '银行', market: '主板', list_date: '20100715', is_active: true },
    { ts_code: '601988.SH', symbol: '601988', name_cn: '中国银行', area: '北京', industry: '银行', market: '主板', list_date: '20060705', is_active: true },
    { ts_code: '601328.SH', symbol: '601328', name_cn: '交通银行', area: '上海', industry: '银行', market: '主板', list_date: '20070515', is_active: true },
    { ts_code: '601939.SH', symbol: '601939', name_cn: '建设银行', area: '北京', industry: '银行', market: '主板', list_date: '20070925', is_active: true },
    { ts_code: '002936.SZ', symbol: '002936', name_cn: '郑州银行', area: '河南', industry: '银行', market: '主板', list_date: '20181011', is_active: true },
    { ts_code: '601528.SH', symbol: '601528', name_cn: '瑞丰银行', area: '浙江', industry: '银行', market: '主板', list_date: '20210831', is_active: true },
    { ts_code: '601658.SH', symbol: '601658', name_cn: '邮储银行', area: '北京', industry: '银行', market: '主板', list_date: '20191210', is_active: true },
  ],
  // 白酒（ths_881273.TI）— 数据库实际成分股
  'ths_881273.TI': [
    { ts_code: '600519.SH', symbol: '600519', name_cn: '贵州茅台', area: '贵州', industry: '白酒', market: '主板', list_date: '20010827', is_active: true },
    { ts_code: '000858.SZ', symbol: '000858', name_cn: '五粮液', area: '四川', industry: '白酒', market: '主板', list_date: '19980427', is_active: true },
    { ts_code: '002304.SZ', symbol: '002304', name_cn: '洋河股份', area: '江苏', industry: '白酒', market: '主板', list_date: '20091117', is_active: true },
    { ts_code: '000596.SZ', symbol: '000596', name_cn: '古井贡酒', area: '安徽', industry: '白酒', market: '主板', list_date: '19960910', is_active: true },
    { ts_code: '603369.SH', symbol: '603369', name_cn: '今世缘', area: '江苏', industry: '白酒', market: '主板', list_date: '20150120', is_active: true },
    { ts_code: '600197.SH', symbol: '600197', name_cn: '伊力特', area: '新疆', industry: '白酒', market: '主板', list_date: '20000726', is_active: true },
    { ts_code: '600696.SH', symbol: '600696', name_cn: '岩石股份', area: '上海', industry: '白酒', market: '主板', list_date: '19971024', is_active: true },
    { ts_code: '603589.SH', symbol: '603589', name_cn: '口子窖', area: '安徽', industry: '白酒', market: '主板', list_date: '20150612', is_active: true },
  ],
  // 电池（ths_881281.TI）— 数据库实际成分股
  'ths_881281.TI': [
    { ts_code: '300750.SZ', symbol: '300750', name_cn: '宁德时代', area: '福建', industry: '电池', market: '创业板', list_date: '20180611', is_active: true },
    { ts_code: '300014.SZ', symbol: '300014', name_cn: '亿纬锂能', area: '广东', industry: '电池', market: '创业板', list_date: '20100101', is_active: true },
    { ts_code: '301152.SZ', symbol: '301152', name_cn: '中一科技', area: '广东', industry: '电池', market: '创业板', list_date: '20220114', is_active: true },
    { ts_code: '002709.SZ', symbol: '002709', name_cn: '天赐材料', area: '广东', industry: '电池', market: '主板', list_date: '20120305', is_active: true },
    { ts_code: '300890.SZ', symbol: '300890', name_cn: '翔丰华', area: '广东', industry: '电池', market: '创业板', list_date: '20201027', is_active: true },
    { ts_code: '002812.SZ', symbol: '002812', name_cn: '恩捷股份', area: '云南', industry: '电池', market: '主板', list_date: '20150113', is_active: true },
    { ts_code: '000009.SZ', symbol: '000009', name_cn: '中国宝安', area: '广东', industry: '电池', market: '主板', list_date: '19910603', is_active: true },
    { ts_code: '301358.SZ', symbol: '301358', name_cn: '华盛锂电', area: '广东', industry: '电池', market: '创业板', list_date: '20230301', is_active: true },
  ],
  // 化学制药（ths_881140.TI）— 数据库实际成分股
  'ths_881140.TI': [
    { ts_code: '603707.SH', symbol: '603707', name_cn: '健友股份', area: '江苏', industry: '化学制药', market: '主板', list_date: '20170727', is_active: true },
    { ts_code: '603676.SH', symbol: '603676', name_cn: '红太阳', area: '江苏', industry: '化学制药', market: '主板', list_date: '20170420', is_active: true },
    { ts_code: '688197.SH', symbol: '688197', name_cn: '首药控股', area: '北京', industry: '化学制药', market: '科创板', list_date: '20220128', is_active: true },
    { ts_code: '000739.SZ', symbol: '000739', name_cn: '普洛药业', area: '浙江', industry: '化学制药', market: '主板', list_date: '20000801', is_active: true },
    { ts_code: '600267.SH', symbol: '600267', name_cn: '海正药业', area: '浙江', industry: '化学制药', market: '主板', list_date: '20000810', is_active: true },
    { ts_code: '688247.SH', symbol: '688247', name_cn: '宣泰医药', area: '上海', industry: '化学制药', market: '科创板', list_date: '20210825', is_active: true },
    { ts_code: '300636.SZ', symbol: '300636', name_cn: '同和药业', area: '安徽', industry: '化学制药', market: '创业板', list_date: '20170118', is_active: true },
    { ts_code: '920566.BJ', symbol: '920566', name_cn: '华岭股份', area: '广东', industry: '化学制药', market: '北交所', list_date: '20230901', is_active: true },
  ],
  // 光伏设备（ths_881279.TI）— 数据库实际成分股
  'ths_881279.TI': [
    { ts_code: '601012.SH', symbol: '601012', name_cn: '隆基绿能', area: '陕西', industry: '光伏设备', market: '主板', list_date: '20120811', is_active: true },
    { ts_code: '688599.SH', symbol: '688599', name_cn: '天合光能', area: '江苏', industry: '光伏设备', market: '科创板', list_date: '20200610', is_active: true },
    { ts_code: '300274.SZ', symbol: '300274', name_cn: '阳光电源', area: '安徽', industry: '光伏设备', market: '创业板', list_date: '20111102', is_active: true },
    { ts_code: '301636.SZ', symbol: '301636', name_cn: '鑫宏业', area: '广东', industry: '光伏设备', market: '创业板', list_date: '20230801', is_active: true },
    { ts_code: '603778.SH', symbol: '603778', name_cn: '乾景园林', area: '上海', industry: '光伏设备', market: '主板', list_date: '20170727', is_active: true },
    { ts_code: '603212.SH', symbol: '603212', name_cn: '浙江力诺', area: '浙江', industry: '光伏设备', market: '主板', list_date: '20170718', is_active: true },
    { ts_code: '300827.SZ', symbol: '300827', name_cn: '上能电气', area: '江苏', industry: '光伏设备', market: '创业板', list_date: '20191009', is_active: true },
    { ts_code: '002079.SZ', symbol: '002079', name_cn: '苏州固锝', area: '江苏', industry: '光伏设备', market: '主板', list_date: '20080104', is_active: true },
  ],
  // 证券（ths_881157.TI）— 数据库实际成分股
  'ths_881157.TI': [
    { ts_code: '600030.SH', symbol: '600030', name_cn: '中信证券', area: '北京', industry: '证券', market: '主板', list_date: '20030106', is_active: true },
    { ts_code: '601688.SH', symbol: '601688', name_cn: '华泰证券', area: '江苏', industry: '证券', market: '主板', list_date: '20100209', is_active: true },
    { ts_code: '000776.SZ', symbol: '000776', name_cn: '广发证券', area: '广东', industry: '证券', market: '主板', list_date: '20100830', is_active: true },
    { ts_code: '600061.SH', symbol: '600061', name_cn: '国投资本', area: '北京', industry: '证券', market: '主板', list_date: '19970908', is_active: true },
    { ts_code: '002945.SZ', symbol: '002945', name_cn: '华林证券', area: '广东', industry: '证券', market: '主板', list_date: '20190114', is_active: true },
    { ts_code: '601099.SH', symbol: '601099', name_cn: '太平洋', area: '北京', industry: '证券', market: '主板', list_date: '20080225', is_active: true },
    { ts_code: '601236.SH', symbol: '601236', name_cn: '红塔证券', area: '云南', industry: '证券', market: '主板', list_date: '20200130', is_active: true },
    { ts_code: '002736.SZ', symbol: '002736', name_cn: '国信证券', area: '广东', industry: '证券', market: '主板', list_date: '20141226', is_active: true },
  ],
  // 医疗器械（ths_881144.TI）— 数据库实际成分股
  'ths_881144.TI': [
    { ts_code: '300760.SZ', symbol: '300760', name_cn: '迈瑞医疗', area: '广东', industry: '医疗器械', market: '创业板', list_date: '20181016', is_active: true },
    { ts_code: '688301.SH', symbol: '688301', name_cn: '奕瑞科技', area: '上海', industry: '医疗器械', market: '科创板', list_date: '20210916', is_active: true },
    { ts_code: '300453.SZ', symbol: '300453', name_cn: '三诺生物', area: '湖南', industry: '医疗器械', market: '创业板', list_date: '20140116', is_active: true },
    { ts_code: '300642.SZ', symbol: '300642', name_cn: '透景生命', area: '广东', industry: '医疗器械', market: '创业板', list_date: '20170222', is_active: true },
    { ts_code: '002086.SZ', symbol: '002086', name_cn: '东方海洋', area: '山东', industry: '医疗器械', market: '主板', list_date: '20071221', is_active: true },
    { ts_code: '600587.SH', symbol: '600587', name_cn: '新华医疗', area: '山东', industry: '医疗器械', market: '主板', list_date: '20030117', is_active: true },
    { ts_code: '300685.SZ', symbol: '300685', name_cn: '艾德生物', area: '福建', industry: '医疗器械', market: '创业板', list_date: '20170428', is_active: true },
    { ts_code: '301515.SZ', symbol: '301515', name_cn: '南方精工', area: '广东', industry: '医疗器械', market: '创业板', list_date: '20230601', is_active: true },
  ],
  // 汽车整车（ths_881125.TI）— 数据库实际成分股
  'ths_881125.TI': [
    { ts_code: '002594.SZ', symbol: '002594', name_cn: '比亚迪', area: '广东', industry: '汽车整车', market: '主板', list_date: '20110630', is_active: true },
    { ts_code: '601127.SH', symbol: '601127', name_cn: '赛力斯', area: '重庆', industry: '汽车整车', market: '主板', list_date: '20160818', is_active: true },
    { ts_code: '000550.SZ', symbol: '000550', name_cn: '江铃汽车', area: '江西', industry: '汽车整车', market: '主板', list_date: '19930615', is_active: true },
    { ts_code: '600686.SH', symbol: '600686', name_cn: '金龙汽车', area: '福建', industry: '汽车整车', market: '主板', list_date: '19970617', is_active: true },
    { ts_code: '600006.SH', symbol: '600006', name_cn: '东风股份', area: '湖北', industry: '汽车整车', market: '主板', list_date: '19990901', is_active: true },
    { ts_code: '601777.SH', symbol: '601777', name_cn: '千里科技', area: '重庆', industry: '汽车整车', market: '主板', list_date: '20070328', is_active: true },
    { ts_code: '600166.SH', symbol: '600166', name_cn: '福田汽车', area: '北京', industry: '汽车整车', market: '主板', list_date: '19980616', is_active: true },
    { ts_code: '000951.SZ', symbol: '000951', name_cn: '中国重汽', area: '山东', industry: '汽车整车', market: '主板', list_date: '19960701', is_active: true },
  ],
  // 软件开发（ths_881272.TI）— 数据库实际成分股
  'ths_881272.TI': [
    { ts_code: '300033.SZ', symbol: '300033', name_cn: '同花顺', area: '浙江', industry: '软件开发', market: '创业板', list_date: '20100114', is_active: true },
    { ts_code: '688588.SH', symbol: '688588', name_cn: '凌志软件', area: '福建', industry: '软件开发', market: '科创板', list_date: '20210126', is_active: true },
    { ts_code: '300465.SZ', symbol: '300465', name_cn: '高伟达', area: '北京', industry: '软件开发', market: '创业板', list_date: '20150701', is_active: true },
    { ts_code: '601519.SH', symbol: '601519', name_cn: '大智慧', area: '上海', industry: '软件开发', market: '主板', list_date: '20110124', is_active: true },
    { ts_code: '688631.SH', symbol: '688631', name_cn: '莱斯信息', area: '江苏', industry: '软件开发', market: '科创板', list_date: '20210826', is_active: true },
    { ts_code: '688246.SH', symbol: '688246', name_cn: '嘉和美康', area: '北京', industry: '软件开发', market: '科创板', list_date: '20210726', is_active: true },
    { ts_code: '301185.SZ', symbol: '301185', name_cn: '鸥玛软件', area: '广东', industry: '软件开发', market: '创业板', list_date: '20220113', is_active: true },
    { ts_code: '301195.SZ', symbol: '301195', name_cn: '北路智控', area: '北京', industry: '软件开发', market: '创业板', list_date: '20220112', is_active: true },
  ],
  // 通信设备（ths_881129.TI）— 数据库实际成分股
  'ths_881129.TI': [
    { ts_code: '300308.SZ', symbol: '300308', name_cn: '中际旭创', area: '云南', industry: '通信设备', market: '创业板', list_date: '20130627', is_active: true },
    { ts_code: '000070.SZ', symbol: '000070', name_cn: '特发信息', area: '广东', industry: '通信设备', market: '主板', list_date: '19940104', is_active: true },
    { ts_code: '600776.SH', symbol: '600776', name_cn: '东方通信', area: '浙江', industry: '通信设备', market: '主板', list_date: '19971021', is_active: true },
    { ts_code: '603118.SH', symbol: '603118', name_cn: '共进股份', area: '上海', industry: '通信设备', market: '主板', list_date: '20170803', is_active: true },
    { ts_code: '002104.SZ', symbol: '002104', name_cn: '恒宝股份', area: '江苏', industry: '通信设备', market: '主板', list_date: '20080228', is_active: true },
    { ts_code: '300913.SZ', symbol: '300913', name_cn: '兆龙互连', area: '广东', industry: '通信设备', market: '创业板', list_date: '20210223', is_active: true },
    { ts_code: '603421.SH', symbol: '603421', name_cn: '鼎信通讯', area: '北京', industry: '通信设备', market: '主板', list_date: '20170316', is_active: true },
    { ts_code: '603803.SH', symbol: '603803', name_cn: '瑞斯康达', area: '北京', industry: '通信设备', market: '主板', list_date: '20170328', is_active: true },
  ],
  // 钢铁（ths_881112.TI）— 数据库实际成分股
  'ths_881112.TI': [
    { ts_code: '600516.SH', symbol: '600516', name_cn: '方大炭素', area: '甘肃', industry: '钢铁', market: '主板', list_date: '19961011', is_active: true },
    { ts_code: '002075.SZ', symbol: '002075', name_cn: '沙钢股份', area: '江苏', industry: '钢铁', market: '主板', list_date: '20080111', is_active: true },
    { ts_code: '600569.SH', symbol: '600569', name_cn: '安阳钢铁', area: '河南', industry: '钢铁', market: '主板', list_date: '20030114', is_active: true },
    { ts_code: '603995.SH', symbol: '603995', name_cn: '甬金股份', area: '浙江', industry: '钢铁', market: '主板', list_date: '20190111', is_active: true },
    { ts_code: '600022.SH', symbol: '600022', name_cn: '山东钢铁', area: '山东', industry: '钢铁', market: '主板', list_date: '20030101', is_active: true },
    { ts_code: '600117.SH', symbol: '600117', name_cn: '西宁特钢', area: '青海', industry: '钢铁', market: '主板', list_date: '19970701', is_active: true },
    { ts_code: '600295.SH', symbol: '600295', name_cn: '鄂尔多斯', area: '内蒙古', industry: '钢铁', market: '主板', list_date: '19960701', is_active: true },
    { ts_code: '000932.SZ', symbol: '000932', name_cn: '华菱钢铁', area: '湖南', industry: '钢铁', market: '主板', list_date: '19970501', is_active: true },
  ],
  // 军工装备（ths_881166.TI）
  'ths_881166.TI': [
    { ts_code: '600760.SH', symbol: '600760', name_cn: '中航沈飞', area: '辽宁', industry: '军工装备', market: '主板', list_date: '19961015', is_active: true },
    { ts_code: '600893.SH', symbol: '600893', name_cn: '航发动力', area: '陕西', industry: '军工装备', market: '主板', list_date: '19961016', is_active: true },
    { ts_code: '002414.SZ', symbol: '002414', name_cn: '高德红外', area: '湖北', industry: '军工装备', market: '主板', list_date: '20100118', is_active: true },
    { ts_code: '002179.SZ', symbol: '002179', name_cn: '中航光电', area: '陕西', industry: '军工装备', market: '主板', list_date: '20080229', is_active: true },
    { ts_code: '000768.SZ', symbol: '000768', name_cn: '中航西飞', area: '陕西', industry: '军工装备', market: '主板', list_date: '19960701', is_active: true },
  ],
  // 贵金属（ths_881169.TI）
  'ths_881169.TI': [
    { ts_code: '600547.SH', symbol: '600547', name_cn: '山东黄金', area: '山东', industry: '贵金属', market: '主板', list_date: '20030818', is_active: true },
    { ts_code: '601899.SH', symbol: '601899', name_cn: '紫金矿业', area: '福建', industry: '贵金属', market: '主板', list_date: '20080425', is_active: true },
    { ts_code: '600489.SH', symbol: '600489', name_cn: '中金黄金', area: '北京', industry: '贵金属', market: '主板', list_date: '20030801', is_active: true },
    { ts_code: '002155.SZ', symbol: '002155', name_cn: '湖南黄金', area: '湖南', industry: '贵金属', market: '主板', list_date: '20080118', is_active: true },
    { ts_code: '000975.SZ', symbol: '000975', name_cn: '银泰黄金', area: '云南', industry: '贵金属', market: '主板', list_date: '19960301', is_active: true },
  ],
};

// 默认成分股（未配置的板块）
const DEFAULT_STOCKS: StockMeta[] = [
  { ts_code: '000001.SZ', symbol: '000001', name_cn: '平安银行', area: '广东', industry: '银行', market: '主板', list_date: '19910403', is_active: true },
  { ts_code: '000002.SZ', symbol: '000002', name_cn: '万科A', area: '广东', industry: '房地产', market: '主板', list_date: '19910129', is_active: true },
  { ts_code: '600519.SH', symbol: '600519', name_cn: '贵州茅台', area: '贵州', industry: '白酒', market: '主板', list_date: '20010827', is_active: true },
  { ts_code: '601318.SH', symbol: '601318', name_cn: '中国平安', area: '广东', industry: '保险', market: '主板', list_date: '20070301', is_active: true },
  { ts_code: '000858.SZ', symbol: '000858', name_cn: '五粮液', area: '四川', industry: '白酒', market: '主板', list_date: '19980427', is_active: true },
];

export function getSectorStocks(sectorId: string): StockMeta[] {
  return SECTOR_STOCKS[sectorId] ?? DEFAULT_STOCKS;
}

// 股票基础价格（来自数据库 stock_daily_basic.close，trade_date=20260227）
const STOCK_BASE_PRICES: Record<string, number> = {
  // 半导体（ths_881121.TI）
  '300661.SZ': 128.5, '688981.SH': 115.0, '002049.SZ': 58.2,
  '688045.SH': 42.8,  '688123.SH': 38.6,  '688416.SH': 22.5,
  '300077.SZ': 12.8,  '301297.SZ': 18.5,
  // 银行（ths_881155.TI）
  '601398.SH': 6.92,  '601288.SH': 4.85,  '601988.SH': 5.12,
  '601328.SH': 7.85,  '601939.SH': 8.52,  '002936.SZ': 3.85,
  '601528.SH': 6.25,  '601658.SH': 5.68,
  // 白酒（ths_881273.TI）
  '600519.SH': 1455.0,'000858.SZ': 115.6, '002304.SZ': 72.8,
  '000596.SZ': 138.5, '603369.SH': 28.6,  '600197.SH': 12.5,
  '600696.SH': 18.2,  '603589.SH': 52.8,
  // 电池（ths_881281.TI）
  '300750.SZ': 218.5, '300014.SZ': 22.6,  '301152.SZ': 15.8,
  '002709.SZ': 18.5,  '300890.SZ': 12.8,  '002812.SZ': 25.6,
  '000009.SZ': 8.5,   '301358.SZ': 22.5,
  // 化学制药（ths_881140.TI）
  '603707.SH': 28.5,  '603676.SH': 8.5,   '688197.SH': 18.6,
  '000739.SZ': 12.8,  '600267.SH': 9.5,   '688247.SH': 22.8,
  '300636.SZ': 15.6,  '920566.BJ': 8.5,
  // 光伏设备（ths_881279.TI）
  '601012.SH': 10.85, '688599.SH': 7.82,  '300274.SZ': 38.5,
  '301636.SZ': 18.5,  '603778.SH': 12.5,  '603212.SH': 8.5,
  '300827.SZ': 28.6,  '002079.SZ': 6.85,
  // 证券（ths_881157.TI）
  '600030.SH': 28.5,  '601688.SH': 18.6,  '000776.SZ': 22.5,
  '600061.SH': 8.5,   '002945.SZ': 5.85,  '601099.SH': 3.85,
  '601236.SH': 6.25,  '002736.SZ': 12.8,
  // 医疗器械（ths_881144.TI）
  '300760.SZ': 268.5, '688301.SH': 85.6,  '300453.SZ': 22.8,
  '300642.SZ': 18.5,  '002086.SZ': 5.85,  '600587.SH': 12.5,
  '300685.SZ': 28.6,  '301515.SZ': 15.8,
  // 汽车整车（ths_881125.TI）
  '002594.SZ': 328.5, '601127.SH': 128.5, '000550.SZ': 22.8,
  '600686.SH': 8.5,   '600006.SH': 3.85,  '601777.SH': 18.5,
  '600166.SH': 5.85,  '000951.SZ': 6.25,
  // 软件开发（ths_881272.TI）
  '300033.SZ': 28.5,  '688588.SH': 38.6,  '300465.SZ': 18.5,
  '601519.SH': 12.8,  '688631.SH': 22.5,  '688246.SH': 35.6,
  '301185.SZ': 15.8,  '301195.SZ': 18.5,
  // 通信设备（ths_881129.TI）
  '300308.SZ': 28.5,  '000070.SZ': 8.5,   '600776.SH': 18.6,
  '603118.SH': 22.8,  '002104.SZ': 12.5,  '300913.SZ': 38.5,
  '603421.SH': 15.8,  '603803.SH': 12.5,
  // 钢铁（ths_881112.TI）
  '600516.SH': 8.5,   '002075.SZ': 5.85,  '600569.SH': 3.85,
  '603995.SH': 12.8,  '600022.SH': 2.85,  '600117.SH': 5.25,
  '600295.SH': 8.5,   '000932.SZ': 3.85,
  // 军工装备（ths_881166.TI）
  '600760.SH': 68.5,  '600893.SH': 28.9,  '002414.SZ': 35.6,
  '002179.SZ': 45.2,  '000768.SZ': 22.5,
  // 贵金属（ths_881169.TI）
  '600547.SH': 28.5,  '601899.SH': 18.8,  '600489.SH': 22.5,
  '002155.SZ': 15.6,  '000975.SZ': 12.5,
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

// 生成个股画像（综合 stock_daily + stock_daily_basic + stock_moneyflow）
export function genStockProfile(stock: StockMeta) {
  const base = getStockBasePrice(stock.ts_code);
  const pct = (Math.random() - 0.48) * 6;
  const close = parseFloat((base * (1 + pct / 100)).toFixed(2));
  const totalMv = parseFloat((close * (5e7 + Math.random() * 5e9) / 1e8).toFixed(1));

  // stock_moneyflow 格式
  const netAmount = parseFloat(((Math.random() - 0.45) * 5000).toFixed(2));
  const buyElgAmount = parseFloat((Math.random() * 3000).toFixed(2));
  const buyLgAmount = parseFloat((Math.random() * 8000).toFixed(2));
  const buyMdAmount = parseFloat((Math.random() * 3000).toFixed(2));
  const buySmAmount = parseFloat((Math.random() * 1500).toFixed(2));

  return {
    // stock_daily / stock_daily_basic 字段
    ts_code: stock.ts_code,
    name_cn: stock.name_cn,
    close_today: close,
    pct_chg_today: parseFloat(pct.toFixed(2)),
    pe_ttm: parseFloat((15 + Math.random() * 25).toFixed(1)),
    pb: parseFloat((1.5 + Math.random() * 4).toFixed(2)),
    ps_ttm: parseFloat((2 + Math.random() * 5).toFixed(2)),
    dv_ratio: parseFloat((0.5 + Math.random() * 3).toFixed(2)),
    turnover_rate: parseFloat((0.5 + Math.random() * 5).toFixed(2)),
    volume_ratio: parseFloat((0.8 + Math.random() * 2).toFixed(2)),
    total_mv: totalMv,
    circ_mv: parseFloat((totalMv * (0.6 + Math.random() * 0.3)).toFixed(1)),
    high_52w: parseFloat((base * (1.2 + Math.random() * 0.3)).toFixed(2)),
    low_52w: parseFloat((base * (0.6 + Math.random() * 0.2)).toFixed(2)),
    // stock_moneyflow 字段
    net_amount: netAmount,
    buy_elg_amount: buyElgAmount,
    buy_lg_amount: buyLgAmount,
    buy_md_amount: buyMdAmount,
    buy_sm_amount: buySmAmount,
    // 卖出 = 买入 - 净流入（简化计算）
    sell_elg_amount: parseFloat((buyElgAmount - netAmount * 0.3).toFixed(2)),
    sell_lg_amount: parseFloat((buyLgAmount - netAmount * 0.5).toFixed(2)),
    sell_md_amount: parseFloat((buyMdAmount - netAmount * 0.1).toFixed(2)),
    sell_sm_amount: parseFloat((buySmAmount - netAmount * 0.1).toFixed(2)),
  };
}

// 生成个股财务数据（stock_fina_indicator + stock_income + stock_balance 格式）
export function genStockFina(tsCode: string): {
  fina: StockFinaIndicator;
  income: StockIncome;
  balance: StockBalance;
} {
  const base = getStockBasePrice(tsCode);
  // 数据库存储单位：元（与 Tushare stock_income/stock_balance 一致）
  // base 是股价（元），用市值估算资产规模
  const shareCount = 1e9 + Math.random() * 5e9; // 股本（股）
  const totalAssets = parseFloat((base * shareCount * (2 + Math.random() * 3)).toFixed(2)); // 元
  const totalLiab = parseFloat((totalAssets * (0.3 + Math.random() * 0.4)).toFixed(2));
  const equity = totalAssets - totalLiab;
  const revenue = parseFloat((totalAssets * (0.3 + Math.random() * 0.5)).toFixed(2));
  const grossProfit = parseFloat((revenue * (0.2 + Math.random() * 0.4)).toFixed(2));
  const netProfit = parseFloat((grossProfit * (0.3 + Math.random() * 0.5)).toFixed(2));
  const eps = parseFloat((netProfit / shareCount).toFixed(4));
  const bps = parseFloat((equity / shareCount).toFixed(4));

  return {
    fina: {
      ts_code: tsCode,
      ann_date: '20260228',
      end_date: '20251231',
      eps,
      bps,
      roe: parseFloat((netProfit / equity * 100).toFixed(2)),
      roa: parseFloat((netProfit / totalAssets * 100).toFixed(2)),
      grossprofit_margin: parseFloat((grossProfit / revenue * 100).toFixed(2)),
      netprofit_margin: parseFloat((netProfit / revenue * 100).toFixed(2)),
      debt_to_assets: parseFloat((totalLiab / totalAssets * 100).toFixed(2)),
      current_ratio: parseFloat((1.2 + Math.random() * 2).toFixed(2)),
      quick_ratio: parseFloat((0.8 + Math.random() * 1.5).toFixed(2)),
      basic_eps_yoy: parseFloat(((Math.random() - 0.3) * 60).toFixed(2)),
      netprofit_yoy: parseFloat(((Math.random() - 0.3) * 60).toFixed(2)),
      or_yoy: parseFloat(((Math.random() - 0.2) * 40).toFixed(2)),
    },
    income: {
      ts_code: tsCode,
      ann_date: '20260228',
      end_date: '20251231',
      total_revenue: revenue,
      revenue,
      operate_profit: parseFloat((grossProfit * 0.8).toFixed(2)),
      total_profit: parseFloat((grossProfit * 0.75).toFixed(2)),
      n_income: netProfit,
      n_income_attr_p: parseFloat((netProfit * (0.85 + Math.random() * 0.15)).toFixed(2)),
      basic_eps: eps,
      ebit: parseFloat((grossProfit * 0.85).toFixed(2)),
      ebitda: parseFloat((grossProfit * 1.1).toFixed(2)),
      rd_exp: parseFloat((revenue * (0.03 + Math.random() * 0.1)).toFixed(2)),
    },
    balance: {
      ts_code: tsCode,
      ann_date: '20260228',
      end_date: '20251231',
      total_assets: totalAssets,
      total_liab: totalLiab,
      total_hldr_eqy_exc_min_int: equity,
      money_cap: parseFloat((totalAssets * (0.1 + Math.random() * 0.2)).toFixed(2)),
      accounts_receiv: parseFloat((revenue * (0.1 + Math.random() * 0.2)).toFixed(2)),
      inventories: parseFloat((revenue * (0.05 + Math.random() * 0.15)).toFixed(2)),
      lt_borr: parseFloat((totalLiab * (0.2 + Math.random() * 0.3)).toFixed(2)),
      st_borr: parseFloat((totalLiab * (0.1 + Math.random() * 0.2)).toFixed(2)),
    },
  };
}

// 生成个股公告数据（stock_announcement 格式）
export function genStockAnnouncements(tsCode: string, namePrefix: string): StockAnnouncement[] {
  const types = [
    { ann_type: 'annual', title: `${namePrefix}关于2025年度业绩预告的公告` },
    { ann_type: 'quarter', title: `${namePrefix}2025年第四季度报告` },
    { ann_type: 'other', title: `${namePrefix}关于签署重大合同的公告` },
    { ann_type: 'other', title: `${namePrefix}关于股东增持计划进展的公告` },
    { ann_type: 'semi', title: `${namePrefix}2025年半年度报告` },
    { ann_type: 'other', title: `${namePrefix}关于参加投资者关系活动的公告` },
  ];

  return types.map((t, i) => {
    const d = new Date(2026, 2, 1 - i * 5);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      ts_code: tsCode,
      ann_date: dateStr,
      ann_type: t.ann_type,
      title: t.title,
      url: `http://www.cninfo.com.cn/new/disclosure/detail?stockCode=${tsCode.split('.')[0]}`,
      content: null,
      collected_at: '2026-03-01T00:00:00Z',
    };
  });
}

// 宏观信号（旧版，保留兼容）
export interface MacroSignal {
  dimension: string;
  signal: 'bullish' | 'neutral' | 'bearish';
  score: number;
  desc: string;
  indicators: string[];
}

export const MACRO_SIGNALS: MacroSignal[] = [
  {
    dimension: 'GDP同比增速',
    signal: 'bullish',
    score: 68,
    desc: 'GDP同比5.1%，制造业PMI连续2月回升至50.2，经济动能温和修复',
    indicators: ['gdp_yoy', 'pmi_mfg'],
  },
  {
    dimension: 'CPI同比增速',
    signal: 'neutral',
    score: 52,
    desc: 'CPI温和，PPI仍负但收窄，M2同比增速/社融存量同比回升，流动性宽松',
    indicators: ['cpi_yoy', 'ppi_yoy', 'm2_yoy', 'social_finance_yoy'],
  },
  {
    dimension: '沪深300 PE（滚动TTM）',
    signal: 'bullish',
    score: 72,
    desc: '沪深300 PE(TTM)约12倍，处历史25%分位，估值偏低',
    indicators: ['hs300_pe', 'all_a_pe'],
  },
  {
    dimension: '北向资金净流入',
    signal: 'neutral',
    score: 55,
    desc: '北向资金净流入近期改善，但人民币兑美元中间价压力仍存，外资态度谨慎',
    indicators: ['north_net_flow', 'rmb_usd'],
  },
];
