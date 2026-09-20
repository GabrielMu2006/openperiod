import { GroupForm } from "@/components/group-form";
import { ArrowLeft } from "@phosphor-icons/react/ssr";

export default async function JoinGroupByCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <main className="form-page"><section className="form-card"><a className="back-link" href="/groups"><ArrowLeft className="ui-icon" weight="bold" />返回群组</a><p className="eyebrow">GROUP INVITE</p><h1>加入群组</h1><p>确认邀请码并选择你愿意分享的课程信息。</p><GroupForm mode="join" initialCode={decodeURIComponent(code).toUpperCase()} /></section></main>;
}
