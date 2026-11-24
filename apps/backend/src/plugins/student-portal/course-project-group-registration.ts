import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  CourseProjectGroupPolicyInput,
  CourseProjectGroupProposalSchema,
  type CourseProjectGroupActionInput,
  type CourseProjectGroupProposal,
  type CourseProjectGroupRegistrationView,
  type CourseProjectGroupReviewInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { appendRegisteredAssessmentGroup } from "./group-assessment-results.ts";
import { applyProjectGroupAction, assertProjectGroupMembers } from "./course-project-group-policy.ts";
import { PortalAccessError, PortalConflictError, PortalNotFoundError } from "./service.ts";

type Db = Prisma.TransactionClient;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const active = (p: CourseProjectGroupProposal) => p.status === "draft" || p.status === "submitted";
const keyName = (name: string) => name.trim().toLocaleLowerCase();

async function context(db: Db, offeringId: string, assessmentItemId: string, userId: string, manager: boolean) {
  const offering = await db.offering.findUnique({
    where: { id: offeringId },
    select: { id: true, status: true, lecturerId: true, coLecturers: { select: { lecturerId: true } },
      courseSpec: { select: { id: true, reviewStatus: true, assessmentItems: { where: { id: assessmentItemId, status: "Active" }, select: { id: true, mode: true } } } },
      enrollments: { select: { id: true, student: { select: { name: true, userId: true, email: true, status: true, studentId: true } } }, orderBy: { student: { name: "asc" } } },
    },
  });
  if (!offering) throw new PortalNotFoundError("Offering not found");
  const roster = offering.enrollments.filter((e) => e.student.status === "Active");
  const own = roster.find((e) => e.student.userId === userId && e.student.email);
  // Deliberately only the actual assigned lecturer/co-lecturer; no inherited
  // programme-wide bypass from the legacy group-scoring manager.
  if (manager ? !(offering.lecturerId === userId || offering.coLecturers.some((l) => l.lecturerId === userId)) : !own) throw new PortalAccessError("Not authorized for this offering");
  const assessment = offering.courseSpec?.assessmentItems[0];
  if (!offering.courseSpec || offering.courseSpec.reviewStatus !== "Approved" || !assessment || assessment.mode === "Individual") throw new PortalConflictError("An approved bound Group or Group + Individual assessment is required");
  const scope = { offeringId, courseSpecId: offering.courseSpec.id, assessmentItemId };
  const registration = await db.courseProjectGroupRegistration.findUnique({ where: { offeringId_courseSpecId_assessmentItemId: scope } });
  const groups = await db.assessmentGroup.findMany({ where: scope, select: {
    id: true, name: true, membershipLockedAt: true, publishedAt: true, finalizedAt: true,
    members: { select: { enrollmentId: true, studentNameSnapshot: true } },
    score: { select: { id: true } }, _count: { select: { individualComponents: true } },
  } });
  const legacyResults = await db.assessmentResult.count({ where: { courseSpecId: scope.courseSpecId, assessmentItemId, enrollmentId: { in: offering.enrollments.map((e) => e.id) } } });
  const scoringStarted = offering.status !== "Active" || legacyResults > 0 || groups.some((g) => Boolean(g.membershipLockedAt || g.publishedAt || g.finalizedAt || g.score || g._count.individualComponents));
  const academicEnrollmentIds = new Set(groups.flatMap((g) => g.members.map((m) => m.enrollmentId)));
  const eligibleEnrollmentIds = new Set(roster.map((e) => e.id));
  const policy = registration ? CourseProjectGroupPolicyInput.parse({ enabled: registration.enabled, maxGroups: registration.maxGroups, minMembers: registration.minMembers, maxMembers: registration.maxMembers, deadlineAt: registration.deadlineAt.toISOString() }) : null;
  const proposals = registration ? CourseProjectGroupProposalSchema.array().parse(registration.proposals) : [];
  return { scope, registration, policy, proposals, groups, roster, own, eligibleEnrollmentIds, academicEnrollmentIds, scoringStarted };
}

type Context = Awaited<ReturnType<typeof context>>;
function view(c: Context, manager: boolean): CourseProjectGroupRegistrationView {
  const actor = manager ? null : c.own!.id;
  const registrationOpen = Boolean(c.policy?.enabled && Date.now() < Date.parse(c.policy.deadlineAt) && !c.scoringStarted);
  const ownGroup = c.groups.find((g) => g.members.some((m) => m.enrollmentId === actor));
  // Students see only their own proposals or a pending invitation, never the
  // identity/status of unrelated invitees or a course-wide proposal roster.
  const proposals = manager ? c.proposals : c.proposals.flatMap((p) => {
    if (!active(p)) return [];
    const own = p.members.find((m) => m.enrollmentId === actor);
    if (!own || own.status === "declined") return [];
    if (own.status === "accepted") return [p];
    return [{ ...p, members: p.members.filter((m) => m.enrollmentId === actor || m.enrollmentId === p.leaderEnrollmentId) }];
  });
  const relevant = new Set(proposals.flatMap((p) => p.members.map((m) => m.enrollmentId)));
  const classmates = c.roster.filter((e) => manager || relevant.has(e.id) || (registrationOpen && !ownGroup && !c.academicEnrollmentIds.has(e.id))).map((e) => ({ enrollmentId: e.id, name: e.student.name }));
  return {
    policy: c.policy, registrationOpen, membershipLocked: c.scoringStarted, actorEnrollmentId: actor,
    classmates, proposals,
    officialGroup: ownGroup ? { id: ownGroup.id, name: ownGroup.name, members: ownGroup.members.map((m) => ({ enrollmentId: m.enrollmentId, name: m.studentNameSnapshot })) } : null,
    unassignedCount: c.roster.filter((e) => !c.academicEnrollmentIds.has(e.id)).length, officialGroupCount: c.groups.length,
  };
}

