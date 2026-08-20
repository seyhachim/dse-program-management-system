import { expect, test } from "bun:test";
import { getNavRoutes } from "./nav";

test("Rubric Bank is visible only to programme leadership", () => {
  const admin = getNavRoutes(["admin"]).find((route) => route.path === "/rubric-bank");
  const coordinator = getNavRoutes(["program_coordinator"]).find((route) => route.path === "/rubric-bank");
  const lecturer = getNavRoutes(["lecturer"]).find((route) => route.path === "/rubric-bank");
  const student = getNavRoutes(["student"]).find((route) => route.path === "/rubric-bank");

  expect(admin?.label).toBe("Rubric Bank");
  expect(coordinator?.label).toBe("Rubric Bank");
  expect(lecturer).toBeUndefined();
  expect(student).toBeUndefined();
});

test("Rating Scales management is visible only to Admin and Programme Coordinator", () => {
  const path = "/programme-settings/rating-scales";
  expect(getNavRoutes(["admin"]).find((route) => route.path === path)?.label).toBe("Rating Scales");
  expect(getNavRoutes(["program_coordinator"]).find((route) => route.path === path)?.label).toBe("Rating Scales");
  expect(getNavRoutes(["lecturer"]).find((route) => route.path === path)).toBeUndefined();
  expect(getNavRoutes(["program_secretary"]).find((route) => route.path === path)).toBeUndefined();
  expect(getNavRoutes(["qa_reviewer"]).find((route) => route.path === path)).toBeUndefined();
});
