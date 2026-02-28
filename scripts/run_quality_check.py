#!/usr/bin/env python3
"""
Trudecide 宏观数据质量检查脚本
REQ-037 | 自适应设计：从 indicator_meta 自动加载所有指标，无需手动配置

检查维度：
  1. 及时性（Timeliness）  — 数据是否按时更新
  2. 完整性（Completeness）— 时间序列是否有异常断档
  3. 准确性（Accuracy）    — 数值是否存在异常值或量级突变

输出：
  - HTML 报告（/tmp/data_quality_report.html）
  - 控制台摘要
  - ERROR 级别问题通过邮件告警（可选）

用法：
  python run_quality_check.py [--email] [--region CN] [--indicator gdp_yoy]

注意：
  - 需要 SUPABASE_URL、SUPABASE_KEY 环境变量
  - 邮件告警需要 GMAIL_APP_PASSWORD 环境变量（可选）
"""

import os
import sys
import json
import argparse
import smtplib
from datetime import datetime, timedelta, date
from collections import defaultdict
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import numpy as np
from supabase import create_client

# ─────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
GMAIL_USER = 'finalfantansy@163.com'
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '')
ALERT_EMAILS = ['finalfantansy@163.com', '172056205@qq.com']
REPORT_PATH = '/tmp/data_quality_report.html'

# 各频率的最大允许更新间隔（天）
FREQUENCY_MAX_GAP = {
    'daily':     5,    # 日度：超过5天未更新告警
    'weekly':    14,
    'monthly':   50,   # 月度：超过50天未更新告警
    'quarterly': 120,
    'annual':    400,  # 年度：超过400天未更新告警（年度数据一般4月发布上年数据）
}

# 各频率的正常数据间隔（天），用于断档检测
FREQUENCY_NORMAL_GAP = {
    'daily':     3,
    'weekly':    10,
    'monthly':   45,
    'quarterly': 100,
    'annual':    400,
}

# 理论上恒为正的指标（出现负值为 ERROR）
ALWAYS_POSITIVE = {
    'unemployment_rate', 'population', 'gdp_level', 'gdp_per_capita',
    'gdp_per_capita_ppp', 'm2_level', 'gold_price', 'silver_price',
    'oil_wti', 'oil_brent', 'copper_price', 'iron_ore_price',
    'vix', 'sp500', 'nasdaq', 'bond_10y', 'bond_10y_real',
    'policy_rate', 'hs300_pe', 'hs300_pb', 'all_a_pe', 'all_a_pb',
}


# ─────────────────────────────────────────────
# 数据加载
# ─────────────────────────────────────────────
def load_indicators(sb, filter_region=None, filter_indicator=None):
    """从 indicator_meta 自动加载所有指标（自适应：新增指标自动纳入）"""
    q = sb.table('indicator_meta').select('id, region, frequency, category, unit, name_cn')
    if filter_region:
        q = q.eq('region', filter_region)
    if filter_indicator:
        q = q.eq('id', filter_indicator)
    res = q.execute()
    return res.data


def load_values(sb, indicator_id, region, limit=500):
    """加载某指标的最近 N 条数据，按时间升序"""
    res = (sb.table('indicator_values')
           .select('trade_date, value')
           .eq('indicator_id', indicator_id)
           .eq('region', region)
           .order('trade_date', desc=False)
           .limit(limit)
           .execute())
    return res.data


# ─────────────────────────────────────────────
# 检查规则
# ─────────────────────────────────────────────
def check_timeliness(meta, values):
    """及时性检查：最新数据是否超过允许的更新间隔"""
    issues = []
    if not values:
        issues.append({
            'level': 'ERROR',
            'rule': 'timeliness_no_data',
            'message': '无任何数据',
        })
        return issues

    freq = meta.get('frequency', 'monthly')
    max_gap = FREQUENCY_MAX_GAP.get(freq, 50)
    latest_date_str = values[-1]['trade_date']
    try:
        latest_date = datetime.strptime(str(latest_date_str)[:10], '%Y-%m-%d').date()
    except Exception:
        return issues

    today = date.today()
    gap_days = (today - latest_date).days

    if gap_days > max_gap:
        level = 'ERROR' if gap_days > max_gap * 2 else 'WARNING'
        issues.append({
            'level': level,
            'rule': 'timeliness_stale',
            'message': f'最新数据 {latest_date_str} 距今 {gap_days} 天，超过 {max_gap} 天阈值（频率: {freq}）',
        })
    return issues


