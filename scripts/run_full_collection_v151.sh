#!/bin/bash
# Trudecide v1.5.1 首次全量数据采集脚本
# ======================================
# 执行前请确保已配置环境变量：
#   export TUSHARE_TOKEN="your_token"
#   export SUPABASE_URL="your_url"
#   export SUPABASE_SERVICE_KEY="your_key"

set -e

echo "=== Trudecide v1.5.1 首次全量数据采集 ==="
echo "开始时间: $(date)"
echo ""

# 检查环境变量
if [ -z "$TUSHARE_TOKEN" ]; then
    echo "❌ 错误: 未设置 TUSHARE_TOKEN 环境变量"
    exit 1
fi

if [ -z "$SUPABASE_URL" ]; then
    echo "❌ 错误: 未设置 SUPABASE_URL 环境变量"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "❌ 错误: 未设置 SUPABASE_SERVICE_KEY 环境变量"
    exit 1
fi

echo "✅ 环境变量检查通过"
echo ""

# 1. 股票行情数据（周/月 K 线）
echo "[1/7] 采集周线数据（全量 - 最近5年）..."
echo "    预计时间: 2-3小时（5800+只股票）"
echo "    积分消耗: 2000分"
python3 scripts/collect_stock_weekly.py --mode full --workers 10
echo ""

echo "[2/7] 采集月线数据（全量 - 最近5年）..."
echo "    预计时间: 2-3小时（5800+只股票）"
echo "    积分消耗: 2000分"
python3 scripts/collect_stock_monthly.py --mode full --workers 10
echo ""

# 2. 公司基本面数据（REQ-160~163）
echo "[3/7] 采集公司基本信息（REQ-160）..."
echo "    预计时间: 5分钟"
echo "    积分消耗: 120分"
python3 scripts/collect_stock_company_info.py
echo ""

echo "[4/7] 采集高管信息（REQ-161）..."
echo "    预计时间: 2-3小时（5800+只股票）"
echo "    积分消耗: 2000分"
python3 scripts/collect_stock_managers.py
echo ""

echo "[5/7] 采集主营业务构成（REQ-162）..."
echo "    预计时间: 30分钟"
echo "    积分消耗: 5000分"
python3 scripts/collect_stock_main_business.py --mode full
echo ""

echo "[6/7] 采集股东户数（REQ-163）..."
echo "    预计时间: 1-2小时（5800+只股票）"
echo "    积分消耗: 600分"
python3 scripts/collect_stock_holder_number.py --mode full
echo ""

# 3. 日线数据（增量 - 最近1年）
echo "[7/7] 采集日线数据（增量）..."
echo "    预计时间: 30分钟"
echo "    积分消耗: 免费"
python3 scripts/collect_stock_daily.py --mode incremental
echo ""

echo "=== 采集完成 ==="
echo "结束时间: $(date)"
echo ""
echo "📊 数据验证 SQL:"
echo "    SELECT 'stock_weekly' as table_name, MAX(trade_date) as latest_date, COUNT(*) as total_rows FROM stock_weekly"
echo "    UNION ALL"
echo "    SELECT 'stock_monthly', MAX(trade_date), COUNT(*) FROM stock_monthly"
echo "    UNION ALL"
echo "    SELECT 'stock_company_info', MAX(updated_at), COUNT(*) FROM stock_company_info;"
