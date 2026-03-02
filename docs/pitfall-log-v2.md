
---
## 13. CHECK 约束与业务逻辑不同步导致写入失败
- **严重程度**: ⭐⭐⭐
- **触发场景**: REQ-068 采集治理框架首次接入 `collect_reports_eastmoney.py` 脚本时。
- **现象**: 运行脚本时，`log_start()` 函数报错 `new row for relation "collect_log" violates check constraint "chk_collect_log_status"`。
- **根本原因**: `collect_log` 表的 `status` 字段在设计时，CHECK 约束只定义了最终状态 `('complete', 'partial', 'failed')`，但 `collect_helper.py` 的 `log_start()` 函数会先写入一个中间状态 `'running'`，该状态未被约束允许，导致数据库拒绝写入。
- **错误 DDL (v1.0)**:
  ```sql
  -- ❌ 错误写法，遗漏了中间状态
  ALTER TABLE collect_log
      ADD CONSTRAINT chk_collect_log_status
      CHECK (status IN ('complete', 'partial', 'failed'));
  ```
- **最终解决方案**: 
  1. **修正 DDL**: 修改 CHECK 约束，加入 `'running'` 状态。
  2. **修正 `collect_helper.py`**: 在 `log_start` 的错误处理中，明确标记状态为 `log_failed`，避免状态不一致。
- **正确 DDL (v1.1)**:
  ```sql
  -- ✅ 正确写法，包含所有业务生命周期中的状态
  ALTER TABLE collect_log DROP CONSTRAINT IF EXISTS chk_collect_log_status;
  ALTER TABLE collect_log ADD CONSTRAINT chk_collect_log_status
      CHECK (status IN ('running', 'complete', 'partial', 'failed'));
  ```
- **核心教训与预防规则**:
  > **规则 13-1**: 设计数据库 CHECK 约束时，必须考虑字段在整个业务生命周期中所有**可能的状态**，包括中间状态和最终状态。
  > **规则 13-2**: 表结构设计（DDL）与业务逻辑代码（如 `collect_helper.py`）必须**同步评审**。只评审其一，极易出现此类不一致问题。
  > **规则 13-3**: 新增或修改 CHECK 约束后，必须编写单元测试或集成测试，覆盖所有允许值和至少一个非法值，确保约束按预期工作。
- **关联任务**: REQ-068 采集治理框架
