"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import {
  CreateOfferingInput,
  UpdateOfferingInput,
  type AcademicCalendarContextView,
  type AcademicYearView,
  type CourseSpecVersionRef,
  type Lecturer,
  type OfferingView,
} from "@dse-pms/shared-types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
} from "@dse-pms/ui";
import { Topbar } from "../topbar";
import { ApiError } from "@/lib/api";
import { academicCalendarApi, academicSemesterLabel } from "@/lib/academic-calendar";
import { coursesApi, type CourseView } from "@/lib/courses";
import { lecturersApi } from "@/lib/lecturers";
import { offeringsApi } from "@/lib/offerings";
import { OfferingFormFields, type OfferingFormValues } from "./offering-form-fields";
import {
  offeringTeamSuggestion,
  removePrimaryFromCoLecturers,
} from "./offering-team-suggestion";

const BACK_HREF = "/offerings";

const emptyDefaults: OfferingFormValues = {
  courseId: "",
  courseSpecId: "",
  term: "",
  sectionCode: "A",
  meetings: [],
  lecturerId: null,
  coLecturerIds: [],
  capacity: 30,
  status: "Planned",
  semester: null,
  programmeYear: null,
  academicCalendarPeriodId: null,
};

function firstValidationMessage(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Check the required offering details and try again";
}

