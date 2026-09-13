# 课隙 · OpenPeriod

把课表叠起来，一眼找到大家共同的空档。

当前仓库已包含响应式共同空闲课表、领域模型、PostgreSQL 持久化、邮箱身份 Session、群组与邀请流程、服务端隐私裁剪、PKU Excel 事务导入，以及个人课表、Skip 与私人 Busy 编辑。产品与 UI 需求以 [`课隙_OpenPeriod_SPEC_UI_V1.md`](./课隙_OpenPeriod_SPEC_UI_V1.md) 为准。

## 本地运行

```bash
cp .env.example .env.local
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

打开 <http://localhost:3000>。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 实现顺序

1. 领域模型、共同空闲计算与服务端隐私裁剪
2. 身份、Session、Semester 与 PostgreSQL/Drizzle 持久化（已建立基线）
3. Group、邀请码、隐私覆盖与首页真实数据接入（已完成）
4. PKU Excel Adapter、预览修正与事务导入（已完成）
5. 个人课表、Skip、Busy 编辑流程（已完成）
6. 完整响应式体验与无障碍回归
