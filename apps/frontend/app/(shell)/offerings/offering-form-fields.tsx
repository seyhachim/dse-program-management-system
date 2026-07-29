"use client";

import { Controller, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { OFFERING_STATUSES, type Lecturer, type Semester } from "@dse-pms/shared-types";
import type { CourseView } from "@/lib/courses";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dse-pms/ui";
import { LecturerChecklist } from "./lecturer-checklist";

export type OfferingFormValues = {
  courseId: string;
  term: string;
  lecturerId?: string | null;
  // Existing lecturer users assigned alongside the primary lecturer (issue #79).
  coLecturerIds?: string[];
  capacity: number;
  status: (typeof OFFERING_STATUSES)[number];
  // §12 Course Availability — optional.
  semester?: Semester | null;
  programmeYear?: number | null;
  // §10 Other Course Lecturer(s) — optional free text.
  otherLecturers?: string;
};

const YEAR_OPTIONS = [1, 2, 3, 4] as const;

// The Select item value can't be "" (that's reserved for "nothing selected"),
// so optional/clearable fields use these sentinels and map back at the edges.
const NOT_SET = "__not_set__";
const UNASSIGNED_SENTINEL = "__unassigned__";

// base-ui's <Select.Value> renders the raw value unless the Root gets an `items`
// map (value -> label); without it the trigger would show the course/lecturer id.
const SEMESTER_ITEMS: Record<string, string> = {
  [NOT_SET]: "— Not set —",
  First: "1st Semester",
  Second: "2nd Semester",
};
const YEAR_ITEMS: Record<string, string> = {
  [NOT_SET]: "— Not set —",
  ...Object.fromEntries(YEAR_OPTIONS.map((y) => [String(y), `Year ${y}`])),
};

interface OfferingFormFieldsProps {
  control: Control<OfferingFormValues>;
  register: UseFormRegister<OfferingFormValues>;
  errors: FieldErrors<OfferingFormValues>;
  courses: CourseView[];
  lecturers: Lecturer[];
  lecturerId: string | null;
  /** Course is fixed once an offering exists — an offering can't change its course. */
  courseLocked?: boolean;
  semester: string;
  onSemesterChange: (v: string) => void;
  programmeYear: string;
  onProgrammeYearChange: (v: string) => void;
}

export function OfferingFormFields({
  control,
  register,
  errors,
  courses,
  lecturers,
  lecturerId,
  courseLocked,
  semester,
  onSemesterChange,
  programmeYear,
  onProgrammeYearChange,
}: OfferingFormFieldsProps) {
  const courseItems: Record<string, string> = Object.fromEntries(
    courses.map((c) => [c.id, `${c.code} — ${c.title}`]),
  );
  const lecturerItems: Record<string, string> = {
    [UNASSIGNED_SENTINEL]: "— Unassigned —",
    ...Object.fromEntries(lecturers.map((l) => [l.id, l.name])),
  };
  // The primary lecturer can't also be picked as a co-lecturer.
  const coLecturerOptions = lecturers.filter((l) => l.id !== lecturerId);

  return (
    <div className="space-y-4">
      <Field label="Course" error={errors.courseId?.message}>
        <Controller
          control={control}
          name="courseId"
          render={({ field }) => (
            <Select
              items={courseItems}
              value={field.value || null}
              onValueChange={(v) => field.onChange(v ?? "")}
              disabled={courseLocked}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— Select course —" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Term" error={errors.term?.message}>
        <Input placeholder="2025-Fall" {...register("term")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Semester (§12)">
          <Select
            items={SEMESTER_ITEMS}
            value={semester === "" ? NOT_SET : semester}
            onValueChange={(v) => onSemesterChange(v && v !== NOT_SET ? v : "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOT_SET}>— Not set —</SelectItem>
              <SelectItem value="First">1st Semester</SelectItem>
              <SelectItem value="Second">2nd Semester</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Year (§12)">
          <Select
            items={YEAR_ITEMS}
            value={programmeYear === "" ? NOT_SET : programmeYear}
            onValueChange={(v) => onProgrammeYearChange(v && v !== NOT_SET ? v : "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOT_SET}>— Not set —</SelectItem>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  Year {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
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
                  {OFFERING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>
      <Field label="Lecturer" error={errors.lecturerId?.message}>
        <Controller
          control={control}
          name="lecturerId"
          render={({ field }) => (
            <Select
              items={lecturerItems}
              value={field.value || UNASSIGNED_SENTINEL}
              onValueChange={(v) => field.onChange(v === UNASSIGNED_SENTINEL ? null : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_SENTINEL}>— Unassigned —</SelectItem>
                {lecturers.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
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
      <Field label="Other lecturer(s) (§10)" error={errors.otherLecturers?.message}>
        <Input placeholder="Co-teachers this term (optional)" {...register("otherLecturers")} />
      </Field>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <span className="block text-xs text-status-live">{error}</span> : null}
    </label>
  );
}
