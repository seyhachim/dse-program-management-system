import { expect, test } from "bun:test";
import {
  StudentPluginStarterQuery,
  StudentPluginStarterWelcome,
  studentPluginStarterManifest,
} from "./student-plugin-starter.ts";

test("student plugin starter metadata uses an isolated plugin namespace", () => {
  expect(studentPluginStarterManifest.id).toBe("student-plugin-starter");
  expect(studentPluginStarterManifest.permissions).toEqual(["student-plugin-starter:read"]);
  expect(studentPluginStarterManifest.routes?.[0]?.roles).toEqual([
    "student",
    "lecturer",
    "program_coordinator",
    "admin",
  ]);
});

test("query requires a bounded explicit programme identifier", () => {
  expect(StudentPluginStarterQuery.parse({ programmeId: " dse " })).toEqual({ programmeId: "dse" });
  for (const query of [{}, { programmeId: "" }, { programmeId: "   " }, { programmeId: "a".repeat(81) }, { programmeId: "dse", role: "admin" }]) {
    expect(StudentPluginStarterQuery.safeParse(query).success).toBe(false);
  }
});

test("response rejects unexpected fields and missing values", () => {
  const response = { programmeId: "dse", title: "Student Plugin Starter", message: "Fictional only" };
  expect(StudentPluginStarterWelcome.safeParse(response).success).toBe(true);
  expect(StudentPluginStarterWelcome.safeParse({ ...response, secret: "unwanted" }).success).toBe(false);
});
