-- ============================================================
-- 补充 indicator_meta 缺失指标种子数据
-- 根据需求文档 v4 完整清单，补充已有14条之外的指标
-- 请在 Supabase Dashboard > SQL Editor 中执行
-- ============================================================

INSERT INTO indicator_meta (id, name_cn, description_cn, category, unit, source_name, source_url, credibility, frequency, value_type, region)
VALUES

-- ── 3.1 宏观经济（Economy）补充 ──────────────────────────────────────────
('gdp_level',          'GDP总量（季度）',        '季度国内生产总值绝对值（亿元）',                       'macro', '亿元', 'AKShare/东方财富', 'https://eastmoney.com', 'high', 'quarterly', 'level', 'CN'),
('gdp_qoq',            'GDP季比增速',             '季度国内生产总值环比增长率',                           'macro', '%',    'AKShare/东方财富', 'https://eastmoney.com', 'high', 'quarterly', 'qoq',   'CN'),
('gdp_primary',        '第一产业增加值',           '第一产业生产总值绝对值（亿元）',                       'macro', '亿元', 'AKShare/东方财富', 'https://eastmoney.com', 'high', 'quarterly', 'level', 'CN'),
('gdp_primary_yoy',    '第一产业同比增速',         '第一产业生产总值同比增长率',                           'macro', '%',    'AKShare/东方财富', 'https://eastmoney.com', 'high', 'quarterly', 'yoy',   'CN'),
('gdp_secondary',      '第二产业增加值',           '第二产业生产总值绝对值（亿元）',                       'macro', '亿元', 'AKShare/东方财富', 'https://eastmoney.com', 'high', 'quarterly', 'level', 'CN'),
('gdp_secondary_yoy',  '第二产业同比增速',         '第二产业生产总值同比增长率',                           'macro', '%',    'AKShare/东方财富', 'https://eastmoney.com', 'high', 'quarterly', 'yoy',   'CN'),
('gdp_tertiary',       '第三产业增加值',           '第三产业生产总值绝对值（亿元）',                       'macro', '亿元', 'AKShare/东方财富', 'https://eastmoney.com', 'high', 'quarterly', 'level', 'CN'),
('gdp_tertiary_yoy',   '第三产业同比增速',         '第三产业生产总值同比增长率',                           'macro', '%',    'AKShare/东方财富', 'https://eastmoney.com', 'high', 'quarterly', 'yoy',   'CN'),
('cpi_mom',            'CPI环比',                 '居民消费价格指数月环比增速',                           'macro', '%',    'AKShare/东方财富', 'https://eastmoney.com', 'high', 'monthly',   'mom',   'CN'),
('pmi_non_mfg',        'PMI非制造业',             '官方非制造业采购经理指数（服务业+建筑业）',             'macro', '',     'AKShare/东方财富', 'https://eastmoney.com', 'high', 'monthly',   'index', 'CN'),
('unemployment_rate',  '城镇调查失业率',           '全国城镇调查失业率，反映就业市场景气度',               'macro', '%',    'AKShare/国家统计局','https://data.stats.gov.cn', 'high', 'monthly', 'index', 'CN'),

-- ── 3.2 流动性与货币政策（Liquidity）补充 ──────────────────────────────
('m2_level',           'M2余额',                  'M2货币供应量存量（亿元）',                             'macro', '亿元', 'AKShare/东方财富', 'https://eastmoney.com', 'high', 'monthly',   'level', 'CN'),
('social_finance_new', '社融新增（当月）',         '当月社会融资规模增量（亿元）',                         'macro', '亿元', 'AKShare/东方财富', 'https://eastmoney.com', 'high', 'monthly',   'flow',  'CN'),
('social_finance_yoy', '社融存量同比',             '社会融资规模存量同比增速',                             'macro', '%',    'AKShare/东方财富', 'https://eastmoney.com', 'high', 'monthly',   'yoy',   'CN'),
('lpr_5y',             '5年期LPR',                '5年期贷款市场报价利率，房贷定价锚',                    'macro', '%',    'AKShare/中国人民银行','http://www.pbc.gov.cn', 'high', 'monthly',  'rate',  'CN'),
('shibor_on',          'Shibor隔夜',              '上海银行间同业拆放利率-隔夜，短期流动性风向标',         'macro', '%',    'AKShare/金十数据', 'https://jin10.com',     'high', 'daily',     'rate',  'CN'),
('shibor_1w',          'Shibor 1周',              '上海银行间同业拆放利率-1周，短期流动性风向标',          'macro', '%',    'AKShare/金十数据', 'https://jin10.com',     'high', 'daily',     'rate',  'CN'),
('dr001',              'DR001银行间隔夜回购',      '银行间市场存款类机构隔夜回购利率（暂用Shibor近似）',   'macro', '%',    'AKShare/金十数据', 'https://jin10.com',     'medium','daily',    'rate',  'CN'),
('dr007',              'DR007银行间7天回购',       '银行间市场存款类机构7天回购利率（暂用Shibor近似）',    'macro', '%',    'AKShare/金十数据', 'https://jin10.com',     'medium','daily',    'rate',  'CN'),

