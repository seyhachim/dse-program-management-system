"use client";

import { useMemo, useState } from "react";
import { Input } from "@dse-pms/ui";
import type { CourseView } from "@/lib/courses";

export function filterCourses(courses: CourseView[], query: string): CourseView[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return courses;
  return courses.filter((course) =>
    `${course.code} ${course.title}`.toLowerCase().includes(normalized),
  );
}

export function CoursePicker({
  courses,
  selectedId,
  onChange,
  disabled = false,
}: {
  courses: CourseView[];
  selectedId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filteredCourses = useMemo(() => filterCourses(courses, query), [courses, query]);
  const selectedCourse = courses.find((course) => course.id === selectedId) ?? null;

  if (disabled) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
        {selectedCourse ? `${selectedCourse.code} — ${selectedCourse.title}` : "No course selected"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search course code or title…"
        aria-label="Search courses"
      />

      {selectedCourse ? (
        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{selectedCourse.code} — {selectedCourse.title}</span>
        </div>
      ) : null}

      {filteredCourses.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          No courses match “{query.trim()}”.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2">
          {filteredCourses.map((course) => (
            <li key={course.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                <input
                  type="radio"
                  name="offering-course"
                  className="mt-0.5 h-4 w-4 border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  checked={selectedId === course.id}
                  onChange={() => onChange(course.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{course.code}</span>
                  <span className="block text-xs text-muted-foreground">{course.title}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
