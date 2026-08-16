import { Topbar } from "../../topbar";
import { EvidenceLibraryClient } from "./evidence-library-client";
import { ExternalSharingPanel } from "./external-sharing-panel";

export default function EvidenceLibraryPage() {
  return (
    <>
      <Topbar
        title="Evidence Library"
        subtitle="Store evidence once and reuse it across AUN-QA requirements"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <ExternalSharingPanel />
        <EvidenceLibraryClient />
      </main>
    </>
  );
}