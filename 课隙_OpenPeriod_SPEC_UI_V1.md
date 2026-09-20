# 课隙 · OpenPeriod

> [!IMPORTANT]
> 本文是项目早期的 V1 产品与视觉基线，保留用于追溯设计意图，并非当前实现合约。当前代码已经采用邮箱＋密码认证、邮箱验证、多学校／自定义作息、动态教学周、AI 导入、7 天导入恢复点和群组软归档；因此下文“邮箱无需验证即可恢复身份”“仅支持 PKU”“固定 16 周”“多学校属于未来版本”等描述均已过时。请以 [README](./README.md)、[当前实施基线](./IMPLEMENTATION.md) 和 [部署指南](./DEPLOY.md) 为准；本轮问题与交付证据见 [项目审查与改进计划](./PROJECT_REVIEW_AND_IMPROVEMENT_PLAN.md)。

## V1 Product & UI Specification

> **中文品牌名：课隙**  
> **英文名：OpenPeriod**  
> **一句话：把课表叠起来，一眼找到大家共同的空档。**

---

## 0. 文档信息

- 产品阶段：V1
- 首发对象：北京大学学生，小规模好友使用
- 首发形态：Responsive Web App
- 核心设备：桌面浏览器 + 手机浏览器
- 首发学校：北京大学（PKU）
- 学期模型：16 周
- 每日课节：1–12 节
- 核心能力：多人课表叠加、共同空闲查询、单双周、临时翘课、临时/周期忙碌
- 品牌主色：北大红 `#94070A`
- V1 课表导入：Excel + 手动修正
- PKU IAAA：V1 不接入，架构预留

---

# 1. 产品定位

**课隙（OpenPeriod）** 是一个以大学课表为基础的多人共同空闲时间查询工具。

它不是通用日历，也不是会议预约系统。

核心问题只有一个：

> **“我和这几个人，这周什么时候都没课？”**

用户上传自己的课表，加入好友群组，勾选若干成员后，系统直接把共同空闲结果显示在一张“课表”中，而不是输出一串文字时间。

典型使用场景：

- 宿舍几个人约饭；
- 朋友约球、健身、出去玩；
- 小组找共同讨论时间；
- 同学找固定自习时段；
- 查看下一周、某个单周/双周的共同空档。

---

# 2. 品牌命名

## 2.1 中文名

**课隙**

含义：课程之间留下的空隙。

中文品牌在产品内拥有最高优先级。

推荐 Logo 文案：

```text
课隙
OpenPeriod
```

或：

```text
课隙 · OpenPeriod
```

网页标题：

```text
课隙 — 找到大家共同的空档
```

---

## 2.2 英文名

**OpenPeriod**

选择原因：

1. `Period` 与学校“课节/时段”的语义天然贴合；
2. `Open` 表示当前时段可用；
3. 不需要中文拼音背景也能理解；
4. 比 `Kexi` 更适合作为面向未来其他学校时的英文副品牌；
5. 产品 UI 内仍以“课隙”为主，不需要强行把英文名中文化。

---

# 3. V1 产品原则

## 3.1 Timetable First

核心结果必须用“课表网格”展示。

不以这种形式作为主结果：

```text
周二 15:10–17:00
周三 13:00–14:50
周五 08:00–09:50
```

而是：

```text
          周一   周二   周三   周四   周五
第1节
第2节
第3节
...
第12节
```

直接通过格子状态表示共同空闲。

---

## 3.2 PKU First, Architecture General

V1 只允许使用 PKU 课表。

但是内部必须使用通用 Adapter：

```ts
interface TimetableImporter {
  provider: string
  detect(file): DetectionResult
  parse(file): ImportResult
}
```

V1：

```text
PkuExcelImporter = ENABLED
GenericImporter = DISABLED
OtherUniversityImporter = DISABLED
```

未来无需修改核心课表模型即可增加其他学校。

---

## 3.3 Privacy First

“能否约到”与“你在上什么课”是两件事。

系统必须允许用户只分享 Free / Busy，而不分享具体课程。

“本周准备翘课”永远是私有状态。

---

## 3.4 Glanceable

共同空闲页应达到：

> 用户打开网页后，2 次以内交互即可看到需要的共同空闲结果。

老用户理想情况：

```text
打开课隙
→ 自动进入上次群组
→ 默认本周 + 全部成员
→ 立即看到共同空闲课表
```

---

# 4. 用户与身份

## 4.1 V1 身份

创建身份只需要：

- 昵称
- 邮箱

不需要：

- 邮箱验证码
- 密码
- 手机号
- PKU 学号
- PKU 密码

Email 作为 V1 的唯一身份 Key。

