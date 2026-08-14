import { expect, test } from "bun:test";
import { capDomainCounts, capDomainStyle } from "./clo-model";

test("resolves valid C/A/P levels to their learning domains", () => {
  expect(capDomainStyle("C5")?.name).toBe("Cognitive");
  expect(capDomainStyle("A2")?.name).toBe("Affective");
  expect(capDomainStyle("P4")?.name).toBe("Psychomotor");
});

test("treats missing and unknown levels as unclassified", () => {
  expect(capDomainStyle("")).toBeNull();
  expect(capDomainStyle("C7")).toBeNull();
  expect(capDomainStyle("Other")).toBeNull();
});

test("counts the C/A/P distribution without hiding unclassified CLOs", () => {
  expect(capDomainCounts(["C5", "C6", "A3", "P4", ""])).toEqual({
    C: 2,
    A: 1,
    P: 1,
    unclassified: 1,
  });
});
