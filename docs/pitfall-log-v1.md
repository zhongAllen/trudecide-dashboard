# 踩坑记录 v1：数据采集 & Supabase 交互

> ⚠️ **高优先级条目置顶**：#11 是迄今为止影响最大的踩坑，涉及 PRIMARY KEY 设计、Tushare 接口字段差异、批内重复三重问题叠加，排查耗时极长，务必优先阅读。

---

## 11. 【高优先级】stock_fina_indicator 三重 upsert 失败：PK 设计错误 × 接口字段缺失 × 批内重复

> **严重程度**: ⭐⭐⭐⭐⭐（最高）  
> **影响范围**: REQ-057 全量采集，涉及全市场 5805 只股票的财务指标历史数据  
> **排查耗时**: 约 3 小时，经历 4 轮 DDL 变更 + 3 次脚本修改

### 现象

`collect_stock_fina_indicator.py` 启动后立即报错，三种错误交替出现：

1. `duplicate key value violates unique constraint "stock_fina_indicator_pkey"` — PRIMARY KEY 冲突
2. `ON CONFLICT DO UPDATE command cannot affect row a second time` — 批内重复
3. `column "report_type" does not exist` — 引用了不存在的列

### 根本原因（三层叠加）

**第一层：PRIMARY KEY 设计错误**

建表 DDL（`create_stock_financial_tables_v1.sql`）中，`stock_fina_indicator` 的 PRIMARY KEY 只有两列：
```sql
PRIMARY KEY (ts_code, end_date)  -- ❌ 错误：同一股票同一报告期可能有多行
```

但脚本中 `CONFLICT_COLS = ['ts_code', 'end_date', 'report_type']`（三列），与 PK 不一致。
PostgREST 的 `on_conflict` 参数要求**精确匹配某个 UNIQUE 约束或 PRIMARY KEY**，列数不匹配时会回落到 PK，导致冲突。

**第二层：Tushare 接口字段缺失**

`fina_indicator_vip` 接口**不返回 `report_type` 字段**（不同于财务三表 `income_vip`/`balancesheet_vip`/`cashflow_vip`，后者有 `report_type`）。

因此：
- 脚本 `CONFLICT_COLS` 中的 `report_type` 是无效引用
- 手动添加 `uq_stock_fina_indicator (ts_code, end_date, report_type)` 后，`report_type` 列不存在，PK 重建也失败
- 每次 upsert 都因 `column "report_type" does not exist` 而失败

**第三层：Tushare 数据源批内重复**

`fina_indicator_vip` 接口返回的数据中，**同一只股票同一 `end_date` 可能有多条记录**（例如 `000001.SZ` 的 `2025-03-31` 有 2 行，`ann_date` 相同）。

这导致即使 PK 和 `CONFLICT_COLS` 都正确，单批次 upsert 也会因为批内有重复的 `(ts_code, end_date)` 而报：
```
ON CONFLICT DO UPDATE command cannot affect row a second time
```

### 错误的修复路径（教训）

| 轮次 | 操作 | 结果 |
|------|------|------|
| 第1轮 | 添加 UNIQUE 约束 `(ts_code, end_date, report_type)` | 失败：`report_type` 列不存在 |
| 第2轮 | 重建 PK 为 `(ts_code, end_date, report_type)` | 失败：列不存在，PK 重建失败 |
| 第3轮 | 添加 `report_type` 列 + 重建 PK | 失败：Tushare 不返回该字段，upsert 时 NOT NULL 违反 |
| 第4轮 | 删除 `report_type` 列，PK 改回 `(ts_code, end_date)` + 脚本去重 | ✅ 成功 |

### 最终解决方案