```ts
User {
  id: UUID
  nickname: string
  email: string // unique, lowercase, trimmed
  defaultPrivacyLevel: 0 | 1 | 2
}
```

---

## 4.2 登录

同一设备：

```text
HttpOnly Session Cookie
→ 自动恢复身份
```

新设备：

```text
输入邮箱
→ 恢复该邮箱对应身份
```

V1 明确接受一个限制：

> 因为不验证邮箱，知道别人邮箱的人理论上能够冒充该用户。

因此 V1 仅面向小规模熟人使用，不将该身份体系宣传为高安全账户系统。

未来升级：

```text
Magic Link
OAuth
PKU IAAA
```

---

# 5. PKU 登录 / IAAA

V1 不接入 PKU IAAA。

禁止：

- 收集北大账号密码；
- 后端模拟登录北大门户；
- 保存 IAAA Cookie；
- 用户上传校园网 Cookie；
- 非官方代理统一身份认证。

架构预留：

```ts
interface AuthProvider {
  identify()
  login()
  callback()
  linkAccount()
}
```

未来获得正式接入资格后，可以增加：

```text
LocalIdentityProvider
PkuIaaaProvider
```

但不得影响 V1 的本地身份系统。

---

# 6. Semester & Schedule Model

## 6.1 Semester

```ts
Semester {
  id
  school
  academicYear
  semester
  startDate
  weekCount
  timezone
}
```

V1：

```text
school = PKU
weekCount = 16
```

当前周：

```text
floor((today - semester.startDate) / 7 days) + 1
```

最终限制在：

```text
1...16
```

学期起始日期必须由管理员/配置文件设置，不写死在业务逻辑中。

---

## 6.2 Weekly Grid

底层固定：

```text
16 weeks
×
7 days
×
12 periods
```

即每位用户一学期最多对应：

```text
1344 basic availability slots
```

不需要真的逐格存储，课程/忙碌数据通过规则动态计算。

---

# 7. Course Model

```ts
Course {
  id
  userId
  semesterId
  name
  instructor?
  location?
  notes?
}
```

同一门课程可以有多个 Meeting：

```ts
CourseMeeting {
  id
  courseId
  weekday
  startPeriod
  endPeriod
  weeks: number[]
}
```

例如：

```text
人工智能中的数学
├─ 周二 7–8节，1–16周
└─ 周四 7–8节，1–16周
```

---

# 8. 周次规则

导入层必须识别：

```text
ALL
ODD
EVEN
CUSTOM
```

解析完成后统一转换为：

```ts
weeks: number[]
```

例如：

```text
1–16周
→ [1,2,3,...,16]

单周
→ [1,3,5,7,9,11,13,15]

双周
→ [2,4,6,8,10,12,14,16]

1,2,5,8,12
→ [1,2,5,8,12]
```

核心 Availability Algorithm 只处理 `weeks[]`，不处理自然语言周次。

---

# 9. Excel 导入

## 9.1 V1 支持

正式支持：

```text
.xlsx
```

可 Best-effort 支持：

```text
.xls
```

但 `.xls` 不作为 V1 发布阻塞项。

---

## 9.2 PKU 导入器

支持两种主要结构。

### A. 行式数据

```text
课程 | 星期 | 节次 | 周次 | 教师 | 地点
```

### B. 课表网格

```text
       周一   周二   周三   周四   周五
1-2
3-4
5-6
...
```

需要尽可能识别：

- 合并单元格；
- 课程名称；
- 星期；
- 节次；
- 周次；
- 教师；
- 地点。

---

## 9.3 标准模板

课隙提供官方模板：

```text
OpenPeriod-PKU-Template.xlsx
```

字段建议：

```text
Course
Teacher
Location
Weekday
StartPeriod
EndPeriod
Weeks
```

---

## 9.4 导入流程

绝对禁止：

```text
Upload → Direct Save
```

必须：

```text
上传 Excel
↓
解析
↓
课表预览
↓
用户修正
↓
确认
↓
原子写入正式课表
```

Preview 显示：

```text
已识别 8 门课程
共 12 个上课时段
发现 2 项需要确认
```

错误支持：

- 编辑
- 删除
- 忽略
- 手动新增

---

## 9.5 V1 PKU Lock

Importer Architecture 保留其他学校接口，但 V1 UI 不显示学校选择。

如果上传文件无法识别为支持格式：

```text
当前版本仅支持北京大学课表。

你可以：
1. 调整当前文件后重新上传
2. 下载课隙标准模板
3. 手动添加课程
```

V1 不自动调用 Generic Importer。

V1 不使用 LLM 解析 Excel。

---

# 10. 手动编辑

用户可以：

