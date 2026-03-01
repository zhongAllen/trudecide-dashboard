"""
个股财务三表历史数据采集脚本（REQ-056）
=====================================
用途：采集全市场个股财务报告（利润表/资产负债表/现金流量表），写入对应三张表
      - stock_income     利润表（85 字段，全字段存储）
      - stock_balance    资产负债表（152 字段，全字段存储）
      - stock_cashflow   现金流量表（97 字段，全字段存储）
数据来源：Tushare Pro API
      - income_vip / balancesheet_vip / cashflow_vip
执行方式：
  python3 collect_stock_financial.py [--table income|balance|cashflow|all]
                                     [--start YYYYMMDD] [--end YYYYMMDD]
                                     [--ts-code 000001.SZ]
                                     [--dry-run]
  --table    采集哪张表，默认 all（三张全采）
  --start    报告期起始（YYYYMMDD），默认 20150101
  --end      报告期结束（YYYYMMDD），默认今日
  --ts-code  只采集指定股票（调试用）
  --dry-run  只打印，不写库
注意事项：
  1. 财务三表按股票代码逐只采集，5500 只股票 × 3 张表，总量大，需断点续传
  2. 断点续传文件：/tmp/financial_{table}_checkpoint.txt（记录已完成的 ts_code）
  3. income_vip/balancesheet_vip/cashflow_vip 需要 5000 积分以上
  4. 字段全存（与 Wind 设计一致），不做字段筛选
  5. report_type='1' 表示合并报表（最常用），report_type='4' 表示合并调整
  6. 主键：(ts_code, ann_date, f_ann_date, end_date, report_type, comp_type)
     → 用 (ts_code, end_date, report_type) 作为 upsert 冲突键
"""
import os
import sys
import time
import argparse
from datetime import datetime, date, timezone
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN  = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL   = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY   = os.environ.get("SUPABASE_SERVICE_KEY", "")

DEFAULT_START  = "20150101"
BATCH_SIZE     = 500
API_SLEEP      = 0.2   # 财务接口间隔（多进程并行时适当降低）