**数据库侧（DDL，由用户在 Supabase SQL Editor 执行）**：
```sql
-- 删除错误的 report_type 列
ALTER TABLE stock_fina_indicator DROP COLUMN IF EXISTS report_type;
-- 删除错误的 UNIQUE 约束
ALTER TABLE stock_fina_indicator DROP CONSTRAINT IF EXISTS uq_stock_fina_indicator;
-- 重建正确的 PK（只有两列）
ALTER TABLE stock_fina_indicator DROP CONSTRAINT IF EXISTS stock_fina_indicator_pkey;
ALTER TABLE stock_fina_indicator ADD PRIMARY KEY (ts_code, end_date);
```

**脚本侧（两处修改）**：
```python
# 1. 修正 CONFLICT_COLS（去掉不存在的 report_type）
CONFLICT_COLS = ['ts_code', 'end_date']  # ✅ fina_indicator 接口无 report_type

# 2. 在 upsert 前对批内数据去重
df = df.sort_values('ann_date', ascending=False)
df = df.drop_duplicates(subset=['ts_code', 'end_date'], keep='first')
```

### 核心教训与预防规则

> **规则 1（最重要）：设计 PRIMARY KEY 前，必须先用 dry-run 打印接口返回的实际字段列表。**
> 不要假设不同接口返回相同字段。`income_vip` 有 `report_type`，`fina_indicator_vip` 没有。

> **规则 2：`CONFLICT_COLS` 必须与数据库中实际存在的 UNIQUE/PK 约束完全一致（列名、列数、顺序）。**
> PostgREST 的 `on_conflict` 参数是按约束名匹配的，不是按列名猜测的。

> **规则 3：Tushare 数据在写入前必须按 PK 列去重。**
> 部分接口（如 `fina_indicator_vip`）会返回同一报告期的多行数据，批内重复会导致 upsert 失败。

> **规则 4：DDL 变更必须与脚本同步更新，不能只改一侧。**
> 本次问题的核心是 DDL 和脚本长期不一致，每次只修一侧，导致问题反复出现。

> **规则 5：新建财务数据采集脚本时，必须先用单只股票 dry-run 验证写入成功，再启动全量。**
> 本次如果在启动全量前做过充分的单只股票测试，可以节省大量排查时间。

### 关联需求

- REQ-057：stock_fina_indicator 全量历史采集
- REQ-049/050/051：财务三表（有 `report_type`，PK 设计正确，无此问题）

---


---

## 5. Supabase SQL 操作规范

- **现象**: 在 SQL Editor 中执行 `INSERT` 或 `UPDATE` 语句时，频繁因约束问题报错。
- **根本原因**: 对 Supabase 默认的表结构和约束不熟悉。
- **最终解决方案**: 总结以下操作规范，在生成 SQL 前必须遵守：

  1.  **优先使用 `INSERT ... ON CONFLICT DO UPDATE`**：这是最标准的 upsert 语法，但**前提是 `ON CONFLICT` 指定的列有唯一约束（UNIQUE 或 PRIMARY KEY）**。如果 `id` 是主键，可以直接用 `ON CONFLICT (id)`。

      ```sql
      -- 假设 id 是主键
      INSERT INTO my_table (id, name) VALUES (1, 'new_name')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      ```

  2.  **若无唯一约束，使用 `INSERT ... WHERE NOT EXISTS`**：如果目标列（如 `indicator_meta.id`）只是普通 TEXT 字段，没有唯一约束，`ON CONFLICT` 会报错。此时应改用 `WHERE NOT EXISTS` 来避免重复插入。

      ```sql
      -- 假设 id 是普通 TEXT 字段
      INSERT INTO my_table (id, name)
      SELECT 1, 'new_name'
      WHERE NOT EXISTS (
        SELECT 1 FROM my_table WHERE id = 1
      );
      ```

  3.  **更新操作前先确认字段存在**：`UPDATE` 语句中 `SET` 的字段如果不存在，会报 `column ... does not exist` 错误。在生成 SQL 前，应先通过 `SELECT * LIMIT 1` 确认表结构，特别是 `created_at` / `updated_at` 这类非标字段。

  4.  **优先使用 Supabase Python SDK**：对于复杂的批量操作，优先使用 `supabase-py` 库的 `upsert` 方法，它能更好地处理冲突和批量写入，比手写 SQL 更可靠。


