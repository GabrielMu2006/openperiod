import { SettingsPanel } from "@/components/settings-panel";
import { DEFAULT_SEMESTER } from "@/src/config/semester";

export default function SettingsPage() {
  return (
    <SettingsPanel
      semester={{
        academicYear: DEFAULT_SEMESTER.academicYear,
        semester: DEFAULT_SEMESTER.semester,
        weekCount: DEFAULT_SEMESTER.weekCount,
        startDate: DEFAULT_SEMESTER.startDate,
      }}
    />
  );
}
