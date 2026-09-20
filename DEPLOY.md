# OpenPeriod 部署与运维指南

## 当前部署状态

仓库版本为 `0.3.0`。已于 2026-09-20 部署至阿里云国内服务器并完成 HTTPS 验收：`0000`–`0010` 全部迁移已在正式库执行，正式入口为 `https://openperiod.gabrielmu2006.cn`，生产数据库为服务器本地 PostgreSQL（Neon 保留为历史快照，不再写入）。ICP 备案已于 2026-09-20 通过省通信管理局审核（备案号见阿里云 ICP 备案系统；域名须在 30 天内解析到阿里云内地服务器，开通后 30 日内需办理公安备案）。本文的部署、验收与迁移流程即本轮实际上线所遵循的记录。

## 环境变量

以 [.env.example](./.env.example) 为唯一变量清单。敏感值不得提交到仓库。

| 变量 | 必需范围 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 所有运行环境 | PostgreSQL 连接串；Serverless 使用连接池地址 |
| `OPENPERIOD_SEMESTER_START` | 可选 | 仅在当前学校学期行尚不存在时提供默认开学日；不会覆盖已有行 |
| `AUTH_SECRET` | 注册／首次设密码／找回密码 | 至少 32 字符，用于验证码 HMAC；轮换会使未消费验证码失效，不影响密码和现有会话 |
| `AUTH_ORIGIN` | 生产必需 | 唯一规范 HTTPS origin，如 `https://example.com`，不能带路径或末尾斜杠 |
| `TRUST_PROXY_HEADERS` | 生产必需 | 精确设为 `1`；前提是应用端口只在回环或私网可达，代理覆盖 `X-Forwarded-Proto` |
| `DIRECTMAIL_ACCESS_KEY_ID` | 需要发送验证码时 | 阿里云 DirectMail AccessKey ID，建议使用最小权限 RAM 身份 |
| `DIRECTMAIL_ACCESS_KEY_SECRET` | 需要发送验证码时 | 阿里云 DirectMail AccessKey Secret |
| `DIRECTMAIL_ACCOUNT` | 需要发送验证码时 | 已配置的发信地址 |
| `DIRECTMAIL_FROM_ALIAS` | 可选 | 发件人名称，默认“课隙” |
| `DIRECTMAIL_REGION` | 可选 | DirectMail RegionId，默认 `cn-hangzhou` |
| `ZHIPU_API_KEY` | AI 导入可选 | 智谱开放平台密钥；留空时 AI 导入关闭，Excel 和手动编辑正常工作 |
| `ADMIN_KEY` | 管理页可选 | `/admin` 的强随机访问密钥；留空时管理接口全部拒绝 |
| `NEXT_PUBLIC_ICP_BEIAN` | 正式环境必需 | ICP 备案号（如 `京ICP备2026xxxxxx号`），展示在页面底部并链接工信部；构建时注入，修改后需重新构建 |

日常密码登录不依赖邮件配置。邮件不可用时，已有密码且邮箱已验证的账号仍可登录；注册、老账号首次设密码和找回密码不可用。

## 本地开发

```bash
cp .env.example .env.local
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

上述迁移命令必须确认 `DATABASE_URL` 指向 `compose.yaml` 的本地数据库。打开 <http://localhost:3000>。

## 预览环境：Vercel + PostgreSQL

当前仓库的 `vercel.json` 指定 `hkg1`。使用 Vercel 与 Neon 等托管 PostgreSQL 时：

1. 创建独立的预览数据库，使用 PostgreSQL pooled connection string 配置 `DATABASE_URL`。
2. 配置 `AUTH_SECRET`、该部署唯一的 `AUTH_ORIGIN` 和 `TRUST_PROXY_HEADERS=1`；需要注册流程时再配置 DirectMail。
3. 需要 AI 导入时配置 `ZHIPU_API_KEY`；需要管理页时配置强随机 `ADMIN_KEY`。
4. 先在独立预览数据库执行迁移，再部署同一提交的应用。不要让旧代码和新 schema 的认证切换长期交叉运行。
5. 只用明显标注的自建测试账号验收，不使用真实用户账号或群组进行写入测试。

托管数据库节点可能位于境外。正式运营前应完成个人信息存储位置与跨境合规评估。`*.vercel.app` 在中国大陆的连通性也不能视为稳定的正式入口。

## 国内服务器与 HTTPS 边界

模板位于 [deploy/Caddyfile.example](./deploy/Caddyfile.example) 和 [deploy/compose.app.example.yaml](./deploy/compose.app.example.yaml)：Caddy 占用公网 80/443 并管理证书，Next 端口只绑定 `127.0.0.1:3000`。服务器安全组也必须关闭公网 3000。

备案和域名解析完成后：

1. 配置 `OPENPERIOD_DOMAIN`、`ACME_EMAIL`，并把正式环境变量放在 `/opt/openperiod/.env.production` 或等价的受限秘密存储中。
2. 设置 `AUTH_ORIGIN=https://正式域名`、`TRUST_PROXY_HEADERS=1`。一个部署只接受一个规范 Host；若 Vercel 仍作为独立入口，需要单独部署和配置其 origin。
3. 确认代理覆盖 `Host` 和单一的 `X-Forwarded-Proto: https`，不追加或透传客户端伪造值。
4. 先完成 HTTPS 验收，再开放密码表单并执行认证迁移切换。

