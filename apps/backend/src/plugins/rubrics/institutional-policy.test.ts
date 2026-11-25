import { describe, expect, test } from "bun:test";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import { policyAccess, policyRevisionInput } from "./institutional-policy.ts";

function actor(role: Role, programmeId: string | null): AuthUser {
  return {id:"test",email:"test@example.invalid",roles:[role],programmeRoles:[{role,programmeId}]};
}
describe("restricted policy register", () => {
  test("uses programme grants, not coarse roles", () => {
    expect(policyAccess(actor("admin",null),"dse")).toBe("manage");
    expect(policyAccess(actor("program_coordinator","dse"),"dse")).toBe("manage");
    expect(policyAccess(actor("lecturer","dse"),"dse")).toBe("read");
    for (const role of ["student","guardian","qa_contributor","qa_reviewer","program_secretary"] as const)
      expect(policyAccess(actor(role,"dse"),"dse")).toBe("deny");
    expect(policyAccess(actor("lecturer","other"),"dse")).toBe("deny");
    expect(policyAccess(actor("program_coordinator","other"),"dse")).toBe("deny");
    expect(policyAccess(actor("lecturer",null),"dse")).toBe("deny");
  });
  const input = {topic:"obe",expectedRevision:0,title:"Synthetic policy",institutionalOwner:"Synthetic office",
    version:"1",effectiveDate:"2026-10-18",locator:"Section 1",modules:"Assessment",status:"verified"};
  test("valid metadata only; no document or source link", () => {
    expect(policyRevisionInput.safeParse(input).success).toBe(true);
    expect(policyRevisionInput.safeParse({...input, sourceUrl:"https://example.invalid"}).success).toBe(false);
    expect(policyRevisionInput.safeParse({...input,locator:"https://example.invalid"}).success).toBe(false);
    expect(policyRevisionInput.safeParse({...input,version:null}).success).toBe(false);
    expect(policyRevisionInput.safeParse({...input,effectiveDate:"2026-02-31"}).success).toBe(false);
    expect(policyRevisionInput.safeParse({...input,status:"archived"}).success).toBe(false);
    expect(policyRevisionInput.safeParse({...input,status:"pending",version:null,locator:null,effectiveDate:null}).success).toBe(true);
  });
});
