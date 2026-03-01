/**
 * mockSubIndicators.ts
 *
 * 宏观矩阵子维度钻取 —— 前端 Mock 数据
 * 版本：v1.0（REQ-072 UI 验证阶段）
 *
 * 数据结构说明：
 *   - key 格式：`${region}_${dimension}_${timescale}`，例如 `CN_宏观经济_short`
 *   - 每个 key 对应一组子指标（SubIndicator[]）
 *   - 每个子指标包含：名称、定性结论（signal）、定量数据（quantData）、数据来源
 *
 * 替换策略：
 *   待 UI 验证通过后，将此 Mock 数据替换为真实 API 接口调用。
 *   接口路径预留：GET /api/sub-indicators?region={region}&dimension={dim}&timescale={ts}
 *
 * 注意：
 *   - 测试库（trudecide_indicator_dev_clone）暂缓建立，UI 验证阶段不需要。
 *   - 定量数据目前为模拟值，仅用于验证展示效果，不代表真实数据。
 */

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 子指标信号状态 */
export type SubSignal =
  | '扩张' | '复苏' | '中性' | '收缩' | '放缓'
  | '宽松' | '偏松' | '偏紧' | '收紧'
  | '积极' | '中性偏积极' | '中性偏消极' | '消极'
  | '低估' | '合理' | '偏高' | '高估' | '极度低估';

/** 定量数据点 */
export interface QuantDataPoint {
  /** 指标名称 */
  label: string;
  /** 当前值（带单位字符串，如 "50.2" / "2.3%" / "1.2万亿" ） */
  value: string;
  /** 历史均值或参考基准（可选） */
  benchmark?: string;
  /** 趋势方向：up=上升 / down=下降 / flat=持平 */
  trend: 'up' | 'down' | 'flat';
  /** 数据来源 */
  source: string;
  /** 最新数据日期 */
  date: string;
}

/** 单个子指标 */
export interface SubIndicator {
  /** 指标 ID（与 indicator_meta.id 对应，Mock 阶段可为任意字符串） */
  id: string;
  /** 指标中文名 */
  name: string;
  /** 定性结论 */
  signal: SubSignal;
  /** 信号强度 0–100 */
  strength: number;
  /** 一句话解读 */
  summary: string;
  /** 定量数据（1–3 个核心数据点） */
  quantData: QuantDataPoint[];
  /** 数据权重（在本维度中的重要性，1–5） */
  weight: number;
}

/** Mock 数据索引 key */
export type MockKey = `${string}_${string}_${'short' | 'mid' | 'long'}`;

// ─────────────────────────────────────────────
// Mock 数据
// ─────────────────────────────────────────────

