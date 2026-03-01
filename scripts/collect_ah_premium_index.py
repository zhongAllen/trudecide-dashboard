#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
REQ-072: 宏观宽表数据采集 - AH股溢价指数代理指标

- 功能: 由于Tushare不直接提供恒生AH股溢价指数，本脚本通过获取所有AH股的比价数据，
        计算每日的平均溢价率，作为一个代理指标存入数据库。
- 作者: Manus AI
- 版本: v1.0
"""

import os
import pandas as pd
from supabase import create_client
import tushare as ts
from datetime import datetime, timedelta



def collect_and_calculate_ah_premium(pro, sb, days_to_fetch=365):
    """主函数：采集并计算AH股平均溢价率"""
    print("--- 开始采集AH股溢价数据 ---")
    
    # 1. 获取最近一年的交易日
    today = datetime.now()
    one_year_ago = today - timedelta(days=days_to_fetch)
    trade_dates_df = pro.trade_cal(exchange='SSE', start_date=one_year_ago.strftime('%Y%m%d'), end_date=today.strftime('%Y%m%d'))
    trade_dates = trade_dates_df[trade_dates_df["is_open"] == 1]["cal_date"].tolist()    
    dates_to_process = [d for d in trade_dates if one_year_ago.strftime("%Y%m%d") <= d <= today.strftime("%Y%m%d")]
    print(f"共获取到 {len(dates_to_process)} 个交易日。")

    all_daily_premiums = []

    # 2. 循环获取每一天的AH股比价数据
    for i, trade_date in enumerate(dates_to_process):
        print(f"正在处理日期: {trade_date} ({i+1}/{len(dates_to_process)})...", end='\r')
        try:
            df = pro.stk_ah_comparison(trade_date=trade_date)
            if not df.empty and \'ah_premium\' in df.columns:
                # 计算当日的平均溢价率
                daily_avg_premium = df[\'ah_premium\'].mean()
                all_daily_premiums.append({
                    "ts_code": "CALC_AH_PREMIUM_AVG",
                    "period": trade_date,
                    "value": round(daily_avg_premium, 4),
                    "region": "CN_HK"
                })
                print(f" 当日平均溢价: {daily_avg_premium:.2f}%")
            else:
                print(" 当日无数据或数据格式错误。")
        except Exception as e:
            print(f" 获取数据时出错: {e}")

    # 3. 将计算结果存入数据库
    if all_daily_premiums:
        print(f"\n--- 准备将 {len(all_daily_premiums)} 条平均溢价数据写入数据库 ---")
        try:
            # 为了幂等性，先删除已存在的数据
            for row in all_daily_premiums:
                sb.table("macro_timeseries").delete().match({"ts_code": row["ts_code"], "period": row["period"]}).execute()
            
            res = sb.table("macro_timeseries").insert(all_daily_premiums).execute()
            print("成功写入AH股平均溢价数据:", len(res.data))
        except Exception as e:
            print(f"写入数据库失败: {e}")
    else:
        print("\n没有计算出任何数据，不执行数据库写入操作。")

if __name__ == "__main__":
    sb_url = os.environ.get("SUPABASE_URL")
    sb_key = os.environ.get("SUPABASE_KEY")
    ts_token = os.environ.get("TUSHARE_TOKEN")

    if not all([sb_url, sb_key, ts_token]):
        raise ValueError("Supabase或Tushare的配置信息不完整，请检查环境变量。")

    sb = create_client(sb_url, sb_key)
    pro = ts.pro_api(ts_token)

    collect_and_calculate_ah_premium(pro, sb, days_to_fetch=90) # 先获取最近90天的数据进行测试
