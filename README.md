# Trudecide 股票版 (Trudecide Stock Edition)

**Trudecide 股票版** 是一个基于宏观常识判断的股票交易策略 AI 项目，旨在利用 AI 自动化完成数据采集、分析、策略回测和信号生成，辅助中长期价值投资者做出更明智的决策。

> 本项目由 **Manus AI** 驱动开发，前端基于 **Vite + React + TypeScript + TailwindCSS** 构建，后端数据服务使用 **Supabase**，数据采集主要依赖 **AKShare** 和 **Tushare**。

---

## 核心特性

- **AI 驱动开发**：从需求分析、架构设计、代码实现到文档编写，全程由 AI 主导或深度参与。
- **宏观常识驱动**：投资逻辑基于宏观经济指标、市场流动性、估值水平等常识判断，而非高频或复杂的量化模型。
- **模块化 Skill 设计**：数据采集、AI 分析、指标计算等核心功能被封装为独立的 Manus Skill，可复用、可编排。
- **内置知识库**：所有需求文档、数据模型、决策日志、踩坑记录均沉淀在项目内置的知识库中，方便团队协作和 AI 理解上下文。
- **前后端分离**：Vite + React 构建的响应式前端，通过 Supabase API 与后端数据交互。

## 技术栈

| 分类 | 技术 | 用途 |
|:---|:---|:---|
| **前端** | React, TypeScript, Vite, TailwindCSS | 应用主界面、数据可视化 |
| **后端** | Supabase (PostgreSQL, Auth, Storage) | 数据库、用户认证、文件存储 |
| **数据采集** | AKShare, Tushare Pro | 宏观指标、个股、板块、新闻数据 |
| **AI 引擎** | Manus AI | 项目开发、代码生成、文档编写、Skill 编排 |
| **部署** | Express + Node.js | 静态文件服务 |

---

## 快速开始

### 1. 环境准备

- Node.js >= 22.0
- pnpm >= 9.0
- Python >= 3.10

### 2. 克隆项目

```bash
git clone https://github.com/Winner12-AI/w5-football-prediction.git
cd w5-football-prediction
```

### 3. 配置环境变量

首先，复制环境变量模板文件：

```bash
cp .env.example .env
```

然后，编辑 `.env` 文件，填入你的 Supabase 和 Tushare 凭证。这些凭证的获取方式如下：

- `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`：Supabase 项目控制台 -> Settings -> API
- `SUPABASE_SERVICE_KEY`：Supabase 项目控制台 -> Settings -> API (请注意保管，不要泄露)
- `TUSHARE_TOKEN`：[Tushare Pro 官网](https://tushare.pro/user/token)

### 4. 安装依赖

```bash
# 安装前端和后端依赖
pnpm install

# 安装 Python 数据采集依赖
pip install akshare tushare supabase
```

### 5. 运行开发环境

```bash
# 启动 Vite 前端开发服务器（默认 http://localhost:3000）
pnpm dev
```

### 6. 构建与部署

```bash
# 构建生产环境静态文件（输出到 dist/public）
pnpm build

# 启动生产环境 Node.js 服务器
pnpm start
```

---

## 项目结构

```
.
├── client/                # Vite + React 前端源码
│   ├── src/
│   │   ├── components/    # UI 组件
│   │   ├── lib/           # 核心逻辑与知识库
│   │   ├── pages/         # 页面组件
│   │   └── main.tsx       # 应用入口
│   └── vite.config.ts   # Vite 配置
├── server/                # Express 后端服务源码（用于部署）
├── .env.example           # 环境变量模板
├── .gitignore             # Git 忽略配置（已包含 .env）
├── package.json           # 项目依赖与脚本
└── README.md              # 本文档
```

## 安全说明

本项目通过 `.gitignore` 文件严格忽略了 `.env` 文件，确保你的 Supabase 和 Tushare 等敏感凭证不会被意外提交到 Git 仓库。

当你将此项目分享给其他开发者或 AI 产品时，他们需要遵循「快速开始」章节的指引，创建自己的 `.env` 文件并填入凭证，从而安全地在本地运行项目。
# Deployment trigger: Thu Mar  5 20:22:02 CST 2026
# Auto Deploy Test
# Force rebuild Fri Mar  6 15:41:18 CST 2026
# Redeploy Fri Mar  6 15:56:09 CST 2026
