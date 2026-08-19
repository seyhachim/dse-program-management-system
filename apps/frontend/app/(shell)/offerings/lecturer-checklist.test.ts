import { expect, test } from "bun:test";
import type { Lecturer } from "@dse-pms/shared-types";
import { filterLecturerOptions } from "./lecturer-checklist";

const lecturers = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Chim Seyha",
    email: "chim.seyha@rupp.edu.kh",
    title: "Lecturer",
    qualification: "MSc",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Tieng Kimseng",
    email: "tieng.kimseng@rupp.edu.kh",
    title: "Assistant Professor",
    qualification: "PhD",
  },
] as Lecturer[];

test("co-lecturer search matches name, email, and academic position case-insensitively", () => {
  expect(filterLecturerOptions(lecturers, "seyha").map((l) => l.name)).toEqual(["Chim Seyha"]);
  expect(filterLecturerOptions(lecturers, "KIMSENG@RUPP").map((l) => l.name)).toEqual(["Tieng Kimseng"]);
  expect(filterLecturerOptions(lecturers, "assistant professor").map((l) => l.name)).toEqual(["Tieng Kimseng"]);
});

test("blank co-lecturer search keeps all options and no-match returns none", () => {
  expect(filterLecturerOptions(lecturers, "   ")).toEqual(lecturers);
  expect(filterLecturerOptions(lecturers, "not-a-lecturer")).toEqual([]);
});