export const MOCK_SUB_INDICATORS: Record<string, SubIndicator[]> = {

  // ══════════════════════════════════════════
  // 中国 × 宏观经济
  // ══════════════════════════════════════════

  'CN_宏观经济_short': [
    {
      id: 'pmi_mfg',
      name: '制造业 PMI',
      signal: '扩张',
      strength: 72,
      summary: '制造业 PMI 连续 3 个月站上荣枯线，新订单分项持续改善，短期经济动能较强。',
      quantData: [
        { label: 'PMI（最新）', value: '50.8', benchmark: '50.0（荣枯线）', trend: 'up', source: '国家统计局', date: '2026-01' },
        { label: '新订单分项', value: '52.3', benchmark: '50.0', trend: 'up', source: '国家统计局', date: '2026-01' },
      ],
      weight: 5,
    },
    {
      id: 'cpi_yoy',
      name: 'CPI 同比',
      signal: '中性',
      strength: 50,
      summary: 'CPI 温和回升，通缩压力有所缓解，但仍低于 2% 政策目标，需持续观察。',
      quantData: [
        { label: 'CPI 同比', value: '0.8%', benchmark: '2.0%（政策目标）', trend: 'up', source: '国家统计局', date: '2026-01' },
        { label: 'PPI 同比', value: '-1.2%', benchmark: '0%', trend: 'up', source: '国家统计局', date: '2026-01' },
      ],
      weight: 4,
    },
    {
      id: 'export_yoy',
      name: '出口同比增速',
      signal: '扩张',
      strength: 65,
      summary: '出口增速超预期，东南亚及欧洲订单回暖，外需对经济的拉动作用明显。',
      quantData: [
        { label: '出口同比', value: '+8.2%', benchmark: '+5.0%（市场预期）', trend: 'up', source: '海关总署', date: '2026-01' },
      ],
      weight: 3,
    },
  ],

  'CN_宏观经济_mid': [
    {
      id: 'gdp_yoy',
      name: 'GDP 同比增速',
      signal: '复苏',
      strength: 60,
      summary: '中期 GDP 增速预计维持在 4.5–5% 区间，内需驱动逐步替代出口，结构转型持续推进。',
      quantData: [
        { label: 'GDP 同比（最新季度）', value: '5.0%', benchmark: '5.0%（政府目标）', trend: 'flat', source: '国家统计局', date: '2025-Q4' },
        { label: '固定资产投资同比', value: '3.2%', benchmark: '4.0%', trend: 'down', source: '国家统计局', date: '2025-Q4' },
      ],
      weight: 5,
    },
    {
      id: 'retail_sales',
      name: '社会消费品零售总额同比',
      signal: '复苏',
      strength: 55,
      summary: '消费复苏节奏偏慢，居民消费意愿仍受就业预期影响，中期需关注消费刺激政策效果。',
      quantData: [
        { label: '零售总额同比', value: '+4.1%', benchmark: '+5.5%（历史均值）', trend: 'up', source: '国家统计局', date: '2025-12' },
      ],
      weight: 4,
    },
    {
      id: 'ppi_yoy',
      name: 'PPI 同比',
      signal: '放缓',
      strength: 40,
      summary: 'PPI 持续负增长，工业品价格通缩压力仍在，企业利润修复节奏偏慢。',
      quantData: [
        { label: 'PPI 同比', value: '-1.2%', benchmark: '0%（通缩分界线）', trend: 'up', source: '国家统计局', date: '2026-01' },
      ],
      weight: 3,
    },
  ],

  'CN_宏观经济_long': [
    {
      id: 'gdp_per_capita',
      name: '人均 GDP',
      signal: '扩张',
      strength: 70,
      summary: '中国人均 GDP 已突破 1.3 万美元，向高收入国家迈进，长期消费升级和产业升级逻辑确立。',
      quantData: [
        { label: '人均 GDP', value: '1.32万美元', benchmark: '1.28万（2024）', trend: 'up', source: '国家统计局', date: '2025' },
        { label: '城镇化率', value: '67.2%', benchmark: '56%（2015）', trend: 'up', source: '国家统计局', date: '2025' },
      ],
      weight: 5,
    },
    {
      id: 'rd_gdp_ratio',
      name: '研发投入占 GDP 比重',
      signal: '扩张',
      strength: 68,
      summary: '研发投入持续增加，科技自立自强战略推动长期全要素生产率提升，有利于经济潜在增速维持。',
      quantData: [
        { label: 'R&D/GDP', value: '2.65%', benchmark: '2.4%（2020）', trend: 'up', source: '国家统计局', date: '2025' },
      ],
      weight: 4,
    },
  ],

  // ══════════════════════════════════════════
  // 中国 × 流动性
  // ══════════════════════════════════════════

  'CN_流动性_short': [
    {
      id: 'm2_yoy',
      name: 'M2 同比增速',
      signal: '宽松',
      strength: 75,
      summary: 'M2 增速高于名义 GDP 增速，货币供应充裕，流动性环境整体宽松。',
      quantData: [
        { label: 'M2 同比', value: '8.7%', benchmark: '名义GDP增速约6%', trend: 'up', source: '中国人民银行', date: '2026-01' },
      ],
      weight: 5,
    },
    {
      id: 'shibor_1m',
      name: 'SHIBOR 1 个月',
      signal: '宽松',
      strength: 70,
      summary: '短期利率处于近 3 年低位，银行间市场资金面宽松，信贷扩张条件充分。',
      quantData: [
        { label: 'SHIBOR 1M', value: '1.85%', benchmark: '2.5%（近3年均值）', trend: 'down', source: '上海银行间同业拆放利率', date: '2026-01' },
      ],
      weight: 4,
    },
    {
      id: 'north_net_flow',
      name: '北向资金净流入',
      signal: '偏松',
      strength: 60,
      summary: '北向资金近一个月净流入，外资对 A 股态度趋于积极，短期流动性有增量资金支撑。',
      quantData: [
        { label: '北向净流入（近1月）', value: '+182亿元', benchmark: '月均±50亿', trend: 'up', source: '沪深交易所', date: '2026-01' },
      ],
      weight: 3,
    },
  ],

  'CN_流动性_mid': [
    {
      id: 'lpr_1y',
      name: 'LPR 1 年期',
      signal: '偏松',
      strength: 65,
      summary: 'LPR 处于历史低位，实体经济融资成本下降，有利于中期信贷扩张和投资回升。',
      quantData: [
        { label: 'LPR 1Y', value: '3.10%', benchmark: '3.85%（2022年初）', trend: 'down', source: '中国人民银行', date: '2026-01' },
      ],
      weight: 5,
    },
    {
      id: 'social_financing',
      name: '社会融资规模存量同比',
      signal: '偏松',
      strength: 58,
      summary: '社融增速与名义 GDP 增速基本匹配，信用扩张节奏稳健，中期流动性无明显收紧风险。',
      quantData: [
        { label: '社融存量同比', value: '8.0%', benchmark: '名义GDP增速约6%', trend: 'flat', source: '中国人民银行', date: '2026-01' },
      ],
      weight: 4,
    },
  ],

  'CN_流动性_long': [
    {
      id: 'reserve_ratio',
      name: '存款准备金率',
      signal: '偏松',
      strength: 62,
      summary: '准备金率仍有下调空间（当前约 7%），长期货币政策工具箱充裕，流动性支撑有保障。',
      quantData: [
        { label: '大型银行准备金率', value: '7.0%', benchmark: '15%（2018年高点）', trend: 'down', source: '中国人民银行', date: '2026-01' },
      ],
      weight: 4,
    },
  ],

  // ══════════════════════════════════════════
  // 中国 × 政策与预期
  // ══════════════════════════════════════════

  'CN_政策与预期_short': [
    {
      id: 'fiscal_deficit',
      name: '财政赤字率',
      signal: '积极',
      strength: 78,
      summary: '财政赤字率扩大至 4%，专项债发行提速，财政政策积极发力，短期对市场情绪形成正面催化。',
      quantData: [
        { label: '财政赤字率（预算）', value: '4.0%', benchmark: '3.0%（2023年）', trend: 'up', source: '财政部', date: '2026' },
        { label: '专项债额度', value: '4.5万亿', benchmark: '3.9万亿（2025年）', trend: 'up', source: '财政部', date: '2026' },
      ],
      weight: 5,
    },
    {
      id: 'policy_rate',
      name: '政策利率（7天逆回购）',
      signal: '积极',
      strength: 70,
      summary: '央行维持宽松基调，7 天逆回购利率处于历史低位，货币政策对经济的支撑信号明确。',
      quantData: [
        { label: '7天逆回购利率', value: '1.50%', benchmark: '2.0%（2023年）', trend: 'down', source: '中国人民银行', date: '2026-01' },
      ],
      weight: 4,
    },
  ],

  'CN_政策与预期_mid': [
    {
      id: 'industrial_policy',
      name: '产业政策力度',
      signal: '积极',
      strength: 72,
      summary: '新质生产力、AI 产业、半导体等战略领域政策密集出台，中期产业政策红利持续释放。',
      quantData: [
        { label: '战略性新兴产业政策数量（近12月）', value: '47项', benchmark: '年均约30项', trend: 'up', source: '国务院/发改委', date: '2025' },
      ],
      weight: 4,
    },
    {
      id: 'geopolitical_risk',
      name: '地缘政治风险',
      signal: '中性偏消极',
      strength: 45,
      summary: '中美贸易摩擦仍存在不确定性，地缘风险对市场预期形成一定压制，需持续跟踪关税政策动向。',
      quantData: [
        { label: '对美出口关税税率（均值）', value: '约25%', benchmark: '15%（2018年前）', trend: 'flat', source: '美国贸易代表办公室', date: '2025' },
      ],
      weight: 3,
    },
  ],

  'CN_政策与预期_long': [
    {
      id: 'reform_depth',
      name: '改革深度与制度红利',
      signal: '积极',
      strength: 65,
      summary: '注册制改革、国企改革、资本市场制度完善持续推进，长期有利于市场定价效率和投资者回报。',
      quantData: [
        { label: 'A股注册制覆盖率', value: '100%', benchmark: '0%（2018年前）', trend: 'up', source: '证监会', date: '2024' },
      ],
      weight: 4,
    },
  ],

  // ══════════════════════════════════════════
  // 中国 × 市场估值情绪
  // ══════════════════════════════════════════

  'CN_市场估值情绪_short': [
    {
      id: 'pe_csi300',
      name: '沪深 300 PE（TTM）',
      signal: '低估',
      strength: 80,
      summary: '沪深 300 PE 约 12 倍，低于近 10 年均值（约 14 倍），估值具有较高安全边际。',
      quantData: [
        { label: '沪深300 PE（TTM）', value: '12.1x', benchmark: '14.2x（10年均值）', trend: 'up', source: '万得', date: '2026-01' },
        { label: '沪深300 PB', value: '1.35x', benchmark: '1.6x（10年均值）', trend: 'up', source: '万得', date: '2026-01' },
      ],
      weight: 5,
    },
    {
      id: 'margin_balance',
      name: '融资余额',
      signal: '中性',
      strength: 50,
      summary: '融资余额处于历史中位水平，市场杠杆率适中，短期无明显过热或过冷信号。',
      quantData: [
        { label: '融资余额', value: '1.52万亿', benchmark: '1.4万亿（近3年均值）', trend: 'up', source: '沪深交易所', date: '2026-01' },
      ],
      weight: 3,
    },
    {
      id: 'vix_cn',
      name: 'A 股波动率（VIX 类比）',
      signal: '中性',
      strength: 52,
      summary: '市场隐含波动率处于正常区间，投资者情绪未出现极端恐慌或极端贪婪，短期情绪中性。',
      quantData: [
        { label: '上证 50ETF 隐含波动率', value: '18%', benchmark: '15–25%（正常区间）', trend: 'flat', source: '上交所', date: '2026-01' },
      ],
      weight: 3,
    },
  ],

  'CN_市场估值情绪_mid': [
    {
      id: 'pe_csi500',
      name: '中证 500 PE（TTM）',
      signal: '低估',
      strength: 75,
      summary: '中证 500 PE 约 22 倍，低于历史均值（约 30 倍），中小盘成长股估值修复空间较大。',
      quantData: [
        { label: '中证500 PE（TTM）', value: '22.3x', benchmark: '30.1x（10年均值）', trend: 'up', source: '万得', date: '2026-01' },
      ],
      weight: 4,
    },
    {
      id: 'dividend_yield',
      name: 'A 股整体股息率',
      signal: '低估',
      strength: 72,
      summary: 'A 股整体股息率约 2.8%，高于 10 年期国债收益率（约 2.1%），股债性价比偏向股票。',
      quantData: [
        { label: 'A股整体股息率', value: '2.8%', benchmark: '10Y国债2.1%', trend: 'up', source: '万得', date: '2026-01' },
        { label: '股债利差（股息率-国债）', value: '+0.7%', benchmark: '0%（中性线）', trend: 'up', source: '万得', date: '2026-01' },
      ],
      weight: 5,
    },
  ],

  'CN_市场估值情绪_long': [
    {
      id: 'cape_ratio',
      name: '周期调整市盈率（CAPE）',
      signal: '低估',
      strength: 78,
      summary: 'A 股 CAPE 约 14 倍，处于全球主要市场最低分位，长期配置价值突出。',
      quantData: [
        { label: 'A股 CAPE（席勒PE）', value: '14.2x', benchmark: '美股约32x', trend: 'up', source: '万得/Bloomberg', date: '2026-01' },
      ],
      weight: 5,
    },
  ],

  // ══════════════════════════════════════════
  // 美国 × 宏观经济（示例，仅短期）
  // ══════════════════════════════════════════

  'US_宏观经济_short': [
    {
      id: 'us_pmi',
      name: '美国制造业 PMI（ISM）',
      signal: '中性',
      strength: 50,
      summary: '美国 ISM 制造业 PMI 在荣枯线附近震荡，经济软着陆预期基本兑现，但复苏动能偏弱。',
      quantData: [
        { label: 'ISM 制造业 PMI', value: '50.3', benchmark: '50.0（荣枯线）', trend: 'up', source: 'ISM', date: '2026-01' },
      ],
      weight: 5,
    },
    {
      id: 'us_cpi',
      name: '美国 CPI 同比',
      signal: '中性偏消极',
      strength: 45,
      summary: 'CPI 同比仍高于 2% 目标，通胀粘性制约降息空间，对股市估值扩张形成压制。',
      quantData: [
        { label: 'CPI 同比', value: '2.9%', benchmark: '2.0%（美联储目标）', trend: 'down', source: 'BLS', date: '2026-01' },
        { label: '核心PCE同比', value: '2.7%', benchmark: '2.0%', trend: 'down', source: 'BEA', date: '2025-12' },
      ],
      weight: 4,
    },
  ],

  'US_流动性_short': [
    {
      id: 'fed_funds_rate',
      name: '联邦基金利率',
      signal: '偏紧',
      strength: 55,
      summary: '联邦基金利率仍处于 4.25–4.5% 高位，降息节奏偏慢，流动性环境相对偏紧。',
      quantData: [
        { label: '联邦基金利率（目标区间上限）', value: '4.50%', benchmark: '2.5%（中性利率估计）', trend: 'flat', source: '美联储', date: '2026-01' },
      ],
      weight: 5,
    },
  ],

  'US_政策与预期_short': [
    {
      id: 'us_fiscal',
      name: '美国财政政策',
      signal: '中性偏积极',
      strength: 55,
      summary: '特朗普政府减税政策预期提振企业盈利预期，但财政赤字扩大引发债务可持续性担忧。',
      quantData: [
        { label: '联邦财政赤字/GDP', value: '6.4%', benchmark: '3.0%（历史均值）', trend: 'up', source: 'CBO', date: '2025' },
      ],
      weight: 4,
    },
  ],

  'US_市场估值情绪_short': [
    {
      id: 'sp500_pe',
      name: '标普 500 PE（TTM）',
      signal: '高估',
      strength: 30,
      summary: '标普 500 PE 约 25 倍，高于历史均值（约 18 倍），估值偏贵，安全边际不足。',
      quantData: [
        { label: '标普500 PE（TTM）', value: '25.2x', benchmark: '18.0x（历史均值）', trend: 'down', source: 'Bloomberg', date: '2026-01' },
      ],
      weight: 5,
    },
    {
      id: 'us_vix',
      name: 'VIX 恐慌指数',
      signal: '中性',
      strength: 52,
      summary: 'VIX 处于 15–20 正常区间，市场情绪未出现极端，短期波动可控。',
      quantData: [
        { label: 'VIX', value: '17.2', benchmark: '20以下=正常；30以上=恐慌', trend: 'flat', source: 'CBOE', date: '2026-01' },
      ],
      weight: 4,
    },
  ],
};

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

