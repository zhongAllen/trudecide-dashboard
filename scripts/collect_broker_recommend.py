"""
券商月度金股采集脚本（REQ-069）
================================
用途：采集近3年（2023-01 至今）的券商月度金股数据，写入 broker_recommend 表
数据来源：Tushare Pro API - broker_recommend（6000积分）

执行方式：
  python3 collect_broker_recommend.py [--mode full|incremental] [--dry-run]
  --mode full         全量采集（2023-01 至今），默认
  --mode incremental  增量采集（仅当月）
  --dry-run           只打印，不写库

注意事项：
  1. 接口无严格频率限制（6000积分即可），多线程 MAX_WORKERS=4
  2. 越新的月份参与券商越少（月初数据汇总中），月中以后采集更完整
  3. 2020年及以前返回空，2021-01 起有数据，2023-01 起数据较完整
  4. 主键 (month, broker, ts_code)，ON CONFLICT DO NOTHING 防重复
  5. 由近到远顺序采集，确保最新数据优先入库
"""
import os
import sys
import time
import argparse
import hashlib
from datetime import datetime, date, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN   = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
MAX_WORKERS     = 4      # 并发线程数（接口无严格限制，4线程安全）
BATCH_SIZE      = 500    # 每批 upsert 行数
API_SLEEP       = 0.3    # 每次请求间隔（秒）
RETRY_TIMES     = 3      # 失败重试次数
RETRY_SLEEP     = 5      # 重试等待（秒）
START_MONTH     = "202301"  # 全量采集起始月份（近3年）

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_clients():
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    sb  = create_client(SUPABASE_URL, SUPABASE_KEY)
    return pro, sb

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def retry_call(fn, retries=RETRY_TIMES, sleep_sec=RETRY_SLEEP, **kwargs):
    """带重试的 Tushare 接口调用（踩坑：网络抖动导致偶发失败）"""
    for i in range(retries):
        try:
            return fn(**kwargs)
        except Exception as e:
            print(f"  ⚠️  第{i+1}次失败: {e}")
            if i < retries - 1:
                time.sleep(sleep_sec)
    raise Exception(f"接口调用失败，已重试 {retries} 次")

def upsert_batch(sb, table, rows, conflict_cols):
    """分批 upsert，避免单次请求过大（踩坑：Supabase 单次请求有大小限制）"""
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        sb.table(table).upsert(batch, on_conflict=','.join(conflict_cols)).execute()
    return total

def gen_months(start_ym: str, end_ym: str) -> list:
    """生成月份列表（YYYYMM 格式），由近到远排序"""
    months = []
    y, m = int(start_ym[:4]), int(start_ym[4:])
    ey, em = int(end_ym[:4]), int(end_ym[4:])
    while (y, m) <= (ey, em):
        months.append(f"{y:04d}{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return list(reversed(months))  # 由近到远

def current_month() -> str:
    """返回当前月份字符串，格式 YYYYMM"""
    now = datetime.now()
    return f"{now.year:04d}{now.month:02d}"

# ── 核心采集逻辑 ──────────────────────────────────────────────────────────────
def collect_month(pro, month: str, dry_run: bool = False) -> dict:
    """
    采集单个月份的券商金股数据
    返回: {'month': str, 'rows': int, 'status': 'ok'|'empty'|'error', 'msg': str}
    """
    try:
        time.sleep(API_SLEEP)
        df = retry_call(pro.broker_recommend, month=month)

        if df is None or df.empty:
            return {'month': month, 'rows': 0, 'status': 'empty', 'msg': '接口返回空'}

        # 数据清洗
        df = df.dropna(subset=['month', 'broker', 'ts_code'])
        df['name'] = df['name'].where(df['name'].notna(), None)

        rows = df.to_dict('records')
        print(f"  [{month}] 获取 {len(rows)} 行，{df['broker'].nunique()} 家券商")

        if dry_run:
            return {'month': month, 'rows': len(rows), 'status': 'dry_run', 'msg': 'dry-run 模式，未写库'}

        # 写库（ON CONFLICT DO NOTHING）
        # Supabase upsert with ignoreDuplicates=True 等价于 ON CONFLICT DO NOTHING
        # 踩坑：Supabase Python SDK upsert 的 on_conflict 参数需要列名字符串，不是 ignore
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        written = upsert_batch(sb, 'broker_recommend', rows, ['month', 'broker', 'ts_code'])
        return {'month': month, 'rows': written, 'status': 'ok', 'msg': ''}

    except Exception as e:
        return {'month': month, 'rows': 0, 'status': 'error', 'msg': str(e)}

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='券商月度金股采集脚本 (REQ-069)')
    parser.add_argument('--mode', choices=['full', 'incremental'], default='full',
                        help='full=全量(2023-01至今), incremental=仅当月')
    parser.add_argument('--dry-run', action='store_true', help='只打印，不写库')
    args = parser.parse_args()

    print(f"=== broker_recommend 采集开始 ===")
    print(f"模式: {args.mode} | dry-run: {args.dry_run}")
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    pro, sb = init_clients()

    # 确定采集月份列表
    end_month = current_month()
    if args.mode == 'incremental':
        months = [end_month]
        print(f"增量模式：仅采集 {end_month}")
    else:
        months = gen_months(START_MONTH, end_month)
        print(f"全量模式：{START_MONTH} → {end_month}，共 {len(months)} 个月")

    # 多线程采集（由近到远已在 gen_months 中处理）
    results = []
    total_rows = 0
    ok_count = 0
    empty_count = 0
    error_count = 0

    print(f"\n开始多线程采集（MAX_WORKERS={MAX_WORKERS}）...")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(collect_month, pro, month, args.dry_run): month
            for month in months
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            if result['status'] == 'ok':
                ok_count += 1
                total_rows += result['rows']
            elif result['status'] == 'empty':
                empty_count += 1
            elif result['status'] == 'error':
                error_count += 1
                print(f"  ❌ [{result['month']}] 失败: {result['msg']}")
            elif result['status'] == 'dry_run':
                ok_count += 1
                total_rows += result['rows']

    # 汇总报告
    print(f"\n=== 采集完成 ===")
    print(f"成功: {ok_count} 个月 | 空数据: {empty_count} 个月 | 失败: {error_count} 个月")
    print(f"总写入行数: {total_rows}")

    # 验证数据库
    if not args.dry_run and ok_count > 0:
        r = sb.table('broker_recommend').select('month', count='exact').execute()
        print(f"\n数据库验证: broker_recommend 表共 {r.count} 行")
        # 查询月份覆盖
        r2 = sb.rpc('get_distinct_months_broker', {}).execute() if False else None
        # 简单验证：查最新月份
        r3 = sb.table('broker_recommend').select('month,broker,ts_code,name').order('month', desc=True).limit(5).execute()
        print(f"最新5条记录:")
        for row in r3.data:
            print(f"  {row['month']} | {row['broker']} | {row['ts_code']} | {row['name']}")

    if error_count > 0:
        print(f"\n⚠️  有 {error_count} 个月采集失败，建议重新运行")
        sys.exit(1)

if __name__ == '__main__':
    main()