# 三张表的配置：接口名、表名、upsert 冲突键、合法列名集合
# 注意：Tushare 接口可能返回表中不存在的新字段，必须过滤后再写入避免 PGRST204 错误
TABLE_CONFIG = {
    'income': {
        'api':      'income_vip',
        'table':    'stock_income',
        'conflict': ['ts_code', 'end_date', 'report_type'],
        'columns':  {'ts_code','ann_date','f_ann_date','end_date','report_type','comp_type','end_type',
                     'basic_eps','diluted_eps','total_revenue','revenue','int_income','prem_earned',
                     'comm_income','n_commis_income','n_oth_income','n_oth_b_income','prem_income',
                     'out_prem','une_prem_reser','reins_income','n_sec_tb_income','n_sec_uw_income',
                     'n_asset_mg_income','oth_b_income','fv_value_chg_gain','invest_income',
                     'ass_invest_income','forex_gain','total_cogs','oper_cost','int_exp','comm_exp',
                     'biz_tax_surchg','sell_exp','admin_exp','fin_exp','assets_impair_loss',
                     'prem_refund','compens_payout','reser_insur_liab','div_payt','reins_exp',
                     'oper_exp','compens_payout_refu','insur_reser_refu','reins_cost_refund',
                     'other_bus_cost','operate_profit','non_oper_income','non_oper_exp',
                     'nca_disploss','total_profit','income_tax','n_income','n_income_attr_p',
                     'minority_gain','oth_compr_income','t_compr_income','compr_inc_attr_p',
                     'compr_inc_attr_m_s','ebit','ebitda','insurance_exp','undist_profit',
                     'distable_profit','rd_exp','fin_exp_int_exp','fin_exp_int_income',
                     'transfer_surplus_rese','transfer_housing_imprest','transfer_oth',
                     'adj_lossgain','withdra_legal_surplus','withdra_legal_pubfund',
                     'withdra_mgt_bonus','withdra_rese_fund','withdra_oth_ersu',
                     'workers_welfare','distr_profit_shrhder','prfshare_payable_dvd',
                     'comshare_payable_dvd','capit_comstock_div','net_after_nr_lp_correct',
                     'credit_impa_loss','net_expo_hedging_benefits','oth_impair_loss_assets',
                     'total_opcost','amodcost_fin_assets','oth_income','asset_disp_income',
                     'continued_net_profit','end_net_profit','update_flag'},
    },
    'balance': {
        'api':      'balancesheet_vip',
        'table':    'stock_balance',
        'conflict': ['ts_code', 'end_date', 'report_type'],
        'columns':  {'ts_code','ann_date','f_ann_date','end_date','report_type','comp_type','end_type',
                     'total_share','cap_rese','undistr_porfit','surplus_rese','special_rese',
                     'money_cap','trad_asset','notes_receiv','accounts_receiv','oth_receiv',
                     'prepayment','div_receiv','int_receiv','inventories','amor_exp','nca_within_1y',
                     'sett_rsrv','loanto_oth_bank_fi','premium_receiv','reinsur_receiv',
                     'reinsur_res_receiv','pur_resale_fa','oth_cur_assets','total_cur_assets',
                     'fa_avail_for_sale','htm_invest','lt_eqt_invest','invest_real_estate',
                     'time_deposits','oth_assets','lt_rec','fix_assets','cip','const_materials',
                     'fixed_assets_disp','produc_bio_assets','oil_and_gas_assets','intan_assets',
                     'r_and_d','goodwill','lt_amor_exp','defer_tax_assets','decr_in_disbur',
                     'oth_nca','total_nca','cash_reser_cb','depos_in_oth_bfi','prec_metals',
                     'deriv_assets','rr_reins_une_prem','rr_reins_outstd_cla','rr_reins_lins_liab',
                     'rr_reins_lthins_liab','refund_depos','ph_pledge_loans','refund_cap_depos',
                     'indep_acct_assets','client_depos','client_prov','transac_seat_fee',
                     'invest_as_receiv','total_assets','lt_borr','st_borr','cb_borr',
                     'depos_ib_deposits','loan_oth_bank','trading_fl','notes_payable','acct_payable',
                     'adv_receipts','sold_for_repur_fa','comm_payable','payroll_payable',
                     'taxes_payable','int_payable','div_payable','oth_payable','acc_exp',
                     'deferred_inc','st_bonds_payable','payable_to_reinsurer','rsrv_insur_cont',
                     'acting_trading_sec','acting_uw_sec','non_cur_liab_due_1y','oth_cur_liab',
                     'total_cur_liab','bond_payable','lt_payable','specific_payables',
                     'estimated_liab','defer_tax_liab','defer_inc_non_cur_liab','oth_ncl',
                     'total_ncl','depos_oth_bfi','deriv_liab','depos','agency_bus_liab','oth_liab',
                     'prem_receiv_adva','depos_received','ph_invest','reser_une_prem',
                     'reser_outstd_claims','reser_lins_liab','reser_lthins_liab','indep_acct_liab',
                     'pledge_borr','indem_payable','policy_div_payable','total_liab','treasury_share',
                     'ordin_risk_reser','forex_differ','invest_loss_unconf','minority_int',
                     'total_hldr_eqy_inc_min_int','total_hldr_eqy_exc_min_int','total_liab_hldr_eqy',
                     'lt_payroll_payable','oth_comp_income','oth_eqt_tools','oth_eqt_tools_p_shr',
                     'lending_funds','acc_receivable','st_fin_payable','payables','hfs_assets',
                     'hfs_sales','cost_fin_assets','fair_value_fin_assets','cip_total','oth_pay_total',
                     'long_pay_total','debt_invest','oth_debt_invest','oth_eq_invest',
                     'oth_illiq_fin_assets','oth_eq_ppbond','receiv_financing','use_right_assets',
                     'lease_liab','contract_assets','contract_liab','accounts_receiv_bill',
                     'accounts_pay','oth_rcv_total','fix_assets_total','update_flag'},
    },
    'cashflow': {
        'api':      'cashflow_vip',
        'table':    'stock_cashflow',
        'conflict': ['ts_code', 'end_date', 'report_type'],
        'columns':  {'ts_code','ann_date','f_ann_date','end_date','report_type','comp_type','end_type',
                     'net_profit','finan_exp','c_fr_sale_sg','recp_tax_rends','n_depos_incr_fi',
                     'n_incr_loans_cb','n_inc_borr_oth_fi','prem_fr_orig_contr','n_incr_insured_dep',
                     'n_reinsur_prem','n_incr_disp_tfa','ifc_cash_incr','n_incr_disp_faas',
                     'n_incr_loans_oth_bank','n_cap_incr_repur','c_fr_oth_operate_a',
                     'c_inf_fr_operate_a','c_paid_goods_s','c_paid_to_for_empl','c_paid_for_taxes',
                     'n_incr_clt_loan_adv','n_incr_dep_cbob','c_pay_claims_orig_inco',
                     'pay_handling_chrg','pay_comm_insur_plcy','oth_cash_pay_oper_act',
                     'st_cash_out_act','n_cashflow_act','oth_recp_ral_inv_act',
                     'c_disp_withdrwl_invest','c_recp_return_invest','n_recp_disp_fiolta',
                     'n_recp_disp_sobu','stot_inflows_inv_act','c_pay_acq_const_fiolta',
                     'c_paid_invest','n_disp_subs_oth_biz','oth_pay_ral_inv_act','n_incr_pledge_loan',
                     'stot_out_inv_act','n_cashflow_inv_act','c_recp_borrow','proc_issue_bonds',
                     'oth_cash_recp_ral_fnc_act','stot_cash_in_fnc_act','free_cashflow',
                     'c_prepay_amt_borr','c_pay_dist_dpcp_int_exp','incl_dvd_profit_paid_sc_ms',
                     'oth_cashpay_ral_fnc_act','stot_cashout_fnc_act','n_cash_flows_fnc_act',
                     'eff_fx_flu_cash','n_incr_cash_cash_equ','c_cash_equ_beg_period',
                     'c_cash_equ_end_period','c_recp_cap_contrib','incl_cash_rec_saims',
                     'uncon_invest_loss','prov_depr_assets','depr_fa_coga_dpba','amort_intang_assets',
                     'lt_amort_deferred_exp','decr_deferred_exp','incr_acc_exp','loss_disp_fiolta',
                     'loss_scr_fa','loss_fv_chg','invest_loss','decr_def_inc_tax_assets',
                     'incr_def_inc_tax_liab','decr_inventories','decr_oper_payable',
                     'incr_oper_payable','others','im_net_cashflow_oper_act','conv_debt_into_cap',
                     'conv_copbonds_due_within_1y','fa_fnc_leases','im_n_incr_cash_equ',
                     'net_dism_capital_add','net_cash_rece_sec','credit_impa_loss',
                     'use_right_asset_dep','oth_loss_asset','end_bal_cash','beg_bal_cash',
                     'end_bal_cash_equ','beg_bal_cash_equ','update_flag'},
    },
}

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_clients():
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    sb  = create_client(SUPABASE_URL, SUPABASE_KEY)
    return pro, sb