- 新增课程；
- 删除课程；
- 修改课程名；
- 修改教师；
- 修改地点；
- 修改星期；
- 修改节次；
- 修改周次。

Desktop：

```text
课程卡片 → Modal / Side Panel
```

Mobile：

```text
课程卡片 → Bottom Sheet
```

---

# 11. Group

一个用户可以加入多个群组。

```ts
Group {
  id
  name
  inviteCode
  ownerId
  semesterId
}
```

典型：

- 宿舍
- 吃饭搭子
- 课程项目组
- 社团朋友

角色只需要：

```text
OWNER
MEMBER
```

---

# 12. 邀请

每个群组拥有随机邀请码：

```text
7FQ9K2
```

支持：

```text
输入邀请码加入
```

以及：

```text
/join/7FQ9K2
```

Owner 可重新生成邀请码。

---

# 13. 隐私等级

隐私设置支持：

1. 用户默认级别
2. 每个 Group 单独覆盖

有效等级：

## Level 0 — Availability Only

别人只看到：

```text
Free
Busy
```

---

## Level 1 — Course Name

可以看到：

```text
计量经济学
```

不显示：

- 教师
- 教室
- 备注

推荐作为默认。

---

## Level 2 — Full Course

允许显示：

- 课程名称
- 教师
- 教室
- 周次

---

## 13.1 强制隐私例外

以下信息不受 Level 2 影响，永不公开：

- “本周不去 / 翘课”状态；
- 自定义忙碌标题；
- 私人备注。

别人只看到最终有效状态：

```text
Free
```

或：

```text
Busy
```

---

# 14. 本周不去 / Skip Class

用户可以点击自己本周的一次课程：

```text
本周不去
```

数据：

```ts
CourseException {
  courseMeetingId
  userId
  week
  type: SKIP
}
```

只影响指定教学周。

例如：

```text
第 5 周 周三 5–6
ICS
→ 本周不去
```

则共同空闲计算中：

```text
该用户 = Free
```

但其他成员不能知道这是因为用户标记了 Skip。

---

# 15. 自定义 Busy

支持两种：

## ONE_TIME

```text
第5周 周三7–8
组会
```

## RECURRING

```text
每周 周五10–11
健身
```

底层同样存：

```ts
weeks: number[]
```

标题仅本人可见。

---

# 16. Common Availability Algorithm

定义：

```text
U = selected users
w = selected week
d = weekday
p = period
```

某用户：

```text
courseBusy =
存在当前周有效 CourseMeeting
AND 不存在当前周 SKIP
```

```text
customBusy =
存在当前周有效 BusyBlock
```

最终：

```text
busy = courseBusy OR customBusy
free = NOT busy
```

共同空闲：

```text
commonFree(w,d,p) =
所有被选择用户均为 free
```

---

# 17. UI DESIGN SYSTEM

---

# 18. 视觉方向

整体风格：

> **北大红 × 现代校园工具 × 克制的纸张感**

关键词：

- 简洁
- 学术
- 温和
- 可信
- 不行政化
- 不做“学校官网风”
- 不做高饱和互联网 SaaS 风
- 不做过度玻璃拟态

北大红作为：

- 品牌色
- 导航强调
- Primary Button
- Active State
- 当前周
- 个人课程视觉

而不是让整个页面铺满深红。

大量使用：

- 暖白背景
- 白色 Surface
- 深灰正文
- 极浅红 Tint

这样可以保留“北大”识别度，同时保证课表长时间阅读舒适。

---

# 19. Color Palette

## 19.1 Brand

北京大学官方视觉规范的网页标准色：

```css
--pku-red: #94070A;
```

推荐产品衍生色：

```css
--brand-900: #650305;
--brand-800: #7A0507;
--brand-700: #94070A;
--brand-600: #A91A1D;
--brand-500: #BE3537;

--brand-100: #F6DEDE;
--brand-050: #FCF2F2;
```

使用规则：

- `#94070A`：Primary Button / Active Tab / Logo / Focus
- 深红：Pressed / Navigation emphasis
- 浅红：Selected background / Course tint
- 禁止大面积纯红背景覆盖整个主页面

---

## 19.2 Canvas / Surface

```css
--canvas: #F7F5F2;
--surface: #FFFFFF;
--surface-warm: #FBF9F6;
--surface-hover: #F5F1EE;

--border: #E6E0DB;
--border-strong: #D4CCC6;
```

页面背景建议带极弱暖色，而不是纯 `#F5F5F5`。

---

## 19.3 Text

```css
--text-primary: #201B1B;
--text-secondary: #6E6565;
--text-tertiary: #968D8D;
--text-inverse: #FFFFFF;
```

---

## 19.4 Semantic Availability Colors

品牌色是红色，因此 **Busy 不使用红色**，否则会和品牌含义冲突。

