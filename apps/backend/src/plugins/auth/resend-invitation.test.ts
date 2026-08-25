import { describe, expect, it } from "bun:test";
import { invitationAlreadyAccepted } from "./resend-invitation.ts";

describe("invitationAlreadyAccepted", () => {
  it("allows a still-pending invitation to be rotated", () => {
    expect(
      invitationAlreadyAccepted({
        email_confirmed_at: null,
        last_sign_in_at: null,
      }),
    ).toBe(false);
  });

  it("blocks a confirmed account", () => {
    expect(
      invitationAlreadyAccepted({
        email_confirmed_at: "2026-08-25T03:00:00.000Z",
        last_sign_in_at: null,
      }),
    ).toBe(true);
  });

  it("blocks an account that has already signed in", () => {
    expect(
      invitationAlreadyAccepted({
        email_confirmed_at: null,
        last_sign_in_at: "2026-08-25T03:01:00.000Z",
      }),
    ).toBe(true);
  });
});