# 表实际列名缓存（避免重复查询）
_TABLE_COLUMNS_CACHE: dict = {}

def get_table_columns(sb, table_name):
    """
    获取数据库表的实际列名集合（缓存）
    用于过滤 Tushare 接口返回的多余字段，避免 PGRST204 错误
    """
    if table_name in _TABLE_COLUMNS_CACHE:
        return _TABLE_COLUMNS_CACHE[table_name]
    # 通过查询一行来获取列名（表为空时返回空）
    # 改用 PostgREST 的 HEAD 请求获取列名
    import requests as _req
    url = SUPABASE_URL + f'/rest/v1/{table_name}?limit=1'
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Accept': 'application/json',
    }
    resp = _req.get(url, headers=headers)
    if resp.status_code == 200 and resp.json():
        cols = set(resp.json()[0].keys())
    else:
        # 表为空，通过 information_schema 查询
        from supabase import create_client as _cc
        _sb = _cc(SUPABASE_URL, SUPABASE_KEY)
        # 用 DDL 文件中的列名作为 fallback
        # 直接返回 None 表示不过滤
        cols = None
    _TABLE_COLUMNS_CACHE[table_name] = cols
    return cols

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def retry(fn, retries=3, sleep_sec=5, **kwargs):
    """带重试的 Tushare 接口调用（踩坑记录 #9：网络不稳定）"""
    for i in range(retries):
        try:
            df = fn(**kwargs)
            return df
        except Exception as e:
            print(f"  ⚠️  第{i+1}次失败: {e}")
            if i < retries - 1:
                time.sleep(sleep_sec)
    return None

