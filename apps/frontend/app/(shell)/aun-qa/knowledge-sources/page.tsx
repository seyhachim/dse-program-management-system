import { Topbar } from "../../topbar";
import { KnowledgeSourcesClient } from "./knowledge-sources-client";

export default function KnowledgeSourcesPage() {
  return (
    <>
      <Topbar
        title="Trusted Knowledge Sources"
        subtitle="Govern authoritative and institutional reference sources with exact versions, verification, and provenance."
      />
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <KnowledgeSourcesClient />
      </main>
    </>
  );
}
