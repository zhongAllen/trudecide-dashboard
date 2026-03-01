"""
板块接口可用性测试脚本
逐个测试，每个接口独立 try/except，避免整体超时
"""
import tushare as ts
import os, time, sys

token = os.environ.get('TUSHARE_TOKEN', '')
if not token:
    print("ERROR: TUSHARE_TOKEN 未设置")
    sys.exit(1)

ts.set_token(token)
pro = ts.pro_api()

results = []

def test(name, fn, **kwargs):
    print(f"  测试: {name} ...", flush=True)
    try:
        df = fn(**kwargs)
        if df is None or df.empty:
            status = '❌ 空数据'
            rows = 0
            cols = []
        else:
            status = '✅ 成功'
            rows = len(df)
            cols = list(df.columns)
        results.append((name, status, rows, cols))
        print(f"    → {status} | {rows} 行 | 字段: {cols[:5]}", flush=True)
    except Exception as e:
        err = str(e)[:100]
        results.append((name, f'❌ 错误', 0, [err]))
        print(f"    → ❌ 错误: {err}", flush=True)
    time.sleep(1)

print("\n=== 同花顺 (THS) ===")
test('ths_index (全部)',     pro.ths_index)
test('ths_index (type=N)',  pro.ths_index, type='N')
test('ths_daily (单板块)',  pro.ths_daily, ts_code='885835.TI', start_date='20250201', end_date='20250228')
test('ths_member (单板块)', pro.ths_member, ts_code='885835.TI')

print("\n=== 东方财富 (DC) ===")
test('dc_index (按日期)',       pro.dc_index,  trade_date='20250228')
test('dc_daily (按日期)',       pro.dc_daily,  trade_date='20250228')
test('dc_member (板块+日期)',   pro.dc_member, ts_code='BK1184.DC', trade_date='20250228')

print("\n=== 通达信 (TDX) ===")
test('tdx_index (按日期)',      pro.tdx_index, trade_date='20250228')
test('tdx_daily (按日期)',      pro.tdx_daily, trade_date='20250228')
test('tdx_member (板块+日期)',  pro.tdx_member, ts_code='880728.TDX', trade_date='20250228')

print("\n" + "="*80)
print(f"{'接口':<32} {'状态':<12} {'行数':<8}")
print('-'*60)
for r in results:
    print(f"{r[0]:<32} {r[1]:<12} {str(r[2]):<8}")
