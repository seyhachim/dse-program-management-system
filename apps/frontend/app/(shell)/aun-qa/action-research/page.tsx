import Link from "next/link";
import { Topbar } from "../../topbar";
import { ActionResearchClient } from "./action-research-client";

export default function ActionResearchPage() {
  return (
    <>
      <Topbar
        title="Action Research"
        subtitle="Assign programme improvement problems, run evidence-based cycles, and review research protocols"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mb-4 flex justify-end">
          <Link
            href="/aun-qa/action-research/interventions"
            className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-800"
          >
            Intervention & fidelity timeline
          </Link>
        </div>
        <ActionResearchClient />
      </main>
    </>
  );
}
