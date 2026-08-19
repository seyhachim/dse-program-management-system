"use client";

import { Controller, useFieldArray, useWatch, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import {
  MEETING_ACTIVITY_TYPES,
  MEETING_DAYS,
  OFFERING_STATUSES,
  type CourseSpecVersionRef,
  type Lecturer,
  type OfferingMeetingInput,
} from "@dse-pms/shared-types";
import type { CourseView } from "@/lib/courses";
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
  startDate?: string | null;
  endDate?: string | null;
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
  const startDate = useWatch({ control, name: "startDate" }) ?? "";
  const endDate = useWatch({ control, name: "endDate" }) ?? "";
  const dayItems = Object.fromEntries(MEETING_DAYS.map((day) => [day, day]));
  const activityItems = Object.fromEntries(
    MEETING_ACTIVITY_TYPES.map((activity) => [activity, activity]),
  );
  const meetingsError = (errors.meetings as { message?: string } | undefined)?.message;

  return (
    <div className="space-y-4">
      <Field label="Course" error={errors.courseId?.message} required>
        <Controller
          control={control}
          name="courseId"
          render={({ field }) => (
            <CoursePicker
              courses={courses}
              selectedId={field.value ?? ""}
              onChange={field.onChange}
              disabled={courseLocked}
            />
          )}
        />
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
              <SelectTrigger className="w-full">
                <SelectValue placeholder={courseSpecLoading ? "Loading approved versions…" : "— Select approved version —"} />
              </SelectTrigger>
              <SelectContent>
                {courseSpecVersions.map((spec) => (
                  <SelectItem key={spec.id} value={spec.id}>
                    Version {spec.version}{spec.effectiveFrom ? ` · effective ${spec.effectiveFrom}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {!courseSpecLoading && courses.length > 0 && courseSpecVersions.length === 0 ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">This course has no Approved CourseSpec version yet.</p>
        ) : null}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Term" error={errors.term?.message} required>
          <Input placeholder="2025-Fall" {...register("term")} />
        </Field>
        <Field label="Class / Section" error={errors.sectionCode?.message} required>
          <Input placeholder="A" maxLength={12} {...register("sectionCode")} />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <legend className="text-sm font-semibold text-foreground">
              Weekly Class Schedule <span className="ml-1 text-status-live" aria-label="required">*</span>
            </legend>
            <p className="text-xs text-muted-foreground">
              Add at least one recurring class session. Duration is calculated from start and end time.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendMeeting({
              dayOfWeek: "Monday",
              startTime: "08:00",
              endTime: "09:00",
              room: "",
              activityType: "Lecture",
            })}
          >
            Add session
          </Button>
        </div>
        {meetingFields.length === 0 ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Add at least one weekly session before saving this offering.
          </p>
        ) : null}
        {meetingsError ? <p className="text-xs text-status-live">{meetingsError}</p> : null}
        {meetingFields.map((meeting, index) => (
          <div key={meeting.id} className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Day" error={errors.meetings?.[index]?.dayOfWeek?.message} required>
                <Controller
                  control={control}
                  name={`meetings.${index}.dayOfWeek`}
                  render={({ field }) => (
                    <Select items={dayItems} value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MEETING_DAYS.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Start" error={errors.meetings?.[index]?.startTime?.message} required>
                <Input type="time" {...register(`meetings.${index}.startTime`)} />
              </Field>
              <Field label="End" error={errors.meetings?.[index]?.endTime?.message} required>
                <Input type="time" {...register(`meetings.${index}.endTime`)} />
              </Field>
              <Field label="Room" error={errors.meetings?.[index]?.room?.message} optional>
                <Input placeholder="A203" maxLength={80} {...register(`meetings.${index}.room`)} />
              </Field>
              <Field label="Activity" error={errors.meetings?.[index]?.activityType?.message}>
                <Controller
                  control={control}
                  name={`meetings.${index}.activityType`}
                  render={({ field }) => (
                    <Select items={activityItems} value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MEETING_ACTIVITY_TYPES.map((activity) => (
                          <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => removeMeeting(index)}>
                Remove session
              </Button>
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <legend className="text-sm font-semibold text-foreground">
            Teaching Period <span className="ml-1 text-status-live" aria-label="required">*</span>
          </legend>
          <p className="text-xs text-muted-foreground">
            Set the actual delivery start and end dates.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" error={errors.startDate?.message} required>
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <Input
                  type="date"
                  value={field.value ?? ""}
                  max={endDate || undefined}
                  onChange={(event) => field.onChange(event.target.value || null)}
                />
              )}
            />
          </Field>
          <Field label="End date" error={errors.endDate?.message} required>
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <Input
                  type="date"
                  value={field.value ?? ""}
                  min={startDate || undefined}
                  onChange={(event) => field.onChange(event.target.value || null)}
                />
              )}
            />
          </Field>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Capacity" error={errors.capacity?.message}>
          <Input type="number" min={1} {...register("capacity", { valueAsNumber: true })} />
        </Field>
        <Field label="Status" error={errors.status?.message}>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFERING_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <Field label="Primary Lecturer" error={errors.lecturerId?.message} required>
        <Controller
          control={control}
          name="lecturerId"
          render={({ field }) => (
            <Select
              items={lecturerItems}
              value={field.value || null}
              onValueChange={(value) => field.onChange(value ?? null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— Select primary lecturer —" />
              </SelectTrigger>
              <SelectContent>
                {lecturers.map((lecturer) => (
                  <SelectItem key={lecturer.id} value={lecturer.id}>
                    {lecturer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      <Controller
        control={control}
        name="coLecturerIds"
        render={({ field }) => (
          <LecturerChecklist
            label="Co-Lecturers"
            options={coLecturerOptions}
            selectedIds={field.value ?? []}
            onChange={field.onChange}
          />
        )}
      />
      {errors.coLecturerIds?.message ? (
        <p className="text-xs text-status-live">{errors.coLecturerIds.message}</p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  error,
  required = false,
  optional = false,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-1 text-status-live" aria-label="required">*</span> : null}
        {optional ? <span className="ml-1 font-normal text-muted-foreground">(Optional)</span> : null}
      </span>
      {children}
      {error ? <span className="block text-xs text-status-live">{error}</span> : null}
    </label>
  );
}
