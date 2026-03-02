# REQ-068：通用采集治理框架（目标与日志）
**状态**：✅ 设计确认  
**优先级**：高  
**关联需求**：REQ-036（定时调度）、REQ-037（数据质量自检）、REQ-040（质量闭环）  
**版本**: v2.0 (2026-03-02)

---

## 1. 核心问题

当前系统缺乏一套通用的采集治理机制，导致：
- **目标不明确**：不知道"应该采多少"，无法衡量完整性。
- **过程不透明**：每次采集的实际情况（成功/失败/漏采）没有记录，难以追溯。
- **状态不统一**：各脚本增量模式、日志格式不一致，难以统一管理。

本需求旨在建立一套**以目标为基准、以日志为驱动**的通用采集治理框架，解决上述所有问题。

---

## 2. 核心设计：两张表

### 2.1 `collect_target`（采集目标基准表）

这是一张**配置表**，定义每个采集模块"应该采多少"的规则，是衡量完整性的基准。

**核心字段**：

| 字段 | 说明 |
| :--- | :--- |
| `module` | 采集模块名，如 `reports_eastmoney` |
| `version` | 目标版本号，从1开始递增 |
| `target_logic` | 目标计算逻辑（自然语言描述） |
| `target_value` | 静态目标量（如果是固定数字） |
| `target_sql` | 动态目标量的查询SQL |
| `effective_from` | 本版本生效日期 |
| `effective_to` | 本版本失效日期（NULL表示当前有效） |

**设计价值**：将"目标"从代码中解耦出来，形成可追溯、可版本化的配置，解决了"目标会变"的问题。

### 2.2 `collect_log`（采集执行日志表）

这是一张**事实表**，记录每次采集的实际结果，是所有采集行为的唯一事实来源。

**核心字段**：

| 字段 | 说明 |
| :--- | :--- |
| `module` | 采集模块名 |
| `run_date` | 本次采集的业务日期 |
| `target_version` | 使用的目标版本（外键到 `collect_target`） |
| `target_count` | 本次目标量（快照） |
| `actual_count` | 实际写入量 |
| `completion_rate` | 完成度（`actual / target`） |
| `status` | 完成状态（`complete` / `partial` / `failed`） |
| `repaired_at` | 补采完成时间（NULL表示未修复） |
| `note` | 人工备注 |

**设计价值**：为每个采集模块的每次运行提供了详细、可追溯的执行记录，解决了"过程不透明"的问题。

---

## 3. 实施方案

### 3.1 数据库（待建）

- 创建 `collect_target` 和 `collect_log` 两张表（DDL 见数据模型文档）。

### 3.2 采集脚本改造（通用）

为所有采集脚本增加统一的日志记录逻辑：

```python
# 伪代码
def run_collection(module, run_date):
    # 1. 获取当前有效目标
    target = get_active_target(module, run_date)
    
    # 2. 执行采集
    try:
        actual_count = do_collect(target)
        status = calculate_status(target.target_value, actual_count)
    except Exception as e:
        status = 'failed'
        error_msg = str(e)

    # 3. 写入日志
    write_log(
        module=module,
        run_date=run_date,
        target_version=target.version,
        target_count=target.target_value,
        actual_count=actual_count,
        status=status,
        error_msg=error_msg
    )
```

### 3.3 DataAdmin 后台改造

- **进度条**：`completion_rate` 直接取自 `collect_log` 最新一条记录。
- **状态**：`status` 直接取自 `collect_log` 最新一条记录。
- **目标量**：`target_count` 直接取自 `collect_log` 最新一条记录。

---

## 4. 验收标准

- [ ] `collect_target` 和 `collect_log` 表已创建。
- [ ] `collect_reports_eastmoney.py` 脚本已改造，每次运行都写入 `collect_log`。
- [ ] DataAdmin 后台研报部分的进度条和状态，数据来源已改为 `collect_log`。
- [ ] REQ-068 需求状态更新为 `in_progress`。
