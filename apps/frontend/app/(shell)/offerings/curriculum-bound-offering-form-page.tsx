"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CreateCurriculumBoundOfferingInputSchema,
  UpdateCurriculumBoundOfferingInputSchema,
  type AcademicCalendarPeriodView,
  type AcademicCalendarView,
  type AcademicYearView,
  type CourseSpecVersionRef,
  type Lecturer,
  type OfferingCurriculumBindingView,
  type OfferingCurriculumPlacementRef,
  type OfferingCurriculumVersionRef,
  type OfferingMeetingInput,
  type OfferingStatus,
  type OfferingView,
  type Semester,
} from "@dse-pms/shared-types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Input,
} from "@dse-pms/ui";
import { Topbar } from "../topbar";
import { ApiError } from "@/lib/api";
import { academicCalendarApi, academicSemesterLabel, formatAcademicDate } from "@/lib/academic-calendar";
import { coursesApi } from "@/lib/courses";
import { curriculumBoundOfferingsApi } from "@/lib/curriculum-bound-offerings";
import { lecturersApi } from "@/lib/lecturers";
import { offeringsApi } from "@/lib/offerings";
import { OfferingFormPage } from "./offering-form-page";

const BACK_HREF = "/offerings";

const EMPTY_MEETING: OfferingMeetingInput = {
  dayOfWeek: "Monday",
  startTime: "08:00",
  endTime: "09:00",
  room: "",
  activityType: "Lecture",
};

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function versionLabel(version: OfferingCurriculumVersionRef): string {
  const cohort = version.cohortLabel ? ` · ${version.cohortLabel}` : "";
  const intake = version.intakeYear ? ` · intake ${version.intakeYear}` : "";
  return `v${version.version} · ${version.status}${cohort}${intake}`;
}

function calendarMatch(
  calendars: AcademicCalendarView[],
  studyYear: number,
  semester: Semester,
): { calendar: AcademicCalendarView; period: AcademicCalendarPeriodView } | null {
  const matches = calendars
    .filter((calendar) => calendar.status === "Published" && calendar.studyYears.includes(studyYear))
    .flatMap((calendar) => {
      const period = calendar.periods.find((item) => item.semester === semester);
      return period ? [{ calendar, period }] : [];
    });
  return matches.length === 1 ? matches[0]! : null;
}

