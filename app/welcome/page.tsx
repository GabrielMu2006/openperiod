import { FeedbackButton } from "@/components/feedback-button";
export default function WelcomePage() {
  return (
    <main className="form-page">
        <FeedbackButton />
      <section className="form-card welcome-card">
        <div className="identity-brand" aria-hidden="true">
          <span className="logo-mark"><i /><i /></span>
          <div><strong>课隙</strong><small>OpenPeriod</small></div>
        </div>
        <div className="identity-heading">
          <p className="eyebrow">WELCOME</p>
          <h1>找到大家共同的空档</h1>
          <p className="welcome-lede">课隙帮你和同学、朋友找出「大家都有空」的时间——不用再在群里挨个问「你周四下午有空吗」。</p>
        </div>
        <ol className="welcome-steps">
          <li><i>1</i><div><strong>登录</strong><span>输入邮箱即可；第一次使用需要输入邮件验证码，确认邮箱属于你。</span></div></li>
          <li><i>2</i><div><strong>录入课表</strong><span>上传教务系统导出的 Excel 课表，或手动添加课程和私人安排。</span></div></li>
          <li><i>3</i><div><strong>建群或加入群组</strong><span>群成员一起看共同空闲矩阵，点开空档复制时间，直接发到群里约。</span></div></li>
        </ol>
        <div className="welcome-actions"><a className="welcome-cta" href="/login">开始使用</a></div>
        <p className="identity-disclaimer">免费使用，无需安装。隐私由你掌控：可以选择只让群友看到「忙 / 闲」，还是课程名称或完整课程；「本周不去」和私人忙碌的标题永远不会公开。</p>
      </section>
    </main>
  );
}
