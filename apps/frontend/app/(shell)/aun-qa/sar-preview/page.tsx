import { Topbar } from "../../topbar";
import { AunQaSectionNav } from "../aun-qa-section-nav";
import { SarPreviewClient } from "./sar-preview-client";

export default function SarPreviewPage() {
  return (
    <>
      <Topbar
        title="SAR Preview"
        subtitle="Review the working document, approved official draft, and immutable releases"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <AunQaSectionNav />
        <SarPreviewClient />
      </main>
    </>
  );
}
