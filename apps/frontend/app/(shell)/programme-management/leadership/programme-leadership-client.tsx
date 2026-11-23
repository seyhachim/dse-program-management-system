"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lecturer, ProgrammeHeadOverview } from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { lecturersApi } from "@/lib/lecturers";

const PROGRAMME_ID = "dse";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Present";
}

export function ProgrammeLeadershipClient() {
  const { me, loading: meLoading } = useMe();
  const canManage = Boolean(me?.roles.includes("admin") && me.permissions.includes("accounts:create"));
  const [overview, setOverview] = useState<ProgrammeHeadOverview | null>(null);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [lecturerId, setLecturerId] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [head, candidates] = await Promise.all([
        api.get<ProgrammeHeadOverview>(`/api/auth/programme-head?programmeId=${PROGRAMME_ID}`),
        canManage ? lecturersApi.list() : Promise.resolve([] as Lecturer[]),
      ]);
      setOverview(head);
      setLecturers(candidates);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load programme leadership");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (!meLoading) void load();
  }, [load, meLoading]);

  async function appoint() {
    const lecturer = lecturers.find((item) => item.id === lecturerId);
    if (!lecturer || busy) return;
    const action = overview?.current ? "Replace the current Head with" : "Appoint";
    if (!window.confirm(`${action} ${lecturer.name} as Head of Program?\n\nThe existing lecturer role, courses and teaching assignments will be preserved. Programme Coordinator access will be added if needed.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.post<ProgrammeHeadOverview>("/api/auth/programme-head", {
        programmeId: PROGRAMME_ID,
        lecturerId,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      setOverview(updated);
      setLecturerId("");
      setReference("");
      setNotice(`${lecturer.name} is now Head of Program. Teaching access remains unchanged.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the appointment");
    } finally {
      setBusy(false);
    }
  }

  async function endAppointment() {
    if (!overview?.current || busy) return;
    if (!window.confirm(`End the Head of Program appointment for ${overview.current.lecturerName}?\n\nTeaching access is retained. Coordinator access granted solely through this appointment will be revoked.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.delete<ProgrammeHeadOverview>("/api/auth/programme-head", { programmeId: PROGRAMME_ID });
      setOverview(updated);
      setNotice("The appointment ended and remains in the historical record.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not end the appointment");
    } finally {
      setBusy(false);
    }
  }

  const eligibleLecturers = lecturers.filter((item) => item.accountAccess === "has_access");

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Head of Program — DSE</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One official appointment per programme. The Head also has Program Coordinator system access;
            any lecturer teaching assignments stay attached to the same account.
          </p>
        </div>
        {loading || meLoading ? (
          <p className="text-sm text-muted-foreground">Loading programme leadership…</p>
        ) : overview?.current ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
            <div className="font-semibold">{overview.current.lecturerName}</div>
            <div className="text-sm text-muted-foreground">{overview.current.lecturerEmail}</div>
            <div className="text-sm">Appointed: {formatDate(overview.current.appointedAt)}</div>
            {overview.current.reference ? <div className="text-sm">Official reference: {overview.current.reference}</div> : null}
            <div className="text-xs text-muted-foreground">Lecturer + Program Coordinator • Active Head of Program</div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No Head of Program is currently appointed in PMS. An admin may record the official appointment below.
          </p>
        )}
      </section>

      {error ? <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md border border-border p-3 text-sm">{notice}</p> : null}

      {canManage ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Manage appointment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin only. Select an existing lecturer with a provisioned PMS account. This does not create another login.
            Replacing a Head closes the previous appointment and records who made the change.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Lecturer</span>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                value={lecturerId}
                onChange={(event) => setLecturerId(event.target.value)}
                disabled={busy || loading}
              >
                <option value="">Select lecturer</option>
                {eligibleLecturers.map((lecturer) => (
                  <option key={lecturer.id} value={lecturer.id} disabled={lecturer.id === overview?.current?.lecturerId}>
                    {lecturer.name}{lecturer.id === overview?.current?.lecturerId ? " (current Head)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Official appointment reference (optional)</span>
              <Input value={reference} maxLength={200} onChange={(event) => setReference(event.target.value)}
                placeholder="Appointment letter / faculty decision" disabled={busy} />
            </label>
          </div>
          {eligibleLecturers.length === 0 && !loading ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No provisioned lecturer accounts found. Create or invite the lecturer from the Lecturers page first.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy || !lecturerId || lecturerId === overview?.current?.lecturerId} onClick={() => void appoint()}>
              {busy ? "Saving…" : overview?.current ? "Replace Head of Program" : "Appoint Head of Program"}
            </Button>
            {overview?.current ? (
              <Button variant="outline" disabled={busy} onClick={() => void endAppointment()}>End current appointment</Button>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The appointment date is recorded at the time of this action. An appointment is not a university-level
            approval: enter the reference only after the relevant university appointment has been authorized.
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Appointment history</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Replacements and ended appointments remain visible for academic governance and quality assurance.
        </p>
        {!loading && overview?.history.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No appointments recorded yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {overview?.history.map((appointment) => (
              <div key={appointment.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{appointment.lecturerName}</strong>
                  <span className="text-xs text-muted-foreground">{appointment.endedAt ? "Ended" : "Current"}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {formatDate(appointment.appointedAt)} – {formatDate(appointment.endedAt)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Appointed by {appointment.appointedByName}
                  {appointment.endedByName ? ` • Ended by ${appointment.endedByName}` : ""}
                </div>
                {appointment.reference ? <div className="mt-1 text-xs">Reference: {appointment.reference}</div> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
