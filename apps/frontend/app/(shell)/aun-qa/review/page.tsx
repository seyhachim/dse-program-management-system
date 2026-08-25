import { Topbar } from "../../topbar";
import { AunQaSectionNav } from "../aun-qa-section-nav";
import { SarReviewClient } from "./sar-review-client";

export default function SarReviewPage() {
  return (
    <>
      <Topbar
        title="SAR Review"
        subtitle="Review immutable submissions with their evidence references before approval"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <AunQaSectionNav />
        <SarReviewClient />
      </main>
    </>
  );
}
