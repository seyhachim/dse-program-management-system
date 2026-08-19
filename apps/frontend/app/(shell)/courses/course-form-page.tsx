"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateCourseInput, type CourseType } from "@dse-pms/shared-types";
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
import { coursesApi } from "@/lib/courses";
import { CourseFormFields, type CourseFormValues } from "./course-form-fields";

const BACK_HREF = "/courses";

const emptyDefaults: CourseFormValues = {
  code: "",
  title: "",
  description: "",
  prerequisites: "",
};

export function CourseFormPage({ courseId }: { courseId: string | null }) {
  const router = useRouter();
  const editing = courseId !== null;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [credits, setCredits] = useState<string>("");
  const [courseType, setCourseType] = useState<string>("");
  const [totalSltHours, setTotalSltHours] = useState<string>("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(CreateCourseInput),
    defaultValues: emptyDefaults,
  });

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const course = await coursesApi.get(courseId);
        if (cancelled) return;
        reset({
          code: course.code,
          title: course.title,
          description: course.description ?? "",
          prerequisites: course.prerequisites ?? "",
        });
        setCredits(course.credits != null ? String(course.credits) : "");
        setCourseType(course.courseType ?? "");
        setTotalSltHours(course.totalSltHours != null ? String(course.totalSltHours) : "");
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) setNotFound(true);
          else setError(err instanceof ApiError ? err.message : "Failed to load the course");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true);
    setError(null);
    const payload = {
      ...values,
      prerequisites: values.prerequisites?.trim() || undefined,
      credits: credits ? Number(credits) : null,
      courseType: (courseType || null) as CourseType | null,
      totalSltHours: totalSltHours ? Number(totalSltHours) : null,
    };
    try {
      if (courseId) {
        await coursesApi.update(courseId, payload);
        router.push(BACK_HREF);
      } else {
        const created = await coursesApi.create(payload);
        router.push(`/courses/${created.id}/spec/responsible-lecturers`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the course");
    } finally {
      setSaving(false);
    }
  });

  const pageTitle = editing ? "Edit course" : "Add course";

  return (
    <>
      <Topbar title={pageTitle} subtitle="Course code, title, and syllabus details." />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={BACK_HREF}>Course Management</Link>} />
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
              That course could not be found.{" "}
              <Link href={BACK_HREF} className="underline">
                Back to Course Management
              </Link>
            </p>
          ) : (
            <form
              onSubmit={onSubmit}
              className="space-y-6 rounded-xl border border-border bg-card p-6"
            >
              <CourseFormFields
                register={register}
                errors={errors}
                credits={credits}
                onCreditsChange={setCredits}
                totalSltHours={totalSltHours}
                onTotalSltHoursChange={setTotalSltHours}
                courseType={courseType}
                onCourseTypeChange={setCourseType}
              />

              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" render={<Link href={BACK_HREF}>Cancel</Link>} />
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Add course"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