export function CurriculumBoundOfferingFormPage({ offeringId }: { offeringId: string | null }) {
  const router = useRouter();
  const editing = Boolean(offeringId);
  const [legacyFallback, setLegacyFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [programmeId, setProgrammeId] = useState("");
  const [academicYears, setAcademicYears] = useState<AcademicYearView[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState("");
  const [studyYear, setStudyYear] = useState<number | null>(null);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [calendar, setCalendar] = useState<AcademicCalendarView | null>(null);
  const [period, setPeriod] = useState<AcademicCalendarPeriodView | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const [versions, setVersions] = useState<OfferingCurriculumVersionRef[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [placements, setPlacements] = useState<OfferingCurriculumPlacementRef[]>([]);
  const [selectedPlacementId, setSelectedPlacementId] = useState("");
  const [binding, setBinding] = useState<OfferingCurriculumBindingView | null>(null);

  const [courseSpecVersions, setCourseSpecVersions] = useState<CourseSpecVersionRef[]>([]);
  const [courseSpecId, setCourseSpecId] = useState("");
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [lecturerId, setLecturerId] = useState("");
  const [coLecturerIds, setCoLecturerIds] = useState<string[]>([]);
  const [sectionCode, setSectionCode] = useState("A");
  const [capacity, setCapacity] = useState(30);
  const [status, setStatus] = useState<OfferingStatus>("Planned");
  const [meetings, setMeetings] = useState<OfferingMeetingInput[]>([]);

  const selectedPlacement = useMemo(
    () => placements.find((item) => item.id === selectedPlacementId) ?? binding?.placement ?? null,
    [binding?.placement, placements, selectedPlacementId],
  );
  const courseId = selectedPlacement?.courseId ?? "";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [programme, lecturerList, offering] = await Promise.all([
          academicCalendarApi.programme(),
          lecturersApi.list(),
          offeringId ? offeringsApi.get(offeringId) : Promise.resolve(null),
        ]);
        const [years, curriculumVersions] = await Promise.all([
          academicCalendarApi.years(programme.id),
          curriculumBoundOfferingsApi.versions(programme.id),
        ]);
        if (cancelled) return;
        setProgrammeId(programme.id);
        setLecturers(lecturerList);
        setAcademicYears(years);
        setVersions(curriculumVersions);

        if (!offeringId) {
          const currentYear = years.find((item) => item.isCurrent) ?? years[0] ?? null;
          setSelectedAcademicYearId(currentYear?.id ?? "");
          return;
        }
        if (!offering) {
          setError("Offering not found");
          return;
        }

        let exactBinding: OfferingCurriculumBindingView;
        try {
          exactBinding = await curriculumBoundOfferingsApi.binding(offeringId);
        } catch (bindingError) {
          if (bindingError instanceof ApiError && bindingError.status === 404) {
            setLegacyFallback(true);
            return;
          }
          throw bindingError;
        }
        if (cancelled) return;
        setBinding(exactBinding);
        setSelectedVersionId(exactBinding.curriculumVersionId);
        setSelectedPlacementId(exactBinding.curriculumCourseId);
        setSelectedAcademicYearId(offering.academicCalendar?.academicYearId ?? "");
        setStudyYear(offering.programmeYear);
        setSemester(offering.semester);
        setCourseSpecId(offering.courseSpec?.id ?? "");
        setLecturerId(offering.lecturer?.id ?? "");
        setCoLecturerIds(offering.coLecturers.map((item) => item.id));
        setSectionCode(offering.sectionCode);
        setCapacity(offering.capacity);
        setStatus(offering.status);
        setMeetings(
          offering.meetings.map(({ id: _id, durationHours: _duration, room, ...meeting }) => ({
            ...meeting,
            room: room ?? "",
          })),
        );
      } catch (loadError) {
        if (!cancelled) setError(message(loadError, "Failed to load Offering setup"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [offeringId]);

  useEffect(() => {
    let cancelled = false;
    if (!programmeId || !selectedAcademicYearId || !studyYear || !semester) {
      setCalendar(null);
      setPeriod(null);
      setCalendarError(null);
      return;
    }
    setCalendarLoading(true);
    setCalendarError(null);
    void academicCalendarApi.calendars(programmeId, selectedAcademicYearId)
      .then((items) => {
        if (cancelled) return;
        const resolved = calendarMatch(items, studyYear, semester);
        if (!resolved) {
          setCalendar(null);
          setPeriod(null);
          setCalendarError("No unique published Academic Calendar period exists for this study year and semester.");
          return;
        }
        setCalendar(resolved.calendar);
        setPeriod(resolved.period);
      })
      .catch((calendarLoadError) => {
        if (!cancelled) {
          setCalendar(null);
          setPeriod(null);
          setCalendarError(message(calendarLoadError, "Could not resolve Academic Calendar"));
        }
      })
      .finally(() => { if (!cancelled) setCalendarLoading(false); });
    return () => { cancelled = true; };
  }, [programmeId, selectedAcademicYearId, semester, studyYear]);

  useEffect(() => {
    let cancelled = false;
    if (!programmeId || !selectedVersionId || !studyYear || !semester) {
      setPlacements([]);
      if (!editing) setSelectedPlacementId("");
      return;
    }
    void curriculumBoundOfferingsApi.placements(
      programmeId,
      selectedVersionId,
      studyYear,
      semester,
    )
      .then((items) => {
        if (cancelled) return;
        setPlacements(items);
        if (!editing && !items.some((item) => item.id === selectedPlacementId)) {
          setSelectedPlacementId("");
        }
      })
      .catch((placementError) => {
        if (!cancelled) {
          setPlacements([]);
          setError(message(placementError, "Could not load curriculum courses"));
        }
      });
    return () => { cancelled = true; };
  }, [editing, programmeId, selectedPlacementId, selectedVersionId, semester, studyYear]);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setCourseSpecVersions([]);
      if (!editing) setCourseSpecId("");
      return;
    }
    void coursesApi.approvedSpecVersions(courseId)
      .then((items) => { if (!cancelled) setCourseSpecVersions(items); })
      .catch(() => { if (!cancelled) setCourseSpecVersions([]); });
    return () => { cancelled = true; };
  }, [courseId, editing]);

  if (legacyFallback && offeringId) {
    return <OfferingFormPage offeringId={offeringId} />;
  }

  const academicLocked = editing;
  const selectedYear = academicYears.find((item) => item.id === selectedAcademicYearId) ?? null;
  const selectedVersion = versions.find((item) => item.id === selectedVersionId) ?? binding?.version ?? null;
  const completed = status === "Completed";

  function changeMeeting(index: number, patch: Partial<OfferingMeetingInput>) {
    setMeetings((current) => current.map((meeting, i) => i === index ? { ...meeting, ...patch } : meeting));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (!period || !selectedYear || !studyYear || !semester) {
        setError("Resolve a unique published Academic Calendar period first.");
        return;
      }
      if (!selectedPlacement || !selectedVersion) {
        setError("Select the exact curriculum version and course placement.");
        return;
      }
      if (!lecturerId) {
        setError("Select a primary lecturer.");
        return;
      }
      if (meetings.length === 0) {
        setError("Add at least one weekly class session.");
        return;
      }
      if (status !== "Planned" && !courseSpecId) {
        setError("Keep this Offering Planned until an Approved CourseSpec is selected.");
        return;
      }

      const offeringPayload = {
        courseId: selectedPlacement.courseId,
        courseSpecId: courseSpecId || null,
        term: `${selectedYear.label}-${semester === "First" ? "S1" : "S2"}`,
        sectionCode,
        meetings,
        lecturerId,
        coLecturerIds,
        capacity,
        status,
        semester,
        programmeYear: studyYear,
        academicCalendarPeriodId: period.id,
      };

      if (!offeringId) {
        const parsed = CreateCurriculumBoundOfferingInputSchema.safeParse({
          curriculumCourseId: selectedPlacement.id,
          offering: offeringPayload,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the Offering details");
          return;
        }
        await curriculumBoundOfferingsApi.create(parsed.data);
      } else {
        const { courseId: _courseId, term: _term, ...update } = offeringPayload;
        const parsed = UpdateCurriculumBoundOfferingInputSchema.safeParse({ offering: update });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the Offering details");
          return;
        }
        await curriculumBoundOfferingsApi.update(offeringId, parsed.data);
      }
      router.push(BACK_HREF);
    } catch (saveError) {
      setError(message(saveError, "Failed to save Offering"));
    } finally {
      setSaving(false);
    }
  }

  const title = editing ? "Edit offering" : "Add offering";

  return (
    <>
      <Topbar
        title={title}
        subtitle="Academic Calendar controls when teaching occurs; the exact curriculum version controls what the class delivers."
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink render={<Link href={BACK_HREF}>Course Offerings</Link>} /></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>{title}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {error ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <div className="space-y-5">
              <section className="space-y-4 rounded-2xl border border-border p-4 md:p-5">
                <div>
                  <h2 className="font-semibold">1. Academic Calendar</h2>
                  <p className="text-sm text-muted-foreground">Select when this class is delivered. Calendar year does not choose the curriculum version.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Academic Year</span>
                    <select className="h-9 w-full rounded-md border border-input bg-background px-3" value={selectedAcademicYearId} disabled={academicLocked} onChange={(event) => setSelectedAcademicYearId(event.target.value)}>
                      <option value="">Select</option>
                      {academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? " · Current" : ""}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Study Year</span>
                    <select className="h-9 w-full rounded-md border border-input bg-background px-3" value={studyYear ?? ""} disabled={academicLocked} onChange={(event) => setStudyYear(event.target.value ? Number(event.target.value) : null)}>
                      <option value="">Select</option>
                      {[1, 2, 3, 4].map((year) => <option key={year} value={year}>Year {year}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Semester</span>
                    <select className="h-9 w-full rounded-md border border-input bg-background px-3" value={semester ?? ""} disabled={academicLocked} onChange={(event) => setSemester((event.target.value || null) as Semester | null)}>
                      <option value="">Select</option>
                      <option value="First">Semester 1</option>
                      <option value="Second">Semester 2</option>
                    </select>
                  </label>
                </div>
                {calendarLoading ? <p className="text-sm text-muted-foreground">Resolving published calendar…</p> : calendarError ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{calendarError}</div>
                ) : calendar && period ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                    <p className="font-semibold">Published Calendar · Revision {calendar.revision}</p>
                    <p>{formatAcademicDate(period.teachingStart)} – {formatAcademicDate(period.teachingEnd)} · {academicSemesterLabel(period.semester)}</p>
                  </div>
                ) : null}
              </section>

              <section className="space-y-4 rounded-2xl border border-border p-4 md:p-5">
                <div>
                  <h2 className="font-semibold">2. Exact curriculum placement</h2>
                  <p className="text-sm text-muted-foreground">Choose the curriculum that governs this cohort/class. An older approved curriculum may be paired with a later Academic Calendar.</p>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Curriculum version</span>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3" value={selectedVersionId} disabled={academicLocked} onChange={(event) => { setSelectedVersionId(event.target.value); setSelectedPlacementId(""); setCourseSpecId(""); }}>
                    <option value="">Select exact curriculum</option>
                    {versions.map((version) => <option key={version.id} value={version.id}>{versionLabel(version)} · metadata {version.academicYear}</option>)}
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Course placement</span>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3" value={selectedPlacementId} disabled={academicLocked || !selectedVersionId || !studyYear || !semester} onChange={(event) => { setSelectedPlacementId(event.target.value); setCourseSpecId(""); }}>
                    <option value="">Select course</option>
                    {placements.map((placement) => <option key={placement.id} value={placement.id}>{placement.courseCode} — {placement.courseTitle} · {placement.creditsSnapshot} credits</option>)}
                  </select>
                </label>
                {selectedVersion && selectedPlacement ? (
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <strong>Authority:</strong> Curriculum v{selectedVersion.version} ({selectedVersion.cohortLabel || "no cohort label"}) → Year {selectedPlacement.yearLevel} → {academicSemesterLabel(selectedPlacement.semester)} → {selectedPlacement.courseCode}.
                  </div>
                ) : null}
              </section>

              <section className="space-y-4 rounded-2xl border border-border p-4 md:p-5">
                <h2 className="font-semibold">3. Delivery setup</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Approved CourseSpec {status === "Planned" ? "(optional while Planned)" : ""}</span>
                    <select className="h-9 w-full rounded-md border border-input bg-background px-3" value={courseSpecId} onChange={(event) => setCourseSpecId(event.target.value)} disabled={!courseId}>
                      <option value="">No Approved CourseSpec yet</option>
                      {courseSpecVersions.map((spec) => <option key={spec.id} value={spec.id}>Version {spec.version}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Class</span>
                    <Input value={sectionCode} onChange={(event) => setSectionCode(event.target.value.toUpperCase())} maxLength={12} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Capacity</span>
                    <Input type="number" min={1} max={1000} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Status</span>
                    <select className="h-9 w-full rounded-md border border-input bg-background px-3" value={status} disabled={completed} onChange={(event) => setStatus(event.target.value as OfferingStatus)}>
                      <option value="Planned">Planned</option>
                      <option value="Active">Active</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </label>
                </div>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Primary lecturer</span>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3" value={lecturerId} onChange={(event) => { setLecturerId(event.target.value); setCoLecturerIds((ids) => ids.filter((id) => id !== event.target.value)); }}>
                    <option value="">Select lecturer</option>
                    {lecturers.map((lecturer) => <option key={lecturer.id} value={lecturer.id}>{lecturer.name}</option>)}
                  </select>
                </label>

                <div className="space-y-2 text-sm">
                  <p className="font-medium">Co-lecturers</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {lecturers.filter((lecturer) => lecturer.id !== lecturerId).map((lecturer) => (
                      <label key={lecturer.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                        <input type="checkbox" checked={coLecturerIds.includes(lecturer.id)} onChange={(event) => setCoLecturerIds((ids) => event.target.checked ? [...ids, lecturer.id] : ids.filter((id) => id !== lecturer.id))} />
                        <span>{lecturer.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-border p-4 md:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">4. Weekly meetings</h2>
                    <p className="text-sm text-muted-foreground">The Academic Calendar supplies semester boundaries; these rows supply the recurring timetable.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setMeetings((items) => [...items, { ...EMPTY_MEETING }])}>Add session</Button>
                </div>
                {meetings.map((meeting, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-6">
                    <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={meeting.dayOfWeek} onChange={(event) => changeMeeting(index, { dayOfWeek: event.target.value as OfferingMeetingInput["dayOfWeek"] })}>
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => <option key={day} value={day}>{day}</option>)}
                    </select>
                    <Input type="time" value={meeting.startTime} onChange={(event) => changeMeeting(index, { startTime: event.target.value })} />
                    <Input type="time" value={meeting.endTime} onChange={(event) => changeMeeting(index, { endTime: event.target.value })} />
                    <Input placeholder="Room" value={meeting.room ?? ""} onChange={(event) => changeMeeting(index, { room: event.target.value })} />
                    <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={meeting.activityType} onChange={(event) => changeMeeting(index, { activityType: event.target.value as OfferingMeetingInput["activityType"] })}>
                      {["Lecture", "Tutorial", "Practice", "Lab", "Other"].map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setMeetings((items) => items.filter((_, i) => i !== index))}>Remove</Button>
                  </div>
                ))}
                {meetings.length === 0 ? <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">Add at least one weekly session.</p> : null}
              </section>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" render={<Link href={BACK_HREF}>Cancel</Link>} />
                <Button type="button" disabled={saving || loading || completed || !period || !selectedPlacement} onClick={() => void submit()}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create Planned Offering"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
