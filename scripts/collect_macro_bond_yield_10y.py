#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-034 全球宏观指标-10年期国债收益率-采集脚本
================================================

采集 SG/MY/TH/ID/PH 的 10 年期国债收益率月度数据。

**数据源**：
- SG, MY, ID, PH: Stooq (https://stooq.com/)
  - 月度数据，通过 CSV 下载接口获取
  - tickers: 10ysgy.b, 10ymyy.b, 10yidy.b, 10yphy.b
- TH: Bank of Thailand (BOT) FM_RT_001_S2 统计报告
  - URL: https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=223&language=ENG
  - 需要先通过浏览器下载 CSV，然后解析 "10 years" 行
  - 注意：BOT 网站不支持直接 HTTP 下载，需要先在浏览器中设置日期范围并下载
- PE: BLOCKED - BCRP (Banco Central de Reserva del Perú) 对 sandbox IP 完全封锁
  - 尝试过的方案：BCRP API, BCRP 主站, Stooq (无 PE 数据), OECD (无 PE 数据)

**采集逻辑**：
1.  **Stooq**: 使用 `requests` 直接下载 CSV
2.  **BOT**: 解析已下载的 CSV 文件（需要手动下载）
3.  数据清洗、合并，并转换成标准格式
4.  使用 `collect_helper` 写入 `indicator_values` 表

**注意事项**：
- 踩坑：`indicator_values.value` 字段精度为 NUMERIC(5,4)，只能存储 < 10 的数值
  → 国债收益率通常在 0-20% 之间，超过 10% 的值会导致 overflow
  → 已通过 Supabase 控制台将 value 字段改为 NUMERIC(10, 4)
- 踩坑：`collect_target.target_value` 设置为 5（国家数），但 actual_count 是 942（记录数）
  → completion_rate = 942/5 = 188.4，超出 NUMERIC(5,4) 范围
  → 已将 target_value 改为 NULL
- 踩坑：`indicator_values` 有外键约束 indicator_id_fkey，需要先在 indicator_meta 中插入对应记录
  → 已在 indicator_meta 中插入 bond_yield_10y 的 SG/MY/ID/PH/TH 记录

"""

import os
import requests
import sys
import pandas as pd
from io import StringIO
import time
from datetime import datetime

# 导入采集助手
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure

MODULE_NAME = "macro_bond_yield_10y"

# --- Stooq 配置 ---
STOOQ_URL_TEMPLATE = "https://stooq.com/q/d/l/?s={ticker}&i=m"
STOOQ_TICKERS = {
    "SG": "10ysgy.b", # Singapore
    "MY": "10ymyy.b", # Malaysia
    "ID": "10yidy.b", # Indonesia
    "PH": "10yphy.b", # Philippines
}

# --- BOT 配置 ---
# Thailand data is downloaded manually from BOT website:
# https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=223&language=ENG
# Set date range to Jan 2005 - Jul 2025, then click "Download CSV"
BOT_CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "bot_th_bond10y.csv")

def get_stooq_data(country_code: str) -> pd.DataFrame:
    """从 Stooq 下载指定国家的10年期国债收益率数据"""
    ticker = STOOQ_TICKERS[country_code]
    url = STOOQ_URL_TEMPLATE.format(ticker=ticker)
    print(f"[DATA] Downloading {country_code} data from Stooq: {url}")
    for i in range(3):
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            df = pd.read_csv(StringIO(r.text))
            if 'Date' not in df.columns:
                raise ValueError("\"Date\" column not found in Stooq response")
            df["region"] = country_code
            df["Date"] = pd.to_datetime(df["Date"])
            df = df.rename(columns={"Date": "trade_date", "Close": "value"})
            print(f"[DATA] -> OK, {len(df)} rows from Stooq for {country_code}")
            return df[["trade_date", "value", "region"]]
        except Exception as e:
            print(f"[DATA] -> ERROR downloading {country_code} from Stooq (attempt {i+1}/3): {e}")
            if i < 2:
                time.sleep(5)
    return pd.DataFrame()

def get_bot_data(csv_path: str) -> pd.DataFrame:
    """
    解析 BOT（泰国央行）下载的 CSV 文件，提取 10 年期国债收益率数据。
    
    CSV 文件需要从 BOT 网站手动下载：
    https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=223&language=ENG
    设置日期范围后点击 "Download CSV"。
    """
    if not os.path.exists(csv_path):
        print(f"[DATA] BOT CSV file not found: {csv_path}")
        print("[DATA] Please download it manually from: https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=223&language=ENG")
        return pd.DataFrame()
    
    print(f"[DATA] Parsing BOT CSV file: {csv_path}")
    try:
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            lines = f.readlines()
        
        # Find the header line (starts with ",," and contains year)
        header_line_idx = None
        for i, line in enumerate(lines):
            if line.startswith(",,") and ("2025" in line or "2024" in line):
                header_line_idx = i
                break
        
        if header_line_idx is None:
            raise ValueError("Header line not found in BOT CSV file")
        
        csv_content = "".join(lines[header_line_idx:])
        df = pd.read_csv(StringIO(csv_content), header=0)
        
        # Find the row with exactly "10 years"
        mask = df["Unnamed: 1"].astype(str).str.strip() == "10 years"
        row_10y = df[mask]
        
        if row_10y.empty:
            raise ValueError("Row '10 years' not found in BOT CSV file")
        
        # Extract the time series data
        date_cols = df.columns[2:]
        values = row_10y.iloc[0, 2:].values
        
        records = []
        for col, val in zip(date_cols, values):
            col_clean = col.strip().replace(" p", "").strip()
            try:
                dt = datetime.strptime(col_clean, "%b %Y")
                trade_date = dt.replace(day=1)
                value = float(str(val).strip())
                records.append({"trade_date": trade_date, "value": value, "region": "TH"})
            except (ValueError, TypeError):
                continue
        
        result_df = pd.DataFrame(records)
        print(f"[DATA] -> OK, {len(result_df)} rows from BOT CSV for TH")
        return result_df
    except Exception as e:
        print(f"[DATA] -> ERROR parsing BOT CSV: {e}")
        return pd.DataFrame()

def main():
    """主执行函数"""
    context = CollectionContext(MODULE_NAME)
    try:
        # 1. 获取目标 & 记录开始
        target = get_active_target(context.sb, MODULE_NAME)
        log_start(context, target)

        # 2. 执行采集
        all_dfs = []
        
        # 从 Stooq 获取 SG/MY/ID/PH 数据
        for country in STOOQ_TICKERS.keys():
            df = get_stooq_data(country)
            if not df.empty:
                all_dfs.append(df)
        
        # 从 BOT CSV 获取 TH 数据
        bot_df = get_bot_data(BOT_CSV_PATH)
        if not bot_df.empty:
            all_dfs.append(bot_df)

        if not all_dfs:
            raise ValueError("No data collected from any source.")

        final_df = pd.concat(all_dfs, ignore_index=True)
        final_df["indicator_id"] = "bond_yield_10y"
        final_df["collected_at"] = datetime.now().isoformat()
        final_df["publish_date"] = final_df["trade_date"].apply(lambda x: x.isoformat() if hasattr(x, 'isoformat') else x)

        # 3. 写入数据库
        print(f"[DB] Writing {len(final_df)} rows to indicator_values table...")
        final_df["value"] = pd.to_numeric(final_df["value"], errors='coerce').round(4)
        final_df.dropna(subset=["value"], inplace=True)
        final_df["trade_date"] = final_df["trade_date"].apply(lambda x: x.replace(day=1).isoformat() if hasattr(x, 'replace') else x)

        # Prepare data for upsert
        records = final_df.to_dict("records")
        context.sb.table("indicator_values").upsert(records).execute()
        actual_count = len(final_df)

        # 4. 记录成功
        log_success(context, actual_count)

    except Exception as e:
        # 5. 记录失败
        print(f"[ERROR] {e}")
        log_failure(context, e)
    finally:
        print(f"采集任务 {context.run_id} 执行完毕，状态: {context.status}")

if __name__ == "__main__":
    main()