### Common Free

```css
--free: #2F7D5A;
--free-bg: #E8F3ED;
--free-border: #BEDDCD;
```

含义：

> 所有当前选择成员都空闲

绿色必须作为功能语义色，而不是第二品牌色。

### Blocked

```css
--busy-bg: #F0EEEC;
--busy-border: #DDD8D4;
--busy-text: #746C68;
```

### Personal Course

```css
--course-bg: #F7E5E5;
--course-border: #DFAFB0;
--course-accent: #94070A;
```

### Skipped Course

```css
--skip-bg: #F2EFED;
--skip-text: #9B9390;
```

使用：

- 降低透明度；
- 标题删除线；
- 小型“本周不去”标记。

---

## 19.5 Warning / Error

```css
--warning: #9A6515;
--warning-bg: #FFF4DD;

--danger: #B42318;
--danger-bg: #FEECEB;
```

Danger 不能直接复用北大红，以避免“品牌动作”和“危险动作”无法区分。

---

# 20. Typography

优先使用系统字体，不引入非必要字体文件。

中文：

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "PingFang SC",
  "Microsoft YaHei",
  sans-serif;
```

英文和数字：

```text
Inter / SF Pro / system sans
```

建议：

```text
Page Title      28 / 34 / Semibold
Section Title   20 / 28 / Semibold
Card Title      16 / 24 / Semibold
Body            14 / 22 / Regular
Meta            12 / 18 / Regular
Period Number   13 / 18 / Medium
```

课表不要使用过细字体。

---

# 21. Radius & Shadow

统一圆角：

```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 20px;
```

推荐：

- Button：10px
- Input：10px
- Card：14px
- Sheet：18px
- Main Timetable Container：16px

Shadow 克制：

```css
--shadow-card:
  0 1px 2px rgba(30, 20, 20, 0.04),
  0 6px 20px rgba(30, 20, 20, 0.04);
```

课表本身主要通过 Border 分层，不使用重阴影。

---

# 22. Spacing

采用 4px 基准。

```text
4
8
12
16
20
24
32
40
48
```

页面 Desktop 最大内容宽：

```text
1440px
```

左右 Padding：

```text
Desktop: 32px
Tablet: 24px
Mobile: 16px
```

---

# 23. App Shell

## Desktop

推荐：

```text
┌──────────────────────────────────────────────────────┐
│ 课隙 OpenPeriod             Group ▼    Avatar        │
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│ Common       │          Main Content                 │
│ My Schedule  │                                       │
│ Groups       │                                       │
│ Settings     │                                       │
│              │                                       │
└──────────────┴───────────────────────────────────────┘
```

Sidebar：

```text
宽度 216px
```

Header：

```text
高度 60–64px
```

Logo 区：

```text
红色小型几何符号 + “课隙”
OpenPeriod 作为小号英文副标
```

不直接使用北京大学校徽，避免产生“北大官方应用”的误解。

---

# 24. Logo Direction

Logo 不使用校徽。

建议概念：

> 两张错开的课表格，中间形成一个空白“隙”。

图标结构：

```text
▦  +  空白格
```

或：

```text
两个红色矩形时间块
中间留出一条白色空隙
```

视觉语义：

- Course
- Gap
- Overlap
- Availability

App Icon：

```text
北大红底
+
白色简化“隙/空格”图形
```

---

# 25. COMMON AVAILABILITY — 核心首页

这是 V1 最高优先级页面。

结构：

```text
┌ Common Availability ──────────────────────────────┐
│                                                   │
│ 宿舍 ▼        ‹   第 5 周   ›       本周          │
│                                                   │
│ [全选] [Gabriel ✓] [Alice ✓] [Bob ✓] [Carol ✓]   │
│                                                   │
│ ┌───────────────────────────────────────────────┐ │
│ │       一   二   三   四   五   六   日        │ │
│ │  1                                            │ │
│ │  2                                            │ │
│ │  3                                            │ │
│ │ ...                                           │ │
│ │ 12                                            │ │
│ └───────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

---

# 26. Header Controls

顺序：

1. Group Selector
2. Week Switcher
3. Member Selector
4. View Mode（未来预留，不在 V1 暴露）

Week Switcher：

```text
‹  第 5 周  ›
```

当前周额外有：

```text
本周
```

小型红色 Pill。

点击“第 5 周”打开 1–16 周 Popover。

---

# 27. Member Selector

Desktop：

```text
[全部成员 4/4 ▼]
```

或在空间足够时显示 Chips：

```text
[✓ Gabriel] [✓ Alice] [✓ Bob] [✓ Carol]
```

成员较多时不要无限铺开。

Popover：

