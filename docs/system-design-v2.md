
---
## 4. 采集脚本标准化工作流 (v2.0)

为贯彻 REQ-068 通用采集治理框架，所有新增及改造的采集脚本，必须遵循以下标准化工作流。此举旨在将采集过程与目标/日志系统深度集成，实现开发模式的统一和过程的全面可观测。

### 4.1 核心原则：使用 `collect_helper.py`

所有与 `collect_target` 和 `collect_log` 表的交互，**必须**通过 `scripts/collect_helper.py` 公共库进行。采集脚本不应直接查询或写入这两张治理表。

### 4.2 标准脚本结构

每个采集脚本应遵循“上下文 → 获取目标 → 执行采集 → 记录结果”的四段式结构。

```python
# scripts/my_new_collector.py

import argparse
from collect_helper import CollectionContext, get_active_target, log_start, log_success, log_failure

# 1. 定义模块名（必须与 collect_target 表中的 module 字段完全一致）
MODULE_NAME = "my_new_collector"

def do_collection(context: CollectionContext):
    """在这里实现核心的采集逻辑"""
    print(f"正在执行 {context.module} 的采集...")
    # ... 爬取、解析、转换数据 ...
    actual_count = 100 # 示例：实际写入了100条数据
    return actual_count

def main():
    # 2. 初始化采集上下文
    context = CollectionContext(MODULE_NAME)
    print(f"--- 开始采集任务: {context.module} (Run ID: {context.run_id}) ---")

    try:
        # 3. 获取目标 & 记录开始
        #    - get_active_target 会自动从数据库拉取当前生效的目标配置
        #    - log_start 会在 collect_log 中创建或更新当天的日志记录，状态为 'running'
        target = get_active_target(context.sb, MODULE_NAME)
        log_start(context, target)

        # 4. 执行核心采集逻辑
        actual_count = do_collection(context)

        # 5. 记录成功
        #    - log_success 会根据目标和实际写入量，自动计算 completion_rate 和 status
        #    - 并将最终结果更新回 collect_log
        log_success(context, actual_count)

    except Exception as e:
        # 6. 记录失败
        #    - 任何未捕获的异常都会被这里捕获
        #    - log_failure 会将日志状态更新为 'failed'，并记录详细的错误信息
        print(f"❌ 采集任务失败: {e}")
        log_failure(context, e)

    finally:
        # 7. 任务结束
        print(f"--- 采集任务结束: {context.module} | 最终状态: {context.status} ---")

if __name__ == "__main__":
    main()

```

### 4.3 开发与提交流程

1.  **配置目标**：在 `migrations/create_collect_target.sql` 的初始数据部分，为新模块添加一条目标记录。
2.  **编写脚本**：严格按照 **4.2** 的模板结构编写脚本代码。
3.  **本地测试**：在本地运行脚本，确认采集逻辑正确，`collect_log` 表中能看到 `complete` 或 `failed` 的最终状态。
4.  **提交代码**：
    -   将新脚本（如 `scripts/my_new_collector.py`）和更新后的 `migrations/create_collect_target.sql` 添加到 Git。
    -   Commit Message 必须关联对应的 REQ 编号，例如：`feat(REQ-078): 新增 xxx 数据采集脚本`。

### 4.4 变更日志 (v2.0)

-   **新增**: 本文档（`system-design-v1`）升级为 v2.0，新增第 4 节“采集脚本标准化工作流”。
-   **新增**: 创建 `scripts/collect_helper.py` 公共库，封装采集治理逻辑。
-   **规范**: 明确所有新采集脚本必须使用 `collect_helper.py` 并遵循四段式结构。
