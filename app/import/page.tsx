import { ImportUpload } from "@/components/import-upload";
import { getCurrentUser } from "@/src/server/auth/session";

export default async function ImportPage() {
  const user = await getCurrentUser();
  return <main className="import-page"><header className="simple-header"><a className="brand" href="/"><span className="logo-mark"><i /><i /></span><span><strong>课隙</strong><small>OpenPeriod</small></span></a><a href="/">返回共同空闲</a></header><div className="import-content"><p className="eyebrow">MY SCHEDULE</p><h1>导入我的课表</h1><ol className="import-steps" aria-label="导入步骤"><li className="current"><i>1</i>选择文件</li><li><i>2</i>检查与修正</li><li><i>3</i>完成导入</li></ol><p>上传后先检查解析结果，确认无误才会替换当前学期课表。</p><ImportUpload initialScheduleId={user?.scheduleId} /><details className="import-help"><summary>如何获取课表文件？</summary><div><p><strong>方式一：北大教务系统导出。</strong>登录教务系统（elective.pku.edu.cn），进入「课表查询」，全选复制课表表格，粘贴到 Excel（.xlsx）或直接下载系统提供的课表文件（.xls）。</p><p><strong>方式二：使用标准模板。</strong>下载下方的课隙标准模板，按模板里的列填写课程、星期、节次和周次即可。</p><p>两种格式都会自动识别；周次支持「1-16」「单周」「双周」「1,2,5」等写法。</p></div></details></div></main>;
}