```text
成员
────────────────
✓ 全选
────────────────
✓ Gabriel
✓ Alice
✓ Bob
✓ Carol
```

底部显示：

```text
已选择 4 人
```

---

# 28. Common Timetable Grid

## Grid

列：

```text
Mon–Sun
```

行：

```text
1–12
```

如果移动端空间不足，星期列水平滚动。

Period 左侧始终 Sticky。

---

## 28.1 COMMON FREE Slot

视觉：

```text
浅绿色背景
绿色边框
中心小型 ✓
```

Hover：

```text
背景略加深
```

连续空闲课节可以视觉连成一体，但仍保留每节课的数据边界。

---

## 28.2 BLOCKED Slot

视觉：

```text
浅灰背景
弱边框
```

默认不显示谁 Busy，保持网格干净。

Hover/Click 后再打开详情。

---

## 28.3 “部分空闲”信息

V1 主网格依然只有：

```text
共同空闲
非共同空闲
```

不设计 1/4、2/4、3/4 渐变热力图作为默认视图。

原因：

> 用户第一目标是找“所有人都有时间”。

但是点击 Blocked 后可以显示：

```text
2 / 4 人有空
```

---

# 29. Slot Detail Popover

点击共同空闲：

```text
周三 · 第 7–8 节

4 / 4 人均有空

✓ Gabriel
✓ Alice
✓ Bob
✓ Carol
```

点击非共同空闲：

```text
周二 · 第 5–6 节

2 / 4 人有空

✓ Gabriel      空闲
● Alice        计量经济学
✓ Bob          空闲
● Carol        忙碌
```

课程详情根据 Privacy Level 由后端裁剪。

---

# 30. Current Day

如果所选教学周就是当前周：

当天列 Header 增加：

```text
红色小圆点 / 红色下划线
```

不要整列染红。

当前日期不是产品核心，不需要 Calendar 风格的大号 Today Highlight。

---

# 31. MY SCHEDULE

个人课表使用品牌红体系。

课程块：

```text
┌─────────────────┐
│ 计量经济学       │
│ 二教 · 5–6      │
└─────────────────┘
```

视觉：

- 极浅红底
- 左侧 3px 北大红 Accent
- 标题深色
- Meta 灰色

不同课程 **V1 不使用彩虹颜色**。

原因：

- 统一视觉；
- 更像“课隙”而不是普通课程表 App；
- 颜色语义留给 Free / Busy / Warning。

---

# 32. Course Card States

## Normal

```text
浅红背景
北大红 Accent
```

## Hover

```text
边框加深
```

## Selected

```text
北大红描边
```

## Skipped This Week

```text
灰白背景
课程名删除线
opacity ~ 0.65
Badge: 本周不去
```

Badge 使用中性灰，不使用绿色。

因为“Skip”不等于产品鼓励行为，它只是 Availability Override。

---

# 33. Course Detail Sheet

内容：

```text
课程名称
教师
地点

星期
开始节次
结束节次

周次
[1–16]
[单周]
[双周]
[自定义]

────────────
[本周不去]
[编辑]
[删除]
```

“本周不去”建议是 Secondary Button，不做显眼 Primary CTA。

---

# 34. ADD BUSY

按钮：

```text
+ 标记忙碌
```

表单：

```text
标题（仅自己可见，可选）

星期
开始节次
结束节次

重复：
○ 仅本周
○ 每周
○ 单周
○ 双周
○ 自定义周次
```

Privacy Hint：

```text
其他人只会看到“忙碌”，不会看到标题。
```

---

# 35. EXCEL IMPORT UI

## Upload

页面中心：

```text
┌──────────────────────────────────┐
│                                  │
│      拖入 PKU 课表 Excel         │
│                                  │
│        [选择 Excel 文件]         │
│                                  │
│  支持 .xlsx                      │
│                                  │
└──────────────────────────────────┘
```

顶部用少量北大红做 Accent。

不要做大面积红色上传区。

Secondary：

```text
下载课隙标准模板
```

---

# 36. Import Preview

推荐双区布局。

Desktop：

```text
┌───────────────────────┬────────────────────┐
│                       │  导入检查           │
│   Timetable Preview   │                    │
│                       │  ✓ 8 门课程         │
│                       │  ! 2 项待确认       │
│                       │                    │
│                       │  Warning list      │
└───────────────────────┴────────────────────┘
```

右侧宽：

```text
320–360px
```

底部 Sticky Action：

```text
[取消]               [确认导入 8 门课程]
```

---

# 37. Import Warning UI

Warning Card：

```text
⚠ 无法确认“人工智能中的编程”的周次

检测结果：单周
来源：Sheet1 / D7

[修改] [忽略]
```

Warning 使用琥珀色。

