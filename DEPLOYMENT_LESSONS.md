# 部署踩坑总结与改进措施

> 记录日期: 2026-03-06
> 版本: v1.4.6

---

## 一、本次部署踩过的坑

### 1. TypeScript 类型错误导致部署失败
**问题**: 修改代码后未运行类型检查，直接推送导致 Vercel 构建失败
**错误**: `Parameter 'xxx' implicitly has an 'any' type`
**解决**: 修复类型定义，添加 `ChartData` 接口，明确 `tsCode` 类型

### 2. 包管理器冲突
**问题**: 项目同时存在 `package-lock.json` (npm) 和 `pnpm-lock.yaml` (pnpm)
**错误**: `Command "npm install" exited with 1`
**解决**: 删除 `package-lock.json`，统一使用 pnpm

### 3. Vercel 项目被删除重建
**问题**: 为修复部署错误，使用 `vercel remove` 删除了项目
**后果**: 
- 所有环境变量丢失
- 部署历史清空
- 项目 ID 变更
- **Vercel Authentication 重置为启用状态**

### 4. Vercel Authentication (SSO) 拦截
**问题**: 团队默认启用 Vercel Authentication，导致网站 401 无法访问
**现象**: 访问网站跳转到 Vercel 登录页
**解决**: 在 Project Settings → Deployment Protection 中关闭 Vercel Authentication

### 5. 环境变量丢失
**问题**: 项目重建后，原环境变量 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 丢失
**错误**: `Uncaught Error: supabaseUrl is required`
**解决**: 重新添加环境变量并重新部署

### 6. Git 推送未触发自动部署
**问题**: 修改代码推送后，Vercel 没有自动部署
**原因**: 可能由于项目重建后 Git 连接异常
**解决**: 手动使用 `vercel --prod` 强制部署

---

## 二、关键原则（用户要求）

### ✅ 所有版本必须在 Git
- 版本号更新必须伴随 Git 提交
- 禁止本地修改不提交
- 每次部署必须有对应的 Git commit

### ✅ 必须是私有仓库
- 项目代码包含敏感信息（Supabase 配置等）
- 已设置为 private 仓库
- 环境变量不暴露在代码中

---

## 三、改进措施与标准流程

### 标准开发部署流程

```bash
# 1. 本地开发
npm run dev

# 2. 提交前检查
npm run check        # TypeScript 类型检查
npm run build        # 本地构建测试

# 3. 版本号更新
# 修改 package.json 版本号

# 4. 提交代码
git add .
git commit -m "v1.x.x: 描述

- 变更点1
- 变更点2

🤖 Generated with [Qoder][https://qoder.com]"
git push

# 5. 等待 Vercel 自动部署（2-3分钟）

# 6. 验证线上版本
# 打开网站检查版本号和功能
```

### 环境变量管理

| 变量名 | 说明 | 来源 |
|--------|------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL | Supabase Dashboard |
| `VITE_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | Supabase Dashboard |

**注意**: 项目重建后必须重新添加环境变量！

### 禁止操作

- ❌ 禁止使用 `vercel remove` 删除项目
- ❌ 禁止手动修改 Vercel 项目设置（框架预设等）
- ❌ 禁止在代码中硬编码敏感信息
- ❌ 禁止跳过类型检查直接推送

### 故障排查清单

| 现象 | 可能原因 | 解决 |
|------|---------|------|
| 部署失败 | TypeScript 错误 | 运行 `npm run check` 修复 |
| 构建失败 | 包管理器冲突 | 统一使用 pnpm |
| 401 错误 | Vercel Authentication 启用 | 关闭 Deployment Protection |
| supabaseUrl required | 环境变量丢失 | 重新添加环境变量 |
| 样式丢失 | 构建产物错误 | 检查 vercel.json 配置 |

---

## 四、Vercel 项目配置

### 当前正确配置

```json
{
  "version": 2,
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist/public",
  "framework": "vite",
  "installCommand": "pnpm install",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Deployment Protection 设置

- **Vercel Authentication**: Disabled（必须关闭，否则需要登录）
- **Password Protection**: Disabled
- **Trusted IPs**: Disabled

---

## 五、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.4.6 | 2026-03-06 | REQ-170/171 公司画像功能完善 |
| v1.4.5 | 2026-03-06 | 公司画像 AI 分析功能 |
| v1.4.4 | 2026-03-06 | 修复资金流向数据查询 |
| v1.4.3 | 2026-03-06 | 优化 K 线图展示样式 |
| v1.4.0 | 2026-03-06 | 独立个股详情页面 |

---

## 六、待办事项

- [ ] 数据采集脚本执行（stock_company_info + managers）
- [ ] AI 分析脚本运行
- [ ] 验证公司画像功能完整性
