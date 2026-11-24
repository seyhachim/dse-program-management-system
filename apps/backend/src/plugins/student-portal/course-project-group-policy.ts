import type {
  CourseProjectGroupActionInput,
  CourseProjectGroupPolicyInput,
  CourseProjectGroupProposal,
} from "@dse-pms/shared-types";

export class ProjectGroupPolicyError extends Error {}

type Context = {
  policy: CourseProjectGroupPolicyInput;
  now: Date;
  actorEnrollmentId: string;
  /** Server-derived active enrollments in the exact offering; never client input. */
  eligibleEnrollmentIds: ReadonlySet<string>;
  /** Existing canonical memberships (including lecturer-created groups). */
  academicEnrollmentIds: ReadonlySet<string>;
  academicGroupCount: number;
  academicGroupNames: ReadonlySet<string>;
  scoringStarted: boolean;
};

function fail(message: string): never { throw new ProjectGroupPolicyError(message); }
const active = (proposal: CourseProjectGroupProposal) => proposal.status === "draft" || proposal.status === "submitted";
const accepted = (proposal: CourseProjectGroupProposal, id: string) =>
  proposal.members.some((member) => member.enrollmentId === id && member.status === "accepted");
const key = (name: string) => name.trim().toLocaleLowerCase();

export function assertProjectGroupRegistrationOpen(context: Context) {
  if (!context.policy.enabled || context.now.getTime() >= Date.parse(context.policy.deadlineAt)) fail("Registration is closed");
  if (context.scoringStarted) fail("Assessment group membership is locked");
  if (!context.eligibleEnrollmentIds.has(context.actorEnrollmentId)) fail("You are not eligible for this offering");
}

/** Pure proposal transition. Caller must reload authoritative context and state
 * inside an Offering row-lock transaction and append an audit event. */
export function applyProjectGroupAction(
  previous: CourseProjectGroupProposal[],
  input: CourseProjectGroupActionInput,
  context: Context,
  newProposalId: string,
): CourseProjectGroupProposal[] {
  assertProjectGroupRegistrationOpen(context);
  const actor = context.actorEnrollmentId;
  const proposals = previous.map((proposal) => ({ ...proposal, members: proposal.members.map((member) => ({ ...member })) }));
  const hasTeam = (id: string) => context.academicEnrollmentIds.has(id) || proposals.some((proposal) => active(proposal) && accepted(proposal, id));
  if (input.action === "create") {
    if (hasTeam(actor)) fail("You already belong to a team");
    if (context.academicGroupCount + proposals.filter(active).length >= context.policy.maxGroups) fail("Maximum number of groups reached");
    if (context.academicGroupNames.has(key(input.name)) || proposals.some((p) => active(p) && key(p.name) === key(input.name))) fail("Group name is already in use");
    proposals.push({ id: newProposalId, name: input.name, leaderEnrollmentId: actor, status: "draft", members: [{ enrollmentId: actor, status: "accepted" }] });
    return proposals;
  }
  const proposal = proposals.find((p) => p.id === input.proposalId);
  if (!proposal || proposal.status !== "draft") fail("This proposal is not editable");
  const ownMember = proposal.members.find((member) => member.enrollmentId === actor);
  const leader = proposal.leaderEnrollmentId === actor;
  switch (input.action) {
    case "invite": {
      if (!leader || !accepted(proposal, actor) || context.academicEnrollmentIds.has(actor)) fail("Only an eligible leader can invite classmates");
      const target = input.enrollmentId;
      if (target === actor || !context.eligibleEnrollmentIds.has(target) || hasTeam(target)) fail("Classmate is not available");
      const existing = proposal.members.find((member) => member.enrollmentId === target);
      if (existing && existing.status !== "declined") fail("Invitation already exists");
      if (proposal.members.filter((member) => member.status !== "declined").length >= context.policy.maxMembers) fail("Group is full");
      if (existing) existing.status = "pending";
      else proposal.members.push({ enrollmentId: target, status: "pending" });
      break;
    }
    case "accept":
      if (!ownMember || ownMember.status !== "pending" || hasTeam(actor)) fail("No eligible pending invitation");
      if (proposal.members.filter((member) => member.status === "accepted").length >= context.policy.maxMembers) fail("Group is full");
      ownMember.status = "accepted";
      for (const other of proposals) {
        if (other.id === proposal.id || !active(other)) continue;
        for (const member of other.members) if (member.enrollmentId === actor && member.status === "pending") member.status = "declined";
      }
      break;
    case "decline":
      if (!ownMember || ownMember.status !== "pending") fail("No pending invitation");
      ownMember.status = "declined";
      break;
    case "withdraw":
      if (leader || !ownMember || ownMember.status !== "accepted") fail("Only a non-leader member can withdraw");
      ownMember.status = "declined";
      break;
    case "cancel":
      if (!leader) fail("Only the leader can cancel");
      proposal.status = "cancelled";
      break;
    case "submit":
      if (!leader) fail("Only the leader can submit");
      assertProjectGroupMembers(proposal, context);
      proposal.status = "submitted";
      delete proposal.reviewReason;
      break;
  }
  return proposals;
}

/** Re-run immediately before approval under the canonical Offering lock. */
export function assertProjectGroupMembers(
  proposal: CourseProjectGroupProposal,
  context: Pick<Context, "policy" | "eligibleEnrollmentIds" | "academicEnrollmentIds" | "scoringStarted">,
): string[] {
  if (context.scoringStarted) fail("Assessment group membership is locked");
  if (proposal.members.some((member) => member.status === "pending")) fail("Resolve pending invitations first");
  const ids = proposal.members.filter((member) => member.status === "accepted").map((member) => member.enrollmentId);
  if (ids.length < context.policy.minMembers || ids.length > context.policy.maxMembers) fail("Group size does not meet the registration policy");
  if (!ids.includes(proposal.leaderEnrollmentId) || new Set(ids).size !== ids.length) fail("Group membership is inconsistent");
  if (ids.some((id) => !context.eligibleEnrollmentIds.has(id) || context.academicEnrollmentIds.has(id))) fail("Membership is no longer eligible");
  return ids;
}
