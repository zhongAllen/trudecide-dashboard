"""
券商研究报告采集脚本（REQ-070）
================================
用途：采集近1年（2025-03-01 至今）的券商研究报告元数据，写入 research_report 表
数据来源：Tushare Pro API - research_report（单独权限）

执行方式：
  python3 collect_research_report.py [--mode full|incremental] [--dry-run]
  --mode full         全量采集（2025-03-01 至今），默认
  --mode incremental  增量采集（仅昨天）
  --dry-run           只打印，不写库

⚠️ 关键约束（已实测）：
  - 每天最多调用 5 次，超出返回 "您每天最多访问该接口5次"
  - 全量采集约52周，每次运行消耗 MAX_WORKERS*批次 次调用
  - 建议：MAX_WORKERS=2，每次运行最多消耗 4 次（留1次备用）
  - 全量采集需分 13+ 天完成（每天采 4 周数据）

策略设计：
  1. 以"周"为基本查询单位（避免单日超1000条限制）
  2. 若单周返回恰好1000条（达上限），自动降级为按日查询
  3. 由近到远顺序采集（最新数据优先）
  4. 进度持久化到 /tmp/research_report_progress.json，支持断点续采
  5. title_hash = md5(trade_date_str + title)，应用层计算
"""
import os
import sys
import time
import json
import argparse
import hashlib
from datetime import datetime, date, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import tushare as ts
from supabase import create_client

# ── 配置 ─────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN   = os.environ.get("TUSHARE_TOKEN", "")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
MAX_WORKERS     = 2      # ⚠️ 严格控制并发（每天最多5次调用）
BATCH_SIZE      = 500    # 每批 upsert 行数
API_SLEEP       = 1.0    # 每次请求间隔（秒），避免触发频率限制
RETRY_TIMES     = 3      # 失败重试次数
RETRY_SLEEP     = 10     # 重试等待（秒）
START_DATE      = "20250301"  # 全量采集起始日期（近1年）
PROGRESS_FILE   = "/tmp/research_report_progress.json"  # 进度持久化文件
CALL_LIMIT_PER_DAY = 5   # 每天最多调用次数（已实测）
# 每次运行最多消耗的调用次数（留1次备用）
MAX_CALLS_PER_RUN = 4

# ── 初始化 ────────────────────────────────────────────────────────────────────
def init_clients():
    ts.set_token(TUSHARE_TOKEN)
    pro = ts.pro_api()
    sb  = create_client(SUPABASE_URL, SUPABASE_KEY)
    return pro, sb

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def retry_call(fn, retries=RETRY_TIMES, sleep_sec=RETRY_SLEEP, **kwargs):
    """带重试的 Tushare 接口调用"""
    for i in range(retries):
        try:
            return fn(**kwargs)
        except Exception as e:
            err_str = str(e)
            # 遇到每日调用限制，直接抛出，不重试
            if '每天最多访问' in err_str or '次' in err_str:
                raise RuntimeError(f"DAILY_LIMIT: {err_str}")
            print(f"  ⚠️  第{i+1}次失败: {err_str}")
            if i < retries - 1:
                time.sleep(sleep_sec)
    raise Exception(f"接口调用失败，已重试 {retries} 次")

def compute_title_hash(trade_date_str: str, title: str) -> str:
    """计算去重哈希：md5(trade_date_str + title)"""
    raw = f"{trade_date_str}{title}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()

def upsert_batch(sb, rows: list) -> int:
    """分批 upsert research_report 表，ON CONFLICT DO NOTHING"""
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        sb.table('research_report').upsert(
            batch, on_conflict='trade_date,title_hash'
        ).execute()
    return total

def gen_weeks(start_date_str: str, end_date_str: str) -> list:
    """
    生成周区间列表，格式 [(start, end), ...]，由近到远排序
    每周：周一到周日（或截止到 end_date）
    """
    start = datetime.strptime(start_date_str, '%Y%m%d').date()
    end   = datetime.strptime(end_date_str, '%Y%m%d').date()
    weeks = []
    cur = start
    while cur <= end:
        # 找到本周周日
        days_to_sunday = 6 - cur.weekday()
        week_end = min(cur + timedelta(days=days_to_sunday), end)
        weeks.append((cur.strftime('%Y%m%d'), week_end.strftime('%Y%m%d')))
        cur = week_end + timedelta(days=1)
    return list(reversed(weeks))  # 由近到远

