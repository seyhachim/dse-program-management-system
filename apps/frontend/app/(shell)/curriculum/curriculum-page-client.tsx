"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurriculumCourse, ProgrammeCurriculumRead } from "@dse-pms/shared-types";
import { StatusBadge } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { coursesApi, type CourseView } from "@/lib/courses";
import { INITIAL_DSE_CURRICULUM_INPUT } from "@/lib/curriculum-bootstrap";
import {
  curriculumApi,
  curriculumStatusLabel,
  curriculumVersionLabel,
  revisionTriggerLabel,
  type ProgrammeCurriculumListItem,
} from "@/lib/curriculum";

const STATUS_TONE = {
  Draft: "info",
  Approved: "success",
  Active: "success",
  Superseded: "neutral",
} as const satisfies Record<ProgrammeCurriculumRead["selectedVersion"]["status"], "info" | "success" | "neutral">;

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

function CurriculumSkeleton() {
  return <div className="space-y-4" aria-label="Loading curriculum">{[1,2,3,4].map((year) => <div key={year} className="h-36 animate-pulse rounded-xl border border-border bg-muted/40" />)}</div>;
}

function PlacementEditor({ course, busy, onCancel, onSave, onRemove }: {
  course: CurriculumCourse;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { yearLevel: number; semester: "First" | "Second"; sortOrder: number; credits: number; courseType: CurriculumCourse["courseType"] }) => void;
  onRemove: (reason: string) => void;
}) {
  const [yearLevel, setYearLevel] = useState(course.yearLevel);
  const [semester, setSemester] = useState<"First" | "Second">(course.semester);
  const [credits, setCredits] = useState(course.credits);
  const [courseType, setCourseType] = useState(course.courseType);
  const [reason, setReason] = useState("");
  return <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
    <div className="grid gap-2 sm:grid-cols-4">
      <label className="text-xs">Year<select value={yearLevel} onChange={e=>setYearLevel(Number(e.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-2">{[1,2,3,4].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label className="text-xs">Semester<select value={semester} onChange={e=>setSemester(e.target.value as "First"|"Second")} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="First">1</option><option value="Second">2</option></select></label>
      <label className="text-xs">Credits<input type="number" min={0} value={credits} onChange={e=>setCredits(Number(e.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label>
      <label className="text-xs">Type<select value={courseType} onChange={e=>setCourseType(e.target.value as CurriculumCourse["courseType"])} className="mt-1 h-9 w-full rounded-md border bg-background px-2">{["Basic","Core","Elective","Specialization","MoeysHeip"].map(v=><option key={v}>{v}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>onSave({yearLevel,semester,sortOrder:course.sortOrder,credits,courseType})} className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">Save placement</button><button disabled={busy} onClick={onCancel} className="h-9 rounded-md border px-3 text-sm">Cancel</button></div>
    <div className="border-t pt-3"><label className="text-xs text-muted-foreground">Reason required to remove<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this course being removed?" className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label><button disabled={busy || !reason.trim()} onClick={()=>onRemove(reason.trim())} className="mt-2 h-9 rounded-md border border-destructive/40 px-3 text-sm text-destructive disabled:opacity-50">Remove course</button></div>
  </div>;
}

export function CurriculumPageClient() {
  const { me, loading: meLoading } = useMe();
  const canWrite = me?.permissions.includes("programme:write") ?? false;
  const [curricula, setCurricula] = useState<ProgrammeCurriculumListItem[]>([]);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [data, setData] = useState<ProgrammeCurriculumRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingPlacementId, setEditingPlacementId] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [addCourseId, setAddCourseId] = useState("");
  const [addYear, setAddYear] = useState(1);
  const [addSemester, setAddSemester] = useState<"First"|"Second">("First");
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const applyData = useCallback((result: ProgrammeCurriculumRead) => { setData(result); setSelectedVersionId(result.selectedVersion.id); setMutationError(null); }, []);
  const loadVersion = useCallback(async (curriculumId: string, versionId?: string) => {
    setLoading(true); setError(null); setPermissionDenied(false); setEditMode(false); setEditingPlacementId(null);
    try { applyData(await curriculumApi.get(curriculumId, versionId)); }
    catch (err) { setData(null); if (err instanceof ApiError && err.status===403) setPermissionDenied(true); else setError(err instanceof ApiError ? err.message : "Failed to load curriculum"); }
    finally { setLoading(false); }
  }, [applyData]);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const list=await curriculumApi.list(); setCurricula(list); if(!list.length){setData(null);setLoading(false);return;} setSelectedCurriculumId(list[0]!.id); await loadVersion(list[0]!.id); }
    catch(err){setData(null); if(err instanceof ApiError&&err.status===403)setPermissionDenied(true);else setError(err instanceof ApiError?err.message:"Failed to load curriculum");setLoading(false);}
  },[loadVersion]);
  useEffect(()=>{void load();},[load]);

  const selectedListItem=useMemo(()=>curricula.find(c=>c.id===selectedCurriculumId)??null,[curricula,selectedCurriculumId]);
  const version=data?.selectedVersion;
  const editable=Boolean(canWrite && version?.status==="Draft");
  const placedIds=useMemo(()=>new Set(data?.years.flatMap(y=>y.semesters.flatMap(s=>s.courses.map(c=>c.courseId)))??[]),[data]);
  const availableCourses=courses.filter(c=>!placedIds.has(c.id));

  const enterEdit=async()=>{setMutationError(null);try{setCourses(await coursesApi.list());setEditMode(true);}catch(err){setMutationError(err instanceof ApiError?err.message:"Could not load programme courses");}};
  const mutate=async(action:()=>Promise<ProgrammeCurriculumRead>)=>{setMutating(true);setMutationError(null);try{applyData(await action());setEditingPlacementId(null);}catch(err){setMutationError(err instanceof ApiError?err.message:"Could not save curriculum change");}finally{setMutating(false);}};
  const reorder=async(yearLevel:number,semester:"First"|"Second",ids:string[])=>{if(!data||ids.length<1)return;await mutate(()=>curriculumApi.reorder(data.selectedVersion.id,{yearLevel,semester,placementIds:ids}));};
  const createInitialCurriculum=async()=>{
    setMutating(true);setMutationError(null);
    try { await curriculumApi.createInitial(INITIAL_DSE_CURRICULUM_INPUT); window.location.reload(); }
    catch(err){
      if(err instanceof ApiError&&err.status===409){window.location.reload();return;}
      setMutationError(err instanceof ApiError?err.message:"Could not create the initial curriculum");
    }
    finally{setMutating(false);}
  };

  if(meLoading||loading)return <CurriculumSkeleton/>;
  if(permissionDenied)return <div className="rounded-xl border border-destructive/30 p-6"><h2 className="font-semibold">Curriculum access denied</h2><p className="mt-2 text-sm text-muted-foreground">Your account is not assigned curriculum access for this programme.</p></div>;
  if(error)return <div className="rounded-xl border border-destructive/30 p-6"><h2 className="font-semibold">Could not load curriculum</h2><p className="mt-2 text-sm text-muted-foreground">{error}</p><button onClick={()=>void load()} className="mt-4 h-9 rounded-md border px-3 text-sm">Try again</button></div>;
  if(!data||!curricula.length)return <div className="rounded-xl border border-dashed p-10 text-center"><h2 className="text-lg font-semibold">Set up programme curriculum</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Create the canonical DSE curriculum as an empty v1.0 Draft. No approved course or Course Specification records will be changed; you can review and import the historical curriculum after setup.</p>{canWrite?<button type="button" disabled={mutating} onClick={()=>void createInitialCurriculum()} className="mt-5 h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{mutating?"Creating v1.0…":"Create Initial Curriculum"}</button>:<p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">You need programme write access to create the initial curriculum.</p>}{mutationError&&<p className="mt-3 text-sm text-destructive">{mutationError}</p>}</div>;

  const current=data.selectedVersion;
  const isHistorical=current.status!=="Draft";
  return <div className="space-y-6">
    <section className="rounded-xl border bg-card p-5"><div className="flex flex-col gap-4 xl:flex-row xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{data.curriculum.name}</h2><StatusBadge tone={STATUS_TONE[current.status]} label={curriculumStatusLabel(current.status)} icon={false}/>{isHistorical&&<span className="rounded-full border bg-muted px-2.5 py-1 text-xs">Read-only snapshot</span>}</div><p className="mt-1 text-sm text-muted-foreground">{data.curriculum.code} · {current.cohortLabel||"No cohort label"}{current.academicYear?` · ${current.academicYear}`:""}</p></div>
      <div className="flex flex-wrap items-end gap-3">{curricula.length>1&&<label className="text-sm">Curriculum<select value={selectedCurriculumId} onChange={e=>{setSelectedCurriculumId(e.target.value);void loadVersion(e.target.value);}} className="mt-1 block h-10 rounded-md border bg-background px-3">{curricula.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<label className="text-sm">Version<select value={selectedVersionId} onChange={e=>void loadVersion(selectedCurriculumId,e.target.value)} className="mt-1 block h-10 rounded-md border bg-background px-3">{(selectedListItem?.versions??data.versions).map(v=><option key={v.id} value={v.id}>{curriculumVersionLabel(v)} · {v.status}</option>)}</select></label>{editable&&!editMode&&<button onClick={()=>void enterEdit()} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Edit Draft</button>}{editMode&&<button onClick={()=>{setEditMode(false);setEditingPlacementId(null);setMutationError(null);}} className="h-10 rounded-md border px-4 text-sm">Exit editor</button>}</div></div></section>

    {editMode&&<section className="rounded-xl border border-warning/30 bg-warning-bg/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-end"><div className="flex-1"><p className="font-medium">Add programme course</p><select value={addCourseId} onChange={e=>setAddCourseId(e.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3"><option value="">Select a course…</option>{availableCourses.map(c=><option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</select></div><label className="text-sm">Year<select value={addYear} onChange={e=>setAddYear(Number(e.target.value))} className="mt-1 block h-10 rounded-md border bg-background px-3">{[1,2,3,4].map(v=><option key={v}>{v}</option>)}</select></label><label className="text-sm">Semester<select value={addSemester} onChange={e=>setAddSemester(e.target.value as "First"|"Second")} className="mt-1 block h-10 rounded-md border bg-background px-3"><option value="First">1</option><option value="Second">2</option></select></label><button disabled={mutating||!addCourseId} onClick={()=>void mutate(async()=>{const result=await curriculumApi.addCourse(current.id,{courseId:addCourseId,yearLevel:addYear,semester:addSemester,sortOrder:data.years[addYear-1]?.semesters[addSemester==="First"?0:1]?.courses.length??0});setAddCourseId("");return result;})} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">Add course</button></div>{mutationError&&<p className="mt-3 text-sm text-destructive">{mutationError}</p>}</section>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Stat label="Total credits" value={data.totals.programmeCredits}/><Stat label="Core" value={data.totals.coreCredits}/><Stat label="Basic" value={data.totals.basicCredits}/><Stat label="Elective" value={data.totals.electiveCredits}/><Stat label="Specialization" value={data.totals.specializationCredits}/></section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"><div className="space-y-5">{data.years.map(year=><section key={year.yearLevel} className="rounded-xl border bg-card"><header className="flex justify-between border-b px-5 py-4"><h3 className="font-semibold">Year {year.yearLevel}</h3><span className="text-sm text-muted-foreground">{year.totalCredits} credits</span></header><div className="grid lg:grid-cols-2 lg:divide-x">{year.semesters.map(semester=><div key={semester.semester} className="p-5"><div className="mb-3 flex justify-between"><h4 className="text-sm font-semibold">Semester {semester.semester==="First"?1:2}</h4><span className="text-xs text-muted-foreground">{semester.totalCredits} credits</span></div>{!semester.courses.length?<p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No courses assigned</p>:<div className="divide-y rounded-lg border">{semester.courses.map((course,index)=><div key={course.placementId} className="p-3"><div className="flex gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-muted-foreground">{course.code}</p><p className="text-sm font-medium">{course.title}</p><p className="mt-1 text-xs text-muted-foreground">{course.courseType} · {course.credits} credits</p></div>{editMode&&<div className="flex gap-1"><button disabled={mutating||index===0} onClick={()=>void reorder(year.yearLevel,semester.semester,[...semester.courses.map(c=>c.placementId).slice(0,index-1),course.placementId,semester.courses[index-1]!.placementId,...semester.courses.map(c=>c.placementId).slice(index+1)])} className="h-8 rounded border px-2 text-xs disabled:opacity-30">↑</button><button disabled={mutating||index===semester.courses.length-1} onClick={()=>{const ids=semester.courses.map(c=>c.placementId);[ids[index],ids[index+1]]=[ids[index+1]!,ids[index]!];void reorder(year.yearLevel,semester.semester,ids);}} className="h-8 rounded border px-2 text-xs disabled:opacity-30">↓</button><button onClick={()=>setEditingPlacementId(editingPlacementId===course.placementId?null:course.placementId)} className="h-8 rounded border px-2 text-xs">Edit</button></div>}</div>{editingPlacementId===course.placementId&&<PlacementEditor course={course} busy={mutating} onCancel={()=>setEditingPlacementId(null)} onSave={input=>void mutate(()=>curriculumApi.updateCourse(current.id,course.placementId,input))} onRemove={reason=>void mutate(()=>curriculumApi.removeCourse(current.id,course.placementId,reason))}/>}</div>)}</div>}</div>)}</div></section>)}</div>
      <aside className="space-y-4"><section className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Revision summary</h3><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-muted-foreground">Revision</dt><dd>{current.revisionType}</dd></div><div><dt className="text-muted-foreground">Reason for change</dt><dd>{current.revisionReason||"Initial curriculum version"}</dd></div><div><dt className="text-muted-foreground">Change summary</dt><dd>{current.changeSummary||"Initial curriculum baseline"}</dd></div></dl>{current.revisionTriggers.length>0&&<div className="mt-4 flex flex-wrap gap-2">{current.revisionTriggers.map(t=><span key={t} className="rounded-full border bg-muted px-2 py-1 text-xs">{revisionTriggerLabel(t)}</span>)}</div>}</section><section className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Version timeline</h3><ol className="mt-4 space-y-3">{data.versions.map(v=><li key={v.id} className="border-l pl-4"><div className="flex justify-between"><span className="text-sm font-semibold">{curriculumVersionLabel(v)}</span><span className="text-xs text-muted-foreground">{v.status}</span></div><p className="text-xs text-muted-foreground">{v.changeSummary||v.revisionType}</p></li>)}</ol></section></aside>
    </div>
  </div>;
}