def upsert_batch(sb, table, rows, conflict_cols):
    """
    分批 upsert，避免单次请求过大
    踩坑 #11：写入前按 PK 去重，避免批内重复报错
    踩坑 #12：Tushare 接口可能返回表中不存在的新字段，动态过滤后重试
    """
    if not rows:
        return
    # 批内去重：按冲突键去重，保留最后一条
    df_tmp = pd.DataFrame(rows)
    before = len(df_tmp)
    df_tmp = df_tmp.drop_duplicates(subset=conflict_cols, keep='last')
    after = len(df_tmp)
    if before != after:
        print(f"  ⚠️  批内去重：{before} → {after} 行")
    # drop_duplicates 后 to_dict 会重新产生 float nan，需再次清理
    # 注意：不能用 df.where() 因为 object 列不可靠，必须逐值检查
    import math as _math
    rows_raw = df_tmp.to_dict('records')
    rows = []
    for row in rows_raw:
        cleaned = {}
        for k, v in row.items():
            if v is None:
                cleaned[k] = None
            elif isinstance(v, float) and (_math.isnan(v) or _math.isinf(v)):
                cleaned[k] = None
            else:
                cleaned[k] = v
        rows.append(cleaned)

    # 动态字段过滤：如果出现 PGRST204（字段不存在），自动移除问题字段后重试
    excluded_cols = set()
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        # 如果有已知需过滤的字段，先过滤
        if excluded_cols:
            batch = [{k: v for k, v in r.items() if k not in excluded_cols} for r in batch]
        for attempt in range(5):  # 最多尝试移除 5 个字段
            try:
                sb.table(table).upsert(batch, on_conflict=','.join(conflict_cols)).execute()
                break
            except Exception as e:
                err_str = str(e)
                # 检测 PGRST204：字段不存在
                if 'PGRST204' in err_str or 'Could not find the' in err_str:
                    import re
                    m = re.search(r"Could not find the '(\w+)' column", err_str)
                    if m:
                        bad_col = m.group(1)
                        excluded_cols.add(bad_col)
                        print(f"  ⚠️  过滤不存在的字段: {bad_col}")
                        batch = [{k: v for k, v in r.items() if k not in excluded_cols} for r in batch]
                        continue
                raise  # 其他错误直接抛出

def clean_df(df):
    """
    清洗 DataFrame：
    1. NaN / inf / -inf → None（Supabase 不接受 NaN 和无穷大，JSON 序列化会报错）
    2. 日期字段 YYYYMMDD → YYYY-MM-DD
    3. numpy 类型 → Python 原生类型
    """
    import math
    # 日期字段列表（Tushare 财务接口的日期字段）
    date_cols = {'ann_date', 'f_ann_date', 'end_date', 'report_date',
                 'update_flag', 'comp_type'}
    rows = []
    for record in df.to_dict('records'):
        cleaned = {}
        for k, v in record.items():
            # NaN / inf / -inf → None
            try:
                if pd.isna(v):
                    cleaned[k] = None
                    continue
            except (TypeError, ValueError):
                pass
            # 处理 inf / -inf（JSON 不支持）
            if isinstance(v, float) and (math.isinf(v) or math.isnan(v)):
                cleaned[k] = None
                continue
            # 日期格式转换
            if k in date_cols and isinstance(v, str) and len(v) == 8 and v.isdigit():
                cleaned[k] = f"{v[:4]}-{v[4:6]}-{v[6:8]}"
            # numpy 数值 → Python float/int
            elif hasattr(v, 'item'):
                val = v.item()
                # numpy item() 后也可能是 inf
                if isinstance(val, float) and (math.isinf(val) or math.isnan(val)):
                    cleaned[k] = None
                else:
                    cleaned[k] = val
            else:
                cleaned[k] = v
        rows.append(cleaned)
    return rows

def checkpoint_path(table_name, shard_id=None):
    """
    生成断点文件路径。
    支持分片标识（shard_id），多进程并行时各分片独立断点，互不干扰。
    shard_id 格式建议为：{table}_{start}_{end}，例如 income_20150101_20181231
    """
    if shard_id:
        return f"/tmp/financial_{shard_id}_checkpoint.txt"
    return f"/tmp/financial_{table_name}_checkpoint.txt"

def load_checkpoint(table_name, shard_id=None):
    """读取断点续传文件，返回已完成的 ts_code 集合"""
    path = checkpoint_path(table_name, shard_id)
    if not os.path.exists(path):
        return set()
    with open(path, 'r') as f:
        return set(line.strip() for line in f if line.strip())

def save_checkpoint(table_name, ts_code, shard_id=None):
    """追加写入已完成的 ts_code"""
    path = checkpoint_path(table_name, shard_id)
    with open(path, 'a') as f:
        f.write(ts_code + '\n')