def check_completeness(meta, values):
    """完整性检查：时间序列是否有异常断档"""
    issues = []
    if len(values) < 3:
        return issues

    freq = meta.get('frequency', 'monthly')
    normal_gap = FREQUENCY_NORMAL_GAP.get(freq, 45)
    max_allowed = normal_gap * 3  # 超过3倍正常间隔视为断档

    dates = []
    for v in values:
        try:
            dates.append(datetime.strptime(str(v['trade_date'])[:10], '%Y-%m-%d').date())
        except Exception:
            continue

    gaps = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
    large_gaps = [(dates[i], dates[i+1], gaps[i]) for i, g in enumerate(gaps) if g > max_allowed]

    # 只报告最近5年内的断档
    cutoff = date.today() - timedelta(days=5*365)
    recent_gaps = [(s, e, g) for s, e, g in large_gaps if e > cutoff]

    for start, end, gap in recent_gaps[-3:]:  # 最多报3个
        issues.append({
            'level': 'WARNING',
            'rule': 'completeness_gap',
            'message': f'时间断档：{start} → {end}，间隔 {gap} 天（正常间隔 {normal_gap} 天）',
        })
    return issues


def check_accuracy(meta, values):
    """准确性检查：异常值、量级突变、符号一致性"""
    issues = []
    if len(values) < 10:
        return issues

    indicator_id = meta.get('id', '')
    nums = []
    for v in values:
        try:
            val = float(v['value'])
            if val is not None:
                nums.append(val)
        except (TypeError, ValueError):
            continue

    if len(nums) < 10:
        return issues

    arr = np.array(nums)

    # 1. 符号一致性：理论恒正的指标出现负值
    if indicator_id in ALWAYS_POSITIVE:
        neg_count = int(np.sum(arr < 0))
        if neg_count > 0:
            issues.append({
                'level': 'ERROR',
                'rule': 'accuracy_negative_value',
                'message': f'发现 {neg_count} 条负值（该指标理论上恒为正）',
            })

    # 2. 异常值检测：超过均值 ± 3σ（只检查最近50条）
    recent = arr[-50:]
    mean, std = np.mean(recent), np.std(recent)
    if std > 0:
        outliers = np.where(np.abs(recent - mean) > 3 * std)[0]
        if len(outliers) > 0:
            # 只报最近的异常
            last_outlier_idx = outliers[-1]
            outlier_val = recent[last_outlier_idx]
            issues.append({
                'level': 'WARNING',
                'rule': 'accuracy_outlier',
                'message': f'发现异常值 {outlier_val:.4g}（均值 {mean:.4g} ± 3σ={3*std:.4g}），共 {len(outliers)} 个异常点',
            })

    # 3. 量级突变：相邻两期变化超过历史波动率的5倍（只检查最近20条）
    recent20 = arr[-20:]
    if len(recent20) >= 5:
        diffs = np.abs(np.diff(recent20))
        hist_diffs = np.abs(np.diff(arr[:-20])) if len(arr) > 20 else diffs
        hist_std = np.std(hist_diffs) if len(hist_diffs) > 1 else np.std(diffs)
        if hist_std > 0:
            spike_idx = np.where(diffs > 5 * hist_std)[0]
            if len(spike_idx) > 0:
                spike_val = diffs[spike_idx[-1]]
                issues.append({
                    'level': 'WARNING',
                    'rule': 'accuracy_spike',
                    'message': f'发现量级突变：单期变化 {spike_val:.4g}，超过历史波动率 5 倍（历史σ={hist_std:.4g}）',
                })

    return issues


# ─────────────────────────────────────────────
# 主检查流程
# ─────────────────────────────────────────────
def run_checks(sb, indicators):
    """对所有指标运行三类检查，返回结构化结果"""
    results = []
    total = len(indicators)
    for i, meta in enumerate(indicators):
        ind_id = meta['id']
        region = meta['region']
        if (i + 1) % 20 == 0 or i == 0:
            print(f'  检查进度: {i+1}/{total} ({ind_id}/{region})')

        values = load_values(sb, ind_id, region)
        data_count = len(values)

        issues = []
        issues += check_timeliness(meta, values)
        issues += check_completeness(meta, values)
        issues += check_accuracy(meta, values)

        results.append({
            'indicator_id': ind_id,
            'region': region,
            'frequency': meta.get('frequency', '?'),
            'category': meta.get('category', '?'),
            'name_cn': meta.get('name_cn', ind_id),
            'data_count': data_count,
            'latest_date': str(values[-1]['trade_date'])[:10] if values else 'N/A',
            'issues': issues,
            'error_count': sum(1 for x in issues if x['level'] == 'ERROR'),
            'warning_count': sum(1 for x in issues if x['level'] == 'WARNING'),
        })

    return results


