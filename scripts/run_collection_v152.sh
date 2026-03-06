#!/bin/bash
# Trudecide v1.5.2 数据采集脚本
# =============================
# 采集REQ-177~180所有数据

set -e

echo "=== Trudecide v1.5.2 数据采集 ==="
echo "开始时间: $(date)"
echo ""

# 检查环境变量
if [ -z "$TUSHARE_TOKEN" ]; then
    echo "❌ 错误: 未设置 TUSHARE_TOKEN"
    exit 1
fi
if [ -z "$SUPABASE_URL" ]; then
    echo "❌ 错误: 未设置 SUPABASE_URL"
    exit 1
fi
if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "❌ 错误: 未设置 SUPABASE_SERVICE_KEY"
    exit 1
fi

echo "✅ 环境变量检查通过"
echo ""

# REQ-177: 指数数据
echo "[1/14] 指数基本信息..."
python3 scripts/collect_index_basic.py

echo "[2/14] 指数周线..."
python3 scripts/collect_index_weekly.py

echo "[3/14] 指数月线..."
python3 scripts/collect_index_monthly.py

echo "[4/14] 指数成分权重..."
python3 scripts/collect_index_weight.py

echo "[5/14] 指数每日指标..."
python3 scripts/collect_index_dailybasic.py

# REQ-178: 行业数据
echo "[6/14] 申万行业数据..."
python3 scripts/collect_sw_industry.py

echo "[7/14] 中信行业数据..."
python3 scripts/collect_citic_industry.py

echo "[8/14] 国际指数..."
python3 scripts/collect_global_index.py

# REQ-179: 市场统计
echo "[9/14] 指数技术面..."
python3 scripts/collect_index_technical.py

echo "[10/14] 市场每日统计..."
python3 scripts/collect_market_daily_info.py

echo "[11/14] 深圳市场统计..."
python3 scripts/collect_sz_market_daily.py

# REQ-180: 资金流向
echo "[12/14] 个股资金流向..."
python3 scripts/collect_moneyflow.py

echo "[13/14] 多源个股资金流向..."
python3 scripts/collect_moneyflow_ths.py
python3 scripts/collect_moneyflow_dc.py

echo "[14/14] 行业/板块资金流向..."
python3 scripts/collect_moneyflow_industry.py

echo ""
echo "=== 采集完成 ==="
echo "结束时间: $(date)"
