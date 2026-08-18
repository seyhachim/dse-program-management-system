"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { telegramApi } from "../../telegram-client";

type ClassDetail = {
  id?: string;
  offeringId?: string;
  code?: string;
  title?: string;
  sectionCode?: string;
  term?: string;
  course?: { code?: string; title?: string };
  meetings?: Array<{ dayOfWeek: string; startTime: string; endTime: string; room?: string | null; activityType?: string }>;
  assessments?: Array<{ title: string; weight?: number; dueAt?: string | null }>;
  announcements?: Array<{ id: string; title: string; body: string }>;
  enrollments?: Array<{ student?: { name?: string; studentId?: string } }>;
};

export default function TelegramClassPage({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = use(params);
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void telegramApi<ClassDetail>(`/api/telegram/mini/classes/${encodeURIComponent(offeringId)}`).then(setDetail).catch((e) => setError(e instanceof Error ? e.message : "Could not load class")); }, [offeringId]);
  if (error) return <section className="space-y-4"><Link href="/telegram" className="text-sm text-slate-500">← Home</Link><p className="text-sm text-red-700">{error}</p></section>;
  if (!detail) return <p className="text-sm text-slate-500">Loading class…</p>;
  const code = detail.code ?? detail.course?.code ?? "Course";
  const title = detail.title ?? detail.course?.title ?? "Class details";
  return <section className="space-y-5"><Link href="/telegram" className="text-sm text-slate-500">← Home</Link><header><p className="text-sm font-medium text-slate-500">{code}{detail.sectionCode ? ` · ${detail.sectionCode}` : ""}</p><h1 className="text-2xl font-semibold">{title}</h1>{detail.term ? <p className="text-sm text-slate-500">{detail.term}</p> : null}</header>{detail.meetings?.length ? <div className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">Schedule</h2>{detail.meetings.map((meeting, index) => <p key={index} className="mt-2 text-sm text-slate-600">{meeting.dayOfWeek} · {meeting.startTime}–{meeting.endTime}{meeting.room ? ` · ${meeting.room}` : ""}</p>)}</div> : null}<div className="grid gap-3"><Link href={`/telegram/classes/${encodeURIComponent(offeringId)}/delivery`} className="block min-h-11 rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-medium text-white">Lecturer arrival</Link><Link href={`/telegram/classes/${encodeURIComponent(offeringId)}/attendance`} className="block min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-900">Open student attendance</Link></div>{detail.assessments?.length ? <div className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">Assessments</h2>{detail.assessments.map((assessment, index) => <div key={index} className="mt-2 border-t border-slate-100 pt-2 text-sm"><p>{assessment.title}</p>{assessment.weight != null ? <p className="text-xs text-slate-500">Weight {assessment.weight}%</p> : null}</div>)}</div> : null}{detail.announcements?.length ? <div className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">Recent announcements</h2>{detail.announcements.slice(0,3).map((item) => <div key={item.id} className="mt-2 border-t border-slate-100 pt-2"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-slate-500">{item.body}</p></div>)}</div> : null}{detail.enrollments?.length ? <p className="text-sm text-slate-500">{detail.enrollments.length} students in this section.</p> : null}</section>;
}
