"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Bell, Pin } from "lucide-react";
import { studentPortalApi } from "@/lib/student-portal";
import { EmptyState, PortalError, PortalLoading, usePortalData } from "../portal-state";

export function PortalAnnouncements(){const load=useCallback(()=>studentPortalApi.announcements(),[]);const{data,loading,error}=usePortalData(load);if(loading)return<PortalLoading/>;if(error||!data)return<PortalError message={error??"Could not load announcements"}/>;if(!data.length)return<EmptyState title="No announcements" description="Updates from your lecturers will appear here."/>;return <div className="mx-auto max-w-4xl space-y-3">{data.map(item=><article key={item.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start gap-4"><span className="rounded-xl bg-primary/10 p-3 text-primary">{item.pinned?<Pin className="h-5 w-5"/>:<Bell className="h-5 w-5"/>}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link href={`/portal/courses/${item.offeringId}`} className="text-xs font-semibold uppercase tracking-wide text-primary">{item.courseCode} · Section {item.sectionCode}</Link>{item.pinned?<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Pinned</span>:null}</div><h2 className="mt-2 text-lg font-semibold">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.body}</p><p className="mt-4 text-xs text-muted-foreground">{item.authorName} · {new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.publishedAt))}</p></div></div></article>)}</div>;}
