# 课隙 · OpenPeriod

把课表叠起来，一眼找到大家共同的空档。

**正式入口：<https://openperiod.gabrielmu2006.cn>**

OpenPeriod 是一个响应式多人课表工具。用户可以维护自己的课程与私人忙碌、加入群组、按隐私级别共享信息，并在不同学校、不同开学日和不同作息之间计算真实钟点上的共同空闲。

## 当前状态

仓库版本为 `0.3.0`。已于 2026-09-20（ICP 备案通过同日）部署到阿里云国内服务器并完成 HTTPS 验收，`0000`–`0010` 全部迁移已在正式库执行。部署架构、环境变量、验收清单与运维规则以 [DEPLOY.md](./DEPLOY.md) 为准。

### 线上环境

- 正式入口：<https://openperiod.gabrielmu2006.cn>（HTTP GET 308 跳转到 HTTPS；HTTP 写请求直接 426，不做重定向）。
- 架构：宿主机 Caddy 终结 HTTPS 并自动续期证书 → 反向代理 `127.0.0.1:3000`（Docker，应用端口不对公网开放）。
- 数据库：服务器本地 PostgreSQL 17（已从早期 Neon 环境幂等补同步用户数据；Neon 保留为历史快照，不再写入）。
- CI/CD：推送 `main` 自动构建镜像（备案号经 `--build-arg NEXT_PUBLIC_ICP_BEIAN` 注入）并部署到服务器。

当前主要能力：

- 邮箱＋密码登录；注册、老账号首次设置密码、忘记密码时才发送邮箱验证码。
- 48 套学校／校区／季节作息预设，以及每位用户独立的自定义作息。
- Excel 行式或网格式课表解析，支持 `.xlsx` / `.xls`、导入预览与人工修正。
- 可选的智谱 AI 截图／文字识别；结果必须进入同一预览页确认后才写入课表。
- 导入按目标学校和学期隔离，确认时事务替换目标学期；原课表保留一份 7 天恢复点。
- 课程、上课时段、单周或批量“不去”、一次性／周期私人忙碌，以及“本学期无课”确认。
- 跨校共同空闲：成员按各自学校的开学日、教学周和作息换算到真实钟点轴；未知课表不会被当作全天空闲。
- 三级隐私投影：仅忙闲、课程名称、完整课程；私人忙碌标题只对本人可见。
- 群组创建、邀请码、退出、改名、移出成员、群主转让、软归档与恢复。
- 只读管理总览和站内反馈入口。

## 技术栈

- Next.js 16 App Router、React 19、TypeScript
- PostgreSQL 17、Drizzle ORM
- Vitest、PGlite、Testing Library、jsdom
- SheetJS 与 `read-excel-file`
- Argon2id 密码哈希；阿里云 DirectMail 邮箱验证码

## 本地运行

需要 Node.js、pnpm 和 Docker。以下命令只应连接本地开发数据库：

```bash
cp .env.example .env.local
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

打开 <http://localhost:3000>。`compose.yaml` 只启动本地 PostgreSQL；应用仍由 `pnpm dev` 运行。

本地已有密码的账号在不配置邮件服务时仍可登录。新注册、老账号首次设置密码和找回密码需要配置 `AUTH_SECRET` 与 DirectMail。AI 导入需要 `ZHIPU_API_KEY`；不配置时 Excel、手动编辑和其他功能不受影响。完整变量说明见 [.env.example](./.env.example) 和 [DEPLOY.md](./DEPLOY.md)。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

服务端集成测试使用进程内临时 PostgreSQL，不读取或写入生产数据库；组件测试使用模拟接口。

已于 2026-09-20 在正式环境完成验收：HTTPS／HSTS／Cookie 安全标志、注册→邮箱验证→设置密码→登录全流程（含 Linux 容器中的 Argon2 原生模块）、AI 导入、建群与共同空闲矩阵。仍未在真实环境验证的边界：验证码邮件对真实邮箱的端到端送达（验收使用自建测试域名邮箱）、移动真机浏览器布局与微信内置浏览器差异、多连接数据库压力。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [IMPLEMENTATION.md](./IMPLEMENTATION.md) | 当前架构、数据规则、接口和业务边界 |
| [DEPLOY.md](./DEPLOY.md) | 环境变量、迁移、HTTPS、部署和学期运维 |
| [PROJECT_REVIEW_AND_IMPROVEMENT_PLAN.md](./PROJECT_REVIEW_AND_IMPROVEMENT_PLAN.md) | 本轮审查、逐项交付证据和后续 UI 方案 |
| [课隙_OpenPeriod_SPEC_UI_V1.md](./课隙_OpenPeriod_SPEC_UI_V1.md) | 历史 V1 产品／视觉基线；与当前实现冲突时不作为现行合约 |

## 当前限制

- 当前学年和学期名称仍由代码中的单一默认学期定义；维护脚本只能更新该学期各学校的开学日、周数和时区。
- 学校预设解决作息换算，不代表能直接解析每所学校教务系统的任意原始导出格式。非北大用户优先使用站内生成的标准模板、时间／节次行式表，或 AI 识别后人工核对。
- AI 会把截图或文字发送给智谱服务进行解析；原图不落库，但供应商侧的数据处理受其服务条款约束。
- 没有永久删除群组入口；归档是可恢复状态。生产数据清理必须另行审阅和授权。
- 尚未接入 PKU IAAA，也不会收集学校门户密码。
