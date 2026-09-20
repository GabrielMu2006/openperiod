import { SettingsPanel } from "@/components/settings-panel";
import { DEFAULT_SEMESTER } from "@/src/config/semester";
import { getCurrentUser } from "@/src/server/auth/session";
import { ensureDefaultSemester } from "@/src/server/semesters/data";

// 学期信息来自数据库中的实际配置，而不是全局默认常量（SCH-02）；未登录回落默认
export default async function SettingsPage() {
  const user = await getCurrentUser();
  const semester = user ? await ensureDefaultSemester(user.scheduleId) : null;
  return (
    <SettingsPanel
      semester={{
        academicYear: semester?.academicYear ?? DEFAULT_SEMESTER.academicYear,
        semester: semester?.semester ?? DEFAULT_SEMESTER.semester,
        weekCount: semester?.weekCount ?? DEFAULT_SEMESTER.weekCount,
        startDate: semester?.startDate ?? DEFAULT_SEMESTER.startDate,
      }}
    />
  );
}