-- ── 3.3 利率与汇率（Rates & FX）──────────────────────────────────────────
('cn_bond_10y',        '中国10年期国债收益率',     '中国10年期国债到期收益率，无风险利率基准',             'macro', '%',    'AKShare/东方财富', 'https://eastmoney.com', 'high', 'daily',     'rate',  'CN'),
('us_bond_10y',        '美国10年期国债收益率',     '美国10年期国债到期收益率，全球无风险利率锚',           'macro', '%',    'AKShare/东方财富', 'https://eastmoney.com', 'high', 'daily',     'rate',  'US'),
('rmb_usd',            '人民币兑美元中间价',       '中国人民银行每日公布的人民币兑美元中间价',             'macro', '元/美元','AKShare/中国外汇交易中心','https://www.chinamoney.com.cn', 'high', 'daily', 'rate', 'CN'),

-- ── 3.4 资金流向（Fund Flow）──────────────────────────────────────────────
('north_net_flow',     '北向资金净流入',           '沪深港通北向资金当日净流入金额（亿元）',               'macro', '亿元', 'AKShare/东方财富', 'https://eastmoney.com', 'high', 'daily',     'flow',  'CN'),
('margin_balance_sh',  '上海融资余额',             '上交所融资融券余额中的融资余额（亿元）',               'macro', '亿元', 'AKShare/金十数据', 'https://jin10.com',     'high', 'daily',     'level', 'CN'),
('margin_balance_sz',  '深圳融资余额',             '深交所融资融券余额中的融资余额（亿元）',               'macro', '亿元', 'AKShare/金十数据', 'https://jin10.com',     'high', 'daily',     'level', 'CN'),

-- ── 3.5 市场估值（Valuation）──────────────────────────────────────────────
('hs300_pe',           '沪深300 PE（加权TTM）',    '沪深300指数加权市盈率（TTM），市场整体估值水位',       'macro', '',     'AKShare/乐咕乐股', 'https://legulegu.com',  'high', 'daily',     'index', 'CN'),
('hs300_pb',           '沪深300 PB（加权）',       '沪深300指数加权市净率，市场整体估值水位',              'macro', '',     'AKShare/乐咕乐股', 'https://legulegu.com',  'high', 'daily',     'index', 'CN'),
('all_a_pe',           '全A市场PE（等权TTM中位数）','全A股等权市盈率TTM中位数，剔除极值的市场估值中枢',   'macro', '',     'AKShare/乐咕乐股', 'https://legulegu.com',  'high', 'daily',     'index', 'CN'),
('all_a_pb',           '全A市场PB（等权中位数）',  '全A股等权市净率中位数，剔除极值的市场估值中枢',        'macro', '',     'AKShare/乐咕乐股', 'https://legulegu.com',  'high', 'daily',     'index', 'CN')

ON CONFLICT (id) DO UPDATE SET
  name_cn        = EXCLUDED.name_cn,
  description_cn = EXCLUDED.description_cn,
  unit           = EXCLUDED.unit,
  source_name    = EXCLUDED.source_name,
  frequency      = EXCLUDED.frequency,
  value_type     = EXCLUDED.value_type,
  region         = EXCLUDED.region;

-- ── 同步修正原有14条指标的 indicator_id 命名（对齐需求文档 v4）──────────
-- 需求文档中 GDP同比 用 gdp_yoy，CPI同比用 cpi_yoy，与现有 cn_gdp_yoy 不同
-- 策略：保留原有 cn_ 前缀的记录，同时新增不带前缀的别名记录（前端用）
-- 注：cn_cpi_yoy 等原有记录不删除，保持数据完整性

-- 验证：查看全部指标数量
SELECT region, COUNT(*) AS cnt FROM indicator_meta GROUP BY region ORDER BY region;
SELECT COUNT(*) AS total_indicators FROM indicator_meta;
