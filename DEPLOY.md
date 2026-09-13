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

## 迁移到国内服务器（备案通过后）

1. 服务器上跑 `docker compose up -d postgres` + 应用进程（或届时补充的完整 compose）。
2. `DATABASE_URL` 指向服务器本机 Postgres，执行 `pnpm db:migrate`。
3. Caddy/nginx 做 HTTPS 反代（生产模式 cookie 带 `secure` 标志，必须 HTTPS 才能登录）。
4. Vercel 项目可以保留为预览环境，生产域名 DNS 切换到国内服务器。

## 每学期运维

更新环境变量 `OPENPERIOD_SEMESTER_START` 为新学期第一个周一（应用会自动把该日期写入数据库并重算教学周），然后重新部署。数据库备份：`pg_dump` 每周一次。
