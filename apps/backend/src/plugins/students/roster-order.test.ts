import { describe, expect, test } from "bun:test";
import {
  StudentRosterCursorNotFoundError,
  pageStudentRosterRows,
  sortStudentRosterRows,
  type StudentRosterOrderProfile,
} from "./roster-order.ts";

function row(
  id: string,
  profile: Partial<StudentRosterOrderProfile>,
  name = id,
) {
  return {
    id,
    name,
    profile: {
      khmerFamilyName: null,
      khmerGivenName: null,
      latinFamilyName: null,
      latinGivenName: null,
      ...profile,
    },
  };
}

describe("Khmer student roster ordering", () => {
  test("sorts by Khmer family name before Khmer given name", () => {
    const rows = [
      row("3", {
        khmerFamilyName: "គង់",
        khmerGivenName: "តារា",
        latinFamilyName: "Kong",
        latinGivenName: "Tara",
      }),
      row("2", {
        khmerFamilyName: "ខាន់",
        khmerGivenName: "ឧត្តម",
        latinFamilyName: "Khann",
        latinGivenName: "Udom",
      }),
      row("1", {
        khmerFamilyName: "កែវ",
        khmerGivenName: "សិលា",
        latinFamilyName: "Keo",
        latinGivenName: "Sela",
      }),
    ];

    expect(sortStudentRosterRows(rows).map((student) => student.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  test("uses Khmer given name as the secondary key", () => {
    const rows = [
      row("later", {
        khmerFamilyName: "កែវ",
        khmerGivenName: "ខ",
        latinFamilyName: "Keo",
        latinGivenName: "Later",
      }),
      row("earlier", {
        khmerFamilyName: "កែវ",
        khmerGivenName: "ក",
        latinFamilyName: "Keo",
        latinGivenName: "Earlier",
      }),
    ];

    expect(sortStudentRosterRows(rows).map((student) => student.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  test("ignores zero-width formatting marks while sorting Khmer names", () => {
    const rows = [
      row("second", {
        khmerFamilyName: "ខាន់",
        khmerGivenName: "ឧត្តម",
      }),
      row("first", {
        khmerFamilyName: "កែវ\u200B",
        khmerGivenName: "សិលា",
      }),
    ];

    expect(sortStudentRosterRows(rows).map((student) => student.id)).toEqual([
      "first",
      "second",
    ]);
  });

  test("puts students without Khmer names last and sorts them by Latin name", () => {
    const rows = [
      row("latin-z", {
        latinFamilyName: "Zed",
        latinGivenName: "Student",
      }),
      row("khmer", {
        khmerFamilyName: "កែវ",
        khmerGivenName: "សិលា",
        latinFamilyName: "Keo",
        latinGivenName: "Sela",
      }),
      row("latin-a", {
        latinFamilyName: "Alpha",
        latinGivenName: "Student",
      }),
    ];

    expect(sortStudentRosterRows(rows).map((student) => student.id)).toEqual([
      "khmer",
      "latin-a",
      "latin-z",
    ]);
  });

  test("paginates the globally sorted roster without duplicates", () => {
    const rows = [
      row("4", { khmerFamilyName: "ឃ", khmerGivenName: "ក" }),
      row("2", { khmerFamilyName: "ខ", khmerGivenName: "ក" }),
      row("3", { khmerFamilyName: "គ", khmerGivenName: "ក" }),
      row("1", { khmerFamilyName: "ក", khmerGivenName: "ក" }),
    ];

    const first = pageStudentRosterRows(rows, 2, null);
    expect(first.items.map((student) => student.id)).toEqual(["1", "2"]);
    expect(first.hasNextPage).toBe(true);

    const second = pageStudentRosterRows(rows, 2, first.items[1]!.id);
    expect(second.items.map((student) => student.id)).toEqual(["3", "4"]);
    expect(second.hasNextPage).toBe(false);
  });

  test("fails closed when a cursor no longer exists in the filtered roster", () => {
    const rows = [row("1", { khmerFamilyName: "ក", khmerGivenName: "ក" })];

    expect(() => pageStudentRosterRows(rows, 50, "missing")).toThrow(
      StudentRosterCursorNotFoundError,
    );
  });
});
