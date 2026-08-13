// Issue #143 phase A: the only Programme row that exists yet — every
// UserRoleAssignment/Course write defaults to it since there's nothing else
// to scope to. Phase B replaces these call sites with a real resolved
// programme; this constant is the single place that cutover touches.
export const DEFAULT_PROGRAMME_ID = "dse";
