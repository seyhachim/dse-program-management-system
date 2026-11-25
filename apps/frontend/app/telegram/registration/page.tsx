"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { PendingRegistrationReceipt, TelegramRegistrationBootstrap } from "@dse-pms/shared-types";
import { API_URL } from "../../../lib/api";
import "../telegram-client";

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base";
type Fields = { khmerFamilyName: string; khmerGivenName: string; latinFamilyName: string; latinGivenName: string; cohortId: string; sectionId: string; officialStudentId: string; email: string };
const initial: Fields = { khmerFamilyName: "", khmerGivenName: "", latinFamilyName: "", latinGivenName: "", cohortId: "", sectionId: "", officialStudentId: "", email: "" };
async function post<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/telegram/registration/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store",
  });
  if (!res.ok) throw new Error("Could not complete registration. Check your details or reopen the form from the official bot.");
  return res.json() as Promise<T>;
}

export default function TelegramRegistrationPage() {
  const boot = useRef<Promise<TelegramRegistrationBootstrap> | null>(null);
  const [data, setData] = useState<TelegramRegistrationBootstrap | null>(null);
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    if (!boot.current) {
      const app = window.Telegram?.WebApp;
      app?.ready(); app?.expand();
      boot.current = app?.initData ? post("bootstrap", { initData: app.initData }) : Promise.reject(new Error("Open registration from the official DSE PMS Telegram bot."));
    }
    void boot.current.then(value => { if (active) setData(value); }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Registration unavailable"); });
    return () => { active = false; };
  }, []);
  function setField(key: keyof Fields, value: string) {
    setFields(current => ({ ...current, [key]: value, ...(key === "cohortId" ? { sectionId: "" } : {}) }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!data || data.state !== "FORM" || busy.current) return;
    if (Date.parse(data.expiresAt) <= Date.now()) { setError("Your verified launch expired. Close and reopen the registration form."); return; }
    busy.current = true; setSending(true); setError("");
    try {
      await post<PendingRegistrationReceipt>("requests", {
        ...fields, verificationId: data.verificationId,
        officialStudentId: fields.officialStudentId.trim() || undefined, email: fields.email.trim() || undefined,
      });
      setDone(true); setFields(initial);
    } catch (e) { setError(e instanceof Error ? e.message : "Submission failed"); }
    finally { busy.current = false; setSending(false); }
  }
  const placements = data?.placements ?? [];
  const cohorts = [...new Map(placements.map(p => [p.cohortId, p])).values()];
  const sections = placements.filter(p => p.cohortId === fields.cohortId);
  const state = done ? "PENDING" : data?.state;
  const messages = {
    PENDING: "Your application is pending coordinator review. No student access has been granted yet.",
    APPROVED: "Your application was approved. Open the PMS Mini App using your linked Telegram account.",
    REJECTED: "Your application was not approved. Contact the DSE coordinator if you believe this is incorrect.",
    NEEDS_CORRECTION: "Corrections are required. Ask the coordinator what needs updating, then restart registration from the bot.",
    BOT_REQUIRED: "Please start registration in the official PMS bot and share your own contact or choose Continue without phone.",
    EXISTING_ACCOUNT: "Your Telegram account is already associated with PMS. Use the existing account or contact the coordinator for recovery.",
  };
  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <header><p className="text-sm font-medium text-blue-700">DSE PMS · RUPP</p><h1 className="mt-1 text-2xl font-semibold">Student registration</h1><p className="mt-1 text-sm text-slate-600">ចុះឈ្មោះនិស្សិត · Enter your official names and class.</p></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!data && !error && <p role="status">Verifying your Telegram account…</p>}
    {state && state !== "FORM" && <div className="space-y-3"><p role="status" className="rounded-lg bg-slate-50 p-4 text-sm">{messages[state]}</p>{state === "APPROVED" && <p className="text-sm"><Link className="text-blue-700 underline" href="/telegram">Open PMS</Link> — if verification fails, reopen the Mini App from the bot.</p>}</div>}
    {state === "FORM" && <form onSubmit={submit} className="space-y-4">
      <p className="text-xs leading-5 text-slate-600">Your information is visible only to authorized staff for student verification. Submitting does not activate an account.</p>
      {([["khmerFamilyName", "នាមត្រកូល · Khmer family name"], ["khmerGivenName", "នាមខ្លួន · Khmer given name"], ["latinFamilyName", "English family name"], ["latinGivenName", "English given name"]] as const).map(([key,label]) => <label className="block space-y-1 text-sm font-medium" key={key}>{label}<input className={fieldClass} required maxLength={100} value={fields[key]} onChange={e => setField(key,e.target.value)} /></label>)}
      <label className="block space-y-1 text-sm font-medium">Generation<select className={fieldClass} required value={fields.cohortId} onChange={e => setField("cohortId",e.target.value)}><option value="">Select generation</option>{cohorts.map(c => <option key={c.cohortId} value={c.cohortId}>{c.cohortCode} — {c.cohortName}</option>)}</select></label>
      <label className="block space-y-1 text-sm font-medium">Class section<select className={fieldClass} required disabled={!fields.cohortId} value={fields.sectionId} onChange={e => setField("sectionId",e.target.value)}><option value="">Select section</option>{sections.map(s => <option key={s.sectionId} value={s.sectionId}>{s.sectionCode}</option>)}</select></label>
      <label className="block space-y-1 text-sm font-medium">Official student ID (if issued)<input className={fieldClass} maxLength={100} value={fields.officialStudentId} onChange={e => setField("officialStudentId",e.target.value)} /></label>
      <label className="block space-y-1 text-sm font-medium">Email (optional)<input type="email" className={fieldClass} maxLength={254} value={fields.email} onChange={e => setField("email",e.target.value)} /></label>
      {!cohorts.length && <p className="text-sm text-red-700">No active classes are available. Contact your coordinator.</p>}
      <button disabled={sending || !cohorts.length} className="min-h-11 w-full rounded-xl bg-blue-700 px-4 py-3 font-medium text-white disabled:opacity-50" type="submit">{sending ? "Submitting…" : "Submit for approval"}</button>
    </form>}
  </section>;
}
