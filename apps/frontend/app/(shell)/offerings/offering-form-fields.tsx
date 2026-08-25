"use client";

import Link from "next/link";
import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import {
  MEETING_ACTIVITY_TYPES,
  MEETING_DAYS,
  OFFERING_STATUSES,
  type AcademicCalendarContextView,
  type AcademicYearView,
  type CourseSpecVersionRef,
  type Lecturer,
  type OfferingMeetingInput,
} from "@dse-pms/shared-types";
import type { CourseView } from "@/lib/courses";
import { academicSemesterLabel, formatAcademicDate } from "@/lib/academic-calendar";
import {
  Input,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dse-pms/ui";
import { CoursePicker } from "./course-picker";
import { LecturerChecklist } from "./lecturer-checklist";

export type OfferingFormValues = {
  courseId: string;
  courseSpecId: string;
  term: string;
  sectionCode: string;
  meetings: OfferingMeetingInput[];
  lecturerId?: string | null;
  coLecturerIds?: string[];
  capacity: number;
  status: (typeof OFFERING_STATUSES)[number];
  semester?: "First" | "Second" | null;
  programmeYear?: number | null;
  academicCalendarPeriodId?: string | null;
};

interface OfferingFormFieldsProps {
  control: Control<OfferingFormValues>;
  register: UseFormRegister<OfferingFormValues>;
  errors: FieldErrors<OfferingFormValues>;
  courses: CourseView[];
  courseSpecVersions: CourseSpecVersionRef[];
  courseSpecLoading: boolean;
  lecturers: Lecturer[];
  lecturerId: string | null;
  academicYears: AcademicYearView[];
  selectedAcademicYearId: string;
  onAcademicYearChange: (academicYearId: string) => void;
  calendarContext: AcademicCalendarContextView | null;
  calendarLoading: boolean;
  calendarError: string | null;
  calendarLocked?: boolean;
  legacyTeachingPeriod?: { startDate: string | null; endDate: string | null } | null;
  /** Course is fixed once an offering exists — an offering can't change its course. */
  courseLocked?: boolean;
}

export function OfferingFormFields({
  control,
  register,
  errors,
  courses,
  courseSpecVersions,
  courseSpecLoading,
  lecturers,
  lecturerId,
  academicYears,
  selectedAcademicYearId,
  onAcademicYearChange,
  calendarContext,
  calendarLoading,
  calendarError,
  calendarLocked,
  legacyTeachingPeriod,
  courseLocked,
}: OfferingFormFieldsProps) {
  const courseSpecItems: Record<string, string> = Object.fromEntries(
    courseSpecVersions.map((spec) => [spec.id, `Version ${spec.version}`]),
  );
  const lecturerItems: Record<string, string> = Object.fromEntries(
    lecturers.map((lecturer) => [lecturer.id, lecturer.name]),
  );
  const coLecturerOptions = lecturers.filter((lecturer) => lecturer.id !== lecturerId);
  const { fields: meetingFields, append: appendMeeting, remove: removeMeeting } = useFieldArray({
    control,
    name: "meetings",
  });
  const dayItems = Object.fromEntries(MEETING_DAYS.map((day) => [day, day]));
  const activityItems = Object.fromEntries(
    MEETING_ACTIVITY_TYPES.map((activity) => [activity, activity]),
  );
  const meetingsError = (errors.meetings as { message?: string } | undefined)?.message;

  return (
    <div className="space-y-5">
      <fieldset className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4 md:p-5">
        <div>
          <legend className="text-sm font-semibold text-foreground"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>Academic context</legend>
          <p className="text-xs text-muted-foreground">
            Teaching dates come from the published Academic Calendar. Course choices come from the applicable curriculum.
          </p>
        </div>

        {legacyTeachingPeriod ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">Legacy historical offering</p>
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              This record predates Academic Calendar linking. Its saved teaching period remains unchanged:
              {legacyTeachingPeriod.startDate && legacyTeachingPeriod.endDate
                ? ` ${formatAcademicDate(legacyTeachingPeriod.startDate)} – ${formatAcademicDate(legacyTeachingPeriod.endDate)}.`
                : " no legacy dates were stored."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Academic Year" required>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  value={selectedAcademicYearId}
                  disabled={calendarLocked}
                  onChange={(event) => onAcademicYearChange(event.target.value)}
                >
                  <option value="">— Select academic year —</option>
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? " · Current" : ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="Study Year" error={errors.programmeYear?.message} required>
                <Controller
                  control={control}
                  name="programmeYear"
                  render={({ field }) => (
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      value={field.value ?? ""}
                      disabled={calendarLocked}
                      onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : null)}
                    >
                      <option value="">— Select study year —</option>
                      {[1, 2, 3, 4].map((year) => <option key={year} value={year}>Year {year}</option>)}
                    </select>
                  )}
                />
              </Field>
              <Field label="Semester" error={errors.semester?.message} required>
                <Controller
                  control={control}
                  name="semester"
                  render={({ field }) => (
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      value={field.value ?? ""}
                      disabled={calendarLocked}
                      onChange={(event) => field.onChange(event.target.value || null)}
                    >
                      <option value="">— Select semester —</option>
                      <option value="First">Semester 1</option>
                      <option value="Second">Semester 2</option>
                    </select>
                  )}
                />
              </Field>
            </div>

            {calendarLoading ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">Resolving the published Academic Calendar and curriculum…</div>
            ) : calendarError ? (
              <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">No usable published academic period</p>
                <p className="mt-1">{calendarError}</p>
                <Link href="/academic-calendar" className="mt-2 inline-block font-medium underline underline-offset-4">Manage Academic Calendar</Link>
              </div>
            ) : calendarContext ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Calendar resolved automatically</p>
                    <p className="mt-1 font-semibold">{formatAcademicDate(calendarContext.period.teachingStart)} – {formatAcademicDate(calendarContext.period.teachingEnd)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Years {calendarContext.calendar.studyYears.join("–")} · {academicSemesterLabel(calendarContext.semester)} · Revision {calendarContext.calendar.revision}</p>
                  </div>
                  <Link href="/academic-calendar" className="text-sm font-medium text-primary underline-offset-4 hover:underline">View calendar</Link>
                </div>
              </div>
            ) : (
              <p className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">Select Academic Year, Study Year, and Semester to resolve the official teaching period.</p>
            )}
          </>
        )}
      </fieldset>

      <SectionHeading number="2" title="Course & specification" description="Only courses placed in the applicable active curriculum are available." />
      <Field label="Course" error={errors.courseId?.message} required>
        <CoursePickerField control={control} courses={courses} disabled={courseLocked || (!legacyTeachingPeriod && !calendarContext)} />
        {!legacyTeachingPeriod && calendarContext ? <p className="mt-1 text-xs text-muted-foreground">{courses.length} curriculum course{courses.length === 1 ? "" : "s"} available for this period.</p> : null}
        {!legacyTeachingPeriod && calendarContext && courses.length === 0 ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">No course is available in the applicable active curriculum for this study year and semester.</p>
        ) : null}
      </Field>

      <Field label="Approved CourseSpec version" error={errors.courseSpecId?.message} required>
        <Controller
          control={control}
          name="courseSpecId"
          render={({ field }) => (
            <Select
              items={courseSpecItems}
              value={field.value || null}
              onValueChange={(value) => field.onChange(value ?? "")}
              disabled={!courseSpecVersions.length || courseSpecLoading}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder={courseSpecLoading ? "Loading approved versions…" : "— Select approved version —"} /></SelectTrigger>
              <SelectContent>
                {courseSpecVersions.map((spec) => <SelectItem key={spec.id} value={spec.id}>Version {spec.version}{spec.effectiveFrom ? ` · effective ${spec.effectiveFrom}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        />
        {!courseSpecLoading && courses.length > 0 && courseSpecVersions.length === 0 ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">This course has no Approved CourseSpec version yet.</p> : null}
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Term" error={errors.term?.message} required>
          <Input readOnly className="bg-muted/30" placeholder="Resolved from Academic Calendar" {...register("term")} />
        </Field>
        <Field label="Class / Section" error={errors.sectionCode?.message} required>
          <Input placeholder="A" maxLength={12} {...register("sectionCode")} />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-2xl border border-border p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div><legend className="text-sm font-semibold text-foreground"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">3</span>Weekly class schedule <span className="ml-1 text-status-live" aria-label="required">*</span></legend><p className="text-xs text-muted-foreground">Academic Calendar defines the semester boundary; these rows define the recurring class timetable.</p></div>
          <Button type="button" variant="outline" size="sm" onClick={() => appendMeeting({ dayOfWeek: "Monday", startTime: "08:00", endTime: "09:00", room: "", activityType: "Lecture" })}>Add session</Button>
        </div>
        {meetingFields.length === 0 ? <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Add at least one weekly session before saving this offering.</p> : null}
        {meetingsError ? <p className="text-xs text-status-live">{meetingsError}</p> : null}
        {meetingFields.map((meeting, index) => (
          <div key={meeting.id} className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Day" error={errors.meetings?.[index]?.dayOfWeek?.message} required><Controller control={control} name={`meetings.${index}.dayOfWeek`} render={({ field }) => <Select items={dayItems} value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{MEETING_DAYS.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}</SelectContent></Select>} /></Field>
              <Field label="Start" error={errors.meetings?.[index]?.startTime?.message} required><Input type="time" {...register(`meetings.${index}.startTime`)} /></Field>
              <Field label="End" error={errors.meetings?.[index]?.endTime?.message} required><Input type="time" {...register(`meetings.${index}.endTime`)} /></Field>
              <Field label="Room" error={errors.meetings?.[index]?.room?.message} optional><Input placeholder="A203" maxLength={80} {...register(`meetings.${index}.room`)} /></Field>
              <Field label="Activity" error={errors.meetings?.[index]?.activityType?.message}><Controller control={control} name={`meetings.${index}.activityType`} render={({ field }) => <Select items={activityItems} value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{MEETING_ACTIVITY_TYPES.map((activity) => <SelectItem key={activity} value={activity}>{activity}</SelectItem>)}</SelectContent></Select>} /></Field>
            </div>
            <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => removeMeeting(index)}>Remove session</Button></div>
          </div>
        ))}
      </fieldset>

      <SectionHeading number="4" title="Teaching team & delivery status" description="Assign the lecturer responsible for this section and confirm operational details." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Capacity" error={errors.capacity?.message}><Input type="number" min={1} {...register("capacity", { valueAsNumber: true })} /></Field>
        <Field label="Status" error={errors.status?.message}><Controller control={control} name="status" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{OFFERING_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>} /></Field>
      </div>

      <Field label="Primary Lecturer" error={errors.lecturerId?.message} required>
        <Controller control={control} name="lecturerId" render={({ field }) => <Select items={lecturerItems} value={field.value || null} onValueChange={(value) => field.onChange(value ?? null)}><SelectTrigger className="w-full"><SelectValue placeholder="— Select primary lecturer —" /></SelectTrigger><SelectContent>{lecturers.map((lecturer) => <SelectItem key={lecturer.id} value={lecturer.id}>{lecturer.name}</SelectItem>)}</SelectContent></Select>} />
      </Field>

      <Controller control={control} name="coLecturerIds" render={({ field }) => <LecturerChecklist label="Co-Lecturers" options={coLecturerOptions} selectedIds={field.value ?? []} onChange={field.onChange} />} />
      {errors.coLecturerIds?.message ? <p className="text-xs text-status-live">{errors.coLecturerIds.message}</p> : null}
    </div>
  );
}

function SectionHeading({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-foreground">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{number}</span>
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function CoursePickerField({ control, courses, disabled }: { control: Control<OfferingFormValues>; courses: CourseView[]; disabled: boolean }) {
  return <Controller control={control} name="courseId" render={({ field }) => <CoursePicker courses={courses} selectedId={field.value ?? ""} onChange={field.onChange} disabled={disabled} />} />;
}

function Field({ label, error, required = false, optional = false, children }: { label: string; error?: string; required?: boolean; optional?: boolean; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium text-foreground">{label}{required ? <span className="ml-1 text-status-live" aria-label="required">*</span> : null}{optional ? <span className="ml-1 font-normal text-muted-foreground">(Optional)</span> : null}</span>{children}{error ? <span className="block text-xs text-status-live">{error}</span> : null}</label>;
}
