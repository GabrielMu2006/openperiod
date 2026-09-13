import { GroupForm } from "@/components/group-form";

export default function JoinGroupPage() {
  return <main className="form-page"><section className="form-card"><a className="back-link" href="/groups">← 返回群组</a><p className="eyebrow">JOIN A GROUP</p><h1>加入群组</h1><p>输入朋友发来的邀请码，加入后即可一起查看共同空闲。</p><GroupForm mode="join" /></section></main>;
}