## 6. 数据库操作权限划分

- **现象**: 混淆了 AI 代理和用户的数据库操作权限，导致代理尝试执行本应由用户执行的脚本。
- **根本原因**: 项目初期规范不明确。
- **最终解决方案**: 明确以下权限划分，作为最高规则：

  - **DDL (Data Definition Language)**: **由用户执行**。
    - 任何涉及 `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE` 的操作，AI 代理只负责生成 SQL 或脚本，然后交付给用户在 Supabase SQL Editor 或终端中执行。

  - **DML (Data Manipulation Language)**: **AI 代理可直接执行**。
    - 任何涉及 `INSERT`, `UPDATE`, `DELETE`, `UPSERT` 的数据写入、修改、删除操作，AI 代理可以直接通过脚本执行，无需用户介入。

## 7. AKShare jin10 TLS 兼容性问题（Python 3.11）

- **现象**: 调用 `ak.macro_china_cpi_yearly()` 等 jin10 系列接口时，进程无响应（挂起），或报 `SSLZeroReturnError: TLS/SSL connection has been closed (EOF)` 错误。
- **根本原因**: `datacenter-api.jin10.com` 服务器的 TLS 握手与 Python 3.11 的默认 SSL 上下文不兼容。AKShare 内置的 `TLSAdapter` 虽然有降级逻辑，但存在 bug：设置了 `verify=False` 但未同时关闭 `check_hostname`，导致 Python 3.11 抛出 `ValueError: Cannot set verify_mode to CERT_NONE when check_hostname is enabled`，进而请求失败。
- **最终解决方案**: 直接修改 AKShare 源文件 `/usr/local/lib/python3.11/dist-packages/akshare/economic/macro_china.py`：
  1. 在 `TLSAdapter.init_poolmanager` 中添加：
     ```python
     ctx.check_hostname = False
     ctx.verify_mode = ssl.CERT_NONE
     ```
  2. 在 `__macro_china_base_func` 中将 `requests.get(...)` 替换为使用 `TLSAdapter` 的 session：
     ```python
     _session = requests.Session()
     _session.mount("https://", TLSAdapter())
     r = _session.get(url, params=params, headers=headers, timeout=30)
     ```
- **注意**: 沙箱重启后 AKShare 包会被重置，需要重新 patch。建议在 `update_cn_monthly_2025.py` 中内嵌修复逻辑，不依赖 AKShare 的 `__macro_china_base_func`，而是直接用自定义 session 调用 jin10 API。
- **补充发现**: jin10 连接有时不稳定（TLS 握手超时），建议加入 3 次重试逻辑，每次重试间隔 3 秒。


## 8. jin10 数据日期偏移与预告值问题

- **现象**: 数据库中 CPI/PPI 数据与国家统计局官方发布不符，日期存在 1-5 天的偏移，数值也与真实值错位。
- **根本原因**: jin10 API 返回的数据中包含"预告行"——即未来将要发布的数据，其 `今值` 字段为 `null`，`日期` 字段为预告日期。旧的采集脚本 `collect_macro_cn.py` 没有过滤 `今值 == null` 的行，导致把预告日期当作了实际发布日期存入数据库，数值也因此发生了月份偏移（例如，把 8 月的预告值存成了 7 月的实际值）。
- **最终解决方案**: 
  1. **切换数据源**: CN 月度核心指标（CPI/PPI/PMI/M2）的数据源从 AKShare/jin10 切换为 **Tushare**，其数据经过清洗，不存在预告值问题。
  2. **修正采集逻辑**: 未来任何从 jin10 或类似源采集数据的脚本，都必须在 pandas DataFrame 中**显式过滤掉 `今值` 为 null 或 NaN 的行**，例如 `df = df[df['今值'].notna()]`。
  3. **数据已修复**: 已通过 `backfill_cn_monthly_tushare.py` 脚本，用 Tushare 数据覆盖了 2025 全年的 CPI/PPI/PMI/M2 错误数据。