export function OfferingFormPage({ offeringId }: { offeringId: string | null }) {
  const router = useRouter();
  const editing = offeringId !== null;

  const [programmeId, setProgrammeId] = useState("");
  const [academicYears, setAcademicYears] = useState<AcademicYearView[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState("");
  const [allCourses, setAllCourses] = useState<CourseView[]>([]);
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [courseSpecVersions, setCourseSpecVersions] = useState<CourseSpecVersionRef[]>([]);
  const [courseSpecLoading, setCourseSpecLoading] = useState(false);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [loadedOffering, setLoadedOffering] = useState<OfferingView | null>(null);
  const [calendarContext, setCalendarContext] = useState<AcademicCalendarContextView | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<OfferingFormValues>({ defaultValues: emptyDefaults });
  const courseId = useWatch({ control, name: "courseId" }) ?? "";
  const lecturerId = useWatch({ control, name: "lecturerId" }) ?? null;
  const coLecturerIds = useWatch({ control, name: "coLecturerIds" }) ?? [];
  const studyYear = useWatch({ control, name: "programmeYear" }) ?? null;
  const semester = useWatch({ control, name: "semester" }) ?? null;
  const courseSpecId = useWatch({ control, name: "courseSpecId" }) ?? "";
  const meetings = useWatch({ control, name: "meetings" }) ?? [];

  const legacyOffering = Boolean(loadedOffering && !loadedOffering.academicCalendarPeriodId);
  const calendarLocked = loadedOffering?.status === "Completed";
  const legacyTeachingPeriod = legacyOffering && loadedOffering
    ? { startDate: loadedOffering.startDate, endDate: loadedOffering.endDate }
    : null;
  const selectedCourseSpec = useMemo(
    () => courseSpecVersions.find((spec) => spec.id === courseSpecId) ?? null,
    [courseSpecId, courseSpecVersions],
  );
  const selectedTeamSuggestion = useMemo(
    () => offeringTeamSuggestion(selectedCourseSpec, editing),
    [editing, selectedCourseSpec],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [programme, courseList, lecturerList, offering] = await Promise.all([
          academicCalendarApi.programme(),
          coursesApi.list(),
          lecturersApi.list(),
          offeringId ? offeringsApi.get(offeringId) : Promise.resolve(null),
        ]);
        const years = await academicCalendarApi.years(programme.id);
        if (cancelled) return;
        setProgrammeId(programme.id); setAcademicYears(years); setAllCourses(courseList); setLecturers(lecturerList); setLoadedOffering(offering);
        const currentYear = years.find((year) => year.isCurrent) ?? years[0] ?? null;
        if (offeringId && !offering) {
          setNotFound(true);
        } else if (offering) {
          const academicYearId = offering.academicCalendar?.academicYearId ?? "";
          setSelectedAcademicYearId(academicYearId);
          setCourses(courseList);
          reset({
            courseId: offering.course?.id ?? "",
            courseSpecId: offering.courseSpec?.id ?? "",
            term: offering.term,
            sectionCode: offering.sectionCode,
            meetings: offering.meetings.map(({ id: _id, durationHours: _durationHours, room, ...meeting }) => ({ ...meeting, room: room ?? "" })),
            lecturerId: offering.lecturer?.id ?? null,
            coLecturerIds: offering.coLecturers.map((lecturer) => lecturer.id),
            capacity: offering.capacity,
            status: offering.status,
            semester: offering.semester,
            programmeYear: offering.programmeYear,
            academicCalendarPeriodId: offering.academicCalendarPeriodId,
          });
        } else {
          setSelectedAcademicYearId(currentYear?.id ?? "");
          setCourses([]);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load the offering form");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [offeringId, reset]);

  // A CourseSpec belongs to one course. When Admin changes course on a new
  // Offering, clear the prior version/team instead of leaving a stale selection
  // that the backend would later reject as belonging to another course.
  useEffect(() => {
    if (editing) return;
    setValue("courseSpecId", "");
    setValue("lecturerId", null);
    setValue("coLecturerIds", []);
  }, [courseId, editing, setValue]);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) { setCourseSpecVersions([]); return; }
    setCourseSpecLoading(true);
    void coursesApi.approvedSpecVersions(courseId)
      .then((versions) => { if (!cancelled) setCourseSpecVersions(versions); })
      .catch(() => { if (!cancelled) setCourseSpecVersions([]); })
      .finally(() => { if (!cancelled) setCourseSpecLoading(false); });
    return () => { cancelled = true; };
  }, [courseId]);

  // New Offerings get an initial teaching-team suggestion from the exact Approved
  // CourseSpec version the Admin selected. Editing is deliberately excluded so a
  // historical delivery team's saved assignments are never overwritten.
  useEffect(() => {
    if (!selectedTeamSuggestion) return;
    setValue("lecturerId", selectedTeamSuggestion.primaryLecturerId, { shouldDirty: true });
    setValue("coLecturerIds", selectedTeamSuggestion.coLecturerIds, { shouldDirty: true });
  }, [selectedTeamSuggestion, setValue]);

  // Shared CourseSpecs have no academic lead. Once Admin chooses the actual
  // delivery Primary Lecturer, remove that person from the suggested co-team so
  // the Offering's no-primary-as-co invariant remains valid.
  useEffect(() => {
    if (editing || !lecturerId || coLecturerIds.length === 0) return;
    const nextCoLecturerIds = removePrimaryFromCoLecturers(lecturerId, coLecturerIds);
    if (nextCoLecturerIds.length !== coLecturerIds.length) {
      setValue("coLecturerIds", nextCoLecturerIds, { shouldDirty: true });
    }
  }, [coLecturerIds, editing, lecturerId, setValue]);

  useEffect(() => {
    let cancelled = false;
    if (legacyOffering) {
      setCalendarContext(null); setCalendarError(null); setCalendarLoading(false); setCourses(allCourses); return;
    }
    if (!programmeId || !selectedAcademicYearId || !studyYear || !semester) {
      setCalendarContext(null); setCalendarError(null); setCalendarLoading(false);
      if (!editing) setCourses([]);
      return;
    }
    setCalendarLoading(true); setCalendarError(null);
    void academicCalendarApi.context(programmeId, selectedAcademicYearId, studyYear, semester)
      .then((context) => {
        if (cancelled) return;
        setCalendarContext(context);
        setValue("academicCalendarPeriodId", context.period.id, { shouldDirty: true });
        const allowedIds = new Set(context.courses.map((course) => course.id));
        let filtered = allCourses.filter((course) => allowedIds.has(course.id));
        const currentCourseId = getValues("courseId");
        if (editing && currentCourseId && !filtered.some((course) => course.id === currentCourseId)) {
          const current = allCourses.find((course) => course.id === currentCourseId);
          if (current) filtered = [current, ...filtered];
        }
        setCourses(filtered);
        const originalPeriodId = loadedOffering?.academicCalendarPeriodId ?? null;
        if (!editing || originalPeriodId !== context.period.id) {
          setValue("term", `${context.academicYear.label}-${context.semester === "First" ? "S1" : "S2"}`, { shouldDirty: true });
          if (!editing && currentCourseId && !allowedIds.has(currentCourseId)) setValue("courseId", "");
        }
      })
      .catch((reason) => {
        if (cancelled) return;
        setCalendarContext(null); setCourses(editing ? allCourses : []); setValue("academicCalendarPeriodId", null, { shouldDirty: true });
        setCalendarError(reason instanceof ApiError ? reason.message : "No published academic calendar exists for this context.");
      })
      .finally(() => { if (!cancelled) setCalendarLoading(false); });
    return () => { cancelled = true; };
  }, [allCourses, editing, getValues, legacyOffering, loadedOffering?.academicCalendarPeriodId, programmeId, selectedAcademicYearId, semester, setValue, studyYear]);

  const contextChanged = useMemo(() => {
    if (!loadedOffering) return false;
    return selectedAcademicYearId !== (loadedOffering.academicCalendar?.academicYearId ?? "")
      || studyYear !== loadedOffering.programmeYear
      || semester !== loadedOffering.semester
      || (calendarContext?.period.id ?? null) !== loadedOffering.academicCalendarPeriodId;
  }, [calendarContext?.period.id, loadedOffering, selectedAcademicYearId, semester, studyYear]);

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true); setError(null);
    try {
      if (offeringId) {
        const { courseId: _courseId, term: _term, ...candidate } = values;
        const payload: Record<string, unknown> = {
          ...candidate,
          lecturerId: values.lecturerId || null,
          coLecturerIds: values.coLecturerIds ?? [],
        };
        if (!contextChanged) {
          delete payload.academicCalendarPeriodId;
          delete payload.programmeYear;
          delete payload.semester;
        }
        if (legacyOffering) {
          delete payload.academicCalendarPeriodId;
          delete payload.programmeYear;
          delete payload.semester;
        }
        const parsed = UpdateOfferingInput.safeParse(payload);
        if (!parsed.success) { setError(firstValidationMessage(parsed.error)); return; }
        await offeringsApi.update(offeringId, parsed.data);
      } else {
        const payload = {
          ...values,
          lecturerId: values.lecturerId || null,
          coLecturerIds: values.coLecturerIds ?? [],
        };
        const parsed = CreateOfferingInput.safeParse(payload);
        if (!parsed.success) { setError(firstValidationMessage(parsed.error)); return; }
        if (!calendarContext || parsed.data.academicCalendarPeriodId !== calendarContext.period.id) {
          setError("Resolve a published Academic Calendar period before creating the offering."); return;
        }
        await offeringsApi.create(parsed.data);
      }
      router.push(BACK_HREF);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the offering");
    } finally {
      setSaving(false);
    }
  });

  const pageTitle = editing ? "Edit offering" : "Add offering";
  const createBlocked = !editing && (!calendarContext || calendarLoading || courses.length === 0);
  const setupSteps = [
    { label: "Academic period", complete: legacyOffering || Boolean(calendarContext) },
    { label: "Course & spec", complete: Boolean(courseId && courseSpecId) },
    { label: "Weekly schedule", complete: meetings.length > 0 },
    { label: "Teaching team", complete: Boolean(lecturerId) },
  ];
  const suggestedLead = selectedCourseSpec?.courseTeam?.leadLecturerId
    ? selectedCourseSpec.courseTeam.lecturers.find(
        (lecturer) => lecturer.id === selectedCourseSpec.courseTeam?.leadLecturerId,
      ) ?? null
    : null;

  return (
    <>
      <Topbar title={pageTitle} subtitle="Course delivery is bound to the official Academic Calendar and applicable curriculum." />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink render={<Link href={BACK_HREF}>Course Offerings</Link>} /></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{pageTitle}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>

          {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}

          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : notFound ? <p className="text-sm text-muted-foreground">That offering could not be found. <Link href={BACK_HREF} className="underline">Back to Course Offerings</Link></p> : (
            <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
              <section aria-label="Offering setup progress" className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  {setupSteps.map((step, index) => (
                    <div key={step.label} className={"flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium " + (step.complete ? "bg-primary/10 text-primary" : "bg-background text-muted-foreground")}>
                      <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " + (step.complete ? "bg-primary text-primary-foreground" : "border border-border bg-card")}>
                        {step.complete ? "✓" : index + 1}
                      </span>
                      {step.label}
                    </div>
                  ))}
                </div>
              </section>

              {!editing && selectedCourseSpec?.courseTeam ? (
                <section className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
                  <p className="font-semibold text-foreground">
                    Teaching team suggested from Approved CourseSpec v{selectedCourseSpec.version}
                  </p>
                  {selectedCourseSpec.courseTeam.responsibilityMode === "LEAD_AND_CO" ? (
                    <p className="mt-1 text-muted-foreground">
                      {suggestedLead
                        ? `${suggestedLead.name} is prefilled as Primary Lecturer. Other Course Team members are prefilled as Co-Lecturers.`
                        : "This version has no provable Responsible Lecturer, so choose the actual Primary Lecturer for this delivery."}
                      {" "}Confirm or change these assignments for this offering before saving.
                    </p>
                  ) : (
                    <p className="mt-1 text-muted-foreground">
                      This CourseSpec uses shared academic responsibility, so no Primary Lecturer is invented. Course Team members are suggested as co-teaching candidates; choose the actual Primary Lecturer for this section. The chosen primary is removed from the Co-Lecturer list automatically.
                    </p>
                  )}
                </section>
              ) : null}

              <OfferingFormFields
                control={control}
                register={register}
                errors={errors}
                courses={courses}
                courseSpecVersions={courseSpecVersions}
                courseSpecLoading={courseSpecLoading}
                lecturers={lecturers}
                lecturerId={lecturerId}
                academicYears={academicYears}
                selectedAcademicYearId={selectedAcademicYearId}
                onAcademicYearChange={(academicYearId) => { setSelectedAcademicYearId(academicYearId); setValue("academicCalendarPeriodId", null); }}
                calendarContext={calendarContext}
                calendarLoading={calendarLoading}
                calendarError={calendarError}
                calendarLocked={calendarLocked}
                legacyTeachingPeriod={legacyTeachingPeriod}
                courseLocked={editing}
              />

              <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6"><p className="hidden text-xs text-muted-foreground sm:block">Teaching dates are locked to the resolved published calendar.</p><div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="outline" nativeButton={false} render={<Link href={BACK_HREF}>Cancel</Link>} />
                <Button type="submit" disabled={saving || createBlocked}>
                  {saving ? "Saving…" : editing ? "Save changes" : calendarContext ? `Create · ${academicSemesterLabel(calendarContext.semester)}` : "Add offering"}
                </Button>
              </div></div>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
