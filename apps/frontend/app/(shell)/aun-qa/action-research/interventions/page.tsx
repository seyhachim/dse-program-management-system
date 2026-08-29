import Link from "next/link";
import { Topbar } from "../../../topbar";
import { InterventionsClient } from "./interventions-client";

export default function ActionResearchInterventionsPage() {
  return (
    <>
      <Topbar
        title="Intervention & Fidelity"
        subtitle="Compare planned intervention delivery with what actually happened during the research cycle"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mb-4">
          <Link
            href="/aun-qa/action-research"
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            ← Back to Action Research
          </Link>
        </div>
        <InterventionsClient />
      </main>
    </>
  );
}
