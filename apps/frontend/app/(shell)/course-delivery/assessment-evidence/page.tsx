"use client";

import { useState } from "react";
import { Button } from "@dse-pms/ui";
import { useMe } from "@/lib/auth";
import { Topbar } from "../../topbar";
import { AssessmentEvidenceDashboard } from "../assessment-evidence-dashboard";
import { AssessmentEvidencePanel, type EvidenceSelection } from "../assessment-evidence-panel";

function ReviewWorkspace({ userId }: { userId: string }) {
  const [selection, setSelection] = useState<EvidenceSelection | undefined>();
  return <main className="flex-1 overflow-y-auto p-4 md:p-6">
    <div className="mx-auto max-w-7xl min-w-0 space-y-4">
      {selection ? <>
        <Button variant="outline" onClick={() => setSelection(undefined)}>Back to programme evidence dashboard</Button>
        <AssessmentEvidencePanel key={selection.offeringId + ":" + selection.assessmentItemId + ":" + selection.population}
          offeringId={selection.offeringId} initial={selection} />
      </> : <AssessmentEvidenceDashboard userId={userId} onOpen={setSelection} />}
    </div>
  </main>;
}
export default function AssessmentEvidenceReviewPage() {
  const { me, loading } = useMe();
  const allowed = me?.permissions.includes("qa:manage") && me.roles.some(role => role === "admin" || role === "program_coordinator");
  return <>
    <Topbar title="Assessment Evidence Review" subtitle="Programme coverage and independent assessment evidence verification." />
    {loading ? <p className="p-6 text-sm">Loading account…</p> : allowed && me ?
      <ReviewWorkspace key={me.id} userId={me.id} /> : <p role="alert" className="p-6 text-sm">Coordinator permission required.</p>}
  </>;
}
