import { GroupForm } from "@/components/group-form";
import { ArrowLeft } from "@phosphor-icons/react/ssr";

export default function NewGroupPage() {
  return <GroupFormPage title="创建群组" description="创建后会生成一个邀请码，发给想一起找空档的朋友。"><GroupForm mode="create" /></GroupFormPage>;
}

function GroupFormPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="form-page"><section className="form-card"><a className="back-link" href="/groups"><ArrowLeft className="ui-icon" weight="bold" />返回群组</a><p className="eyebrow">OPENPERIOD</p><h1>{title}</h1><p>{description}</p>{children}</section></main>;
}