/**
 * 获取指定维度×时间尺度的子指标列表
 * @param region 地区代码，如 'CN' / 'US'
 * @param dimension 维度名称，如 '宏观经济'
 * @param timescale 时间尺度，如 'short' / 'mid' / 'long'
 * @returns SubIndicator[] 子指标列表，若无数据则返回空数组
 */
export function getSubIndicators(
  region: string,
  dimension: string,
  timescale: string,
): SubIndicator[] {
  const key = `${region}_${dimension}_${timescale}`;
  return MOCK_SUB_INDICATORS[key] ?? [];
}

/**
 * 根据 signal 返回对应的颜色 class（Tailwind）
 */
export function getSignalColor(signal: SubSignal): {
  badge: string;
  text: string;
  bg: string;
} {
  const positive: SubSignal[] = ['扩张', '复苏', '宽松', '偏松', '积极', '中性偏积极', '低估', '极度低估'];
  const negative: SubSignal[] = ['收缩', '放缓', '偏紧', '收紧', '消极', '中性偏消极', '高估'];

  if (positive.includes(signal)) {
    return {
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      text: 'text-emerald-700',
      bg: 'bg-emerald-50',
    };
  }
  if (negative.includes(signal)) {
    return {
      badge: 'bg-red-100 text-red-800 border-red-200',
      text: 'text-red-700',
      bg: 'bg-red-50',
    };
  }
  // 中性
  return {
    badge: 'bg-gray-100 text-gray-700 border-gray-200',
    text: 'text-gray-600',
    bg: 'bg-gray-50',
  };
}

/**
 * 根据 trend 返回趋势箭头符号
 */
export function getTrendIcon(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  return '→';
}

/**
 * 根据 trend 返回趋势颜色 class
 */
export function getTrendColor(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up') return 'text-emerald-600';
  if (trend === 'down') return 'text-red-500';
  return 'text-gray-400';
}
