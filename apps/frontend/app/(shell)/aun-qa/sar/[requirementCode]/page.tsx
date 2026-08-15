import { Topbar } from "../../../topbar";
import { SarEditorClient } from "./sar-editor-client";

export default async function SarEditorPage({
  params,
}: {
  params: Promise<{ requirementCode: string }>;
}) {
  const { requirementCode } = await params;
  return (
    <>
      <Topbar
        title={`SAR ${requirementCode}`}
        subtitle="Write the narrative, ground claims in evidence, and keep formatting out of the way"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <SarEditorClient requirementCode={requirementCode} />
      </main>
    </>
  );
}