解析 Error 才使用 Danger Red。

---

# 38. GROUPS PAGE

卡片：

```text
宿舍
4 位成员

Gabriel · Alice · Bob · Carol

邀请码 7FQ9K2

[查看共同空闲]
```

Owner 右上角：

```text
•••
```

菜单：

- 群组设置
- 重新生成邀请码
- 删除群组

---

# 39. CREATE GROUP

简单 Modal / Page：

```text
创建群组

群组名称
[________________]

你的隐私级别
[仅空闲状态 ▼]

[创建]
```

创建完成：

```text
宿舍 已创建

邀请码
7FQ9K2

[复制邀请码]
[复制邀请链接]
```

---

# 40. PRIVACY SETTINGS UI

设置页必须让用户理解“别人会看到什么”。

不要只写 Level 0/1/2。

使用三张 Radio Card：

```text
○ 仅显示忙 / 闲
  别人只知道你这个时间能不能约。

● 显示课程名称
  例如“计量经济学”，不显示教师和地点。

○ 显示完整课程
  可显示课程、教师和上课地点。
```

下方固定提示：

```text
“本周不去”和私人忙碌标题永远不会公开。
```

Group Override：

```text
对“宿舍”使用：
○ 跟随默认
○ 仅忙 / 闲
○ 课程名称
○ 完整课程
```

---

# 41. SETTINGS PAGE

分区：

## Profile

```text
昵称
邮箱
```

Email 修改提示：

> 邮箱当前承担你的账户身份作用。V1 不发送验证邮件。

## Privacy

默认隐私等级。

## Semester

显示：

```text
北京大学
2026–2027 秋季学期
16 周
```

V1 学校不可编辑。

---

# 42. LOGIN / FIRST RUN

页面风格应非常轻。

Desktop：

```text
             [Logo]

              课隙
          OpenPeriod

    把课表叠起来，
    找到大家共同的空档。

    昵称
    [________________]

    邮箱
    [________________]

    [开始使用]
```

Brand Red 只用于：

- Logo
- Button
- Focus Ring

背景使用暖白。

---

# 43. EMPTY STATES

## No Schedule

```text
你还没有课表

上传 Excel，或手动添加第一门课程。

[上传 Excel]
[手动添加]
```

## No Group

```text
还没有群组

创建一个群组，或者输入朋友的邀请码。

[创建群组]
[加入群组]
```

## No Selected Member

```text
请选择至少一位成员
```

---

# 44. Mobile Design

目标宽度：

```text
360px+
```

不开发独立 Native UI。

---

## 44.1 Mobile Navigation

Bottom Navigation：

```text
共同空闲
我的课表
群组
我的
```

当前 Tab 使用北大红。

---

## 44.2 Mobile Common Header

Desktop 的大量 Chips 改成：

```text
宿舍 ▼

‹  第5周  ›

[4 人已选择 ▼]
```

三层控制全部压缩。

不要横向摆满朋友昵称。

---

## 44.3 Mobile Grid

左侧节次：

```text
sticky
```

星期区域：

```text
horizontal scroll
```

推荐单列星期最小宽：

```text
64–72px
```

Grid 手势：

- 左右滚动查看星期
- 上下滚动查看节次
- 点击格子打开 Bottom Sheet

---

## 44.4 Mobile Slot Detail

Desktop Popover → Mobile Bottom Sheet。

Sheet：

```text
周三 · 第7–8节

4 / 4 人有空

✓ Gabriel
✓ Alice
✓ Bob
✓ Carol
```

---

# 45. Responsive Breakpoints

建议：

```text
< 640      Mobile
640–1023   Tablet
>= 1024    Desktop
```

Desktop Sidebar 在 Tablet 可以收缩为 Icon Rail。

Mobile 不显示 Sidebar。

---

# 46. Motion

动效目标：

> 快、轻、不抢注意力。

建议：

```text
Hover: 120ms
Popover: 160ms
Modal/Sheet: 180–220ms
Week Switch: 150ms fade/slide
```

不要：

- 大幅 Spring Bounce
- 3D Flip
- 复杂页面过场

切换教学周可使用轻微左右 Slide：

```text
上一周 ←
下一周 →
```

帮助建立时间方向感。

---

# 47. Component Inventory

V1 建议组件：

```text
AppShell
TopBar
SideNav
BottomNav

GroupSelector
WeekSwitcher
MemberSelector

TimetableGrid
TimetableHeader
PeriodColumn
AvailabilitySlot
CourseBlock

SlotDetailPopover
SlotDetailSheet

CourseEditor
BusyEditor

FileDropzone
ImportPreview
ImportWarningCard

PrivacySelector
GroupCard
InviteCodeCard

Button
Input
Select
Checkbox
Badge
Tooltip
Popover
Modal
BottomSheet
Toast
```