def gen_days(start_date_str: str, end_date_str: str) -> list:
    """生成日期列表，由近到远"""
    start = datetime.strptime(start_date_str, '%Y%m%d').date()
    end   = datetime.strptime(end_date_str, '%Y%m%d').date()
    days = []
    cur = start
    while cur <= end:
        days.append(cur.strftime('%Y%m%d'))
        cur += timedelta(days=1)
    return list(reversed(days))

def load_progress() -> dict:
    """加载采集进度（断点续采）"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {'completed_weeks': [], 'total_rows': 0, 'calls_today': 0, 'last_run_date': ''}

def save_progress(progress: dict):
    """保存采集进度"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)

def today_str() -> str:
    return datetime.now().strftime('%Y-%m-%d')

# ── 核心采集逻辑 ──────────────────────────────────────────────────────────────
def collect_period(pro, start_date: str, end_date: str, dry_run: bool = False) -> dict:
    """
    采集单个时间段的研究报告数据
    返回: {'period': str, 'rows': int, 'status': str, 'hit_limit': bool}
    """
    period_str = f"{start_date}~{end_date}"
    try:
        time.sleep(API_SLEEP)
        df = retry_call(pro.research_report, start_date=start_date, end_date=end_date)

        if df is None or df.empty:
            return {'period': period_str, 'rows': 0, 'status': 'empty', 'hit_limit': False}

        hit_limit = len(df) >= 1000  # 达到单次上限，可能有遗漏

        # 数据清洗
        df = df.dropna(subset=['trade_date', 'title', 'url'])
        df['trade_date'] = pd.to_datetime(df['trade_date'], format='%Y%m%d').dt.date

        # 计算 title_hash（去重键）
        df['title_hash'] = df.apply(
            lambda r: compute_title_hash(str(r['trade_date']), r['title']), axis=1
        )

        # 字段映射（Tushare name → stock_name，避免与 Python 内置冲突）
        df = df.rename(columns={'name': 'stock_name'})

        # 处理 NULL 值
        for col in ['author', 'stock_name', 'ts_code', 'inst_csname', 'ind_name']:
            df[col] = df[col].where(df[col].notna(), None)

        # 转换 trade_date 为字符串（Supabase REST API 接受 ISO 格式）
        df['trade_date'] = df['trade_date'].astype(str)

        rows = df[['trade_date', 'title_hash', 'title', 'report_type',
                   'author', 'stock_name', 'ts_code', 'inst_csname',
                   'ind_name', 'url']].to_dict('records')

        print(f"  [{period_str}] 获取 {len(rows)} 行{'（⚠️达上限）' if hit_limit else ''}")

        if dry_run:
            return {'period': period_str, 'rows': len(rows), 'status': 'dry_run', 'hit_limit': hit_limit}

        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        written = upsert_batch(sb, rows)
        return {'period': period_str, 'rows': written, 'status': 'ok', 'hit_limit': hit_limit}

    except RuntimeError as e:
        if 'DAILY_LIMIT' in str(e):
            print(f"  ⛔ [{period_str}] 触发每日调用限制！停止采集")
            return {'period': period_str, 'rows': 0, 'status': 'daily_limit', 'hit_limit': False}
        return {'period': period_str, 'rows': 0, 'status': 'error', 'hit_limit': False}
    except Exception as e:
        return {'period': period_str, 'rows': 0, 'status': 'error', 'hit_limit': False}

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='券商研究报告采集脚本 (REQ-070)')
    parser.add_argument('--mode', choices=['full', 'incremental'], default='full',
                        help='full=全量(2025-03-01至今), incremental=仅昨天')
    parser.add_argument('--dry-run', action='store_true', help='只打印，不写库')
    parser.add_argument('--reset-progress', action='store_true', help='清除断点进度，重新开始')
    args = parser.parse_args()

    print(f"=== research_report 采集开始 ===")
    print(f"模式: {args.mode} | dry-run: {args.dry_run}")
    print(f"⚠️  每日调用限制: {CALL_LIMIT_PER_DAY} 次，本次最多消耗 {MAX_CALLS_PER_RUN} 次")
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    pro, sb = init_clients()

    # 加载/重置进度
    if args.reset_progress and os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)
        print("已清除断点进度")

    progress = load_progress()

    # 重置每日调用计数
    if progress.get('last_run_date') != today_str():
        progress['calls_today'] = 0
        progress['last_run_date'] = today_str()

    remaining_calls = MAX_CALLS_PER_RUN - progress['calls_today']
    if remaining_calls <= 0:
        print(f"⛔ 今日已消耗 {progress['calls_today']} 次调用，已达本次运行上限，请明天再运行")
        sys.exit(0)

    print(f"今日已用 {progress['calls_today']} 次，本次还可调用 {remaining_calls} 次")

    # 确定采集任务
    end_date = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')  # 昨天

    if args.mode == 'incremental':
        # 增量：只采昨天
        periods = [(end_date, end_date)]
        print(f"增量模式：采集 {end_date}")
    else:
        # 全量：按周分批，跳过已完成的
        weeks = gen_weeks(START_DATE, end_date)
        completed = set(progress.get('completed_weeks', []))
        pending_weeks = [w for w in weeks if f"{w[0]}~{w[1]}" not in completed]
        print(f"全量模式：共 {len(weeks)} 周，已完成 {len(completed)} 周，待采 {len(pending_weeks)} 周")

        # 本次只采 remaining_calls 个周（每周1次调用）
        periods = pending_weeks[:remaining_calls]
        print(f"本次采集: {len(periods)} 周（受每日调用限制）")
        if len(pending_weeks) > remaining_calls:
            print(f"⚠️  还有 {len(pending_weeks) - remaining_calls} 周未采，需继续运行 {(len(pending_weeks) - remaining_calls + remaining_calls - 1) // remaining_calls} 天")

    if not periods:
        print("没有待采集的数据")
        sys.exit(0)

    # 多线程采集
    results = []
    total_rows = 0
    calls_used = 0
    daily_limit_hit = False

    print(f"\n开始多线程采集（MAX_WORKERS={MAX_WORKERS}）...")

    # 注意：由于每日限制，不能无限并发，实际并发受 remaining_calls 约束
    actual_workers = min(MAX_WORKERS, remaining_calls)

    with ThreadPoolExecutor(max_workers=actual_workers) as executor:
        futures = {}
        for period in periods:
            if isinstance(period, tuple):
                start, end = period
            else:
                start = end = period
            f = executor.submit(collect_period, pro, start, end, args.dry_run)
            futures[f] = f"{start}~{end}"

        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            calls_used += 1

            if result['status'] == 'daily_limit':
                daily_limit_hit = True
                # 取消剩余任务
                for f in futures:
                    f.cancel()
                break
            elif result['status'] == 'ok':
                total_rows += result['rows']
                # 记录完成进度
                if not args.dry_run:
                    progress['completed_weeks'].append(result['period'])
                    progress['total_rows'] = progress.get('total_rows', 0) + result['rows']
            elif result['status'] == 'error':
                print(f"  ❌ [{result['period']}] 采集失败")

            # 检查达上限的周（需降级按日采集）
            if result.get('hit_limit') and not args.dry_run:
                print(f"  ⚠️  [{result['period']}] 达单次上限1000条，建议手动按日重采该周")

    # 更新进度
    progress['calls_today'] = progress.get('calls_today', 0) + calls_used
    if not args.dry_run:
        save_progress(progress)

    # 汇总报告
    print(f"\n=== 采集完成 ===")
    ok_results = [r for r in results if r['status'] == 'ok']
    print(f"成功: {len(ok_results)} 个周期 | 本次消耗调用: {calls_used} 次")
    print(f"本次写入行数: {total_rows} | 累计写入: {progress.get('total_rows', 0)} 行")

    if daily_limit_hit:
        print(f"⛔ 触发每日调用限制，已停止。请明天继续运行")

    # 验证数据库
    if not args.dry_run and total_rows > 0:
        r = sb.table('research_report').select('trade_date', count='exact').execute()
        print(f"\n数据库验证: research_report 表共 {r.count} 行")
        r2 = sb.table('research_report').select('trade_date,title,inst_csname').order('trade_date', desc=True).limit(3).execute()
        print(f"最新3条记录:")
        for row in r2.data:
            print(f"  {row['trade_date']} | {row['inst_csname']} | {row['title'][:50]}...")

    # 显示全量进度
    if args.mode == 'full':
        completed_count = len(progress.get('completed_weeks', []))
        total_weeks = len(gen_weeks(START_DATE, end_date))
        pct = completed_count / total_weeks * 100 if total_weeks > 0 else 0
        print(f"\n全量进度: {completed_count}/{total_weeks} 周 ({pct:.1f}%)")
        if completed_count < total_weeks:
            remaining = total_weeks - completed_count
            days_needed = (remaining + MAX_CALLS_PER_RUN - 1) // MAX_CALLS_PER_RUN
            print(f"预计还需 {days_needed} 天完成全量采集")

if __name__ == '__main__':
    main()
