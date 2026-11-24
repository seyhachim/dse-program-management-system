import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { courseProjectGroupRegistrationService as service } from "./course-project-group-registration.ts";
import { groupAssessmentService } from "./group-assessment-results.ts";
import { PortalAccessError, PortalConflictError } from "./service.ts";

const dbDescribe = process.env.COURSE_PROJECT_GROUP_DB_TESTS === "1" ? describe : describe.skip;
process.env.JWT_SECRET ??= "issue-1351-course-project-groups-test-secret-32-characters";

dbDescribe("course project group registration database integrity", () => {
  afterAll(async () => { await prisma.$disconnect(); });
  test("student invitation consent, section isolation, transactional approval and immutable audit", async () => {
    const suffix = randomUUID();
    const programme = await prisma.programme.findFirstOrThrow({ select: { id: true } });
    const lecturer = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const course = await prisma.course.create({ data: { code: "I1351-" + suffix, title: "Synthetic project registration", programmeId: programme.id, lecturerId: lecturer.id } });
    const draft = await prisma.courseSpec.create({ data: { courseId: course.id } });
    const assessment = await prisma.courseSpecAssessmentItem.create({ data: { courseSpecId: draft.id, order: 0, name: "Synthetic group project", type: "Project", mode: "Group", status: "Active" } });
    await prisma.courseSpec.update({ where: { id: draft.id }, data: { reviewStatus: "Approved", submissionVersion: 1, approvedAt: new Date() } });
    const offering = await prisma.offering.create({ data: { courseId: course.id, courseSpecId: draft.id, lecturerId: lecturer.id, sectionCode: "M1", term: "1351-" + suffix, capacity: 10, status: "Active" } });
    const otherOffering = await prisma.offering.create({ data: { courseId: course.id, courseSpecId: draft.id, lecturerId: lecturer.id, sectionCode: "M2", term: "1351-" + suffix, capacity: 10, status: "Active" } });
    async function student(label: string, offeringId: string) {
      const email = `i1351-${label}-${suffix}@dse.invalid`;
      const user = await prisma.user.create({ data: { name: "Test " + label, email } });
      const profile = await prisma.student.create({ data: { name: "Test " + label, email, studentId: `I1351-${label}-${suffix}`, userId: user.id, status: "Active" } });
      const enrollment = await prisma.enrollment.create({ data: { offeringId, studentId: profile.id } });
      return { userId: user.id, enrollmentId: enrollment.id, email };
    }
    const a = await student("A", offering.id);
    const b = await student("B", offering.id);
    const c = await student("C", offering.id);
    const outsider = await student("D", otherOffering.id);
    const policy = { enabled: true, maxGroups: 2, minMembers: 2, maxMembers: 3, deadlineAt: new Date(Date.now() + 86_400_000).toISOString() };
    expect((await service.get(offering.id, assessment.id, a.userId, false)).policy).toBeNull();
    await expect(service.configure(offering.id, assessment.id, outsider.userId, policy)).rejects.toBeInstanceOf(PortalAccessError);
    await expect(service.get(offering.id, assessment.id, outsider.userId, false)).rejects.toBeInstanceOf(PortalAccessError);
    await service.configure(offering.id, assessment.id, lecturer.id, policy);
    const created = await service.studentAction(offering.id, assessment.id, a.userId, { action: "create", name: "Rainfall" });
    const id = created.proposals[0]!.id;
    await expect(service.studentAction(offering.id, assessment.id, a.userId, { action: "invite", proposalId: id, enrollmentId: outsider.enrollmentId })).rejects.toThrow();
    await service.studentAction(offering.id, assessment.id, a.userId, { action: "invite", proposalId: id, enrollmentId: b.enrollmentId });
    const bView = await service.get(offering.id, assessment.id, b.userId, false);
    expect(bView.proposals[0]?.members).toHaveLength(2);
    expect(JSON.stringify(bView)).not.toContain(a.email);
    expect((await service.get(offering.id, assessment.id, c.userId, false)).proposals).toEqual([]);
    await expect(service.studentAction(offering.id, assessment.id, c.userId, { action: "accept", proposalId: id })).rejects.toThrow();
    await expect(service.studentAction(offering.id, assessment.id, a.userId, { action: "submit", proposalId: id })).rejects.toThrow();
    const race = await Promise.allSettled([
      service.studentAction(offering.id, assessment.id, b.userId, { action: "accept", proposalId: id }),
      service.studentAction(offering.id, assessment.id, b.userId, { action: "accept", proposalId: id }),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await service.studentAction(offering.id, assessment.id, a.userId, { action: "submit", proposalId: id });
    expect(await prisma.assessmentGroup.count({ where: { offeringId: offering.id } })).toBe(0);
    await expect(groupAssessmentService.replaceGroups(lecturer.id, false, offering.id, assessment.id, { groups: [{ id: randomUUID(), name: "Manual", enrollmentIds: [a.enrollmentId] }] })).rejects.toBeInstanceOf(PortalConflictError);
    await expect(service.review(offering.id, assessment.id, b.userId, { action: "approve", proposalId: id })).rejects.toBeInstanceOf(PortalAccessError);
    const approvals = await Promise.allSettled([
      service.review(offering.id, assessment.id, lecturer.id, { action: "approve", proposalId: id }),
      service.review(offering.id, assessment.id, lecturer.id, { action: "approve", proposalId: id }),
    ]);
    expect(approvals.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const official = await prisma.assessmentGroup.findMany({ where: { offeringId: offering.id }, include: { members: true } });
    expect(official).toHaveLength(1);
    expect(official[0]!.members.map((m) => m.enrollmentId).sort()).toEqual([a.enrollmentId, b.enrollmentId].sort());
    expect((await service.get(offering.id, assessment.id, b.userId, false)).officialGroup?.id).toBe(official[0]!.id);
    expect(await prisma.assessmentResult.count({ where: { enrollmentId: { in: [a.enrollmentId, b.enrollmentId, c.enrollmentId] } } })).toBe(0);
    const registration = await prisma.courseProjectGroupRegistration.findFirstOrThrow({ where: { offeringId: offering.id } });
    const event = await prisma.courseProjectGroupRegistrationEvent.findFirstOrThrow({ where: { registrationId: registration.id, action: "approve" } });
    await expect(prisma.courseProjectGroupRegistrationEvent.update({ where: { id: event.id }, data: { action: "rewrite" } })).rejects.toThrow(/append-only/i);
    await expect(prisma.courseProjectGroupRegistrationEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/i);
    await service.configure(offering.id, assessment.id, lecturer.id, { ...policy, enabled: false });
    await expect(service.studentAction(offering.id, assessment.id, c.userId, { action: "create", name: "Late" })).rejects.toThrow();
    // Append-only academic/registration evidence intentionally remains only in the isolated CI database.
  });
});
