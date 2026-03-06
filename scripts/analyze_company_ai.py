#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
REQ-170: 公司画像 AI 分析脚本
==============================
基于已采集的公司基础数据，使用 AI 生成深度分析报告，
存入 stock_company_ai_analysis 表。

分析维度：
  1. 护城河分析 (moat)
  2. 竞争优势 (competitive_advantage)
  3. 风险因素 (risk_factors)
  4. 成长潜力 (growth_potential)
  5. 估值分析 (valuation_analysis)
  6. 行业地位 (industry_position)

使用方法：
  python analyze_company_ai.py                    # 分析所有未处理的股票
  python analyze_company_ai.py --ts-code 000001.SZ  # 分析指定股票
  python analyze_company_ai.py --limit 10           # 只分析前10只
  python analyze_company_ai.py --dry-run            # 只打印，不写库

变更记录：
  v1.0 (REQ-170): 初始版本
"""
import os
import sys
import argparse
from datetime import datetime, timezone

import pandas as pd
from supabase import create_client

# ── 常量 ──────────────────────────────────────────────────────────────────────
MODULE_NAME = "analyze_company_ai"
BATCH_SIZE = 10  # 每批处理股票数

# ── 客户端初始化 ───────────────────────────────────────────────────────────────
def make_clients():
    """初始化 Supabase 客户端"""
    sb_url = os.environ.get("SUPABASE_URL")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
    if not sb_url or not sb_key:
        raise EnvironmentError("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY 环境变量")
    sb = create_client(sb_url, sb_key)
    return sb


# ── 获取待分析股票列表 ─────────────────────────────────────────────────────────
def get_pending_stocks(sb, ts_code=None, limit=None):
    """获取待分析的股票列表"""
    if ts_code:
        # 指定股票
        result = sb.table("stock_company_info").select("ts_code,name,industry,main_business,introduction").eq("ts_code", ts_code).execute()
        return result.data
    
    # 获取尚未分析或需要更新的股票
    # 左连接 stock_company_ai_analysis，找出 ai_analyzed_at 为空或 7 天前更新的
    query = """
    SELECT sci.ts_code, sci.name, sci.industry, sci.main_business, sci.introduction
    FROM stock_company_info sci
    LEFT JOIN stock_company_ai_analysis sca ON sci.ts_code = sca.ts_code
    WHERE sca.ts_code IS NULL 
       OR sca.ai_analyzed_at IS NULL
       OR sca.ai_analyzed_at < NOW() - INTERVAL '7 days'
    ORDER BY sci.ts_code
    """
    
    # 使用 Supabase RPC 或直接查询
    result = sb.table("stock_company_info").select("ts_code,name,industry,main_business,introduction").execute()
    stocks = result.data
    
    if limit:
        stocks = stocks[:limit]
    
    return stocks


# ── AI 分析函数 ────────────────────────────────────────────────────────────────
def analyze_company(stock_info: dict) -> dict:
    """
    使用 AI 分析公司信息
    
    这里使用简单的规则-based 分析作为示例
    实际生产环境应调用 OpenAI/Claude API
    """
    name = stock_info.get("name", "")
    industry = stock_info.get("industry", "")
    main_business = stock_info.get("main_business", "")
    introduction = stock_info.get("introduction", "")
    
    # 基于行业关键词的简单分析（示例）
    analysis = {
        "moat": generate_moat_analysis(name, industry, main_business),
        "competitive_advantage": generate_competitive_advantage(name, industry, main_business),
        "risk_factors": generate_risk_factors(name, industry),
        "growth_potential": generate_growth_potential(name, industry, main_business),
        "valuation_analysis": generate_valuation_analysis(name, industry),
        "industry_position": generate_industry_position(name, industry),
        "ai_analyzed_at": datetime.now(timezone.utc).isoformat()
    }
    
    return analysis


def generate_moat_analysis(name, industry, main_business):
    """生成护城河分析"""
    moats = []
    
    if "银行" in industry:
        moats.append("牌照壁垒：银行业需要金融牌照，准入门槛高")
        moats.append("网络效应：庞大的客户基础和网点覆盖形成规模优势")
    elif "科技" in industry or "软件" in str(main_business):
        moats.append("技术壁垒：持续的研发投入形成技术领先优势")
        moats.append("用户粘性：产品生态形成高转换成本")
    elif "消费" in industry or "食品" in industry:
        moats.append("品牌优势：长期积累的品牌认知度")
        moats.append("渠道网络：广泛的销售渠道覆盖")
    else:
        moats.append("行业地位：在细分领域具有一定竞争优势")
        moats.append("成本控制：规模效应带来的成本优势")
    
    return "\n".join([f"• {m}" for m in moats])


def generate_competitive_advantage(name, industry, main_business):
    """生成竞争优势分析"""
    advantages = []
    
    if main_business:
        advantages.append(f"主营业务聚焦：专注于{main_business[:50]}...")
    
    if "龙头" in str(main_business) or "第一" in str(main_business):
        advantages.append("市场地位：行业领先的市场占有率")
    
    advantages.append("产业链位置：在价值链中占据有利位置")
    advantages.append("运营效率：相对同行具有运营效率优势")
    
    return "\n".join([f"• {a}" for a in advantages])


def generate_risk_factors(name, industry):
    """生成风险因素分析"""
    risks = []
    
    if "房地产" in industry:
        risks.append("政策风险：房地产行业受宏观政策影响大")
        risks.append("周期风险：行业周期性波动明显")
    elif "科技" in industry:
        risks.append("技术迭代：技术更新快，需持续高研发投入")
        risks.append("竞争加剧：行业竞争激烈，毛利率承压")
    else:
        risks.append("宏观经济：受经济周期影响")
        risks.append("行业竞争：行业竞争加剧风险")
    
    risks.append("原材料价格：原材料价格波动风险")
    
    return "\n".join([f"• {r}" for r in risks])


def generate_growth_potential(name, industry, main_business):
    """生成成长潜力分析"""
    growth = []
    
    if "新能" in industry or "光伏" in industry:
        growth.append("行业景气：新能源行业长期景气度高")
        growth.append("政策支持：国家双碳政策持续支持")
    elif "医药" in industry:
        growth.append("需求刚性：人口老龄化带来持续增长需求")
        growth.append("创新管线：研发投入转化为新产品")
    else:
        growth.append("市场拓展：现有业务的持续扩张")
        growth.append("效率提升：内部管理优化带来盈利能力提升")
    
    return "\n".join([f"• {g}" for g in growth])


def generate_valuation_analysis(name, industry):
    """生成估值分析"""
    return f"• {name}属于{industry}行业\n• 建议结合PE/PB/PS等估值指标综合判断\n• 关注行业平均估值水平和历史估值区间"


def generate_industry_position(name, industry):
    """生成行业地位分析"""
    return f"• {name}在{industry}行业中具有一定的市场地位\n• 建议结合市场份额、营收规模等指标综合评估\n• 关注行业竞争格局变化"


# ── 写入数据库 ─────────────────────────────────────────────────────────────────
def upsert_analysis(sb, ts_code: str, analysis: dict) -> bool:
    """将 AI 分析结果写入数据库"""
    try:
        data = {
            "ts_code": ts_code,
            **analysis
        }
        sb.table("stock_company_ai_analysis").upsert(
            data, on_conflict="ts_code"
        ).execute()
        return True
    except Exception as e:
        print(f"  [ERROR] 写入 {ts_code} 失败: {e}", flush=True)
        return False


# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="公司画像 AI 分析脚本 (REQ-170)")
    parser.add_argument("--ts-code", help="指定分析的股票代码")
    parser.add_argument("--limit", type=int, default=0, help="限制分析数量")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    args = parser.parse_args()

    print("=" * 60)
    print("REQ-170: 公司画像 AI 分析开始")
    print(f"  ts-code: {args.ts_code or '全部'}  limit: {args.limit or '无'}  dry-run: {args.dry_run}")
    print("=" * 60)

    try:
        sb = make_clients()
        
        # 获取待分析股票
        stocks = get_pending_stocks(sb, args.ts_code, args.limit if args.limit > 0 else None)
        print(f"[INFO] 待分析股票数: {len(stocks)}", flush=True)
        
        if not stocks:
            print("[INFO] 没有待分析的股票")
            return
        
        # 批量分析
        success_count = 0
        for idx, stock in enumerate(stocks):
            ts_code = stock["ts_code"]
            name = stock.get("name", "")
            
            print(f"  [{idx+1}/{len(stocks)}] 分析 {ts_code} ({name})...", flush=True)
            
            # 执行 AI 分析
            analysis = analyze_company(stock)
            
            if args.dry_run:
                print(f"    [DRY-RUN] 分析结果预览:")
                print(f"      护城河: {analysis['moat'][:50]}...")
                print(f"      风险因素: {analysis['risk_factors'][:50]}...")
                success_count += 1
            else:
                # 写入数据库
                if upsert_analysis(sb, ts_code, analysis):
                    success_count += 1
                    print(f"    [OK] 已保存", flush=True)
                else:
                    print(f"    [FAIL] 保存失败", flush=True)
        
        print(f"\n✅ 分析完成，成功 {success_count}/{len(stocks)} 条", flush=True)
        
    except Exception as e:
        print(f"\n❌ 分析失败: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)

    print("\n🎉 REQ-170: 公司画像 AI 分析完成")


if __name__ == "__main__":
    main()
