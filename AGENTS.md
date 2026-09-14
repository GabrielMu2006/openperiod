<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 数据安全守则（生产数据操作红线，必须遵守）

本仓库对应的线上系统（Vercel/Neon 环境、阿里云服务器环境）存有**真实用户**的账号与课表数据。任何人（包括 AI 助手）在运维或调试时必须遵守：

1. **不得删除任何用户账号**，不得修改任何群组的成员组成、群组的任何数据，除非项目所有者在当次对话中明确、具体地指示该操作。
2. 清理"疑似重复/测试"数据前，必须先检查其全部关联数据（群组成员、课程、会话等），先与项目所有者确认身份归属，再行动。不同内部 ID 但相同邮箱的记录，可能是同一个人在不同环境各自登录产生的，也可能是不同的人——不能凭时间戳推断。
3. 功能测试一律使用自己创建的、明显标注为测试的临时账号（如 `*-test@example.com`），测试完成后清理的范围仅限这些自己创建的账号。
4. 对生产数据库的写操作（UPDATE/DELETE/INSERT）执行前，先在事务中或先备份受影响范围，并向项目所有者展示将要执行的 SQL。
