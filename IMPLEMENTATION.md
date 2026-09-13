# OpenPeriod V1 实施基线

## 已确定的架构

- Web：Next.js App Router + React + TypeScript
- UI：CSS Design Tokens 起步；组件层保持可迁移到 shadcn/ui 的边界
- 领域层：框架无关的 TypeScript，Availability 只消费规范化的 `weeks[]`
- 数据层：PostgreSQL + Drizzle ORM，首版 migration 已生成
- Excel：`TimetableImporter` Adapter，V1 仅启用 `PkuExcelImporter`
- 隐私：服务端生成详情投影；不把完整课程或 Skip/Busy title 交给他人客户端

## 模块边界

```text
Importer -> normalized courses/meetings -> persistence
                                             |
identity/group membership -> privacy policy -> availability service -> API projection
                                             |
                                       responsive timetable UI
```

## 首批 API 合约

- `GET /api/groups/:groupId/availability?week=5&users=id1,id2`
- `GET /api/groups/:groupId/availability/details?week=5&weekday=wednesday&period=7&users=id1,id2`
- `POST /api/import/preview`
- `POST /api/import/confirm`

`confirm` 必须在单个事务中替换目标学期课表；预览数据与正式数据分离。

## Definition of Done（每个切片）

- 领域规则有针对 SPEC 验收项的自动测试
- 任何成员详情输出都经过成员关系和隐私投影
- Desktop 与 360px Mobile 均可完成主流程
- 键盘可操作，触控目标不小于 44px，状态不只依赖颜色
- `typecheck`、`test`、`build` 全部通过

## 当前服务端入口

- `POST /api/auth/identify`：规范化邮箱、创建或恢复身份、写入 HttpOnly Session
- `GET /api/auth/session`：恢复当前身份
- `DELETE /api/auth/session`：退出并撤销当前 Session
- `GET /api/groups/:groupId/availability`
- `GET /api/groups/:groupId/availability/details`
- `GET /api/groups` / `POST /api/groups`：群组列表与事务创建
- `POST /api/groups/join`：邀请码加入
- `POST /api/groups/:groupId/invite-code`：群主重新生成邀请码
- `PUT /api/groups/:groupId/privacy`：群组级隐私覆盖
- `POST /api/import/preview`：校验并解析不超过 5MB 的 `.xlsx`，创建两小时有效的预览
- `GET /api/import/preview/:previewId`：读取当前用户的未过期预览
- `POST /api/import/confirm`：一次性消费预览并在事务中替换当前学期课表
- `GET /api/schedule`：读取当前用户课程、指定周 Skip 和仅本人可见的 Busy 标题
- `POST /api/courses` / `PUT|DELETE /api/courses/:courseId`：课程与上课时段事务编辑
- `PUT /api/course-meetings/:meetingId/skip`：切换指定教学周的 Skip
- `POST /api/busy-blocks` / `PUT|DELETE /api/busy-blocks/:busyId`：临时或周期 Busy

## 下一切片

完成全流程响应式、键盘操作与无障碍回归，并在数据库可用时执行真实导入到共同空闲的端到端验收。