## 9. Tushare API 网络稳定性问题

- **现象**: 调用 Tushare 接口（如 `pro.cn_pmi()`）时，频繁出现 `Connection reset by peer` 或 `Read timed out` 错误。
- **根本原因**: Tushare 服务器对请求频率有限制，或沙箱网络到 `api.waditu.com` 的连接不稳定。
- **最终解决方案**: 在调用 Tushare API 的函数外层封装一个**带间隔的重试逻辑**。实践证明，重试 3 次、每次间隔 5-10 秒可以有效解决大部分网络波动问题。

  ```python
  def get_pmi_with_retry(pro, **kwargs):
      for i in range(3):
          try:
              df = pro.cn_pmi(**kwargs)
              return df
          except Exception as e:
              print(f"Attempt {i+1} failed: {e}")
              time.sleep(5)
      raise Exception("Failed to fetch data from Tushare after 3 retries.")
  ```

## 10. PostgreSQL ALTER TABLE RENAME COLUMN 不支持 IF EXISTS

- **现象**: 执行 `ALTER TABLE sector_daily RENAME COLUMN IF EXISTS pct_chg TO pct_change;` 时，Supabase SQL Editor 报错 `ERROR: 42601: syntax error at or near "EXISTS"`。
- **根本原因**: PostgreSQL（包括 Supabase 使用的 PG 15）的 `RENAME COLUMN` 语法**不支持 `IF EXISTS` 子句**。这与 `ADD COLUMN IF NOT EXISTS`、`DROP CONSTRAINT IF EXISTS` 等语法不同，后者是支持的。
- **错误示例**:
  ```sql
  -- ❌ 错误写法，PG 不支持
  ALTER TABLE sector_daily RENAME COLUMN IF EXISTS pct_chg TO pct_change;
  ```
- **最终解决方案**: 将条件重命名包进 `DO $$ BEGIN ... END $$` 匿名块，先查询 `information_schema.columns` 判断旧列名是否存在，再执行重命名：
  ```sql
  -- ✅ 正确写法
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'sector_daily'
        AND column_name  = 'pct_chg'
    ) THEN
      ALTER TABLE sector_daily RENAME COLUMN pct_chg TO pct_change;
    END IF;
  END $$;
  ```
- **规律总结（PostgreSQL DDL IF EXISTS 支持情况）**:

  | 语句 | 支持 IF EXISTS / IF NOT EXISTS |
  |------|-------------------------------|
  | `ADD COLUMN IF NOT EXISTS` | ✅ 支持 |
  | `DROP COLUMN IF EXISTS` | ✅ 支持 |
  | `DROP CONSTRAINT IF EXISTS` | ✅ 支持 |
  | `DROP INDEX IF EXISTS` | ✅ 支持 |
  | `CREATE INDEX IF NOT EXISTS` | ✅ 支持 |
  | `RENAME COLUMN IF EXISTS` | ❌ **不支持** |
  | `RENAME TABLE IF EXISTS` | ❌ **不支持** |

- **最佳实践**: 凡是涉及 `RENAME` 操作的迁移脚本，**一律使用 `DO $$ IF EXISTS ... END $$` 包裹**，不要假设 `IF EXISTS` 可用。

---
## 12. 采集脚本字段必须与数据库实际表结构保持一致

- **严重程度**: ⭐⭐⭐⭐
- **触发场景**: 每次新建表、ALTER TABLE 改造表后，启动采集脚本前
- **根本原因**: 脚本字段与 DDL 字段不同步，导致写入时报 `column does not exist` 或多余字段被 PostgREST 拒绝。

### 强制规则

> **规则 12-1（最高优先级）**：任何采集脚本在全量启动前，必须先做小批量写入验证（插入 1 行测试数据并清理），确认所有字段写入成功后再启动全量。

> **规则 12-2**：采集脚本的写入字段集合必须是数据库表字段的子集，不能包含表中不存在的字段。

