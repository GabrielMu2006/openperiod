import { ImportUpload } from "@/components/import-upload";

export default function ImportPage() {
  return <main className="import-page"><header className="simple-header"><a className="brand" href="/"><span className="logo-mark"><i /><i /></span><span><strong>课隙</strong><small>OpenPeriod</small></span></a><a href="/">返回共同空闲</a></header><div className="import-content"><p className="eyebrow">MY SCHEDULE</p><h1>导入我的课表</h1><p>上传后先检查解析结果，确认无误才会替换当前学期课表。</p><ImportUpload /></div></main>;
}
