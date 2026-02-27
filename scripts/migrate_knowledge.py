#!/usr/bin/env python3
"""
migrate_knowledge.py
将知识库文档从硬编码的 knowledge.ts 迁移到 Supabase 四表结构。

目标表：
  - knowledge_doc_meta   文档元信息（轻量索引，AI 快速检索用）
  - knowledge_docs       文档正文（Markdown 全文，按需读取）
  - knowledge_doc_links  文档关联关系（有向语义图）

用法：
    python3 migrate_knowledge.py              # 执行迁移
    python3 migrate_knowledge.py --dry-run    # 仅打印，不写入数据库

数据来源：
    /home/ubuntu/docs_md/*.md  （已从 knowledge.ts 解码导出的 9 篇文档）

注意：
    - 使用 upsert（on_conflict=id），可安全重复执行
    - 复用 collect_macro_cn.py 的 Supabase 连接和重试模式
"""
import os
import sys
import argparse
import logging
import time
from datetime import datetime
from supabase import create_client, Client

# ── 配置（与 collect_macro_cn.py 保持一致）─────────────────────────────────────
SUPABASE_URL = os.environ.get(
    "SUPABASE_URL",
    "https://ozwgqdcqtkdprvhuacjk.supabase.co"
)
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96d2dxZGNxdGtkcHJ2aHVhY2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyMjk4MCwiZXhwIjoyMDg0OTk4OTgwfQ.ZhG6Pqh3czUbiVRiuzEBWvJBbgHdwTYNPqZgzAAuOUM"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger(__name__)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 文档元信息定义（对应 knowledge.ts 中的 INITIAL_DOCS）────────────────────────
DOCS_META = [
    {
        "id": "system-design-v1",
        "category": "decision_log",
        "title": "系统设计 v1：数据采集架构与决策日志",
        "summary": "阐述数据采集的四层架构（ETL）、核心设计原则及关键技术决策，是理解数据流转和技术选型背景的入口。",
        "tags": ["系统设计", "架构", "决策", "数据采集", "AKShare", "Supabase", "ETL"],
        "status": "active",
        "version": 1,
        "created_at": "2026-02-25T10:29:22.531Z",
        "updated_at": "2026-02-27T12:00:00.000Z",
    },
    {
        "id": "pitfall-log-v1",
        "category": "pitfall",
        "title": "踩坑记录 v1：数据采集 & Supabase 交互",
        "summary": "记录数据采集中遇到的 Supabase RLS 权限、AKShare SSL/TLS 握手失败等关键问题的解决方案，是排查采集错误的优先参考。",
        "tags": ["踩坑", "Supabase", "RLS", "AKShare", "SSL", "调试"],
        "status": "active",
        "version": 1,
        "created_at": "2026-02-25T10:29:22.531Z",
        "updated_at": "2026-02-27T12:00:00.000Z",
    },
    {
        "id": "data-collection-v3",
        "category": "requirement",
        "title": "数据采集需求文档 v6（多国指标 + 货币单位）",
        "summary": "定义了多国宏观指标的采集范围、数据源分层策略（AKShare > IMF）和 indicator_id 命名规范，是编写采集脚本的唯一权威依据。",
        "tags": ["需求", "数据采集", "AKShare", "IMF", "多国", "宏观指标"],
        "status": "active",
        "version": 1,
        "created_at": "2026-02-25T10:29:22.531Z",
        "updated_at": "2026-02-27T12:00:00.000Z",
    },
    {
        "id": "arch-overview",
        "category": "decision_log",
        "title": "系统架构全景决策",
        "summary": "描绘了系统的四层架构（采集→存储→分析→展示）和核心约束，强调 AI 只应作用于已存储数据，是理解系统边界的最高纲领。",
        "tags": ["架构", "全景", "决策", "AI边界", "系统设计"],
        "status": "active",
        "version": 1,
        "created_at": "2026-02-25T10:29:22.531Z",
        "updated_at": "2026-02-27T12:00:00.000Z",
    },
    {
        "id": "data-model-v1",
        "category": "data_model",
        "title": "数据库 Schema 设计 v6（多国 G20 指标 + currency 字段）",
        "summary": "定义了 Supabase 中所有核心数据表的 Schema，特别是 indicator_meta 和 indicator_values 的设计，是理解数据结构的基础。",
        "tags": ["数据模型", "Schema", "Supabase", "indicator_meta", "indicator_values", "currency"],
        "status": "active",
        "version": 1,
        "created_at": "2026-02-25T10:29:22.531Z",
        "updated_at": "2026-02-27T12:00:00.000Z",
    },
    {
        "id": "ai-boundary-v1",
        "category": "ai_boundary",
        "title": "AI 使用边界定义 v1",
        "summary": "明确规定了 AI 在项目中能做什么、不能做什么，特别是数据库 CUD 操作的禁令，是 AI 安全使用的核心准则。",
        "tags": ["AI边界", "安全", "禁令", "CUD", "规范"],
        "status": "active",
        "version": 1,
        "created_at": "2026-02-25T10:29:22.531Z",
        "updated_at": "2026-02-27T12:00:00.000Z",
    },
    {
        "id": "skills-directory",
        "category": "skill",
        "title": "MANUS Skills 目录",
        "summary": "列出了项目中所有可用的 MANUS Skills 及其功能和触发条件，是 AI 进行任务编排和自动化的工具箱说明。",
        "tags": ["Skills", "MANUS", "自动化", "工具箱"],
        "status": "active",
        "version": 1,
        "created_at": "2026-02-25T10:29:22.531Z",
        "updated_at": "2026-02-27T12:00:00.000Z",
    },
    {
        "id": "etl-blueprint-v1",
        "category": "etl_blueprint",
        "title": "ETL 蓝图 v1：数据目录 & 运维手册",
        "summary": "提供了数据目录、指标来源和采集脚本的运维手册，是日常数据维护和手动执行采集任务的操作指南。",
        "tags": ["ETL", "运维", "数据目录", "采集脚本", "手册"],
        "status": "active",
        "version": 1,
        "created_at": "2026-02-25T10:29:22.531Z",
        "updated_at": "2026-02-27T12:00:00.000Z",
    },
    {
        "id": "data-collection-v2",
        "category": "requirement",
        "title": "数据采集需求文档 v2（AKShare 公开版）",
        "summary": "（已废弃）定义了早期基于 AKShare 公开版的数据采集需求，大部分内容已被 v6 版本取代。",
        "tags": ["需求", "AKShare", "已废弃"],
        "status": "deprecated",
        "version": 1,
        "created_at": "2026-02-25T10:29:22.531Z",
        "updated_at": "2026-02-27T12:00:00.000Z",
    },
]