# ─────────────────────────────────────────────
# HTML 报告生成
# ─────────────────────────────────────────────
def generate_html_report(results, check_time):
    """生成 HTML 质量报告"""
    total = len(results)
    error_items = [r for r in results if r['error_count'] > 0]
    warning_items = [r for r in results if r['warning_count'] > 0 and r['error_count'] == 0]
    ok_items = [r for r in results if r['error_count'] == 0 and r['warning_count'] == 0]

    total_errors = sum(r['error_count'] for r in results)
    total_warnings = sum(r['warning_count'] for r in results)
    total_data = sum(r['data_count'] for r in results)

    def issue_rows(items):
        rows = ''
        for r in items:
            for iss in r['issues']:
                level_color = '#dc2626' if iss['level'] == 'ERROR' else '#d97706'
                level_bg = '#fef2f2' if iss['level'] == 'ERROR' else '#fffbeb'
                rows += f"""
                <tr style="background:{level_bg}">
                  <td style="padding:8px 12px;font-weight:600;color:{level_color}">{iss['level']}</td>
                  <td style="padding:8px 12px">{r['region']}</td>
                  <td style="padding:8px 12px;font-family:monospace">{r['indicator_id']}</td>
                  <td style="padding:8px 12px;color:#6b7280">{r['name_cn']}</td>
                  <td style="padding:8px 12px;color:#374151">{iss['rule']}</td>
                  <td style="padding:8px 12px">{iss['message']}</td>
                </tr>"""
        return rows

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Trudecide 数据质量报告 {check_time}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
         background:#f9fafb; color:#111827; margin:0; padding:24px; }}
  h1 {{ font-size:22px; font-weight:700; margin-bottom:4px; }}
  .subtitle {{ color:#6b7280; font-size:14px; margin-bottom:24px; }}
  .cards {{ display:flex; gap:16px; margin-bottom:28px; flex-wrap:wrap; }}
  .card {{ background:#fff; border-radius:10px; padding:20px 28px; min-width:140px;
           box-shadow:0 1px 3px rgba(0,0,0,.08); }}
  .card .num {{ font-size:32px; font-weight:700; }}
  .card .label {{ font-size:13px; color:#6b7280; margin-top:4px; }}
  .card.error .num {{ color:#dc2626; }}
  .card.warning .num {{ color:#d97706; }}
  .card.ok .num {{ color:#16a34a; }}
  .section {{ background:#fff; border-radius:10px; padding:20px;
              box-shadow:0 1px 3px rgba(0,0,0,.08); margin-bottom:20px; }}
  .section h2 {{ font-size:15px; font-weight:600; margin:0 0 14px; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  th {{ text-align:left; padding:8px 12px; background:#f3f4f6;
        font-weight:600; color:#374151; border-bottom:1px solid #e5e7eb; }}
  tr:hover {{ background:#f9fafb; }}
  .ok-badge {{ color:#16a34a; font-size:13px; }}
</style>
</head>
<body>
<h1>Trudecide 宏观数据质量报告</h1>
<div class="subtitle">检查时间：{check_time} &nbsp;|&nbsp; 共检查 {total} 个指标序列 &nbsp;|&nbsp; 总数据量：{total_data:,} 条</div>

<div class="cards">
  <div class="card error"><div class="num">{total_errors}</div><div class="label">ERROR（需立即处理）</div></div>
  <div class="card warning"><div class="num">{total_warnings}</div><div class="label">WARNING（需关注）</div></div>
  <div class="card ok"><div class="num">{len(ok_items)}</div><div class="label">正常指标</div></div>
  <div class="card"><div class="num">{total}</div><div class="label">检查总数</div></div>
  <div class="card"><div class="num">{total_data:,}</div><div class="label">总数据条数</div></div>
</div>
"""

    if error_items:
        html += f"""
<div class="section">
  <h2>🔴 ERROR 问题（{len(error_items)} 个指标，{total_errors} 个问题）</h2>
  <table>
    <tr><th>级别</th><th>地区</th><th>指标ID</th><th>指标名</th><th>规则</th><th>详情</th></tr>
    {issue_rows(error_items)}
  </table>
</div>"""

    if warning_items:
        html += f"""
<div class="section">
  <h2>🟡 WARNING 问题（{len(warning_items)} 个指标，{total_warnings} 个问题）</h2>
  <table>
    <tr><th>级别</th><th>地区</th><th>指标ID</th><th>指标名</th><th>规则</th><th>详情</th></tr>
    {issue_rows(warning_items)}
  </table>
</div>"""

    # 覆盖度统计
    region_stats = defaultdict(lambda: {'total': 0, 'errors': 0, 'warnings': 0, 'data': 0})
    for r in results:
        rg = r['region']
        region_stats[rg]['total'] += 1
        region_stats[rg]['errors'] += r['error_count']
        region_stats[rg]['warnings'] += r['warning_count']
        region_stats[rg]['data'] += r['data_count']

    region_rows = ''
    for rg, s in sorted(region_stats.items()):
        status = '🔴' if s['errors'] > 0 else ('🟡' if s['warnings'] > 0 else '✅')
        region_rows += f"""<tr>
          <td style="padding:8px 12px;font-weight:600">{rg}</td>
          <td style="padding:8px 12px">{s['total']}</td>
          <td style="padding:8px 12px">{s['data']:,}</td>
          <td style="padding:8px 12px;color:#dc2626">{s['errors'] or ''}</td>
          <td style="padding:8px 12px;color:#d97706">{s['warnings'] or ''}</td>
          <td style="padding:8px 12px">{status}</td>
        </tr>"""

    html += f"""
<div class="section">
  <h2>📊 各地区覆盖度统计</h2>
  <table>
    <tr><th>地区</th><th>指标数</th><th>数据量</th><th>ERROR</th><th>WARNING</th><th>状态</th></tr>
    {region_rows}
  </table>
</div>

<div class="section">
  <h2>✅ 正常指标（{len(ok_items)} 个）</h2>
  <p style="color:#6b7280;font-size:13px">以下指标无任何问题：
    {', '.join(f'<code>{r["region"]}/{r["indicator_id"]}</code>' for r in ok_items[:30])}
    {'...' if len(ok_items) > 30 else ''}
  </p>
</div>

</body></html>"""

    return html


# ─────────────────────────────────────────────
# 邮件告警
# ─────────────────────────────────────────────
def send_alert_email(html_content, error_count, warning_count, check_time):
    """发送 HTML 格式的质量报告邮件（仅在有 ERROR 时发送，或强制发送）"""
    if not GMAIL_APP_PASSWORD:
        print('  [跳过邮件] 未设置 GMAIL_APP_PASSWORD 环境变量')
        return

    subject = f'[Trudecide] 数据质量报告 {check_time} — {error_count} ERROR / {warning_count} WARNING'
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = GMAIL_USER
    msg['To'] = ', '.join(ALERT_EMAILS)
    msg.attach(MIMEText(html_content, 'html', 'utf-8'))

    try:
        # 163 邮箱 SMTP
        with smtplib.SMTP_SSL('smtp.163.com', 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, ALERT_EMAILS, msg.as_string())
        print(f'  ✉️  邮件已发送至 {ALERT_EMAILS}')
    except Exception as e:
        print(f'  [邮件发送失败] {e}')


# ─────────────────────────────────────────────
# 入口
# ─────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Trudecide 宏观数据质量检查')
    parser.add_argument('--email', action='store_true', help='强制发送邮件报告（即使无 ERROR）')
    parser.add_argument('--region', type=str, default=None, help='只检查指定地区（如 CN）')
    parser.add_argument('--indicator', type=str, default=None, help='只检查指定指标（如 gdp_yoy）')
    parser.add_argument('--output', type=str, default=REPORT_PATH, help='HTML 报告输出路径')
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print('错误：请设置 SUPABASE_URL 和 SUPABASE_KEY 环境变量')
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    check_time = datetime.now().strftime('%Y-%m-%d %H:%M')

    print(f'\n=== Trudecide 数据质量检查 {check_time} ===')
    print('加载指标列表...')
    indicators = load_indicators(sb, filter_region=args.region, filter_indicator=args.indicator)
    print(f'共加载 {len(indicators)} 个指标序列')

    print('\n开始检查...')
    results = run_checks(sb, indicators)

    # 统计
    total_errors = sum(r['error_count'] for r in results)
    total_warnings = sum(r['warning_count'] for r in results)
    total_data = sum(r['data_count'] for r in results)
    ok_count = sum(1 for r in results if r['error_count'] == 0 and r['warning_count'] == 0)

    print(f'\n=== 检查完成 ===')
    print(f'  总指标数: {len(results)}')
    print(f'  总数据量: {total_data:,} 条')
    print(f'  ERROR:   {total_errors} 个')
    print(f'  WARNING: {total_warnings} 个')
    print(f'  正常:    {ok_count} 个')

    # 生成 HTML 报告
    html = generate_html_report(results, check_time)
    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'\n  📄 HTML 报告已保存至: {args.output}')

    # 邮件告警
    if total_errors > 0 or args.email:
        send_alert_email(html, total_errors, total_warnings, check_time)

    # 返回状态码（ERROR 时非零，方便 CI 集成）
    sys.exit(1 if total_errors > 0 else 0)


if __name__ == '__main__':
    main()