应用的生产传输规则：

- 缺少合法 `AUTH_ORIGIN` 或 `TRUST_PROXY_HEADERS=1` 时，生产请求返回 503，不降级运行。
- HTTP 或错误 Host 的 GET/HEAD 使用 308 跳到规范 HTTPS origin，并保留路径和查询参数。
- HTTP 的 POST/PUT/PATCH/DELETE 返回 426；错误 Host 返回 421，不重定向带密码或写入内容的请求。
- 会话 Cookie 始终带 `Secure`、`HttpOnly`、`SameSite=Lax`、`Path=/` 和高优先级。
- HTTPS 响应带一年 HSTS、`nosniff` 和严格来源 Referrer Policy。
- `ALLOW_INSECURE_COOKIE` 已被移除，即使环境中遗留该变量也不会降低 Cookie 要求。

验收清单：

| 检查 | 预期 |
| --- | --- |
| `curl -I http://正式域名/login` | 308 到同域名 HTTPS 路径 |
| `curl -I https://正式域名/login` | 200，包含 `Strict-Transport-Security: max-age=31536000` |
| 对 HTTP 入口 POST `/api/auth/login` | 426，无 `Location`，请求未进入登录处理 |
| 直接访问 `http://服务器IP:3000` | 公网连接失败 |
| 登录响应 `Set-Cookie` | 包含 `Secure; HttpOnly; SameSite=Lax; Path=/` |
| 错误 Host 或组合代理头 | 421／426，不能建立或读取会话 |
| 浏览器关闭后重开 | 登录保持；注册、找回和修改密码可正常提交 |

以上线上检查通过以前，SEC-01 只能记为“仓库侧完成、部署侧待验证”。

## 数据库迁移

Drizzle 按 [drizzle/meta/_journal.json](./drizzle/meta/_journal.json) 依次执行 `0000`–`0010`。本轮新增迁移：

| 迁移 | 作用 | 数据影响 |
| --- | --- | --- |
| [`0007_password_auth.sql`](./drizzle/0007_password_auth.sql) | 密码哈希、会话版本、challenge、邮件配额和持久限流 | 不删除账号、课表、群组或旧会话记录；新应用拒绝 `auth_version` 为空的旧会话，用户需重新认证 |
| [`0008_semester_confirmations.sql`](./drizzle/0008_semester_confirmations.sql) | 新增“本学期无课”确认表 | 纯增量建表，不修改现有行 |
| [`0009_custom_schedules.sql`](./drizzle/0009_custom_schedules.sql) | 用户级自定义作息 | 新增表，并把旧共享 custom 学期的网格快照给现有 custom 用户；旧共享列保留只读兜底 |
| [`0010_group_lifecycle.sql`](./drizzle/0010_group_lifecycle.sql) | 群组软归档时间 | 仅新增可空 `archived_at`；现有群组默认仍为使用中 |

`0010` 的完整 SQL 为：

```sql
ALTER TABLE "groups" ADD COLUMN "archived_at" timestamp with time zone;
```

迁移前必须：

1. 确认目标连接串和数据库身份，向项目所有者展示将执行的迁移 SQL、历史会话失效范围和数据影响。
2. 使用 `pg_dump` 或云数据库快照备份目标数据库，并验证备份文件可读和恢复路径明确。
3. 取得项目所有者对当次生产写入的明确授权。不得顺带清理账号、群组、成员、课程、旧会话或“疑似测试”数据。
4. 在独立预发布数据库执行 `pnpm db:migrate`，再运行登录、导入、群组和共同空闲验收。