# ── 文档关联关系定义 ────────────────────────────────────────────────────────────
DOC_LINKS = [
    {"source_id": "data-model-v1",       "target_id": "data-collection-v3", "relation": "implements"},
    {"source_id": "pitfall-log-v1",      "target_id": "system-design-v1",   "relation": "caused_by"},
    {"source_id": "etl-blueprint-v1",    "target_id": "system-design-v1",   "relation": "references"},
    {"source_id": "data-collection-v3",  "target_id": "data-collection-v2", "relation": "supersedes"},
    {"source_id": "system-design-v1",    "target_id": "arch-overview",      "relation": "references"},
]

# ── MD 文件目录 ────────────────────────────────────────────────────────────────
MD_DIR = "/home/ubuntu/docs_md"


def upsert_rows(table: str, rows: list[dict], on_conflict: str, dry_run: bool = False) -> int:
    """
    批量 upsert 到指定表，返回写入条数。
    复用 collect_macro_cn.py 的重试模式。
    """
    if not rows:
        return 0
    if dry_run:
        log.info(f"  [DRY-RUN] 表 {table}：将写入 {len(rows)} 条，示例: {list(rows[0].keys())}")
        return len(rows)

    batch_size = 100
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        for attempt in range(3):
            try:
                supabase.table(table).upsert(
                    batch,
                    on_conflict=on_conflict
                ).execute()
                total += len(batch)
                log.info(f"  [{table}] 写入 {len(batch)} 条 OK")
                break
            except Exception as e:
                if attempt < 2:
                    log.warning(f"  写入重试 {attempt+1}/3: {e}")
                    time.sleep(2)
                else:
                    log.error(f"  写入失败（已重试 3 次）: {e}")
    return total


def run(dry_run: bool = False):
    log.info("=== 知识库迁移开始 ===")

    # ── Step 1: 写入 knowledge_doc_meta ────────────────────────────────────────
    log.info("Step 1: 写入 knowledge_doc_meta...")
    meta_rows = []
    for d in DOCS_META:
        meta_rows.append({
            "id":         d["id"],
            "category":   d["category"],
            "title":      d["title"],
            "summary":    d["summary"],
            "tags":       d["tags"],
            "status":     d["status"],
            "version":    d["version"],
            "updated_at": d["updated_at"],
        })
    n = upsert_rows("knowledge_doc_meta", meta_rows, on_conflict="id", dry_run=dry_run)
    log.info(f"  knowledge_doc_meta: {n} 条写入完成")

    # ── Step 2: 写入 knowledge_docs ────────────────────────────────────────────
    log.info("Step 2: 写入 knowledge_docs（Markdown 正文）...")
    docs_rows = []
    for d in DOCS_META:
        md_path = os.path.join(MD_DIR, f"{d['id']}.md")
        if os.path.exists(md_path):
            with open(md_path, "r", encoding="utf-8") as f:
                content = f.read()
        else:
            log.warning(f"  MD 文件不存在: {md_path}，使用占位内容")
            content = f"# {d['title']}\n\n内容待补充。\n"

        docs_rows.append({
            "id":         d["id"],
            "content":    content,
            "created_at": d["created_at"],
            "updated_at": d["updated_at"],
        })
    n = upsert_rows("knowledge_docs", docs_rows, on_conflict="id", dry_run=dry_run)
    log.info(f"  knowledge_docs: {n} 条写入完成")

    # ── Step 3: 写入 knowledge_doc_links ───────────────────────────────────────
    log.info("Step 3: 写入 knowledge_doc_links（文档关联关系）...")
    n = upsert_rows("knowledge_doc_links", DOC_LINKS, on_conflict="source_id,target_id,relation", dry_run=dry_run)
    log.info(f"  knowledge_doc_links: {n} 条写入完成")

    log.info("=== 知识库迁移完成 ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="知识库迁移脚本")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写入数据库")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
