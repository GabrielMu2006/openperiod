# OpenPeriod 0.2 实施基线

本文描述当前仓库中的实际实现。旧版 [V1 Product & UI Specification](./课隙_OpenPeriod_SPEC_UI_V1.md) 保留为历史产品与视觉基线；其中“邮箱可直接恢复身份”“仅 PKU”“固定 16 周”“多学校属于未来功能”等内容已经失效。

## 架构

- Web：Next.js 16 App Router、React 19、TypeScript。
- 数据：PostgreSQL、Drizzle ORM；服务端路由和数据函数执行鉴权与事务。
- 领域层：框架无关的 TypeScript；课程周次始终规范化为 `weeks[]`，作息负责把节次换算成钟点。
- 导入：Excel Adapter 或 AI 提取先生成临时预览，用户修正并确认后才替换正式课表。
- 隐私：共同空闲和详情均由服务端投影，不把他人的完整课程或私人忙碌标题提前发送到客户端。

```text
Excel / AI -> 预览与校验 -> 事务确认 -> 课程、时段、恢复点
                                      |
账号 -> 学校与学期 -> 群组成员与隐私 -> 钟点区间 -> 共同空闲 API -> 响应式界面
```

## 核心业务规则

### 身份与会话

- 日常登录使用邮箱和密码。邮箱地址本身不能建立会话。
- 注册、老账号首次设置密码、忘记密码分别使用独立用途的 6 位邮箱验证码；验证码绑定邮箱、用途和 challenge ID，15 分钟有效，错误 5 次后失效。
- 密码为 6–128 个字符，使用 Argon2id。修改或重置密码会提高 `authVersion`、撤销其他会话，并为当前操作签发新会话。
- 会话令牌只存于 HttpOnly Cookie，数据库只保存摘要。生产 Cookie 强制 `Secure`；生产请求必须通过已配置的规范 HTTPS origin。
- 认证邮件、登录和验证码验证均有 PostgreSQL 持久限额；邮件申请另有 60 秒冷却和 24 小时 5 次上限。

### 学校、学期与作息

- `users.scheduleId` 表示用户当前查看／导入的学校作息，也决定其新建群组绑定的学校学期。
- 注册表当前包含 32 个学校／校区／季节预设；另有 `custom`。自定义作息按“用户＋学年＋学期”保存在 `custom_schedules`，用户之间隔离。
- 学期行按“学校键＋学年＋学期名”区分，包含开学日、周数和时区。共同空闲按每位成员自己的学校学期换算教学周。
- 当前默认仍是 `2026–2027 秋季学期`；读路径只在缺行时创建默认学期，不覆盖运维设置。更新开学日、周数和时区必须走维护脚本。

### 课程、忙碌与导入

- Excel 支持 `.xlsx` / `.xls`，最大 5MB；解析行式或网格式课表，也支持节次、大节或钟点时间字段。
- AI 支持 PNG、JPG、WebP 截图或不超过 5000 字的文本，调用智谱 `glm-4v-flash` / `glm-4-flash`。每账号每天 10 次，北京时间 00:00 重置。
- Excel 与 AI 共用预览模型。预览有效期 2 小时，确认操作一次性消费预览，并在单个事务中只替换目标学校／学期的课程。
- 确认前不会修改正式课表或个人自定义作息。确认导入会把用户当前学校切到目标学校；其他学校的课程不受影响。
- 替换前保存该用户、该学期最近一份课表快照，包括“不去”记录。恢复点有效 7 天；私人忙碌不属于课表替换范围。
- “本周不去”按成员自己的教学周保存；未知课表、已确认无课和已有课程／忙碌是三个不同状态。

### 群组与共同空闲

- 群主可以改名、重新生成邀请码、移出普通成员、转让群主、归档和恢复。普通成员可以主动退出。
- 群主不能直接退出；需先转让，只有自己时使用归档。归档保留群组、成员、隐私和历史数据，暂停邀请码、管理和共同空闲。
- 群主转让在同一事务内同步 `groups.owner_id` 与成员角色。自定义作息群只允许转让给同学期作息完全相同的成员。
- 共同空闲先把每位成员的课程和私人忙碌换算成真实分钟区间，再计算忙碌并集和空闲补集；不会跨过午间或课间的实际忙碌。
- 未录入且未确认无课的成员标记为未知，不参与“确定有空”结论。确认无课后才按已知空闲参与。
- 隐私级别为：0 仅忙闲、1 课程名称、2 完整课程。本人始终能查看自己的完整课程；私人忙碌标题不向其他成员公开。

