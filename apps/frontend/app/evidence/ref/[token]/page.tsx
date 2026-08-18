import type { QaExternalEvidenceView } from "@dse-pms/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type PageProps = {
  params: Promise<{ token: string }>;
};

async function loadEvidence(token: string): Promise<QaExternalEvidenceView | null> {
  const response = await fetch(
    `${API_URL}/api/qa/evidence/ref/${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not load the external evidence reference");
  return response.json() as Promise<QaExternalEvidenceView>;
}

export default async function ExternalEvidencePage({ params }: PageProps) {
  const { token } = await params;
  const evidence = await loadEvidence(token);

  if (!evidence) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-8 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">External QA evidence</div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Reference unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This evidence reference is invalid, expired, revoked, or no longer meets the current external-sharing privacy policy. Contact the programme QA team for a current reference.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Read-only external QA evidence</div>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">{evidence.title}</h1>
              <p className="mt-2 font-mono text-sm text-slate-600">{evidence.referenceCode}</p>
            </div>
            <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              Immutable snapshot
            </span>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-600">
            This page shows the evidence snapshot captured for QA review. It is not an editable PMS page and later changes to the live source do not rewrite this snapshot.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <InfoCard title="Programme">
            <div className="font-medium text-slate-900">{evidence.programme.name}</div>
            <div className="mt-1 text-sm text-slate-600">{evidence.programme.code}</div>
          </InfoCard>
          <InfoCard title="QA context">
            <div className="font-medium text-slate-900">{evidence.qaContext.cycleTitle}</div>
            <div className="mt-1 text-sm text-slate-600">
              Requirements: {evidence.qaContext.requirementCodes.join(", ") || "—"}
            </div>
          </InfoCard>
          <InfoCard title="Reporting period">
            <div className="font-medium text-slate-900">{evidence.reportingPeriod.label || "—"}</div>
            {(evidence.reportingPeriod.start || evidence.reportingPeriod.end) ? (
              <div className="mt-1 text-sm text-slate-600">
                {formatDate(evidence.reportingPeriod.start)} – {formatDate(evidence.reportingPeriod.end)}
              </div>
            ) : null}
          </InfoCard>
          <InfoCard title="Source & provenance">
            <div className="font-medium text-slate-900">{humanize(evidence.provenance.sourceAuthority)}</div>
            <div className="mt-1 text-sm text-slate-600">
              {evidence.provenance.sourceEntityType} · version {evidence.provenance.sourceVersion || "—"}
            </div>
            {evidence.provenance.approvalStatus ? (
              <div className="mt-1 text-sm text-slate-600">Status: {evidence.provenance.approvalStatus}</div>
            ) : null}
          </InfoCard>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Captured evidence</h2>
            <div className="text-xs text-slate-500">Captured {new Date(evidence.capturedAt).toLocaleString()}</div>
          </div>
          <pre className="mt-5 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-5 text-xs leading-6 text-slate-100">
            {JSON.stringify(evidence.evidence, null, 2)}
          </pre>
        </section>

        <section className="rounded-2xl border bg-white p-5 text-xs text-slate-500 shadow-sm">
          <div><span className="font-medium text-slate-700">Integrity hash:</span> <span className="break-all font-mono">{evidence.contentHash}</span></div>
          <div className="mt-2">External snapshots use the current PMS redaction policy. Narrative source text is omitted by default; structured review-safe evidence and page/section provenance remain available.</div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}