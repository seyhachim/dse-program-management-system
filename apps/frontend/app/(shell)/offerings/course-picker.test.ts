import { expect, test } from "bun:test";
import type { CourseView } from "@/lib/courses";
import { filterCourses } from "./course-picker";

const courses = [
  { id: "1", code: "AAI302", title: "Machine Learning" },
  { id: "2", code: "PAN202", title: "Data Analytics" },
  { id: "3", code: "MAT201", title: "Applied Mathematics" },
] as unknown as CourseView[];

test("course search matches code and title case-insensitively", () => {
  expect(filterCourses(courses, "aai").map((course) => course.id)).toEqual(["1"]);
  expect(filterCourses(courses, "analytics").map((course) => course.id)).toEqual(["2"]);
  expect(filterCourses(courses, "APPLIED").map((course) => course.id)).toEqual(["3"]);
});

test("course search never changes the source list or selection semantics", () => {
  expect(filterCourses(courses, "")).toEqual(courses);
  expect(filterCourses(courses, "missing")).toEqual([]);
});