async function lockOffering(tx: Db, offeringId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
}
async function event(tx: Db, registrationId: string, actorId: string, action: string, details: unknown) {
  await tx.courseProjectGroupRegistrationEvent.create({ data: { registrationId, actorId, action, details: json(details) } });
}
function rules(c: Context, policy: CourseProjectGroupPolicyInput) {
  return { policy, now: new Date(), actorEnrollmentId: c.own?.id ?? "", eligibleEnrollmentIds: c.eligibleEnrollmentIds, academicEnrollmentIds: c.academicEnrollmentIds, academicGroupCount: c.groups.length, academicGroupNames: new Set(c.groups.map((g) => keyName(g.name))), scoringStarted: c.scoringStarted };
}

export const courseProjectGroupRegistrationService = {
  async get(offeringId: string, assessmentItemId: string, userId: string, manager: boolean) {
    return view(await context(prisma, offeringId, assessmentItemId, userId, manager), manager);
  },
  async configure(offeringId: string, assessmentItemId: string, userId: string, input: CourseProjectGroupPolicyInput) {
    return prisma.$transaction(async (tx) => {
      await lockOffering(tx, offeringId);
      const c = await context(tx, offeringId, assessmentItemId, userId, true);
      if (input.enabled && (c.scoringStarted || Date.parse(input.deadlineAt) <= Date.now())) throw new PortalConflictError("Registration needs an unlocked active assessment and a future deadline");
      const pending = c.proposals.filter(active);
      if (input.enabled && (c.groups.length + pending.length > input.maxGroups || pending.some((p) => p.members.filter((m) => m.status !== "declined").length > input.maxMembers))) throw new PortalConflictError("The new limits conflict with existing groups or proposals");
      const data = { ...input, deadlineAt: new Date(input.deadlineAt) };
      const row = await tx.courseProjectGroupRegistration.upsert({ where: { offeringId_courseSpecId_assessmentItemId: c.scope }, create: { ...c.scope, ...data, proposals: [] }, update: data });
      await event(tx, row.id, userId, "configure", { previous: c.policy, next: input });
      return view(await context(tx, offeringId, assessmentItemId, userId, true), true);
    });
  },
  async studentAction(offeringId: string, assessmentItemId: string, userId: string, input: CourseProjectGroupActionInput) {
    return prisma.$transaction(async (tx) => {
      await lockOffering(tx, offeringId);
      const c = await context(tx, offeringId, assessmentItemId, userId, false);
      if (!c.registration || !c.policy) throw new PortalConflictError("Registration is not enabled");
      const id = randomUUID();
      const proposals = applyProjectGroupAction(c.proposals, input, rules(c, c.policy), id);
      await tx.courseProjectGroupRegistration.update({ where: { id: c.registration.id }, data: { proposals: json(proposals) } });
      await event(tx, c.registration.id, userId, input.action, { ...input, proposalId: input.action === "create" ? id : input.proposalId, actorEnrollmentId: c.own!.id });
      return view(await context(tx, offeringId, assessmentItemId, userId, false), false);
    });
  },
  async review(offeringId: string, assessmentItemId: string, userId: string, input: CourseProjectGroupReviewInput) {
    return prisma.$transaction(async (tx) => {
      await lockOffering(tx, offeringId);
      const c = await context(tx, offeringId, assessmentItemId, userId, true);
      if (!c.registration || !c.policy || !c.policy.enabled || c.scoringStarted) throw new PortalConflictError("Registration must be enabled and academic membership unlocked");
      const proposal = c.proposals.find((p) => p.id === input.proposalId);
      if (!proposal || proposal.status !== "submitted") throw new PortalConflictError("This proposal is not awaiting review");
      if (input.action === "approve") {
        const ids = assertProjectGroupMembers(proposal, rules(c, c.policy));
        if (c.groups.length >= c.policy.maxGroups || c.groups.some((g) => keyName(g.name) === keyName(proposal.name))) throw new PortalConflictError("Group limit or name conflict");
        if (c.proposals.some((p) => p.id !== proposal.id && active(p) && p.members.some((m) => m.status === "accepted" && ids.includes(m.enrollmentId)))) throw new PortalConflictError("Another proposal contains an accepted member");
        proposal.academicGroupId = await appendRegisteredAssessmentGroup(tx, userId, offeringId, assessmentItemId, { name: proposal.name, enrollmentIds: ids });
        proposal.status = "approved";
        for (const other of c.proposals) if (active(other)) for (const member of other.members) if (ids.includes(member.enrollmentId) && member.status === "pending") member.status = "declined";
      } else {
        proposal.status = "draft";
        proposal.reviewReason = input.reason;
      }
      await tx.courseProjectGroupRegistration.update({ where: { id: c.registration.id }, data: { proposals: json(c.proposals) } });
      await event(tx, c.registration.id, userId, input.action, { ...input, proposal });
      return view(await context(tx, offeringId, assessmentItemId, userId, true), true);
    });
  },
};
