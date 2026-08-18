"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Clock3, MapPin } from "lucide-react";
import { MEETING_DAYS } from "@dse-pms/shared-types";
import { studentPortalApi } from "@/lib/student-portal";
import { EmptyState, PortalError, PortalLoading, usePortalData } from "../portal-state";

export function PortalSchedule() {
  const load=useCallback(()=>studentPortalApi.courses(),[]); const {data,loading,error}=usePortalData(load);
  if(loading)return <PortalLoading/>; if(error||!data)return <PortalError message={error??"Could not load schedule"}/>;
  const entries=data.flatMap(course=>course.meetings.map(meeting=>({course,meeting})));
  if(!entries.length)return <EmptyState title="No schedule available" description="Class meetings will appear after your section timetable is published."/>;
  return <div className="mx-auto max-w-6xl space-y-4">{MEETING_DAYS.map(day=>{const dayEntries=entries.filter(item=>item.meeting.dayOfWeek===day).sort((a,b)=>a.meeting.startTime.localeCompare(b.meeting.startTime));if(!dayEntries.length)return null;return <section key={day} className="grid gap-3 md:grid-cols-[130px_1fr]"><h2 className="pt-4 text-sm font-semibold uppercase tracking-wide text-primary">{day}</h2><div className="space-y-3">{dayEntries.map(({course,meeting})=><Link key={meeting.id} href={`/portal/courses/${course.offeringId}`} className="grid gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 sm:grid-cols-[110px_1fr_auto]"><div><p className="font-semibold">{meeting.startTime}</p><p className="text-xs text-muted-foreground">to {meeting.endTime}</p></div><div><p className="font-semibold">{course.code} · {course.title}</p><p className="mt-1 text-sm text-muted-foreground">Section {course.sectionCode} · {meeting.activityType} · {course.lecturer?.name??"Lecturer TBA"}</p></div><div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 text-primary"/>{meeting.room||"Room TBA"}</div></Link>)}</div></section>;})}</div>;
}
