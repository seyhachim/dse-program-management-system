"use client";

import { use, useEffect, useMemo, useState } from "react";
import type { AttendanceSessionView, AttendanceStatus } from "@dse-pms/shared-types";
import { telegramApi } from "../../../telegram-client";

const STATUSES: AttendanceStatus[] = ["Present", "Late", "Absent", "Excused"];

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function TelegramAttendancePage({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = use(params);
  const [date, setDate] = useState(today());
  const [session, setSession] = useState<AttendanceSessionView | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMessage("");
    void telegramApi<AttendanceSessionView>(`/api/telegram/mini/attendance/${encodeURIComponent(offeringId)}/${date}`).then(setSession).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load attendance"));
  }, [date, offeringId]);

  const counts = useMemo(() => {
    const value = { Present: 0, Late: 0, Absent: 0, Excused: 0, Unmarked: 0 };
    for (const row of session?.records ?? []) row.status ? value[row.status]++ : value.Unmarked++;
    return value;
  }, [session]);

  function mark(studentId: string, status: AttendanceStatus) {
    setSession((current) => current ? { ...current, records: current.records.map((row) => row.studentId === studentId ? { ...row, status } : row) } : current);
  }

  async function save() {
    if (!session) return;
    setSaving(true); setMessage("");
    try {
      const saved = await telegramApi<AttendanceSessionView>(`/api/telegram/mini/attendance/${encodeURIComponent(offeringId)}/${date}`, {
        method: "PUT",
        body: JSON.stringify({ records: session.records.filter((row) => row.status).map((row) => ({ studentId: row.studentId, status: row.status, note: row.note.trim() })) }),
      });
      setSession(saved); setMessage("Attendance saved.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save attendance"); }
    finally { setSaving(false); }
  }

  return <section className="space-y-4"><a href={`/telegram/classes/${encodeURIComponent(offeringId)}`} className="text-sm text-slate-500">← Class</a><div><h1 className="text-2xl font-semibold">Attendance</h1><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm" /></div>{message ? <p className="text-sm text-slate-600">{message}</p> : null}{session ? <><div className="grid grid-cols-5 gap-1 text-center text-xs">{Object.entries(counts).map(([label,count]) => <div key={label} className="rounded-lg bg-slate-100 p-2"><strong className="block text-base">{count}</strong>{label}</div>)}</div><div className="space-y-2">{session.records.map((row) => <article key={row.studentId} className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2"><p className="font-medium">{row.studentName}</p><p className="text-xs text-slate-500">{row.studentNumber}</p></div><div className="grid grid-cols-4 gap-1">{STATUSES.map((status) => <button key={status} type="button" onClick={() => mark(row.studentId,status)} className={`min-h-10 rounded-lg border px-1 text-xs ${row.status === status ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200"}`}>{status === "Excused" ? "Excused" : status}</button>)}</div></article>)}</div><button disabled={saving} onClick={() => void save()} className="min-h-12 w-full rounded-xl bg-slate-950 px-4 font-medium text-white disabled:opacity-50">{saving ? "Saving…" : "Save attendance"}</button></> : <p className="text-sm text-slate-500">Loading roster…</p>}</section>;
}
