"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { COURSE_TYPES, courseTypeLabel, type CourseType } from "@dse-pms/shared-types";
import { FormFieldLabel, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dse-pms/ui";

export type CourseFormValues = {
  code: string;
  title: string;
  description?: string;
  // Syllabus Course Information — §4 credits, §5 prerequisites, §11 type.
  credits?: number | null;
  prerequisites?: string;
  courseType?: CourseType | null;
  totalSltHours?: number | null;
};

// The Select item value can't be "" (that's reserved for "nothing selected"),
// so optional/clearable fields use this sentinel and map back to "" at the edges.
const NOT_SET = "__not_set__";

// base-ui's <Select.Value> renders the raw value unless the Root gets an `items`
// map (value -> label); without it the trigger would show the enum value.
const COURSE_TYPE_ITEMS: Record<string, string> = {
  [NOT_SET]: "— Not set —",
  ...Object.fromEntries(COURSE_TYPES.map((t) => [t, courseTypeLabel(t)])),
};

interface CourseFormFieldsProps {
  register: UseFormRegister<CourseFormValues>;
  errors: FieldErrors<CourseFormValues>;
  credits: string;
  onCreditsChange: (v: string) => void;
  totalSltHours: string;
  onTotalSltHoursChange: (v: string) => void;
  courseType: string;
  onCourseTypeChange: (v: string) => void;
}

export function CourseFormFields({
  register,
  errors,
  credits,
  onCreditsChange,
  totalSltHours,
  onTotalSltHoursChange,
  courseType,
  onCourseTypeChange,
}: CourseFormFieldsProps) {
  return (
    <div className="space-y-4">
      <Field label="Code" error={errors.code?.message} required>
        <Input placeholder="CS101" {...register("code")} required />
      </Field>
      <Field label="Title" error={errors.title?.message} required>
        <Input placeholder="Introduction to Programming" {...register("title")} required />
      </Field>
      <Field label="Description" error={errors.description?.message}>
        <Input placeholder="Optional" {...register("description")} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Credits (§4)">
          <Input
            type="number"
            min={1}
            max={30}
            placeholder="3"
            value={credits}
            onChange={(e) => onCreditsChange(e.target.value)}
          />
        </Field>
        <Field label="Total SLT (hours)">
          <Input
            type="number"
            min={0}
            placeholder="120"
            value={totalSltHours}
            onChange={(e) => onTotalSltHoursChange(e.target.value)}
          />
        </Field>
        <Field label="Course type (§11)">
          <Select
            items={COURSE_TYPE_ITEMS}
            value={courseType === "" ? NOT_SET : courseType}
            onValueChange={(v) => onCourseTypeChange(v && v !== NOT_SET ? v : "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOT_SET}>— Not set —</SelectItem>
              {COURSE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {courseTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Pre-requisites (§5)" error={errors.prerequisites?.message}>
        <Input
          placeholder="e.g. Math I–III; Statistics I–II (optional)"
          {...register("prerequisites")}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  error,
  required = false,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <FormFieldLabel required={required}>{label}</FormFieldLabel>
      {children}
      {error ? <span className="block text-xs text-status-live">{error}</span> : null}
    </label>
  );
}
