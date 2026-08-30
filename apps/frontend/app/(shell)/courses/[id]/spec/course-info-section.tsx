"use client";

import {
  COURSE_TYPES,
  PROGRAMME_TITLE,
  SEMESTERS,
  courseTypeLabel,
  semesterLabel,
} from "@dse-pms/shared-types";
import { Input } from "@dse-pms/ui";

/** All fields held as strings for input binding; converted on save by the wizard. */
export type CourseInfoForm = {
  programmeTitle: string;
  courseTitle: string;
  courseCode: string;
  credits: string;
  prerequisites: string;
  courseType: string;
  description: string;
  totalSltHours: number | null | undefined;
  instructorName: string;
  instructorTitle: string;
  qualification: string;
  email: string;
  telephone: string;
  otherLecturers: string;
  semester: string;
  programmeYear: string;
};

export const EMPTY_COURSE_INFO: CourseInfoForm = {
  programmeTitle: PROGRAMME_TITLE,
  courseTitle: "",
  courseCode: "",
  credits: "",
  prerequisites: "",
  courseType: "",
  description: "",
  totalSltHours: undefined,
  instructorName: "",
  instructorTitle: "",
  qualification: "",
  email: "",
  telephone: "",
  otherLecturers: "",
  semester: "",
  programmeYear: "",
};

/** Map the API's Course Information snapshot into the string-based form model. */
export function toCourseInfoForm(data: Record<string, unknown> | undefined): CourseInfoForm {
  const d = (data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? "" : String(v));
  return {
    programmeTitle: str(d.programmeTitle) || PROGRAMME_TITLE,
    courseTitle: str(d.courseTitle),
    courseCode: str(d.courseCode),
    credits: str(d.credits),
    prerequisites: str(d.prerequisites),
    courseType: str(d.courseType),
    description: str(d.description),
    totalSltHours: Object.prototype.hasOwnProperty.call(d, "totalSltHours")
      ? d.totalSltHours == null
        ? null
        : Number(d.totalSltHours)
      : undefined,
    instructorName: str(d.instructorName),
    instructorTitle: str(d.instructorTitle),
    qualification: str(d.qualification),
    email: str(d.email),
    telephone: str(d.telephone),
    otherLecturers: str(d.otherLecturers),
    semester: str(d.semester),
    programmeYear: str(d.programmeYear),
  };
}

/**
 * Convert the form model into the lecturer-editable Course Information payload.
 * Authoritative course, offering, prerequisite, and lecturer-profile data is
 * read-only in Course Specification. This workflow may only persist the synopsis.
 */
export function toCourseInfoPayload(f: CourseInfoForm) {
  const description = f.description.trim();
  return {
    description: description || undefined,
  };
}

/**
 * Course information is a read-only document view except for the synopsis.
 * Course metadata comes from Course Management, offering data from the assigned
 * offering, prerequisite data from curriculum/course management, and lecturer
 * identity/contact data from the lecturer profile.
 */
export function CourseInfoSection({
  value,
  onChange,
}: {
  value: CourseInfoForm;
  onChange: (patch: Partial<CourseInfoForm>) => void;
}) {
  const set = (patch: Partial<CourseInfoForm>) => onChange(patch);

  return (
    <div className="space-y-6">
      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          Course & Programme Information
        </legend>
        <Field label="1. Programme Title" hint="Fixed for this programme.">
          <Input value={value.programmeTitle || PROGRAMME_TITLE} disabled readOnly />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="2. Course Title" hint="Managed in Course Management.">
            <Input value={value.courseTitle} disabled readOnly />
          </Field>
          <Field label="3. Course Code" hint="Managed in Course Management.">
            <Input value={value.courseCode} disabled readOnly />
          </Field>
          <Field label="4. No. of Credits" hint="Managed in Course Management.">
            <Input value={value.credits} disabled readOnly />
          </Field>
          <Field label="11. Course Type" hint="Managed in Course Management.">
            <Input
              value={value.courseType ? courseTypeLabel(value.courseType as (typeof COURSE_TYPES)[number]) : ""}
              disabled
              readOnly
            />
          </Field>
          <Field label="12. Semester" hint="Managed on the course offering.">
            <Input value={value.semester ? semesterLabel(value.semester as (typeof SEMESTERS)[number]) : ""} disabled readOnly />
          </Field>
          <Field label="13. Year" hint="Managed on the course offering.">
            <Input value={value.programmeYear ? `Year ${value.programmeYear}` : ""} disabled readOnly />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Assigned Lecturer</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="6. Course Instructor" hint="From the course's assigned lecturer.">
            <Input value={value.instructorName} disabled readOnly />
          </Field>
          <Field label="7. Qualification" hint="From the lecturer's profile.">
            <Input value={value.qualification} disabled readOnly />
          </Field>
          <Field label="8. Email" hint="From the lecturer's profile.">
            <Input value={value.email} disabled readOnly />
          </Field>
          <Field label="9. Telephone No." hint="From the lecturer's profile.">
            <Input value={value.telephone} disabled readOnly />
          </Field>
        </div>
        <Field label="10. Other Course Lecturer(s) (if any)" hint="Managed on the course offering.">
          <Input value={value.otherLecturers} disabled readOnly />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Course Specification</legend>
        <Field label="5. Pre-requisites (if any)" hint="Managed in curriculum/course management.">
          <Input value={value.prerequisites} disabled readOnly />
        </Field>
        <Field label="14. Course Description / Synopsis">
          <textarea
            className="min-h-[140px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            placeholder="Short synopsis of the course — what it covers, tools used, and what students can do by the end."
            value={value.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
      </fieldset>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </label>
  );
}