> **规则 12-3**：数据模型文档（需求文档中的"数据模型总览"表格）是唯一权威来源。DDL 变更后必须同步更新需求文档，脚本字段以需求文档为准。

> **规则 12-4**：`GENERATED ALWAYS` 计算列不能出现在采集脚本的写入 payload 中，否则 PostgREST 会报错。计算列应改为普通列，由脚本在应用层计算后写入。

### 验证模板

```python
# 每次建表后，在启动全量采集前执行此验证
test_row = { ...一行完整的测试数据... }
try:
    r = sb.table('表名').insert(test_row).execute()
    print(f"✅ 字段验证通过: {list(r.data[0].keys())}")
    # 清理测试数据
    sb.table('表名').delete().eq('pk_col', test_row['pk_col']).execute()
except Exception as e:
    print(f"❌ 字段验证失败，请检查脚本与 DDL 是否一致: {e}")
```

### 本次实践记录（REQ-058~060，2026-03-01）

| 表 | 验证结果 | 备注 |
| :--- | :--- | :--- |
| `index_daily` | ✅ 通过 | 13 个字段全部写入成功 |
| `news`（改造） | ✅ 通过 | `src` + `title_hash` 新字段写入成功 |
| `stock_announcement` | ✅ 通过 | 三列 PK + content/content_at 写入成功 |

### 关联踩坑
- 踩坑 #11：`report_type` 字段不存在导致 upsert 失败（同类问题）


---

## 12. 【前端】Vite 构建失败：引用不存在的模块导致回退旧缓存

> **严重程度**: ⭐⭐⭐⭐  
> **影响范围**: 前端页面修改后始终无法生效，用户看到的永远是旧版本  
> **排查耗时**: 约 2 小时，经历多次无效重启

### 现象

修改了 `Home.tsx` 并执行 `pnpm build`，但页面始终显示旧内容。反复重启服务、强制刷新浏览器均无效。

### 根本原因（两层叠加）

**第一层：引用了不存在的模块**

`Home.tsx` 中写了 `import { supabase } from '@/lib/supabase'`，但项目中根本不存在 `client/src/lib/supabase.ts` 这个文件。

**第二层：构建在错误目录执行**

在 `/home/ubuntu`（根目录）而非 `/home/ubuntu/stock-dashboard`（项目目录）下执行 `pnpm build`，构建的是一个旧的、不相关的 `package.json`，产物覆盖了正确的构建目录，导致每次构建都是旧版本。

两个问题叠加，导致：
1. 在正确目录构建时，因模块不存在而报错失败，Vite 回退到上一次的缓存产物
2. 在错误目录构建时，成功但产物是旧版本

### 解决方案

1. **创建缺失的 Supabase 客户端文件** `client/src/lib/supabase.ts`：
```typescript
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

2. **在正确的项目目录下执行构建**：
```bash
cd /home/ubuntu/stock-dashboard && pnpm build
```

3. **重启生产服务器**：
```bash
sudo kill -9 $(sudo lsof -t -i:3000) && cd /home/ubuntu/stock-dashboard && pnpm start
```

### 核心教训与预防规则

> **规则 1：新增前端页面时，必须确认所有 import 的模块文件实际存在。** 若引用不存在的模块，Vite 构建会失败并静默回退旧缓存，极难排查。

> **规则 2：执行 `pnpm build` 前，必须先 `cd /home/ubuntu/stock-dashboard` 切换到正确目录。** 在错误目录执行构建会产生错误的产物。

> **规则 3：本项目的运行机制是"构建-部署"模式，不是热更新。** 每次修改前端代码后，必须：① `pnpm build` → ② 重启服务器，页面才会更新。

> **规则 4：PostgreSQL 不支持 `PRINT` 语句。** 在 SQL 文件中输出信息应使用 `RAISE NOTICE`（在 PL/pgSQL 块中）或直接省略，`PRINT` 是 SQL Server 语法，在 PostgreSQL 中会报语法错误。

### 关联任务
- REQ-072 宏观宽表系统前端展示
