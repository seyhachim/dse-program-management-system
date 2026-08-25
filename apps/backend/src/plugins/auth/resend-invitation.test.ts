import { describe, expect, it } from "bun:test";
import { invitationIsPending } from "./resend-invitation.ts";

describe("invitationIsPending", () => {
  it("allows a still-pending Supabase invitation to be rotated", () => {
    expect(
      invitationIsPending({
        invited_at: "2026-08-25T02:00:00.000Z",
        email_confirmed_at: null,
        confirmed_at: null,
        last_sign_in_at: null,
      }),
    ).toBe(true);
  });

  it("blocks an unconfirmed identity that was not created as an invitation", () => {
    expect(
      invitationIsPending({
        invited_at: null,
        email_confirmed_at: null,
        confirmed_at: null,
        last_sign_in_at: null,
      }),
    ).toBe(false);
  });

  it("blocks an invited account with email confirmation metadata", () => {
    expect(
      invitationIsPending({
        invited_at: "2026-08-25T02:00:00.000Z",
        email_confirmed_at: "2026-08-25T03:00:00.000Z",
        confirmed_at: null,
        last_sign_in_at: null,
      }),
    ).toBe(false);
  });

  it("blocks an invited account with generic confirmation metadata", () => {
    expect(
      invitationIsPending({
        invited_at: "2026-08-25T02:00:00.000Z",
        email_confirmed_at: null,
        confirmed_at: "2026-08-25T03:00:00.000Z",
        last_sign_in_at: null,
      }),
    ).toBe(false);
  });

  it("blocks an invited account that has already signed in", () => {
    expect(
      invitationIsPending({
        invited_at: "2026-08-25T02:00:00.000Z",
        email_confirmed_at: null,
        confirmed_at: null,
        last_sign_in_at: "2026-08-25T03:01:00.000Z",
      }),
    ).toBe(false);
  });
});
