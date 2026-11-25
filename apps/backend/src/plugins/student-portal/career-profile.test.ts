import { describe, expect, test } from "bun:test";
import { EMPTY_STUDENT_CAREER_PROFILE, StudentCareerProfileSchema, matchCareerOpportunity } from "@dse-pms/shared-types";

describe("private student career preferences", () => {
  test("empty preferences are valid and produce no suggestion", () => {
    expect(StudentCareerProfileSchema.parse(EMPTY_STUDENT_CAREER_PROFILE)).toEqual(EMPTY_STUDENT_CAREER_PROFILE);
    expect(matchCareerOpportunity(EMPTY_STUDENT_CAREER_PROFILE, {type:"hackathon",title:"AI hackathon",summary:"Machine learning"})).toEqual([]);
  });
  test("matches explicit interests and opportunity types", () => {
    const profile = StudentCareerProfileSchema.parse({...EMPTY_STUDENT_CAREER_PROFILE,interests:["Machine Learning (ML)","Machine Learning (ML)"],opportunityInterests:["hackathon"]});
    expect(profile.interests).toEqual(["Machine Learning (ML)"]);
    expect(matchCareerOpportunity(profile,{type:"hackathon",title:"Machine learning challenge",summary:"Build a model"})).toEqual(["Machine Learning (ML)","hackathon"]);
    expect(matchCareerOpportunity(profile,{type:"exchange",title:"History exchange",summary:"Study abroad"})).toEqual([]);
  });
  test("rejects invalid fields and contradictory unknown interests", () => {
    for (const patch of [{interests:["unknown"]},{interests:["Not sure yet","Web Development"]},{role:"admin"},{studentId:"other"},{programmingLevel:"expert"}]) {
      expect(StudentCareerProfileSchema.safeParse({...EMPTY_STUDENT_CAREER_PROFILE,...patch}).success).toBe(false);
    }
  });
});
