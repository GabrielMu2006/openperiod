import { SettingsPanel } from "@/components/settings-panel";
import { getCurrentUser } from "@/src/server/auth/session";

// 学期信息的展示与修改由设置面板内的表单自行读取（USER-SEM：含用户覆盖）；未登录跳登录
export default async function SettingsPage() {
  const user = await getCurrentUser();
  return <SettingsPanel />;
}