---

# 48. Design Tokens

建议直接建立：

```css
:root {
  --pku-red: #94070A;

  --brand-900: #650305;
  --brand-800: #7A0507;
  --brand-700: #94070A;
  --brand-600: #A91A1D;
  --brand-500: #BE3537;
  --brand-100: #F6DEDE;
  --brand-050: #FCF2F2;

  --canvas: #F7F5F2;
  --surface: #FFFFFF;
  --surface-warm: #FBF9F6;
  --surface-hover: #F5F1EE;

  --border: #E6E0DB;
  --border-strong: #D4CCC6;

  --text-primary: #201B1B;
  --text-secondary: #6E6565;
  --text-tertiary: #968D8D;

  --free: #2F7D5A;
  --free-bg: #E8F3ED;
  --free-border: #BEDDCD;

  --busy-bg: #F0EEEC;
  --busy-border: #DDD8D4;

  --course-bg: #F7E5E5;
  --course-border: #DFAFB0;

  --warning: #9A6515;
  --warning-bg: #FFF4DD;

  --danger: #B42318;
  --danger-bg: #FEECEB;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
}
```

---

# 49. Accessibility

颜色不能成为唯一状态。

共同空闲：

```text
绿色 + ✓
```

非共同空闲：

```text
灰色 + hover/click detail
```

Warning：

```text
琥珀色 + ⚠
```

Input Focus：

```text
2px 北大红 Focus Ring
```

基本要求：

- Text contrast 至少达到 WCAG AA；
- Keyboard 可以操作 Week Selector / Member Selector；
- Timetable Slot 支持 `aria-label`；
- Button 触控目标 Mobile 不小于 44×44px。

---

# 50. Backend Privacy Enforcement

Privacy 绝不能只在前端隐藏。

错误：

```text
API 返回完整 Course
→ React 不显示
```

正确：

```text
Request
→ server resolve group membership
→ server resolve target privacy level
→ server filter fields
→ response
```

Skip 信息：

```text
绝不进入他人可访问 Response
```

---

# 51. Main API Domains

```text
/auth
/users

/semesters

/groups
/groups/:id/members

/courses
/course-meetings
/course-exceptions

/busy-blocks

/import

/availability
```

---

# 52. Availability API

```http
GET /api/groups/:groupId/availability
```

Query：

```text
week=5
users=id1,id2,id3
```

Result：

```json
{
  "week": 5,
  "selectedUsers": 3,
  "slots": {
    "monday": {
      "1": {
        "commonFree": true
      }
    }
  }
}
```

详细成员状态按需加载：

```http
GET /api/groups/:groupId/availability/details
```

避免首页返回全部课程详情。

---

# 53. Excel Security

上传限制：

```text
.xlsx
max 5MB
```

解析时：

- 不执行 Macro；
- 不执行公式；
- 不执行嵌入对象；
- 只读取 Cell Value；
- 完成解析后删除原始临时文件；
- 正式保存 Normalized Timetable，而不是永久保存 Excel。

---

# 54. Recommended Tech Stack

Frontend：

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
```

Backend：

```text
Next.js Server / Route Handlers
PostgreSQL
Drizzle ORM
```

Excel：

```text
SheetJS / xlsx
```

Deploy：

```text
Vercel + PostgreSQL
```

或：

```text
Docker + VPS + PostgreSQL
```

V1 不需要：

- Redis
- Kafka
- Queue
- WebSocket
- Kubernetes
- Microservices

---

# 55. Route Map

```text
/                     Common Availability

/login                Identity

/import               Upload Excel
/import/preview       Import Preview

/schedule             My Schedule

/groups               Groups
/groups/new           Create Group
/join/:code           Join
/groups/:id/settings  Group Settings

