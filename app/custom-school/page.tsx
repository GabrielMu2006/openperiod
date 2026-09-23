import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/server/auth/session";
import { getUserCustomRows } from "@/src/server/semesters/data";
import { DEFAULT_SEMESTER } from "@/src/config/semester";
import { FeedbackButton } from "@/components/feedback-button";
import { CustomSchoolWizard } from "@/components/custom-school-wizard";

export const metadata = { title: "自定义学校作息 · 课隙 OpenPeriod" };

const RETURN_TARGETS = new Set(["/import", "/settings"]);

export default async function CustomSchoolPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { return: returnTo } = await searchParams;
  const target = typeof returnTo === "string" && RETURN_TARGETS.has(returnTo) ? returnTo : "/schedule";
  const saved = await getUserCustomRows(user.id, DEFAULT_SEMESTER.academicYear, DEFAULT_SEMESTER.semester);

  return <main className="import-page">
    <FeedbackButton />
    <header className="simple-header">
      <a className="brand" href="/"><span className="logo-mark"><i /><i /></span><span><strong>课隙</strong><small>OpenPeriod</small></span></a>
      <a href="/">返回共同空闲</a>
    </header>
    <div className="import-content">
      <p className="eyebrow">MY SCHOOL</p>
      <h1>自定义学校作息</h1>
      <ol className="import-steps" aria-label="设置步骤">
        <li className="current"><i>1</i>填写节次时间</li>
        <li><i>2</i>填写学校名称</li>
        <li><i>3</i>提交并导入课表</li>
      </ol>
      <p>你们的学校不在课隙列表里？按顺序填好每节课的起止时间并提交，就能按这份作息手动添加课程或导入课表。填好的学校会提交给我们审核，确认无误后会收录为正式预设，你的账号也会自动切换过去。</p>
      <CustomSchoolWizard returnTo={target} initialRows={saved?.map((row) => ({ start: row.start, end: row.end }))} />
      <details className="import-help">
        <summary>填写小提示</summary>
        <div>
          <p>时间用 24 小时制（如 08:00）；每节 40–50 分钟、按顺序递增不重叠；最多 16 节。点「添加下一节」会自动接上一节的结束时间。</p>
          <p><strong>推荐使用电脑操作</strong>，方便对照教务系统的课表核对时间；后续导入 Excel 也在电脑上更顺手。</p>
        </div>
      </details>
    </div>
  </main>;
}
