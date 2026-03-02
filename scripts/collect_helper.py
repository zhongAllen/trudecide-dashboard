#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
采集脚本通用辅助库 (collect_helper.py)
=======================================
REQ-068 采集治理框架的客户端实现，为所有采集脚本提供统一、标准化的
目标获取、日志记录、状态计算等功能，形成可复用的标准化工作流。

核心功能：
1.  **CollectionContext**: 上下文管理器，封装单次采集任务的所有状态。
2.  **get_active_target()**: 从 `collect_target` 表获取当前生效的目标配置。
3.  **log_start()**: 采集开始时调用，在 `collect_log` 写入初始记录。
4.  **log_success()**: 采集成功后调用，计算完成度/状态并更新日志。
5.  **log_failure()**: 采集异常时调用，记录错误信息并更新日志。

设计原则：
-   **高内聚**：所有与 `collect_target` 和 `collect_log` 表的交互都封装在此库中。
-   **低耦合**：采集脚本只需调用高级函数，无需关心数据库交互细节。
-   **标准化**：统一日志格式、状态计算逻辑和错误处理流程。

使用示例：
```python
from collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure

MODULE_NAME = "my_collector"

def main():
    context = CollectionContext(MODULE_NAME)
    try:
        # 1. 获取目标 & 记录开始
        target = get_active_target(context.sb, MODULE_NAME)
        log_start(context, target)

        # 2. 执行采集
        actual_count = do_my_collection()

        # 3. 记录成功
        log_success(context, actual_count)

    except Exception as e:
        # 4. 记录失败
        log_failure(context, e)
    finally:
        print(f"采集任务 {context.run_id} 执行完毕，状态: {context.status}")
```
"""

import os
import sys
import uuid
from datetime import datetime, date, timezone
from dataclasses import dataclass, field
from supabase import create_client, Client

# --- 配置 --- #
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

# --- 状态判定规则 (v15.0) --- #
STATUS_COMPLETE_THRESHOLD = 0.99
STATUS_PARTIAL_THRESHOLD = 0.01

@dataclass
class CollectionTarget:
    """采集目标的数据模型"""
    version: int
    target_logic: str
    target_value: int | None = None
    target_sql: str | None = None

@dataclass
class CollectionContext:
    """采集任务上下文，用于在函数间传递状态"""
    module: str
    run_date: date = field(default_factory=date.today)
    run_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    sb: Client = field(default_factory=lambda: create_client(SUPABASE_URL, SUPABASE_KEY))
    log_id: int | None = None
    target: CollectionTarget | None = None
    actual_count: int = 0
    status: str = "pending"
    error_msg: str | None = None
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None

def get_active_target(sb_client: Client, module: str) -> CollectionTarget:
    """从 collect_target 表获取指定模块当前生效的目标"""
    today = date.today()
    print(f"[HELPER] 正在为模块 [{module}] 获取采集目标...", file=sys.stderr)
    try:
        r = sb_client.table("collect_target").select("*") \
            .eq("module", module) \
            .lte("effective_from", today.isoformat()) \
            .or_(f"effective_to.is.null,effective_to.gte.{today.isoformat()}") \
            .order("effective_from", desc=True) \
            .limit(1).execute()

        if not r.data:
            raise ValueError(f"在 collect_target 表中未找到模块 [{module}] 的有效目标配置")

        target_data = r.data[0]
        target = CollectionTarget(
            version=target_data["version"],
            target_logic=target_data["target_logic"],
            target_value=target_data.get("target_value"),
            target_sql=target_data.get("target_sql"),
        )
        print(f"[HELPER] -> 成功获取目标 (v{target.version}): {target.target_logic}", file=sys.stderr)
        return target
    except Exception as e:
        print(f"[HELPER] ❌ 获取采集目标失败: {e}", file=sys.stderr)
        raise

def log_start(context: CollectionContext, target: CollectionTarget):
    """在采集开始时，向 collect_log 写入初始记录"""
    context.target = target
    print(f"[HELPER] 记录采集任务 [{context.module}] 开始...", file=sys.stderr)
    try:
        log_entry = {
            "module": context.module,
            "run_date": context.run_date.isoformat(),
            "target_version": target.version,
            "target_count": target.target_value, # 快照
            "status": "running",
            "started_at": context.started_at.isoformat(),
        }
        r = context.sb.table("collect_log").upsert(log_entry, on_conflict="module, run_date").execute()
        if not r.data:
            raise IOError("Upsert a new log record failed, no data returned.")
        context.log_id = r.data[0]["id"]
        context.status = "running"
        print(f"[HELPER] -> 日志记录创建/更新成功 (ID: {context.log_id})", file=sys.stderr)
    except Exception as e:
        print(f"[HELPER] ❌ 记录采集开始状态失败: {e}", file=sys.stderr)
        # 即使日志记录失败，也允许采集继续，但要标记错误
        context.status = "log_failed"
        context.error_msg = f"log_start failed: {e}"

def _update_log(context: CollectionContext):
    """内部函数，用于更新日志记录的最终状态"""
    if not context.log_id:
        print("[HELPER] ⚠️  Log ID 不存在，无法更新最终日志状态。", file=sys.stderr)
        return

    context.finished_at = datetime.now(timezone.utc)
    log_update = {
        "actual_count": context.actual_count,
        "status": context.status,
        "error_msg": context.error_msg,
        "finished_at": context.finished_at.isoformat(),
    }

    if context.target and context.target.target_value and context.target.target_value > 0:
        log_update["completion_rate"] = round(context.actual_count / context.target.target_value, 4)
    else:
        log_update["completion_rate"] = None # 目标为0或None时，完成度无意义

    try:
        context.sb.table("collect_log").update(log_update).eq("id", context.log_id).execute()
        print(f"[HELPER] -> 日志 (ID: {context.log_id}) 状态更新为: {context.status}", file=sys.stderr)
    except Exception as e:
        print(f"[HELPER] ❌ 更新最终日志状态失败: {e}", file=sys.stderr)

def log_success(context: CollectionContext, actual_count: int):
    """采集成功后调用，计算状态并更新日志"""
    context.actual_count = actual_count
    target_count = context.target.target_value if context.target else 0

    if target_count and target_count > 0:
        completion_rate = actual_count / target_count
        if completion_rate >= STATUS_COMPLETE_THRESHOLD:
            context.status = "complete"
        elif completion_rate >= STATUS_PARTIAL_THRESHOLD:
            context.status = "partial"
        else:
            context.status = "failed" # 实际写入量过少，也算失败
            context.error_msg = f"Actual count ({actual_count}) is less than 1% of target ({target_count})."
    elif actual_count > 0:
        context.status = "complete" # 没有目标，但采到了数据，算成功
    else: # target_count=0 and actual_count=0
        context.status = "complete" # 目标是0，也采到0，算成功

    _update_log(context)

def log_failure(context: CollectionContext, error: Exception):
    """采集异常时调用，记录错误信息并更新日志"""
    context.status = "failed"
    context.error_msg = f"{type(error).__name__}: {str(error)}"
    _update_log(context)
