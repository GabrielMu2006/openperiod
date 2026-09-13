import { ImportPreviewEditor } from "@/components/import-preview-editor";

export default async function ImportPreviewPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id = "" } = await searchParams;
  return <main className="import-preview-page"><header className="simple-header"><a className="brand" href="/"><span className="logo-mark"><i /><i /></span><span><strong>课隙</strong><small>OpenPeriod</small></span></a><span>导入预览</span></header><ImportPreviewEditor previewId={id} /></main>;
}
