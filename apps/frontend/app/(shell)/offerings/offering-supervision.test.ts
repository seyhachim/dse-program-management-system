import { describe, expect, it } from "vitest";
import type { OfferingView } from "@dse-pms/shared-types";
import type { OfferingGroup } from "@/lib/offering-groups";
import {
  groupTeachingTeam,
  isSupervisionOfferingGroup,
  offeringTeachingTeam,
} from "./offering-supervision";

const lecturer = (id: string, name: string) => ({ id, name });

function makeOffering(overrides: Partial<OfferingView> = {}): OfferingView {
  return {
    id: "offering-1",
    courseId: "course-1",
    lecturerId: "lecturer-1",
    term: "2026-2027-S1",
    capacity: 9,
    status: "Planned",
    programmeYear: 4,
    semester: "First",
    otherLecturers: null,
    sectionCode: "E1-A",
    startDate: null,
    endDate: null,
    courseSpecId: null,
    academicCalendarPeriodId: null,
    course: { id: "course-1", code: "FPR401", title: "Final Project I: Data Science and AI" },
    lecturer: lecturer("lecturer-1", "Heng Chanarin"),
    coLecturers: [],
    meetings: [],
    enrolledCount: 0,
    ...overrides,
  } as OfferingView;
}

function makeGroup(offerings: OfferingView[]): OfferingGroup {
  return {
    id: "FPR401::2026-2027-S1",
    course: offerings[0]?.course ?? null,
    term: "2026-2027-S1",
    offerings,
  } as OfferingGroup;
}

describe("final project supervision offering helpers", () => {
  it("classifies FPR courses as supervision offerings", () => {
    expect(isSupervisionOfferingGroup(makeGroup([makeOffering()]))).toBe(true);
  });

  it("keeps the primary and co-lecturers as one teaching team", () => {
    const offering = makeOffering({
      coLecturers: [
        lecturer("lecturer-2", "Chim Seyha"),
        lecturer("lecturer-3", "Chap Chanpiseth"),
      ],
    });

    expect(offeringTeachingTeam(offering).map((member) => member.name)).toEqual([
      "Heng Chanarin",
      "Chim Seyha",
      "Chap Chanpiseth",
    ]);
  });

  it("deduplicates supervisors across separate supervision groups", () => {
    const group = makeGroup([
      makeOffering(),
      makeOffering({
        id: "offering-2",
        sectionCode: "E1-B",
        lecturerId: "lecturer-2",
        lecturer: lecturer("lecturer-2", "Chim Seyha"),
      }),
      makeOffering({
        id: "offering-3",
        sectionCode: "E1-C",
        lecturerId: "lecturer-3",
        lecturer: lecturer("lecturer-3", "Chap Chanpiseth"),
      }),
    ]);

    expect(groupTeachingTeam(group).map((member) => member.name)).toEqual([
      "Heng Chanarin",
      "Chim Seyha",
      "Chap Chanpiseth",
    ]);
  });
});
