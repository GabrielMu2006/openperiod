# 部署指南

当前版本（0.1.0）的推荐试运行路径：**GitHub + Vercel + Neon**（全免费档）。
正式对外或校园规模化后，迁移到国内服务器，见文末。

## 0.1.0 试用版：Vercel + Neon（约 30 分钟）

### 1. 建数据库（Neon，免费）

1. 注册 [neon.com](https://neon.com)，创建项目，区域建议选 **Singapore**（对大陆延迟较低）。
2. 复制连接串。注意选 **Pooled connection**（带 `-pooler` 的地址），Serverless 环境下更稳：
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`

### 2. 建表（只需一次）

在本机项目根目录执行：

```bash
DATABASE_URL="上一步的连接串" pnpm db:migrate
```

### 3. 推送代码到 GitHub

仓库已建好并推送（私有仓库），如需重新推送：

```bash
git push origin main
```

### 4. Vercel 导入

1. 用 GitHub 账号登录 [vercel.com](https://vercel.com) → Add New… → Project → 选中 `openperiod` 仓库导入。
2. Framework 自动识别为 Next.js，无需改 Build 设置。
3. **Environment Variables** 添加两个：
   - `DATABASE_URL` = Neon 的 Pooled 连接串
   - `OPENPERIOD_SEMESTER_START` = `2026-09-07`
4. **Settings → Functions → Function Region**：确认是 **Hong Kong (hkg1)**（`vercel.json` 已指定）。
5. Deploy。之后每次 `git push` 自动重新发布。

### 5. 验证

打开分配的 `*.vercel.app` 域名 → 登录 → 上传课表 Excel → 建群。
大陆直连 `*.vercel.app` 可能不稳定；试用版仅供熟人小范围体验，**不建议广泛分发**。

## 试用版的两点须知

- **身份模型**：0.1.0 登录不验证邮箱，知道邮箱即可接管账号。只把地址发给信得过的人。
- **数据出境**：Neon 数据存境外节点。正式运营前应迁移到境内数据库（PIPL 对个人信息出境有要求）。

## 邮箱验证码登录（可选，配好即启用）

实现已就绪，**全部配齐以下 4 个环境变量后自动启用**；缺任何一个都保持旧的免验证行为：

| 变量 | 值 |
|---|---|
| `DIRECTMAIL_ACCESS_KEY_ID` | 阿里云 AccessKey ID（建议 RAM 子账号 + 邮件推送权限） |
| `DIRECTMAIL_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret |
| `DIRECTMAIL_ACCOUNT` | 发信地址，如 `noreply@mail.gabrielmu2006.cn` |
| `DIRECTMAIL_FROM_ALIAS` | 发件人显示名，如 `课隙`（可选，默认"课隙"） |

启用后：新邮箱首次登录需输入发送到邮箱的 6 位验证码（15 分钟有效）；同一邮箱 60 秒内只能重发、每天最多 5 条；错误 5 次后验证码作废。已验证邮箱直接登录。

## 迁移到国内服务器（备案通过后）

1. 服务器上跑 `docker compose up -d postgres` + 应用进程（或届时补充的完整 compose）。
2. `DATABASE_URL` 指向服务器本机 Postgres，执行 `pnpm db:migrate`。
3. Caddy/nginx 做 HTTPS 反代（生产模式 cookie 带 `secure` 标志，必须 HTTPS 才能登录）。
4. Vercel 项目可以保留为预览环境，生产域名 DNS 切换到国内服务器。

## 管理页 /admin（仅项目所有者）

`/admin` 是一个只读的站点总览页：凭管理密钥查看全站账号（邮箱、昵称、验证状态、课程/群组数）与全部群组（群主、成员数、邀请码）。不做任何修改操作。

访问密钥由环境变量 `ADMIN_KEY` 控制，**未配置时接口一律拒绝**：

- **Vercel**：Settings → Environment Variables 添加 `ADMIN_KEY`（强随机值，如 `openssl rand -base64 18` 生成），添加后需 Redeploy 生效。
- **阿里云服务器**：把 `ADMIN_KEY=...` 写进 `/opt/openperiod` 的应用环境文件（compose 引用的 `.env`），然后 `docker compose up -d app`。

## 每学期运维

学期配置（开学日/周数）由独立的显式流程更新，读写接口不会自动覆盖数据库：

```bash
node --env-file=.env scripts/apply-semester-config.mjs 2027-02-22 16 Asia/Shanghai
```

`OPENPERIOD_SEMESTER_START` 环境变量仅在数据库还没有该学期记录时用于首次创建；之后修改开学日必须用上面的脚本。数据库备份：`pg_dump` 每周一次。
