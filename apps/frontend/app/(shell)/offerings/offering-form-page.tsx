"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateOfferingInput,
  type Lecturer,
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
} from "@dse-pms/ui";
import { Topbar } from "../topbar";
import { ApiError } from "@/lib/api";
import { coursesApi, type CourseView } from "@/lib/courses";
import { lecturersApi } from "@/lib/lecturers";
import { offeringsApi } from "@/lib/offerings";
import { OfferingFormFields, type OfferingFormValues } from "./offering-form-fields";

const BACK_HREF = "/offerings";

const emptyDefaults: OfferingFormValues = {
  courseId: "",
  term: "",
  sectionCode: "A",
  meetings: [],
  lecturerId: null,
  coLecturerIds: [],
  capacity: 30,
  status: "Planned",
  otherLecturers: "",
};

export function OfferingFormPage({ offeringId }: { offeringId: string | null }) {
  const router = useRouter();
  const editing = offeringId !== null;

  const [courses, setCourses] = useState<CourseView[]>([]);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // §12 Course Availability — plain local state so an empty choice submits as null.
  const [semester, setSemester] = useState<string>("");
  const [programmeYear, setProgrammeYear] = useState<string>("");
  // Delivery calendar dates are optional as a pair; empty strings map to null.
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OfferingFormValues>({
    resolver: zodResolver(CreateOfferingInput),
    defaultValues: emptyDefaults,
  });
  const lecturerId = useWatch({ control, name: "lecturerId" }) ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [courseList, lecturerList, offering] = await Promise.all([
          coursesApi.list(),
          lecturersApi.list(),
          offeringId ? offeringsApi.get(offeringId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCourses(courseList);
        setLecturers(lecturerList);
        if (offeringId && !offering) {
          setNotFound(true);
        } else if (offering) {
          reset({
            courseId: offering.course?.id ?? "",
            term: offering.term,
            sectionCode: offering.sectionCode,
            meetings: offering.meetings.map(({ id: _id, durationHours: _durationHours, room, ...meeting }) => ({
              ...meeting,
              room: room ?? "",
            })),
            lecturerId: offering.lecturer?.id ?? null,
            coLecturerIds: offering.coLecturers.map((l) => l.id),
            capacity: offering.capacity,
            status: offering.status,
            otherLecturers: offering.otherLecturers ?? "",
          });
          setSemester(offering.semester ?? "");
          setProgrammeYear(offering.programmeYear != null ? String(offering.programmeYear) : "");
          setStartDate(offering.startDate ?? "");
          setEndDate(offering.endDate ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load the offering");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offeringId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true);
    setError(null);
    const payload = {
      ...values,
      lecturerId: values.lecturerId || null,
      coLecturerIds: values.coLecturerIds ?? [],
      semester: (semester || null) as Semester | null,
      programmeYear: programmeYear ? Number(programmeYear) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      otherLecturers: values.otherLecturers?.trim() || undefined,
    };
    const parsed = CreateOfferingInput.safeParse(payload);
    if (!parsed.success) {
      const dateIssue = parsed.error.issues.find(
        (issue) => issue.path[0] === "startDate" || issue.path[0] === "endDate",
      );
      setError(dateIssue?.message ?? "Check the offering details and try again");
      setSaving(false);
      return;
    }
    try {
      if (offeringId) {
        const { courseId: _courseId, ...rest } = parsed.data;
        await offeringsApi.update(offeringId, rest);
      } else {
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

  return (
    <>
      <Topbar
        title={pageTitle}
        subtitle="A course delivered in a term, with teaching dates, lecturer, timetable, and seat capacity."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={BACK_HREF}>Course Offerings</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {error ? (
            <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
              {error}
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : notFound ? (
            <p className="text-sm text-muted-foreground">
              That offering could not be found.{" "}
              <Link href={BACK_HREF} className="underline">
                Back to Course Offerings
              </Link>
            </p>
          ) : (
            <form
              onSubmit={onSubmit}
              className="space-y-6 rounded-xl border border-border bg-card p-6"
            >
              <OfferingFormFields
                control={control}
                register={register}
                errors={errors}
                courses={courses}
                lecturers={lecturers}
                lecturerId={lecturerId}
                courseLocked={editing}
                semester={semester}
                onSemesterChange={setSemester}
                programmeYear={programmeYear}
                onProgrammeYearChange={setProgrammeYear}
                startDate={startDate}
                onStartDateChange={setStartDate}
                endDate={endDate}
                onEndDateChange={setEndDate}
              />

              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" render={<Link href={BACK_HREF}>Cancel</Link>} />
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Add offering"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>
    </>
  );
}