def get_all_stocks(pro):
    """获取全市场股票列表（含退市股，保证历史数据完整）"""
    # 上市股票
    df_l = retry(pro.stock_basic, exchange='', list_status='L',
                 fields='ts_code,name,list_status')
    # 退市股票
    df_d = retry(pro.stock_basic, exchange='', list_status='D',
                 fields='ts_code,name,list_status')
    # 暂停上市
    df_p = retry(pro.stock_basic, exchange='', list_status='P',
                 fields='ts_code,name,list_status')
    dfs = [df for df in [df_l, df_d, df_p] if df is not None and not df.empty]
    if not dfs:
        return []
    df_all = pd.concat(dfs, ignore_index=True)
    return sorted(df_all['ts_code'].tolist())

# ── 核心采集函数 ──────────────────────────────────────────────────────────────
def collect_one_stock(pro, sb, ts_code, table_key, start_date, end_date,
                      dry_run=False):
    """
    采集单只股票的财务报告（一张表）
    返回写入行数
    """
    cfg = TABLE_CONFIG[table_key]
    api_fn = getattr(pro, cfg['api'])

    df = retry(api_fn, ts_code=ts_code, start_date=start_date, end_date=end_date,
               report_type='1')  # 合并报表
    if df is None or df.empty:
        return 0

    rows = clean_df(df)
    # 过滤多余字段：Tushare 接口可能返回表中不存在的新字段，需过滤后再写入
    valid_cols = cfg.get('columns')
    if valid_cols:
        rows = [{k: v for k, v in row.items() if k in valid_cols} for row in rows]

    if dry_run:
        return len(rows)

    upsert_batch(sb, cfg['table'], rows, cfg['conflict'])
    return len(rows)

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='个股财务三表历史数据采集（REQ-056）')
    parser.add_argument('--table', choices=['income', 'balance', 'cashflow', 'all'],
                        default='all', help='采集哪张表')
    parser.add_argument('--start', default=DEFAULT_START, help='报告期起始 YYYYMMDD')
    parser.add_argument('--end',   default=None,          help='报告期结束 YYYYMMDD（默认今日）')
    parser.add_argument('--ts-code', default=None,        help='只采集指定股票（调试用）')
    parser.add_argument('--dry-run', action='store_true', help='只打印，不写库')
    parser.add_argument('--shard-id', default=None,
                        help='分片标识（用于多进程并行时区分断点文件），建议格式: {table}_{start}_{end}')
    args = parser.parse_args()

    pro, sb = init_clients()
    dry_run = args.dry_run
    end_date = args.end or date.today().strftime('%Y%m%d')

    # 分片标识（多进程并行时每个进程用独立断点文件）
    shard_id = args.shard_id  # 例如 "income_20150101_20181231"

    # 确定要采集的表
    tables = ['income', 'balance', 'cashflow'] if args.table == 'all' else [args.table]

    # 确定股票列表
    if args.ts_code:
        stocks = [args.ts_code]
    else:
        print("  → 获取全市场股票列表...")
        stocks = get_all_stocks(pro)
        print(f"  → 共 {len(stocks)} 只股票")

    for table_key in tables:
        cfg = TABLE_CONFIG[table_key]
        print(f"\n{'='*60}")
        print(f"=== 采集 {cfg['table']}（{table_key}）===")
        print(f"  报告期：{args.start} → {end_date}")

        # 断点续传（支持分片标识）
        done = load_checkpoint(table_key, shard_id)
        pending = [s for s in stocks if s not in done]
        print(f"  已完成 {len(done)} 只，待采集 {len(pending)} 只")

        total_rows = 0
        failed = []

        for i, ts_code in enumerate(pending, 1):
            try:
                count = collect_one_stock(pro, sb, ts_code, table_key,
                                          args.start, end_date, dry_run)
                total_rows += count
                if not dry_run:
                    save_checkpoint(table_key, ts_code, shard_id)

                # 进度打印（每 50 只打印一次）
                if i % 50 == 0 or i <= 5:
                    print(f"  [{i}/{len(pending)}] {ts_code}: {count} 行 | 累计 {total_rows:,} 行")

            except Exception as e:
                print(f"  ❌ {ts_code} 失败: {e}")
                failed.append(ts_code)

            time.sleep(API_SLEEP)

        print(f"\n✅ {cfg['table']} 完成：{len(pending)} 只，{total_rows:,} 行")
        if failed:
            print(f"  ⚠️  失败 {len(failed)} 只：{failed[:10]}{'...' if len(failed)>10 else ''}")

    print("\n🎉 全部完成")

if __name__ == '__main__':
    main()