获准后的维护窗口顺序：停止旧应用接收认证写请求 → 备份 → `pnpm db:migrate` → 部署新应用 → 用自建临时账号验收。失败时保留新增列和表，暂停入口并部署兼容新认证 schema 的修复版本；不要回退到允许邮箱直接建立会话的旧代码。

迁移历史 `0004`–`0006` 没有对应 schema snapshot。不要直接把 `drizzle-kit generate` 基于旧 snapshot 生成的重复迁移用于生产；应先校准 snapshot 或继续使用人工审阅的 SQL＋journal 流程。

## 认证和限额运行规则

- 密码：6–128 字符，Argon2id（19 MiB、2 次迭代、并行度 1、随机盐）。
- 验证码：按注册、首次设密码、重置密码绑定邮箱、用途和 challenge ID；15 分钟有效，错误 5 次失效，重发使旧码失效。
- 登录／修改密码、邮件申请、验证码验证：同邮箱各 15 分钟 10 次；邮件另有 60 秒冷却和滚动 24 小时 5 次上限。
- 邮件发送失败也保留申请配额并作废对应验证码；外部响应不暴露邮箱是否存在或供应商错误。
- AI 导入：每账号每天 10 次，北京时间 00:00 重置。开始调用供应商后即计入，后续超时或模型结果无效不退额度。
- 当前没有基于请求头 IP 的应用层限流；可在经过严格可信代理后增加网关级全站／IP 限额。

过期 challenge、配额和限流记录不会被本轮自动清理。未来清理任务需要单独审阅，只删除已过期记录，不重置仍有效窗口。

## 学期运维

当前代码中的默认学期是 `2026–2027 秋季学期`。每所学校各有学期行；开学日和教学周数可以不同。读请求只会创建缺失的默认行，不会覆盖已有配置。

维护脚本只能更新当前代码所定义的这个学期，并会写数据库；执行生产命令前同样需要展示影响、备份和明确授权：

```bash
node --env-file=.env scripts/apply-semester-config.mjs 2027-02-22 16 Asia/Shanghai
node --env-file=.env scripts/apply-semester-config.mjs 2027-03-01 20 Asia/Shanghai uibe
```

第四个参数是学校键：北大沿用 `PKU`，其他学校使用作息预设 ID，如 `uibe`、`zju`、`lzu-winter`。切换到新学年或新学期目前需要先修改代码中的默认学期和脚本常量，再经过审阅部署；尚无管理界面完成该操作。

## 导入与恢复运维事实

- Excel 和 AI 预览有效期为 2 小时；预览阶段不修改正式课程或自定义作息。
- 确认导入只替换目标学校／学期的课程，其他学校课表保留，并把当前查看学校切到目标学校。
- 若目标学期原来有课程，系统只保留最近一份导入前快照，有效 7 天；快照包含课程、时段和“不去”记录，不包含私人忙碌。
- 恢复会再次替换该快照所属学期的课程，并恢复当时的“不去”记录；生产故障排查不能把恢复点当作完整数据库备份。

## 管理页 `/admin`

`ADMIN_KEY` 保护账号和群组只读总览，可查看账号验证／课程／群组统计，以及群组所有者、成员数和归档状态。归档群的邀请码在界面中显示为停用。

账号和群组没有管理写接口。反馈列表允许项目所有者切换“已处理”状态；这项写入只修改反馈记录，不修改用户、课表或群组。

## 上线后验收

1. HTTPS、Host、代理头、HSTS 和 Secure Cookie 符合前述清单。
2. 使用自建 `*-test@example.com` 账号验证注册、首次设密码、密码登录、重置、修改和旧会话失效。
3. 验证 Excel 与 AI 预览、失败重试、目标学校提示、确认导入和 7 天恢复入口。
4. 建立测试群，验证加入、三级隐私、未知／确认无课、跨校教学周、退出、转让、归档和恢复。
5. 测试完成后只清理本次自己创建且明确标记的测试账号；生产清理前仍需展示 SQL 和关联范围并取得授权。
6. 记录部署提交、迁移版本、备份位置、HTTPS 检查结果和回滚负责人。
