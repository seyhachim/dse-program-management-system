"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CanonicalRosterSyncPreview,
  StudentCohortSectionView,
  StudentCohortSummaryView,
} from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { offeringRosterSyncApi } from "@/lib/offering-roster-sync";
import { studentCohortsApi } from "@/lib/student-cohorts";
import { studentCohortSectionsApi } from "@/lib/student-cohort-sections";

const PROGRAMME_ID = "dse";
const messageOf = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong";

export function CohortRosterSyncClient() {
  const { me } = useMe();
  const canManage =
    (me?.permissions.includes("offerings:manage") ?? false) &&
    (me?.permissions.includes("students:write") ?? false);
  const [cohorts, setCohorts] = useState<StudentCohortSummaryView[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [sections, setSections] = useState<StudentCohortSectionView[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [programmeYear, setProgrammeYear] = useState("3");
  const [term, setTerm] = useState("");
  const [preview, setPreview] = useState<CanonicalRosterSyncPreview | null>(null);
  const [selectedOfferingIds, setSelectedOfferingIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeSections = useMemo(() => sections.filter((section) => section.active), [sections]);
  const selectedItems = useMemo(
    () => preview?.offerings.filter((item) => selectedOfferingIds.includes(item.offeringId)) ?? [],
    [preview, selectedOfferingIds],
  );
  const selectedMissingCount = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.missingStudents.length, 0),
    [selectedItems],
  );

  async function loadSections(nextCohortId: string) {
    const rows = nextCohortId ? await studentCohortSectionsApi.list(nextCohortId, true) : [];
    setSections(rows);
    setSectionId((current) => rows.some((section) => section.id === current) ? current : rows[0]?.id ?? "");
    setPreview(null);
    setSelectedOfferingIds([]);
  }

  useEffect(() => {
    setBusy(true);
    studentCohortsApi.list(PROGRAMME_ID)
      .then(async (rows) => {
        setCohorts(rows);
        const first = rows.find((row) => row.status === "Active")?.id ?? rows[0]?.id ?? "";
        setCohortId(first);
        await loadSections(first);
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setBusy(false));
  }, []);

  async function changeCohort(next: string) {
    setCohortId(next);
    setBusy(true); setError(null); setNotice(null); setPreview(null); setSelectedOfferingIds([]);
    try { await loadSections(next); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  function input() {
    return {
      sectionId,
      term: term.trim(),
      programmeYear: Number(programmeYear),
    };
  }

  function resetPreview() {
    setPreview(null);
    setSelectedOfferingIds([]);
  }

  async function previewSync() {
    if (!sectionId || !term.trim() || !programmeYear) return;
    setBusy(true); setError(null); setNotice(null); setSelectedOfferingIds([]);
    try {
      setPreview(await offeringRosterSyncApi.preview(input()));
    } catch (err) {
      setPreview(null);
      setError(messageOf(err));
    } finally { setBusy(false); }
  }

  function toggleOffering(offeringId: string) {
    setSelectedOfferingIds((current) =>
      current.includes(offeringId)
        ? current.filter((id) => id !== offeringId)
        : [...current, offeringId],
    );
  }

  function selectAllSafe() {
    if (!preview) return;
    setSelectedOfferingIds(
      preview.offerings
        .filter((item) => item.status !== "Completed" && item.state !== "blocked")
        .map((item) => item.offeringId),
    );
  }

  async function applySync() {
    if (!preview || selectedOfferingIds.length === 0) return;
    if (!window.confirm(
      `Synchronize ${selectedOfferingIds.length} selected course offering(s) and add ${selectedMissingCount} missing enrollment(s)? No student will be removed.`,
    )) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await offeringRosterSyncApi.apply({ ...input(), offeringIds: selectedOfferingIds });
      setPreview(result);
      setNotice(
        result.createdEnrollmentCount === 0
          ? "Selected course rosters were already synchronized. No enrollment changed."
          : `Synchronized ${result.createdEnrollmentCount} missing enrollment(s). No existing enrollment was removed.`,
      );
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Canonical class roster → course offerings</h2>
        <p className="text-sm text-muted-foreground">
          Keep standard course rosters aligned with the canonical cohort section, such as Year 3 M1. Preview first, then explicitly select the standard courses to synchronize. Electives/repeats can be left unselected. Synchronization only adds missing students and never silently removes an existing academic enrollment.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Cohort</span>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cohortId} disabled={busy || !cohorts.length} onChange={(event) => void changeCohort(event.target.value)}>
            {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.code} — {cohort.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Canonical section</span>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={sectionId} disabled={busy || !activeSections.length} onChange={(event) => { setSectionId(event.target.value); resetPreview(); }}>
            <option value="">Choose section…</option>
            {activeSections.map((section) => <option key={section.id} value={section.id}>{section.code} · {section.name} ({section.activeMembershipCount})</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Study year</span>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={programmeYear} onChange={(event) => { setProgrammeYear(event.target.value); resetPreview(); }}>
            {[1, 2, 3, 4].map((year) => <option key={year} value={year}>Year {year}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Term</span>
          <Input value={term} placeholder="e.g. 2026-2027-S1" onChange={(event) => { setTerm(event.target.value); resetPreview(); }} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!canManage || busy || !sectionId || !term.trim()} onClick={() => void previewSync()}>
          {!canManage ? "Read-only" : busy ? "Checking…" : "Preview roster sync"}
        </Button>
        {preview ? <Button variant="outline" disabled={busy || preview.offerings.every((item) => item.status === "Completed" || item.state === "blocked")} onClick={selectAllSafe}>Select all safe</Button> : null}
        <Button disabled={!canManage || busy || selectedOfferingIds.length === 0} onClick={() => void applySync()}>
          Synchronize selected ({selectedOfferingIds.length})
        </Button>
      </div>

      {preview ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <strong>{preview.sourceSection.code} · {preview.sourceSection.name}</strong> — {preview.sourceSection.studentCount} canonical students · Year {preview.programmeYear} · {preview.term}. {preview.missingEnrollmentCount} missing enrollment(s), {preview.blockedOfferingCount} blocked offering(s), {preview.historicalOfferingCount} historical offering(s).
          </div>
          {preview.offerings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No course offerings match this programme, term, study year, and section.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[920px] text-sm">
                <thead><tr className="border-b border-border bg-muted/30 text-left text-muted-foreground"><th className="px-3 py-2">Sync</th><th className="px-3 py-2">Course</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Roster</th><th className="px-3 py-2">Missing</th><th className="px-3 py-2">Extra</th><th className="px-3 py-2">Sync state</th></tr></thead>
                <tbody>{preview.offerings.map((item) => {
                  const selectable = item.status !== "Completed" && item.state !== "blocked";
                  return (
                    <tr key={item.offeringId} className="border-b border-border/70 last:border-b-0">
                      <td className="px-3 py-2"><input type="checkbox" aria-label={`Synchronize ${item.course.code}`} checked={selectedOfferingIds.includes(item.offeringId)} disabled={!selectable || busy} onChange={() => toggleOffering(item.offeringId)} /></td>
                      <td className="px-3 py-2"><span className="font-semibold">{item.course.code}</span><span className="ml-2 text-muted-foreground">{item.course.title}</span></td>
                      <td className="px-3 py-2">{item.status}</td>
                      <td className="px-3 py-2">{item.currentCount}/{item.canonicalCount} · cap {item.capacity}</td>
                      <td className="px-3 py-2">{item.missingStudents.length}</td>
                      <td className="px-3 py-2">{item.unexpectedExtraStudents.length}</td>
                      <td className="px-3 py-2"><span className="font-medium">{item.state.replace("_", " ")}</span>{item.blockedReason ? <p className="text-xs text-status-upcoming">{item.blockedReason}</p> : null}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
          <p className="text-sm text-muted-foreground">Choose only the standard courses that should share this class roster. Completed courses and blocked rows cannot be selected. Unexpected extra enrollments are never deleted automatically.</p>
        </div>
      ) : null}

      {notice ? <div className="rounded-lg border border-status-live bg-status-live-bg px-4 py-3 text-sm text-status-live">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming">{error}</div> : null}
    </section>
  );
}
