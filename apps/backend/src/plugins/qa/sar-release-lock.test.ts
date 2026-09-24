import { describe, expect, test } from "bun:test";
import type { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import {
  lockQaSarBookFinalizationSources,
  lockQaSarReleaseVersion,
  QA_SAR_RELEASE_VERSION_LOCK_PREFIX,
} from "./sar-release-lock.ts";

function fakeTx(calls: unknown[]): Prisma.TransactionClient {
  return {
    $executeRaw: async (query: unknown) => {
      calls.push(query);
      return 0;
    },
  } as unknown as Prisma.TransactionClient;
}

describe("SAR release locking", () => {
  test("uses one cycle-scoped advisory namespace for all QaSarRelease version allocation", async () => {
    const calls: any[] = [];
    await lockQaSarReleaseVersion(fakeTx(calls), "cycle-123");
    expect(calls).toHaveLength(1);
    expect(calls[0].values).toEqual([`${QA_SAR_RELEASE_VERSION_LOCK_PREFIX}cycle-123`]);
  });

  test("freezes canonical full-book sources against mutation while finalizing", async () => {
    const calls: any[] = [];
    await lockQaSarBookFinalizationSources(fakeTx(calls));
    expect(calls).toHaveLength(1);
    const sql = calls[0].strings.join(" ");
    for (const table of [
      "QaSarSection",
      "QaSarSubmission",
      "QaSarReview",
      "QaEvidence",
      "QaEvidenceMapping",
      "QaImprovementAction",
      "QaSarBookSectionRevision",
      "QaSarBookSectionReview",
      "QaSarBookRequirementRatingRevision",
      "QaSarBookCriterionRatingRevision",
      "QaSarBookSectionEvidenceReference",
      "QaSarBookEvidencePresentation",
    ]) {
      expect(sql).toContain(`"${table}"`);
    }
    expect(sql).toContain("IN SHARE MODE");
  });

  test("full-book finalizer locks sources before building and validating the release", () => {
    const source = readFileSync(new URL("./sar-book/release-service.ts", import.meta.url), "utf8");
    const versionLock = source.indexOf("lockQaSarReleaseVersion(tx, cycleId)");
    const sourceLock = source.indexOf("lockQaSarBookFinalizationSources(tx)");
    const build = source.indexOf('buildQaSarBookDocument(programmeId, cycleId, "official")');
    const validate = source.indexOf("assertQaSarBookFinalizable(source)");
    const insert = source.indexOf("tx.qaSarRelease.create");
    expect(versionLock).toBeGreaterThan(-1);
    expect(sourceLock).toBeGreaterThan(versionLock);
    expect(build).toBeGreaterThan(sourceLock);
    expect(validate).toBeGreaterThan(build);
    expect(insert).toBeGreaterThan(validate);
  });

  test("legacy finalizer shares the same version lock before max-version allocation", () => {
    const source = readFileSync(new URL("./sar-document/service.ts", import.meta.url), "utf8");
    const lock = source.indexOf("lockQaSarReleaseVersion(tx, cycleId)");
    const latest = source.indexOf("tx.qaSarRelease.findFirst");
    const insert = source.indexOf("tx.qaSarRelease.create");
    expect(lock).toBeGreaterThan(-1);
    expect(latest).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(latest);
  });
});
