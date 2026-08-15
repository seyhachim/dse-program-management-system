"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { type Rubric } from "@dse-pms/shared-types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Input,
  StatusBadge,
} from "@dse-pms/ui";
import { Topbar } from "../../../../../topbar";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { coursesApi, type CourseView } from "@/lib/courses";
import { rubricsApi, rubricStatusTone, typeChipClass } from "@/lib/rubrics";

export function RubricLibraryPage({ courseId }: { courseId: string }) {
  const router = useRouter();
  const { me } = useMe();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [rows, setRows] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const base = `/courses/${courseId}/spec/assessment/rubrics`;
  const assessmentHref = `/courses/${courseId}/spec?tab=assessmentPlan`;
  const canWrite = me?.permissions.includes("rubrics:write") ?? false;

  useEffect(() => {
    coursesApi.get(courseId).then(setCourse).catch(() => setCourse(null));
  }, [courseId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await rubricsApi.list({ search }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load rubrics");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(load, 200);
    return () => clearTimeout(timeout);
  }, [load]);

  const handleDelete = async (rubric: Rubric) => {
    if (!confirm(`Delete "${rubric.name}"? This cannot be undone.`)) return;
    try {
      await rubricsApi.remove(rubric.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete rubric");
    }
  };

  const copyPublicLink = async (rubricId: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/rubrics/${rubricId}`);
    setCopiedId(rubricId);
    window.setTimeout(() => setCopiedId((current) => (current === rubricId ? null : current)), 1800);
  };

  const openRubric = (rubricId: string) => router.push(`${base}/${rubricId}`);
  const breadcrumbLabel = course ? `${course.code} – ${course.title}` : "Course Specification";

  return (
    <>
      <Topbar
        title="Rubric Bank"
        subtitle="Browse reusable assessment rubrics. Active rubrics can also be shared publicly."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[1500px] space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/courses">Course Management</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={assessmentHref}>Course Specification</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={assessmentHref}>Assessment</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Rubric Bank</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search rubrics…"
                className="pl-9"
              />
            </div>
            {canWrite ? (
              <Button render={<Link href={`${base}/new`}><Plus className="h-4 w-4" />Create Rubric</Link>} />
            ) : null}
          </div>

          {error ? (
            <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
              {error}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/25 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Rubric</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-center">Criteria</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      {canWrite ? "No rubrics yet. Create the first rubric." : "No rubrics are available."}
                    </td>
                  </tr>
                ) : (
                  rows.map((rubric) => (
                    <tr
                      key={rubric.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => openRubric(rubric.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openRubric(rubric.id);
                        }
                      }}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`${base}/${rubric.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium text-foreground hover:underline"
                        >
                          {rubric.name}
                        </Link>
                        {rubric.description ? (
                          <div className="mt-1 line-clamp-1 max-w-xl text-xs text-muted-foreground">
                            {rubric.description}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${typeChipClass(rubric.type)}`}>
                          {rubric.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-foreground">
                        {rubric.criteria.length}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(rubric.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={rubricStatusTone(rubric.status)} label={rubric.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Link
                            href={`${base}/${rubric.id}`}
                            aria-label={`View ${rubric.name}`}
                            title="View rubric"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {rubric.status === "Active" ? (
                            <>
                              <Link
                                href={`/rubrics/${rubric.id}`}
                                aria-label={`View public page for ${rubric.name}`}
                                title="View public page"
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => copyPublicLink(rubric.id)}
                                aria-label={`Copy public link for ${rubric.name}`}
                                title={copiedId === rubric.id ? "Public link copied" : "Copy public link"}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                {copiedId === rubric.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              </button>
                            </>
                          ) : null}
                          {canWrite ? (
                            <>
                              <Link
                                href={`${base}/${rubric.id}/edit`}
                                aria-label={`Edit ${rubric.name}`}
                                title="Edit rubric"
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleDelete(rubric)}
                                aria-label={`Delete ${rubric.name}`}
                                title="Delete rubric"
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-status-live-bg hover:text-status-live"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Active rubrics are public: use the public-page or copy-link actions to share them with students, QA reviewers, or external stakeholders. Draft and Archived rubrics remain private.
          </p>
        </div>
      </main>
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
