"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  StudentCohortSectionMemberView,
  StudentCohortSectionView,
  StudentCohortSummaryView,
} from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { studentCohortsApi } from "@/lib/student-cohorts";
import {
  studentCohortSectionsApi,
  type StudentCohortSectionHistoryView,
} from "@/lib/student-cohort-sections";

const PROGRAMME_ID = "dse";
const today = () => new Date().toISOString().slice(0, 10);
const messageOf = (error: unknown) => error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong";

export function CohortSectionClient() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("students:write") ?? false;
  const [cohorts, setCohorts] = useState<StudentCohortSummaryView[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [sections, setSections] = useState<StudentCohortSectionView[]>([]);
  const [members, setMembers] = useState<StudentCohortSectionMemberView[]>([]);
  const [history, setHistory] = useState<StudentCohortSectionHistoryView[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeSections = useMemo(() => sections.filter((section) => section.active), [sections]);
  const unassignedMembers = useMemo(
    () => members.filter((member) => !member.currentSectionMembership),
    [members],
  );

  async function load(selectedCohortId: string) {
    if (!selectedCohortId) {
      setSections([]); setMembers([]); setHistory([]);
      return;
    }
    const [sectionRows, memberRows, historyRows] = await Promise.all([
      studentCohortSectionsApi.list(selectedCohortId),
      studentCohortSectionsApi.members(selectedCohortId),
      studentCohortSectionsApi.history(selectedCohortId),
    ]);
    setSections(sectionRows);
    setMembers(memberRows);
    setHistory(historyRows);
    setSectionId((current) => sectionRows.some((item) => item.id === current && item.active) ? current : sectionRows.find((item) => item.active)?.id ?? "");
    setStudentId((current) => memberRows.some((item) => item.studentId === current && !item.currentSectionMembership) ? current : memberRows.find((item) => !item.currentSectionMembership)?.studentId ?? "");
  }

  useEffect(() => {
    setBusy(true);
    setError(null);
    studentCohortsApi.list(PROGRAMME_ID)
      .then(async (rows) => {
        setCohorts(rows);
        const first = rows[0]?.id ?? "";
        setCohortId(first);
        await load(first);
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setBusy(false));
    // Initial load only; cohort changes are explicit below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeCohort(nextId: string) {
    setCohortId(nextId);
    setBusy(true); setError(null); setNotice(null);
    try { await load(nextId); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  async function createSection() {
    if (!canWrite || !cohortId) return;
    if (!code.trim() || !name.trim()) {
      setError("Enter both a section code and display name.");
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      await studentCohortSectionsApi.create({ cohortId, code: code.trim(), name: name.trim() });
      setCode(""); setName("");
      await load(cohortId);
      setNotice("Section created. No student membership was inferred or changed.");
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  async function toggleSection(section: StudentCohortSectionView) {
    if (!canWrite) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await studentCohortSectionsApi.update(section.id, { active: !section.active });
      await load(cohortId);
      setNotice(`${section.code} is now ${section.active ? "disabled" : "active"}.`);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  async function renameSection(section: StudentCohortSectionView) {
    if (!canWrite) return;
    const next = window.prompt("Section display name", section.name);
    if (next === null) return;
    if (!next.trim()) {
      setError("Section name cannot be empty.");
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      await studentCohortSectionsApi.update(section.id, { name: next.trim() });
      await load(cohortId);
      setNotice(`${section.code} name updated.`);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  async function assignMember() {
    if (!canWrite || !sectionId || !studentId || !effectiveDate) return;
    const member = members.find((item) => item.studentId === studentId);
    const section = sections.find((item) => item.id === sectionId);
    if (!member || !section) return;
    if (!window.confirm(`Assign ${member.studentNumber} · ${member.studentName} to ${section.code} from ${effectiveDate}?`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await studentCohortSectionsApi.addMembership(sectionId, {
        studentId,
        joinedAt: effectiveDate,
        note: note.trim(),
      });
      setNote("");
      await load(cohortId);
      setNotice(`${member.studentNumber} assigned to ${section.code}.`);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  async function exitMember(member: StudentCohortSectionMemberView) {
    const membership = member.currentSectionMembership;
    if (!canWrite || !membership) return;
    const exitDate = window.prompt("Official section exit date (YYYY-MM-DD)", today());
    if (exitDate === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exitDate)) {
      setError("Use YYYY-MM-DD for the section exit date.");
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      await studentCohortSectionsApi.exitMembership(membership.sectionId, membership.id, { exitedAt: exitDate });
      await load(cohortId);
      setNotice(`${member.studentNumber} section membership closed on ${exitDate}.`);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Cohort sections</h2>
        <p className="text-sm text-muted-foreground">
          Maintain canonical sections such as M1, M2, A1, and E1 inside a cohort. Section history is dated and Telegram can reference these records safely.
        </p>
      </div>

      <label className="block max-w-xl space-y-1.5">
        <span className="text-sm font-medium">Cohort</span>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={cohortId}
          disabled={busy || !cohorts.length}
          onChange={(event) => void changeCohort(event.target.value)}
        >
          {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.code} — {cohort.name}</option>)}
        </select>
      </label>

      <div className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
        <Input placeholder="Code, e.g. M1" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
        <Input placeholder="Display name, e.g. Morning 1" value={name} onChange={(event) => setName(event.target.value)} />
        <Button disabled={!canWrite || busy || !cohortId || !code.trim() || !name.trim()} onClick={() => void createSection()}>
          {!canWrite ? "Read-only" : "Add section"}
        </Button>
      </div>

      {sections.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[650px] text-sm">
            <thead><tr className="border-b border-border bg-muted/30 text-left text-muted-foreground"><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Active students</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th></tr></thead>
            <tbody>{sections.map((section) => (
              <tr key={section.id} className="border-b border-border/70 last:border-b-0">
                <td className="px-3 py-2 font-semibold">{section.code}</td>
                <td className="px-3 py-2">{section.name}</td>
                <td className="px-3 py-2">{section.activeMembershipCount}</td>
                <td className="px-3 py-2 text-muted-foreground">{section.active ? "Active" : "Disabled"}</td>
                <td className="px-3 py-2"><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!canWrite || busy} onClick={() => void renameSection(section)}>Rename</Button><Button variant="outline" size="sm" disabled={!canWrite || busy || (section.active && section.activeMembershipCount > 0)} onClick={() => void toggleSection(section)}>{section.active ? "Disable" : "Enable"}</Button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">No sections yet for this cohort.</p>}

      <div className="border-t border-border pt-5">
        <h3 className="font-semibold">Assign student to section</h3>
        <p className="mt-1 text-sm text-muted-foreground">Only students with active canonical membership in this cohort are listed. Existing section membership must be closed before moving a student.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="">Choose unassigned student…</option>
            {unassignedMembers.map((member) => <option key={member.studentId} value={member.studentId}>{member.studentNumber} · {member.studentName}</option>)}
          </select>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            <option value="">Choose section…</option>
            {activeSections.map((section) => <option key={section.id} value={section.id}>{section.code} · {section.name}</option>)}
          </select>
          <Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
          <Input placeholder="Note (optional)" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <Button className="mt-3" disabled={!canWrite || busy || !studentId || !sectionId || !effectiveDate} onClick={() => void assignMember()}>Assign section</Button>
      </div>

      {members.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border bg-muted/30 text-left text-muted-foreground"><th className="px-3 py-2">Student ID</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Current section</th><th className="px-3 py-2">Since</th><th className="px-3 py-2">Action</th></tr></thead>
            <tbody>{members.map((member) => (
              <tr key={member.studentId} className="border-b border-border/70 last:border-b-0">
                <td className="px-3 py-2 font-medium">{member.studentNumber}</td>
                <td className="px-3 py-2">{member.studentName}</td>
                <td className="px-3 py-2">{member.currentSectionMembership ? `${member.currentSectionMembership.section.code} · ${member.currentSectionMembership.section.name}` : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{member.currentSectionMembership?.joinedAt ?? "—"}</td>
                <td className="px-3 py-2">{member.currentSectionMembership ? <Button variant="outline" size="sm" disabled={!canWrite || busy} onClick={() => void exitMember(member)}>Close membership</Button> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}

      {history.length ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">Section membership history ({history.length})</summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="px-2 py-2">Student</th><th className="px-2 py-2">Section</th><th className="px-2 py-2">Joined</th><th className="px-2 py-2">Exited</th></tr></thead><tbody>{history.map((row) => <tr key={row.id} className="border-b border-border/70 last:border-b-0"><td className="px-2 py-2">{row.studentNumber} · {row.studentName}</td><td className="px-2 py-2">{row.section.code} · {row.section.name}</td><td className="px-2 py-2">{row.joinedAt}</td><td className="px-2 py-2">{row.exitedAt ?? "Active"}</td></tr>)}</tbody></table></div>
        </details>
      ) : null}

      {notice ? <div className="rounded-lg border border-status-live bg-status-live-bg px-4 py-3 text-sm text-status-live">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming">{error}</div> : null}
    </section>
  );
}