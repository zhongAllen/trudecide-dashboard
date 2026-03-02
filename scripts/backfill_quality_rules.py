"""
REQ-037 v2.0：为 collect_target 表回填三维质量规则配置
"""
import os, requests, json

url = os.environ['SUPABASE_URL']
key = os.environ['SUPABASE_KEY']
headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
}

# ============================================================
# 质量规则配置
# timeliness_rule: max_days=error阈值, warn_days=warning阈值
# completeness_rule: frequency=采集频率, lookback_days=回溯天数
#   frequency: daily(交易日), weekly, monthly, quarterly, static(不检查)
# accuracy_rule: rules=检查规则列表
# ============================================================

RULES = {
    # ===== 行情数据（每日采集，对时效性要求高）=====
    'stock_daily': {
        'timeliness': {'max_days': 5, 'warn_days': 3},
        'completeness': {'frequency': 'daily', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null_price', 'positive_volume', 'price_range_check']}
    },
    'stock_daily_basic': {
        'timeliness': {'max_days': 5, 'warn_days': 3},
        'completeness': {'frequency': 'daily', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null', 'pe_range_check', 'pb_range_check']}
    },
    'index_daily': {
        'timeliness': {'max_days': 5, 'warn_days': 3},
        'completeness': {'frequency': 'daily', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null_price', 'positive_volume']}
    },
    'sector_daily': {
        'timeliness': {'max_days': 5, 'warn_days': 3},
        'completeness': {'frequency': 'daily', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null']}
    },
    'stock_moneyflow': {
        'timeliness': {'max_days': 5, 'warn_days': 3},
        'completeness': {'frequency': 'daily', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null']}
    },

    # ===== 宏观指标（月度/季度，时效性要求宽松）=====
    'macro_indicator_values': {
        'timeliness': {'max_days': 60, 'warn_days': 45},
        'completeness': {'frequency': 'monthly', 'lookback_days': 365},
        'accuracy': {'rules': ['not_null', 'no_extreme_outlier']}
    },
    'macro_indicator_meta': {
        'timeliness': {'max_days': 365, 'warn_days': 180},  # 元数据不常变
        'completeness': {'frequency': 'static', 'lookback_days': 0},
        'accuracy': {'rules': ['not_null']}
    },

    # ===== 财务数据（季度，每季报季更新）=====
    'stock_income': {
        'timeliness': {'max_days': 120, 'warn_days': 90},
        'completeness': {'frequency': 'quarterly', 'lookback_days': 365},
        'accuracy': {'rules': ['not_null', 'revenue_positive_check']}
    },
    'stock_balance': {
        'timeliness': {'max_days': 120, 'warn_days': 90},
        'completeness': {'frequency': 'quarterly', 'lookback_days': 365},
        'accuracy': {'rules': ['not_null']}
    },
    'stock_cashflow': {
        'timeliness': {'max_days': 120, 'warn_days': 90},
        'completeness': {'frequency': 'quarterly', 'lookback_days': 365},
        'accuracy': {'rules': ['not_null']}
    },
    'stock_fina_indicator': {
        'timeliness': {'max_days': 120, 'warn_days': 90},
        'completeness': {'frequency': 'quarterly', 'lookback_days': 365},
        'accuracy': {'rules': ['not_null', 'roe_range_check']}
    },

    # ===== 新闻/公告（每日，时效性较高）=====
    'news': {
        'timeliness': {'max_days': 3, 'warn_days': 1},
        'completeness': {'frequency': 'daily', 'lookback_days': 7},
        'accuracy': {'rules': ['not_null_title']}
    },
    'cctv_news': {
        'timeliness': {'max_days': 3, 'warn_days': 1},
        'completeness': {'frequency': 'daily', 'lookback_days': 7},
        'accuracy': {'rules': ['not_null_title']}
    },
    'stock_announcement': {
        'timeliness': {'max_days': 5, 'warn_days': 3},
        'completeness': {'frequency': 'daily', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null']}
    },

    # ===== 研报/荐股（月度）=====
    'reports_eastmoney': {
        'timeliness': {'max_days': 30, 'warn_days': 15},
        'completeness': {'frequency': 'daily', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null_title']}
    },
    'broker_recommend': {
        'timeliness': {'max_days': 45, 'warn_days': 30},
        'completeness': {'frequency': 'monthly', 'lookback_days': 90},
        'accuracy': {'rules': ['not_null']}
    },

    # ===== 事件日历（每日）=====
    'economic_events': {
        'timeliness': {'max_days': 5, 'warn_days': 3},
        'completeness': {'frequency': 'daily', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null']}
    },

    # ===== 个股事件（季度/不定期）=====
    'stock_holders': {
        'timeliness': {'max_days': 120, 'warn_days': 90},
        'completeness': {'frequency': 'quarterly', 'lookback_days': 365},
        'accuracy': {'rules': ['not_null', 'rank_range_check']}
    },
    'stock_pledge': {
        'timeliness': {'max_days': 120, 'warn_days': 90},
        'completeness': {'frequency': 'quarterly', 'lookback_days': 365},
        'accuracy': {'rules': ['not_null', 'pledge_ratio_check']}
    },
    'stock_holder_trade': {
        'timeliness': {'max_days': 30, 'warn_days': 14},
        'completeness': {'frequency': 'weekly', 'lookback_days': 90},
        'accuracy': {'rules': ['not_null']}
    },

    # ===== 元数据（静态，不检查时效性）=====
    'stock_meta': {
        'timeliness': {'max_days': 365, 'warn_days': 180},
        'completeness': {'frequency': 'static', 'lookback_days': 0},
        'accuracy': {'rules': ['not_null']}
    },
    'sector_meta': {
        'timeliness': {'max_days': 365, 'warn_days': 180},
        'completeness': {'frequency': 'static', 'lookback_days': 0},
        'accuracy': {'rules': ['not_null']}
    },
    'sector_stock_map': {
        'timeliness': {'max_days': 30, 'warn_days': 14},
        'completeness': {'frequency': 'weekly', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null']}
    },
    'macro_bond_yield_10y': {
        'timeliness': {'max_days': 5, 'warn_days': 3},
        'completeness': {'frequency': 'daily', 'lookback_days': 30},
        'accuracy': {'rules': ['not_null', 'yield_range_check']}
    },
}

def main():
    success = 0
    failed = 0
    for module, rules in RULES.items():
        payload = {
            'timeliness_rule': rules['timeliness'],
            'completeness_rule': rules['completeness'],
            'accuracy_rule': rules['accuracy'],
            'quality_status': 'unknown'
        }
        r = requests.patch(
            f'{url}/rest/v1/collect_target?module=eq.{module}',
            headers=headers,
            json=payload
        )
        if r.status_code in (200, 204):
            print(f'  OK  {module}')
            success += 1
        else:
            print(f'  FAIL {module}: {r.status_code} {r.text[:100]}')
            failed += 1

    print(f'\n回填完成：{success} 成功，{failed} 失败')

if __name__ == '__main__':
    main()
