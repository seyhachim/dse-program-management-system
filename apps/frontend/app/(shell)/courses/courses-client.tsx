"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { courseTypeLabel } from "@dse-pms/shared-types";
import { DataTable, TableToolbar, type DataTableColumn } from "@dse-pms/ui";
import { coursesApi, type CourseView } from "@/lib/courses";
import { authApi } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export function CoursesClient() {
  const router = useRouter();
  const [rows, setRows] = useState<CourseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await coursesApi.list(search));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  // Creating/editing/deleting a course record is admin-only (courses:manage);
  // lecturers only fill in the spec of their assigned courses via "Syllabus".
  useEffect(() => {
    authApi
      .me()
      .then((me) => setIsAdmin(me.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  const handleDelete = async (course: CourseView) => {
    if (!confirm(`Delete ${course.code}?`)) return;
    try {
      await coursesApi.remove(course.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete course");
    }
  };

  const columns: DataTableColumn<CourseView>[] = [
    { key: "code", header: "Code", render: (c) => <span className="font-medium">{c.code}</span> },
    { key: "title", header: "Title", render: (c) => c.title },
    {
      key: "credits",
      header: "Credits",
      render: (c) =>
        c.credits != null ? c.credits : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "totalSltHours",
      header: "Total SLT",
      render: (c) =>
        c.totalSltHours != null ? (
          `${c.totalSltHours} h`
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "courseType",
      header: "Type",
      render: (c) =>
        c.courseType ? (
          courseTypeLabel(c.courseType)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search courses…"
        addLabel={isAdmin ? "Add Course" : undefined}
        onAdd={isAdmin ? () => router.push("/courses/new") : undefined}
      />

      {error ? (
        <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
          {error}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(c) => c.id}
        dragHandle
        actions={[
          {
            key: "syllabus",
            label: "Syllabus",
            icon: <FileText className="mr-1 h-3.5 w-3.5" />,
            onClick: (c) => router.push(`/courses/${c.id}/spec`),
          },
        ]}
        onEdit={isAdmin ? (c) => router.push(`/courses/${c.id}/edit`) : undefined}
        onDelete={isAdmin ? handleDelete : undefined}
        loading={loading}
        emptyMessage={
          isAdmin ? "No courses yet. Add your first course." : "No courses are assigned to you yet."
        }
      />
    </div>
  );
}