## 数据与迁移

Schema 位于 [`src/server/db/schema.ts`](./src/server/db/schema.ts)，迁移位于 [`drizzle/`](./drizzle)。`0007`–`0010` 分别覆盖密码认证与持久限额、无课确认、个人自定义作息、群组软归档。它们已在 PGlite 临时 PostgreSQL 中回归，尚未用于生产数据库。

迁移历史的 `0004`–`0006` 没有对应的 Drizzle schema snapshot，后续不能直接根据旧 snapshot 生成并执行迁移；应先校准快照，或沿用经人工审阅的 SQL＋journal 流程。生产步骤、影响和备份要求见 [DEPLOY.md](./DEPLOY.md)。

## 当前 API

| 域 | 路由 | 行为 |
| --- | --- | --- |
| 认证 | `POST /api/auth/login` | 邮箱＋密码登录 |
| 认证 | `POST /api/auth/identify`、`POST /api/auth/resend` | 申请注册／首次设密码／重置密码验证码；不能直接建立会话 |
| 认证 | `POST /api/auth/verify` | 验证 challenge、设置密码并建立会话 |
| 认证 | `GET/DELETE /api/auth/session` | 恢复或撤销当前会话 |
| 认证 | `POST /api/auth/password` | 已登录用户修改密码 |
| 认证 | `PUT /api/auth/profile` | 更新昵称、默认隐私和学校作息 |
| 群组 | `GET/POST /api/groups` | 列表与事务创建；普通列表默认排除归档群 |
| 群组 | `POST /api/groups/join` | 通过有效邀请码加入活跃群组 |
| 群组 | `PATCH/DELETE /api/groups/:groupId` | 改名／归档／恢复；成员退出 |
| 群组 | `PATCH/DELETE /api/groups/:groupId/members/:userId` | 转让群主／移出成员 |
| 群组 | `POST /api/groups/:groupId/invite-code` | 群主重新生成邀请码 |
| 群组 | `PUT /api/groups/:groupId/privacy` | 群组级隐私覆盖 |
| 空闲 | `GET /api/groups/:groupId/availability` | 周视图、钟点网格和连续空档 |
| 空闲 | `GET /api/groups/:groupId/availability/details` | 单时段的服务端隐私投影 |
| 导入 | `POST /api/import/preview` | Excel 解析并创建两小时预览 |
| 导入 | `POST /api/import/ai` | AI 截图／文字识别并创建同类预览 |
| 导入 | `GET /api/import/preview/:previewId` | 读取本人未过期预览 |
| 导入 | `POST /api/import/confirm` | 一次性确认、快照并事务替换目标课表 |
| 导入 | `POST /api/import/restore` | 恢复本人 7 天内的导入前快照 |
| 导入 | `GET /api/import/template` | 按学校作息生成标准 Excel 模板 |
| 课表 | `GET /api/schedule` | 读取当前学校学期的课程、忙碌和状态 |
| 课表 | `PUT /api/schedule/confirm-empty` | 确认或撤销“本学期无课” |
| 课表 | `POST /api/courses`、`PUT/DELETE /api/courses/:courseId` | 课程与时段编辑 |
| 课表 | `PUT /api/course-meetings/:meetingId/skip` | 批量替换该时段的“不去”周次 |
| 课表 | `POST /api/busy-blocks`、`PUT/DELETE /api/busy-blocks/:busyId` | 一次性或周期私人忙碌 |
| 运维 | `GET /api/admin/overview` | 管理密钥保护的只读账号／群组总览 |
| 运维 | `GET/PATCH /api/admin/feedback` | 只读列表与处理状态更新 |
| 公共 | `GET/POST /api/feedback` | 读取近 30 天未处理反馈数；登录或匿名提交反馈 |

## 完成标准与验证边界

- 核心领域规则、认证、真实 SQL 迁移、跨校换算、导入恢复和群组生命周期有自动化测试。
- 主要组件覆盖手机主流程、键盘、焦点、错误恢复、导入确认和群组管理。
- 当前要求 `pnpm typecheck`、`pnpm test`、`pnpm build`、`git diff --check` 全部通过。
- 自动化测试不代表真实生产验收。HTTPS、邮件实际送达、第三方 AI、Linux 容器、真机布局、屏幕阅读器和真实多连接并发仍需在预发布环境验证。
