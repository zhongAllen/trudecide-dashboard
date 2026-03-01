-- ============================================================
-- 个股精选数据层建表 SQL
-- 版本: v1
-- 日期: 2026-03-01
-- 说明: 财务三表全字段（与 Tushare 接口返回一致），
--       daily_basic/fina_indicator 全字段，
--       事件层精选字段
-- ============================================================

-- ============================================================
-- 1. stock_daily_basic — 每日估值指标（18字段，全存）
--    来源: Tushare daily_basic 接口
--    更新: 每交易日
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_daily_basic (
  ts_code          TEXT    NOT NULL,
  trade_date       DATE    NOT NULL,
  close            NUMERIC,
  turnover_rate    NUMERIC,   -- 换手率(%)
  turnover_rate_f  NUMERIC,   -- 换手率(自由流通股)(%)
  volume_ratio     NUMERIC,   -- 量比
  pe               NUMERIC,   -- 市盈率（静态）
  pe_ttm           NUMERIC,   -- 市盈率TTM
  pb               NUMERIC,   -- 市净率
  ps               NUMERIC,   -- 市销率
  ps_ttm           NUMERIC,   -- 市销率TTM
  dv_ratio         NUMERIC,   -- 股息率(%)
  dv_ttm           NUMERIC,   -- 股息率TTM(%)
  total_share      NUMERIC,   -- 总股本(万股)
  float_share      NUMERIC,   -- 流通股本(万股)
  free_share       NUMERIC,   -- 自由流通股本(万股)
  total_mv         NUMERIC,   -- 总市值(万元)
  circ_mv          NUMERIC,   -- 流通市值(万元)
  PRIMARY KEY (ts_code, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_stock_daily_basic_date ON stock_daily_basic(trade_date);
CREATE INDEX IF NOT EXISTS idx_stock_daily_basic_code ON stock_daily_basic(ts_code);

-- ============================================================
-- 2. stock_income — 利润表（85字段，全存）
--    来源: Tushare income / income_vip 接口
--    更新: 每季度
--    主键: (ts_code, end_date, report_type)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_income (
  ts_code              TEXT    NOT NULL,
  ann_date             TEXT,              -- 公告日期
  f_ann_date           TEXT,              -- 实际公告日期
  end_date             TEXT    NOT NULL,  -- 报告期
  report_type          TEXT    NOT NULL,  -- 报告类型(1合并 9半年报 12年报)
  comp_type            TEXT,              -- 公司类型
  end_type             TEXT,              -- 报告期类型
  basic_eps            NUMERIC,           -- 基本每股收益
  diluted_eps          NUMERIC,           -- 稀释每股收益
  total_revenue        NUMERIC,           -- 营业总收入
  revenue              NUMERIC,           -- 营业收入
  int_income           NUMERIC,           -- 利息收入
  prem_earned          NUMERIC,           -- 已赚保费
  comm_income          NUMERIC,           -- 手续费及佣金收入
  n_commis_income      NUMERIC,           -- 手续费及佣金净收入
  n_oth_income         NUMERIC,           -- 其他经营净收益
  n_oth_b_income       NUMERIC,           -- 加:其他业务净收益
  prem_income          NUMERIC,           -- 保险业务收入
  out_prem             NUMERIC,           -- 减:分出保费
  une_prem_reser       NUMERIC,           -- 提取未到期责任准备金
  reins_income         NUMERIC,           -- 其中:分保费收入
  n_sec_tb_income      NUMERIC,           -- 代理买卖证券业务净收入
  n_sec_uw_income      NUMERIC,           -- 证券承销业务净收入
  n_asset_mg_income    NUMERIC,           -- 受托客户资产管理业务净收入
  oth_b_income         NUMERIC,           -- 其他业务收入
  fv_value_chg_gain    NUMERIC,           -- 加:公允价值变动净收益
  invest_income        NUMERIC,           -- 加:投资净收益
  ass_invest_income    NUMERIC,           -- 其中:对联营企业和合营企业的投资收益
  forex_gain           NUMERIC,           -- 加:汇兑净收益
  total_cogs           NUMERIC,           -- 营业总成本
  oper_cost            NUMERIC,           -- 减:营业成本
  int_exp              NUMERIC,           -- 减:利息支出
  comm_exp             NUMERIC,           -- 减:手续费及佣金支出
  biz_tax_surchg       NUMERIC,           -- 减:营业税金及附加
  sell_exp             NUMERIC,           -- 减:销售费用
  admin_exp            NUMERIC,           -- 减:管理费用
  fin_exp              NUMERIC,           -- 减:财务费用
  assets_impair_loss   NUMERIC,           -- 减:资产减值损失
  prem_refund          NUMERIC,           -- 退保金
  compens_payout       NUMERIC,           -- 赔付总支出
  reser_insur_liab     NUMERIC,           -- 提取保险责任准备金
  div_payt             NUMERIC,           -- 保户红利支出
  reins_exp            NUMERIC,           -- 分保费用
  oper_exp             NUMERIC,           -- 营业支出
  compens_payout_refu  NUMERIC,           -- 减:摊回赔付支出
  insur_reser_refu     NUMERIC,           -- 减:摊回保险责任准备金
  reins_cost_refund    NUMERIC,           -- 减:摊回分保费用
  other_bus_cost       NUMERIC,           -- 其他业务成本
  operate_profit       NUMERIC,           -- 营业利润
  non_oper_income      NUMERIC,           -- 加:营业外收入
  non_oper_exp         NUMERIC,           -- 减:营业外支出
  nca_disploss         NUMERIC,           -- 其中:减:非流动资产处置净损失
  total_profit         NUMERIC,           -- 利润总额
  income_tax           NUMERIC,           -- 所得税费用
  n_income             NUMERIC,           -- 净利润(含少数股东损益)
  n_income_attr_p      NUMERIC,           -- 归属于母公司股东的净利润
  minority_gain        NUMERIC,           -- 少数股东损益
  oth_compr_income     NUMERIC,           -- 其他综合收益
  t_compr_income       NUMERIC,           -- 综合收益总额
  compr_inc_attr_p     NUMERIC,           -- 归属于母公司(或股东)的综合收益总额
  compr_inc_attr_m_s   NUMERIC,           -- 归属于少数股东的综合收益总额
  ebit                 NUMERIC,           -- 息税前利润
  ebitda               NUMERIC,           -- 息税折旧摊销前利润
  insurance_exp        NUMERIC,           -- 保险业务支出
  undist_profit        NUMERIC,           -- 年初未分配利润
  distable_profit      NUMERIC,           -- 可分配利润
  rd_exp               NUMERIC,           -- 研发费用
  fin_exp_int_exp      NUMERIC,           -- 财务费用:利息费用
  fin_exp_int_inc      NUMERIC,           -- 财务费用:利息收入
  transfer_surplus_rese NUMERIC,          -- 盈余公积转入
  transfer_housing_imprest NUMERIC,       -- 住房周转金转入
  transfer_oth         NUMERIC,           -- 其他转入
  adj_lossgain         NUMERIC,           -- 调整以前年度损益
  withdra_legal_surplus NUMERIC,          -- 提取法定盈余公积
  withdra_legal_pubfund NUMERIC,          -- 提取法定公益金
  withdra_mgt_bonus    NUMERIC,           -- 提取企业发展基金
  withdra_pvt_funds    NUMERIC,           -- 提取储备基金
  withdra_oth_ersu     NUMERIC,           -- 提取任意盈余公积金
  workers_welfare      NUMERIC,           -- 职工奖金福利
  distr_profit_shrhder NUMERIC,           -- 可供股东分配的利润
  prfshare_payable_dvd NUMERIC,           -- 应付优先股股利
  comshare_payable_dvd NUMERIC,           -- 应付普通股股利
  capit_comstock_div   NUMERIC,           -- 转作股本的普通股股利
  net_after_nr_lp_correct NUMERIC,        -- 扣除非经常性损益后的净利润（更正前）
  credit_impa_loss     NUMERIC,           -- 信用减值损失
  net_expo_hedging_benefits NUMERIC,      -- 净敞口套期收益
  oth_impair_loss_assets NUMERIC,         -- 其他资产减值损失
  total_opcost         NUMERIC,           -- 营业总成本（二）
  amodcost_fin_assets  NUMERIC,           -- 以摊余成本计量的金融资产终止确认收益
  oth_income           NUMERIC,           -- 其他收益
  asset_disp_income    NUMERIC,           -- 资产处置收益
  continued_net_profit NUMERIC,           -- 持续经营净利润
  end_net_profit       NUMERIC,           -- 终止经营净利润
  update_flag          TEXT,              -- 更新标识
  PRIMARY KEY (ts_code, end_date, report_type)
);

CREATE INDEX IF NOT EXISTS idx_stock_income_date ON stock_income(end_date);
CREATE INDEX IF NOT EXISTS idx_stock_income_code ON stock_income(ts_code);

-- ============================================================
-- 3. stock_balance — 资产负债表（152字段，全存）
--    来源: Tushare balancesheet / balancesheet_vip 接口
--    更新: 每季度
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_balance (
  ts_code                    TEXT    NOT NULL,
  ann_date                   TEXT,
  f_ann_date                 TEXT,
  end_date                   TEXT    NOT NULL,
  report_type                TEXT    NOT NULL,
  comp_type                  TEXT,
  end_type                   TEXT,
  total_share                NUMERIC,   -- 期末总股本
  cap_rese                   NUMERIC,   -- 资本公积金
  undistr_porfit             NUMERIC,   -- 未分配利润
  surplus_rese               NUMERIC,   -- 盈余公积金
  special_rese               NUMERIC,   -- 专项储备
  money_cap                  NUMERIC,   -- 货币资金
  trad_asset                 NUMERIC,   -- 交易性金融资产
  notes_receiv               NUMERIC,   -- 应收票据
  accounts_receiv            NUMERIC,   -- 应收账款
  oth_receiv                 NUMERIC,   -- 其他应收款
  prepayment                 NUMERIC,   -- 预付款项
  div_receiv                 NUMERIC,   -- 应收股利
  int_receiv                 NUMERIC,   -- 应收利息
  inventories                NUMERIC,   -- 存货
  amor_exp                   NUMERIC,   -- 长期待摊费用
  nca_within_1y              NUMERIC,   -- 一年内到期的非流动资产
  sett_rsrv                  NUMERIC,   -- 结算备付金
  loanto_oth_bank_fi         NUMERIC,   -- 拆出资金
  premium_receiv             NUMERIC,   -- 应收保费
  reinsur_receiv             NUMERIC,   -- 应收分保账款
  reinsur_res_receiv         NUMERIC,   -- 应收分保合同准备金
  pur_resale_fa              NUMERIC,   -- 买入返售金融资产
  oth_cur_assets             NUMERIC,   -- 其他流动资产
  total_cur_assets           NUMERIC,   -- 流动资产合计
  fa_avail_for_sale          NUMERIC,   -- 可供出售金融资产
  htm_invest                 NUMERIC,   -- 持有至到期投资
  lt_eqt_invest              NUMERIC,   -- 长期股权投资
  invest_real_estate         NUMERIC,   -- 投资性房地产
  time_deposits              NUMERIC,   -- 定期存款
  oth_assets                 NUMERIC,   -- 其他资产
  lt_rec                     NUMERIC,   -- 长期应收款
  fix_assets                 NUMERIC,   -- 固定资产
  cip                        NUMERIC,   -- 在建工程
  const_materials            NUMERIC,   -- 工程物资
  fixed_assets_disp          NUMERIC,   -- 固定资产清理
  produc_bio_assets          NUMERIC,   -- 生产性生物资产
  oil_and_gas_assets         NUMERIC,   -- 油气资产
  intan_assets               NUMERIC,   -- 无形资产
  r_and_d                    NUMERIC,   -- 开发支出
  goodwill                   NUMERIC,   -- 商誉
  lt_amor_exp                NUMERIC,   -- 长期待摊费用
  defer_tax_assets           NUMERIC,   -- 递延所得税资产
  decr_in_disbur             NUMERIC,   -- 发放贷款及垫款
  oth_nca                    NUMERIC,   -- 其他非流动资产
  total_nca                  NUMERIC,   -- 非流动资产合计
  cash_reser_cb              NUMERIC,   -- 现金及存放中央银行款项
  depos_in_oth_bfi           NUMERIC,   -- 存放同业和其它金融机构款项
  prec_metals                NUMERIC,   -- 贵金属
  deriv_assets               NUMERIC,   -- 衍生金融资产
  rr_reins_une_prem          NUMERIC,   -- 应收分保未到期责任准备金
  rr_reins_outstd_cla        NUMERIC,   -- 应收分保未决赔款准备金
  rr_reins_lins_liab         NUMERIC,   -- 应收分保寿险责任准备金
  rr_reins_lthins_liab       NUMERIC,   -- 应收分保长期健康险责任准备金
  refund_depos               NUMERIC,   -- 存出保证金
  ph_pledge_loans            NUMERIC,   -- 保户质押贷款
  refund_cap_depos           NUMERIC,   -- 存出资本保证金
  indep_acct_assets          NUMERIC,   -- 独立账户资产
  client_depos               NUMERIC,   -- 其中:客户资金存款
  client_prov                NUMERIC,   -- 其中:客户备付金
  transac_seat_fee           NUMERIC,   -- 其中:交易席位费
  invest_as_receiv           NUMERIC,   -- 应收款项类投资
  total_assets               NUMERIC,   -- 资产总计
  lt_borr                    NUMERIC,   -- 长期借款
  st_borr                    NUMERIC,   -- 短期借款
  cb_borr                    NUMERIC,   -- 向中央银行借款
  depos_ib_deposits          NUMERIC,   -- 吸收存款及同业存放
  loan_oth_bank              NUMERIC,   -- 拆入资金
  trading_fl                 NUMERIC,   -- 交易性金融负债
  notes_payable              NUMERIC,   -- 应付票据
  acct_payable               NUMERIC,   -- 应付账款
  adv_receipts               NUMERIC,   -- 预收款项
  sold_for_repur_fa          NUMERIC,   -- 卖出回购金融资产款
  comm_payable               NUMERIC,   -- 应付手续费及佣金
  payroll_payable            NUMERIC,   -- 应付职工薪酬
  taxes_payable              NUMERIC,   -- 应交税费
  int_payable                NUMERIC,   -- 应付利息
  div_payable                NUMERIC,   -- 应付股利
  oth_payable                NUMERIC,   -- 其他应付款
  acc_exp                    NUMERIC,   -- 预提费用
  deferred_inc               NUMERIC,   -- 递延收益
  st_bonds_payable           NUMERIC,   -- 应付短期债券
  payable_to_reinsurer       NUMERIC,   -- 应付分保账款
  rsrv_insur_cont            NUMERIC,   -- 保险合同准备金
  acting_trading_sec         NUMERIC,   -- 代理买卖证券款
  acting_uw_sec              NUMERIC,   -- 代理承销证券款
  non_cur_liab_due_1y        NUMERIC,   -- 一年内到期的非流动负债
  oth_cur_liab               NUMERIC,   -- 其他流动负债
  total_cur_liab             NUMERIC,   -- 流动负债合计
  bond_payable               NUMERIC,   -- 应付债券
  lt_payable                 NUMERIC,   -- 长期应付款
  specific_payables          NUMERIC,   -- 专项应付款
  estimated_liab             NUMERIC,   -- 预计负债
  defer_tax_liab             NUMERIC,   -- 递延所得税负债
  defer_inc_non_cur_liab     NUMERIC,   -- 递延收益-非流动负债
  oth_ncl                    NUMERIC,   -- 其他非流动负债
  total_ncl                  NUMERIC,   -- 非流动负债合计
  depos_oth_bfi              NUMERIC,   -- 同业和其它金融机构存放款项
  deriv_liab                 NUMERIC,   -- 衍生金融负债
  depos                      NUMERIC,   -- 吸收存款
  agency_bus_liab            NUMERIC,   -- 代理业务负债
  oth_liab                   NUMERIC,   -- 其他负债
  prem_receiv_adva           NUMERIC,   -- 预收保费
  depos_received             NUMERIC,   -- 存入保证金
  ph_invest                  NUMERIC,   -- 保户储金及投资款
  reser_une_prem             NUMERIC,   -- 未到期责任准备金
  reser_outstd_claims        NUMERIC,   -- 未决赔款准备金
  reser_lins_liab            NUMERIC,   -- 寿险责任准备金
  reser_lthins_liab          NUMERIC,   -- 长期健康险责任准备金
  indep_acct_liab            NUMERIC,   -- 独立账户负债
  pledge_borr                NUMERIC,   -- 其中:质押借款
  indem_payable              NUMERIC,   -- 应付赔付款
  policy_div_payable         NUMERIC,   -- 应付保单红利
  total_liab                 NUMERIC,   -- 负债合计
  treasury_share             NUMERIC,   -- 减:库存股
  ordin_risk_reser           NUMERIC,   -- 一般风险准备
  forex_differ               NUMERIC,   -- 外币报表折算差额
  invest_loss_unconf         NUMERIC,   -- 未确认的投资损失
  minority_int               NUMERIC,   -- 少数股东权益
  total_hldr_eqy_inc_min_int NUMERIC,   -- 股东权益合计(含少数股东权益)
  total_hldr_eqy_exc_min_int NUMERIC,   -- 归母股东权益
  total_liab_hldr_eqy        NUMERIC,   -- 负债及股东权益总计
  lt_payroll_payable         NUMERIC,   -- 长期应付职工薪酬
  oth_comp_income            NUMERIC,   -- 其他综合收益
  oth_eqt_tools              NUMERIC,   -- 其他权益工具
  oth_eqt_tools_p_shr        NUMERIC,   -- 其中:优先股
  lending_funds              NUMERIC,   -- 放出贷款及垫款
  acc_receivable             NUMERIC,   -- 应收款项
  st_fin_payable             NUMERIC,   -- 应付短期融资款
  payables                   NUMERIC,   -- 应付款项
  hfs_assets                 NUMERIC,   -- 持有待售的资产
  hfs_sales                  NUMERIC,   -- 持有待售的负债
  cost_fin_assets            NUMERIC,   -- 以摊余成本计量的金融资产
  fair_value_fin_assets      NUMERIC,   -- 以公允价值计量且其变动计入其他综合收益的金融资产
  cip_total                  NUMERIC,   -- 在建工程(合计)(元)
  oth_pay_total              NUMERIC,   -- 其他应付款(合计)(元)
  long_pay_total             NUMERIC,   -- 长期应付款(合计)(元)
  debt_invest                NUMERIC,   -- 债权投资(元)
  oth_debt_invest            NUMERIC,   -- 其他债权投资(元)
  oth_eq_invest              NUMERIC,   -- 其他权益工具投资(元)
  oth_illiq_fin_assets       NUMERIC,   -- 其他非流动金融资产(元)
  oth_eq_ppbond              NUMERIC,   -- 其他权益工具:永续债(元)
  receiv_financing           NUMERIC,   -- 应收款项融资
  use_right_assets           NUMERIC,   -- 使用权资产
  lease_liab                 NUMERIC,   -- 租赁负债
  contract_assets            NUMERIC,   -- 合同资产
  contract_liab              NUMERIC,   -- 合同负债
  accounts_receiv_bill       NUMERIC,   -- 应收票据及应收账款
  accounts_pay               NUMERIC,   -- 应付票据及应付账款
  oth_rcv_total              NUMERIC,   -- 其他应收款(合计)
  fix_assets_total           NUMERIC,   -- 固定资产(合计)
  update_flag                TEXT,
  PRIMARY KEY (ts_code, end_date, report_type)
);

CREATE INDEX IF NOT EXISTS idx_stock_balance_date ON stock_balance(end_date);
CREATE INDEX IF NOT EXISTS idx_stock_balance_code ON stock_balance(ts_code);

-- ============================================================
-- 4. stock_cashflow — 现金流量表（97字段，全存）
--    来源: Tushare cashflow / cashflow_vip 接口
--    更新: 每季度
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_cashflow (
  ts_code                  TEXT    NOT NULL,
  ann_date                 TEXT,
  f_ann_date               TEXT,
  end_date                 TEXT    NOT NULL,
  report_type              TEXT    NOT NULL,
  comp_type                TEXT,
  end_type                 TEXT,
  net_profit               NUMERIC,   -- 净利润
  finan_exp                NUMERIC,   -- 财务费用
  c_fr_sale_sg             NUMERIC,   -- 销售商品、提供劳务收到的现金
  recp_tax_rends           NUMERIC,   -- 收到的税费返还
  n_depos_incr_fi          NUMERIC,   -- 客户存款和同业存放款项净增加额
  n_incr_loans_cb          NUMERIC,   -- 向中央银行借款净增加额
  n_inc_borr_oth_fi        NUMERIC,   -- 向其他金融机构拆入资金净增加额
  prem_fr_orig_contr       NUMERIC,   -- 收到原保险合同保费取得的现金
  n_incr_insured_dep       NUMERIC,   -- 保户储金净增加额
  n_reinsur_prem           NUMERIC,   -- 收到再保业务现金净额
  n_incr_disp_tfa          NUMERIC,   -- 处置交易性金融资产净增加额
  ifc_cash_incr            NUMERIC,   -- 收取利息和手续费净增加额
  n_incr_disp_faas         NUMERIC,   -- 处置可供出售金融资产净增加额
  n_incr_loans_oth_bank    NUMERIC,   -- 拆入资金净增加额
  n_cap_incr_repur         NUMERIC,   -- 回购业务资金净增加额
  c_fr_oth_operate_a       NUMERIC,   -- 收到其他与经营活动有关的现金
  c_inf_fr_operate_a       NUMERIC,   -- 经营活动现金流入小计
  c_paid_goods_s           NUMERIC,   -- 购买商品、接受劳务支付的现金
  c_paid_to_for_empl       NUMERIC,   -- 支付给职工以及为职工支付的现金
  c_paid_for_taxes         NUMERIC,   -- 支付的各项税费
  n_incr_clt_loan_adv      NUMERIC,   -- 客户贷款及垫款净增加额
  n_incr_dep_cbob          NUMERIC,   -- 存放央行和同业款项净增加额
  c_pay_claims_orig_inco   NUMERIC,   -- 支付原保险合同赔付款项的现金
  pay_handling_chrg        NUMERIC,   -- 支付手续费及佣金的现金
  pay_comm_insur_plcy      NUMERIC,   -- 支付保单红利的现金
  oth_cash_pay_oper_act    NUMERIC,   -- 支付其他与经营活动有关的现金
  st_cash_out_act          NUMERIC,   -- 经营活动现金流出小计
  n_cashflow_act           NUMERIC,   -- 经营活动产生的现金流量净额
  oth_recp_ral_inv_act     NUMERIC,   -- 收到其他与投资活动有关的现金
  c_disp_withdrwl_invest   NUMERIC,   -- 收回投资收到的现金
  c_recp_return_invest     NUMERIC,   -- 取得投资收益收到的现金
  n_recp_disp_fiolta       NUMERIC,   -- 处置固定资产、无形资产和其他长期资产收回的现金净额
  n_recp_disp_sobu         NUMERIC,   -- 处置子公司及其他营业单位收到的现金净额
  stot_inflows_inv_act     NUMERIC,   -- 投资活动现金流入小计
  c_pay_acq_const_fiolta   NUMERIC,   -- 购建固定资产、无形资产和其他长期资产支付的现金
  c_paid_invest            NUMERIC,   -- 投资支付的现金
  n_disp_subs_oth_biz      NUMERIC,   -- 取得子公司及其他营业单位支付的现金净额
  oth_pay_ral_inv_act      NUMERIC,   -- 支付其他与投资活动有关的现金
  n_incr_pledge_loan       NUMERIC,   -- 质押贷款净增加额
  stot_out_inv_act         NUMERIC,   -- 投资活动现金流出小计
  n_cashflow_inv_act       NUMERIC,   -- 投资活动产生的现金流量净额
  c_recp_borrow            NUMERIC,   -- 取得借款收到的现金
  proc_issue_bonds         NUMERIC,   -- 发行债券收到的现金
  oth_cash_recp_ral_fnc_act NUMERIC,  -- 收到其他与筹资活动有关的现金
  stot_cash_in_fnc_act     NUMERIC,   -- 筹资活动现金流入小计
  free_cashflow            NUMERIC,   -- 企业自由现金流量
  c_prepay_amt_borr        NUMERIC,   -- 偿还债务支付的现金
  c_pay_dist_dpcp_int_exp  NUMERIC,   -- 分配股利、利润或偿付利息支付的现金
  incl_dvd_profit_paid_sc_ms NUMERIC, -- 其中:子公司支付给少数股东的股利、利润
  oth_cashpay_ral_fnc_act  NUMERIC,   -- 支付其他与筹资活动有关的现金
  stot_cashout_fnc_act     NUMERIC,   -- 筹资活动现金流出小计
  n_cash_flows_fnc_act     NUMERIC,   -- 筹资活动产生的现金流量净额
  eff_fx_flu_cash          NUMERIC,   -- 汇率变动对现金的影响
  n_incr_cash_cash_equ     NUMERIC,   -- 现金及现金等价物净增加额
  c_cash_equ_beg_period    NUMERIC,   -- 期初现金及现金等价物余额
  c_cash_equ_end_period    NUMERIC,   -- 期末现金及现金等价物余额
  c_recp_cap_contrib       NUMERIC,   -- 吸收投资收到的现金
  incl_cash_rec_saims      NUMERIC,   -- 其中:子公司吸收少数股东投资收到的现金
  uncon_invest_loss        NUMERIC,   -- 未确认投资损失
  prov_depr_assets         NUMERIC,   -- 加:资产减值准备
  depr_fa_coga_dpba        NUMERIC,   -- 固定资产折旧、油气资产折耗、生产性生物资产折旧
  amort_intang_assets      NUMERIC,   -- 无形资产摊销
  lt_amort_deferred_exp    NUMERIC,   -- 长期待摊费用摊销
  decr_deferred_exp        NUMERIC,   -- 待摊费用减少
  incr_acc_exp             NUMERIC,   -- 预提费用增加
  loss_disp_fiolta         NUMERIC,   -- 处置固定、无形资产和其他长期资产的损失
  loss_scr_fa              NUMERIC,   -- 固定资产报废损失
  loss_fv_chg              NUMERIC,   -- 公允价值变动损失
  invest_loss              NUMERIC,   -- 投资损失
  decr_def_inc_tax_assets  NUMERIC,   -- 递延所得税资产减少
  incr_def_inc_tax_liab    NUMERIC,   -- 递延所得税负债增加
  decr_inventories         NUMERIC,   -- 存货的减少
  decr_oper_payable        NUMERIC,   -- 经营性应收项目的减少
  incr_oper_payable        NUMERIC,   -- 经营性应付项目的增加
  others                   NUMERIC,   -- 其他
  im_net_cashflow_oper_act NUMERIC,   -- 经营活动产生的现金流量净额(间接法)
  conv_debt_into_cap       NUMERIC,   -- 债务转为资本
  conv_copbonds_due_within_1y NUMERIC,-- 一年内到期的可转换公司债券
  fa_fnc_leases            NUMERIC,   -- 融资租入固定资产
  im_n_incr_cash_equ       NUMERIC,   -- 现金及现金等价物净增加额(间接法)
  net_dism_capital_add     NUMERIC,   -- 拆出资金净增加额
  net_cash_rece_sec        NUMERIC,   -- 代理买卖证券收到的现金净额
  credit_impa_loss         NUMERIC,   -- 信用减值损失
  use_right_asset_dep      NUMERIC,   -- 使用权资产折旧
  oth_loss_asset           NUMERIC,   -- 其他资产减值损失
  end_bal_cash             NUMERIC,   -- 现金的期末余额
  beg_bal_cash             NUMERIC,   -- 现金的期初余额
  end_bal_cash_equ         NUMERIC,   -- 现金等价物的期末余额
  beg_bal_cash_equ         NUMERIC,   -- 现金等价物的期初余额
  update_flag              TEXT,
  PRIMARY KEY (ts_code, end_date, report_type)
);

CREATE INDEX IF NOT EXISTS idx_stock_cashflow_date ON stock_cashflow(end_date);
CREATE INDEX IF NOT EXISTS idx_stock_cashflow_code ON stock_cashflow(ts_code);

-- ============================================================
-- 5. stock_fina_indicator — 财务指标（108字段，全存）
--    来源: Tushare fina_indicator / fina_indicator_vip 接口
--    更新: 每季度
--    含 TTM/单季/同比 等预计算指标
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_fina_indicator (
  ts_code                  TEXT    NOT NULL,
  ann_date                 TEXT,
  end_date                 TEXT    NOT NULL,
  eps                      NUMERIC,   -- 基本每股收益
  dt_eps                   NUMERIC,   -- 稀释每股收益
  total_revenue_ps         NUMERIC,   -- 每股营业总收入
  revenue_ps               NUMERIC,   -- 每股营业收入
  capital_rese_ps          NUMERIC,   -- 每股资本公积
  surplus_rese_ps          NUMERIC,   -- 每股盈余公积
  undist_profit_ps         NUMERIC,   -- 每股未分配利润
  extra_item               NUMERIC,   -- 非经常性损益
  profit_dedt              NUMERIC,   -- 扣除非经常性损益后的净利润
  gross_margin             NUMERIC,   -- 毛利
  current_ratio            NUMERIC,   -- 流动比率
  quick_ratio              NUMERIC,   -- 速动比率
  cash_ratio               NUMERIC,   -- 现金比率
  ar_turn                  NUMERIC,   -- 应收账款周转率
  ca_turn                  NUMERIC,   -- 流动资产周转率
  fa_turn                  NUMERIC,   -- 固定资产周转率
  assets_turn              NUMERIC,   -- 总资产周转率
  op_income                NUMERIC,   -- 经营活动净收益
  ebit                     NUMERIC,   -- 息税前利润
  ebitda                   NUMERIC,   -- 息税折旧摊销前利润
  fcff                     NUMERIC,   -- 企业自由现金流量
  fcfe                     NUMERIC,   -- 股权自由现金流量
  current_exint            NUMERIC,   -- 无息流动负债
  noncurrent_exint         NUMERIC,   -- 无息非流动负债
  interestdebt             NUMERIC,   -- 带息债务
  netdebt                  NUMERIC,   -- 净债务
  tangible_asset           NUMERIC,   -- 有形资产
  working_capital          NUMERIC,   -- 营运资金
  networking_capital       NUMERIC,   -- 营运流动资金
  invest_capital           NUMERIC,   -- 全部投入资本
  retained_earnings        NUMERIC,   -- 留存收益
  diluted2_eps             NUMERIC,   -- 期末摊薄每股收益
  bps                      NUMERIC,   -- 每股净资产
  ocfps                    NUMERIC,   -- 每股经营活动产生的现金流量净额
  retainedps               NUMERIC,   -- 每股留存收益
  cfps                     NUMERIC,   -- 每股现金流量净额
  ebit_ps                  NUMERIC,   -- 每股息税前利润
  fcff_ps                  NUMERIC,   -- 每股企业自由现金流量
  fcfe_ps                  NUMERIC,   -- 每股股权自由现金流量
  netprofit_margin         NUMERIC,   -- 销售净利率(%)
  grossprofit_margin       NUMERIC,   -- 销售毛利率(%)
  cogs_of_sales            NUMERIC,   -- 销售成本率
  expense_of_sales         NUMERIC,   -- 销售期间费用率
  profit_to_gr             NUMERIC,   -- 净利润/营业总收入
  saleexp_to_gr            NUMERIC,   -- 销售费用/营业总收入
  adminexp_of_gr           NUMERIC,   -- 管理费用/营业总收入
  finaexp_of_gr            NUMERIC,   -- 财务费用/营业总收入
  impai_ttm                NUMERIC,   -- 资产减值损失/营业总收入
  gc_of_gr                 NUMERIC,   -- 营业总成本/营业总收入
  op_of_gr                 NUMERIC,   -- 营业利润/营业总收入
  ebit_of_gr               NUMERIC,   -- 息税前利润/营业总收入
  roe                      NUMERIC,   -- 净资产收益率(%)
  roe_waa                  NUMERIC,   -- 加权平均净资产收益率
  roe_dt                   NUMERIC,   -- 扣除非经常损益后的净资产收益率
  roa                      NUMERIC,   -- 总资产报酬率
  npta                     NUMERIC,   -- 总资产净利润
  roic                     NUMERIC,   -- 投入资本回报率
  roe_yearly               NUMERIC,   -- 年化净资产收益率
  roa2_yearly              NUMERIC,   -- 年化总资产报酬率
  debt_to_assets           NUMERIC,   -- 资产负债率(%)
  assets_to_eqt            NUMERIC,   -- 权益乘数
  dp_assets_to_eqt         NUMERIC,   -- 权益乘数(杜邦分析)
  ca_to_assets             NUMERIC,   -- 流动资产/总资产
  nca_to_assets            NUMERIC,   -- 非流动资产/总资产
  tbassets_to_totalassets  NUMERIC,   -- 有形资产/总资产
  int_to_talcap            NUMERIC,   -- 带息债务/全部投入资本
  eqt_to_talcapital        NUMERIC,   -- 归属于母公司的股东权益/全部投入资本
  currentdebt_to_debt      NUMERIC,   -- 流动负债/负债合计
  longdeb_to_debt          NUMERIC,   -- 非流动负债/负债合计
  ocf_to_shortdebt         NUMERIC,   -- 经营活动产生的现金流量净额/流动负债
  debt_to_eqt              NUMERIC,   -- 产权比率
  eqt_to_debt              NUMERIC,   -- 归属于母公司的股东权益/负债合计
  eqt_to_interestdebt      NUMERIC,   -- 归属于母公司的股东权益/带息债务
  tangibleasset_to_debt    NUMERIC,   -- 有形资产/负债合计
  tangasset_to_intdebt     NUMERIC,   -- 有形资产/带息债务
  tangibleasset_to_netdebt NUMERIC,   -- 有形资产/净债务
  ocf_to_debt              NUMERIC,   -- 经营活动产生的现金流量净额/负债合计
  turn_days                NUMERIC,   -- 营业周期
  roa_yearly               NUMERIC,   -- 年化总资产净利率
  roa_dp                   NUMERIC,   -- 总资产净利率(杜邦分析)
  fixed_assets             NUMERIC,   -- 固定资产合计
  profit_to_op             NUMERIC,   -- 利润总额/营业收入
  q_saleexp_to_gr          NUMERIC,   -- 销售费用/营业总收入(单季)
  q_gc_to_gr               NUMERIC,   -- 营业总成本/营业总收入(单季)
  q_roe                    NUMERIC,   -- 净资产收益率(单季)
  q_dt_roe                 NUMERIC,   -- 扣非净资产收益率(单季)
  q_npta                   NUMERIC,   -- 总资产净利润(单季)
  q_ocf_to_sales           NUMERIC,   -- 经营活动产生的现金流量净额/营业收入(单季)
  basic_eps_yoy            NUMERIC,   -- 基本每股收益同比增长率(%)
  dt_eps_yoy               NUMERIC,   -- 稀释每股收益同比增长率(%)
  cfps_yoy                 NUMERIC,   -- 每股现金流量净额同比增长率(%)
  op_yoy                   NUMERIC,   -- 营业利润同比增长率(%)
  ebt_yoy                  NUMERIC,   -- 利润总额同比增长率(%)
  netprofit_yoy            NUMERIC,   -- 归属母公司股东的净利润同比增长率(%)
  dt_netprofit_yoy         NUMERIC,   -- 归属母公司股东的净利润-扣非同比增长率(%)
  ocf_yoy                  NUMERIC,   -- 经营活动产生的现金流量净额同比增长率(%)
  roe_yoy                  NUMERIC,   -- 净资产收益率(摊薄)同比增长率(%)
  bps_yoy                  NUMERIC,   -- 每股净资产相对年初增长率(%)
  assets_yoy               NUMERIC,   -- 资产总计相对年初增长率(%)
  eqt_yoy                  NUMERIC,   -- 归属母公司的股东权益相对年初增长率(%)
  tr_yoy                   NUMERIC,   -- 营业总收入同比增长率(%)
  or_yoy                   NUMERIC,   -- 营业收入同比增长率(%)
  q_sales_yoy              NUMERIC,   -- 营业收入同比增长率(单季)
  q_op_qoq                 NUMERIC,   -- 营业利润环比增长率(单季)(%)
  equity_yoy               NUMERIC,   -- 净资产同比增长率
  PRIMARY KEY (ts_code, end_date)
);

CREATE INDEX IF NOT EXISTS idx_stock_fina_ind_date ON stock_fina_indicator(end_date);
CREATE INDEX IF NOT EXISTS idx_stock_fina_ind_code ON stock_fina_indicator(ts_code);

-- ============================================================
-- 6. stock_moneyflow — 个股资金流向
--    来源: Tushare moneyflow_dc / moneyflow_ths 接口
--    更新: 每交易日
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_moneyflow (
  ts_code          TEXT    NOT NULL,
  trade_date       DATE    NOT NULL,
  source           TEXT    NOT NULL,   -- 'dc' 东方财富 / 'ths' 同花顺
  net_amount       NUMERIC,            -- 主力净流入额（万元）
  net_amount_rate  NUMERIC,            -- 主力净流入净占比(%)
  buy_elg_amount   NUMERIC,            -- 超大单净流入额（万元）
  buy_elg_rate     NUMERIC,            -- 超大单净流入净占比(%)
  buy_lg_amount    NUMERIC,            -- 大单净流入额（万元）
  buy_lg_rate      NUMERIC,            -- 大单净流入净占比(%)
  buy_md_amount    NUMERIC,            -- 中单净流入额（万元）
  buy_md_rate      NUMERIC,            -- 中单净流入净占比(%)
  buy_sm_amount    NUMERIC,            -- 小单净流入额（万元）
  buy_sm_rate      NUMERIC,            -- 小单净流入净占比(%)
  PRIMARY KEY (ts_code, trade_date, source)
);

CREATE INDEX IF NOT EXISTS idx_stock_moneyflow_date ON stock_moneyflow(trade_date);
CREATE INDEX IF NOT EXISTS idx_stock_moneyflow_code ON stock_moneyflow(ts_code);

-- ============================================================
-- 7. stock_holders — 前十大股东/流通股东
--    来源: Tushare top10_holders / top10_floatholders 接口
--    更新: 每季度
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_holders (
  ts_code          TEXT    NOT NULL,
  ann_date         TEXT,
  end_date         TEXT    NOT NULL,
  holder_type      TEXT    NOT NULL,   -- 'top10' 全部股东 / 'top10_float' 流通股东
  rank             INT     NOT NULL,   -- 排名 1-10
  holder_name      TEXT,
  hold_amount      NUMERIC,            -- 持有数量（股）
  hold_ratio       NUMERIC,            -- 占总股本比例(%)
  hold_float_ratio NUMERIC,            -- 占流通股比例(%)
  hold_change      NUMERIC,            -- 持股变动
  holder_type_desc TEXT,               -- 股东类型描述
  PRIMARY KEY (ts_code, end_date, holder_type, rank)
);

CREATE INDEX IF NOT EXISTS idx_stock_holders_code ON stock_holders(ts_code);

-- ============================================================
-- 8. stock_pledge — 股权质押统计
--    来源: Tushare pledge_stat 接口
--    更新: 不定期
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_pledge (
  ts_code          TEXT    NOT NULL,
  end_date         TEXT    NOT NULL,
  pledge_count     INT,                -- 质押次数
  unrest_pledge    NUMERIC,            -- 无限售股质押数量（万股）
  rest_pledge      NUMERIC,            -- 限售股质押数量（万股）
  total_share      NUMERIC,            -- 总股本（万股）
  pledge_ratio     NUMERIC,            -- 质押比例(%)
  PRIMARY KEY (ts_code, end_date)
);

-- ============================================================
-- 9. stock_holder_trade — 股东增减持
--    来源: Tushare stk_holdertrade 接口
--    更新: 不定期
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_holder_trade (
  ts_code          TEXT    NOT NULL,
  ann_date         TEXT    NOT NULL,
  holder_name      TEXT,
  holder_type      TEXT,               -- 股东类型
  in_de            TEXT,               -- IN增持 DE减持
  change_vol       NUMERIC,            -- 变动数量（股）
  change_ratio     NUMERIC,            -- 占总股本比例(%)
  after_share      NUMERIC,            -- 变动后持股数（股）
  after_ratio      NUMERIC,            -- 变动后持股比例(%)
  avg_price        NUMERIC,            -- 成交均价
  total_share      NUMERIC,            -- 持股总数（股）
  PRIMARY KEY (ts_code, ann_date, holder_name)
);

CREATE INDEX IF NOT EXISTS idx_stock_holder_trade_code ON stock_holder_trade(ts_code);

-- ============================================================
-- 完成提示
-- ============================================================
-- 建表完成后，请在 stock_daily 表补充以下字段（如尚未添加）：
-- ALTER TABLE stock_daily ADD COLUMN IF NOT EXISTS pre_close NUMERIC;
-- ALTER TABLE stock_daily ADD COLUMN IF NOT EXISTS change_val NUMERIC;
-- ALTER TABLE stock_daily ADD COLUMN IF NOT EXISTS pct_chg NUMERIC;
-- （注：pct_chg 字段名与 daily_basic 中的 pe_ttm 等区分，stock_daily 用 pct_chg，stock_daily_basic 用 pe_ttm 等）