/settings             Personal Settings
```

---

# 56. V1 P0

必须完成：

- 昵称 + 邮箱身份；
- Session；
- PKU 16 周模型；
- 1–12 节；
- 单双周；
- Excel 导入；
- Import Preview；
- 简易手工修正；
- 多 Group；
- Invite Code；
- Member Selector；
- Common Availability Grid；
- 默认显示本周；
- 1–16 周切换；
- Privacy Level；
- Group Privacy Override；
- 本周不去；
- One-time Busy；
- Recurring Busy；
- Responsive Mobile；
- Group Owner 管理。

---

# 57. V1 Explicitly Out of Scope

V1 不做：

- PKU IAAA
- 北大账号密码抓取
- 自动登录选课网
- Chrome Extension
- Safari Extension
- 非 PKU Importer
- LLM Excel Parser
- Google Calendar
- Apple Calendar
- Outlook
- 自动会议预约
- 聊天
- 好友系统
- Push Notification
- Email Verification
- Native iOS / Android
- AI 推荐时间

---

# 58. Acceptance Test — 单双周

Alice：

```text
周三 5–6
单周
```

Bob：

```text
Free
```

第 3 周：

```text
Alice Busy
Bob Free
→ NOT Common Free
```

第 4 周：

```text
Alice Free
Bob Free
→ Common Free
```

---

# 59. Acceptance Test — Skip

Alice：

```text
Week 5
Wednesday 5–6
ICS
```

Alice 设置：

```text
本周不去
```

Bob：

```text
Free
```

共同结果：

```text
Common Free
```

Bob 详情只能看到：

```text
Alice  Free
```

不得看到：

```text
Alice skipped ICS
```

---

# 60. Acceptance Test — Busy

Alice 没课，但存在：

```text
Recurring Busy
Thursday 7–8
```

共同查询：

```text
Alice = Busy
```

别人不能看到 Busy Title。

---

# 61. Acceptance Test — Privacy

Level 0：

```text
Alice
Busy
```

Level 1：

```text
Alice
计量经济学
```

Level 2：

```text
Alice
计量经济学
二教203
张老师
```

任何 Level：

```text
不得显示 Skip 状态
不得显示 Private Busy Title
```

---

# 62. Acceptance Test — Import Transaction

流程：

```text
Upload
→ Parse
→ Preview
→ Edit
→ Confirm
```

Confirm 前：

```text
正式 Course 数据不改变
```

Confirm：

```text
事务性覆盖 / 写入
```

失败：

```text
Rollback
```

不得出现半张新课表。

---

# 63. Product Success Criteria

对于一个拥有真实 PKU 课表的新用户：

```text
创建身份
→ 上传 Excel
→ 修正
→ 加入群组
→ 选择朋友
→ 看懂共同空闲
```

整个流程不需要阅读帮助文档。

对于老用户：

```text
打开网页
→ 直接看到当前周共同空闲
```

---

# 64. UI Success Criteria

视觉成功应满足：

1. 用户第一眼感受到“北大红”品牌，但页面绝不压抑；
2. 3 秒内能分辨共同空闲与不可共同约；
3. 课表是首页最大、最重要的视觉元素；
4. 共同空闲绿色不会被品牌红干扰；
5. 手机端仍能快速切周、切群组、选成员；
6. 不知道产品规则的新用户也能理解网格；
7. “本周不去”对本人可见，对别人完全不可推断；
8. 页面不像教务系统，也不像通用企业会议 SaaS。

---

# 65. V1 Development Priority

出现取舍时：

```text
Schedule Data Correctness
>
Availability Correctness
>
Privacy Correctness
>
Import Reliability
>
Core Timetable UX
>
Responsive UX
>
Visual Polish
>
Secondary Features
```

---

# 66. Future V1.5

可研究：

## PKU Import Helper

用户自行登录北大门户：

```text
PKU Portal
→ 我的课表
→ Import to 课隙
```

实现可能：

- Bookmarklet
- Browser Extension

前提：

- 不收集密码；
- 不上传登录 Cookie；
- 只读取课程结构数据。

---

# 67. Future V2

候选：

- Email Magic Link；
- 正式 PKU IAAA；
- PWA；
- 清华 / 人大 / 贸大等 Importer；
- Generic Excel；
- Google / Apple Calendar Busy；
- 分享只读共同空闲链接；
- 事件/活动；
- 固定多人组合；
- 更复杂的 Availability 查询。

---

# 68. Final Definition

**课隙不是一个“课程管理 App”。**

它也不是一个“日历”。

它的核心数据关系是：

```text
人
×
课表
×
教学周
×
共同空闲
```

首页应该始终回答：

> **“我们这周什么时候都有空？”**

而 UI 应该让这个答案：

> **不用读，一眼就能看出来。**

---

# 69. Visual Identity Reference

北大红参考北京大学视觉形象识别系统：

- 标准色：北大红
- Web：`#94070A`
- RGB：官方资料同时列出 `R139 G0 B18`
- 本项目 Web UI 以官方明确给出的 Web 色值 `#94070A` 为主色。

参考：

- 北京大学标识管理办公室  
  https://vim.pku.edu.cn/cjwt/index.htm
- 北京大学视觉形象识别系统 Basic System  
  https://vim.pku.edu.cn/docs/20240527144814943256.pdf

> 注意：课隙目前是面向朋友使用的独立学生项目，不应通过 Logo、文案或页面结构暗示它是“北京大学官方应用”。因此使用北大红作为视觉灵感，但不直接使用北京大学校徽作为产品 Logo。
