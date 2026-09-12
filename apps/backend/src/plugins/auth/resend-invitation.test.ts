import { describe, expect, it } from "bun:test";
import {
  invitationEmailsMatch,
  invitationIsPending,
  invitationMetadata,
} from "./resend-invitation.ts";

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

describe("invitation email identity", () => {
  it("matches institutional emails case-insensitively and after trimming", () => {
    expect(invitationEmailsMatch(" Student@rupp.edu.kh ", "student@RUPP.EDU.KH")).toBe(true);
  });

  it("fails closed for missing or different Supabase email identities", () => {
    expect(invitationEmailsMatch("student@rupp.edu.kh", null)).toBe(false);
    expect(invitationEmailsMatch("student@rupp.edu.kh", "other@rupp.edu.kh")).toBe(false);
  });
});

describe("invitationMetadata", () => {
  it("keeps lecturer resend metadata backward-compatible", () => {
    expect(invitationMetadata("Dr Lecturer", "lecturer")).toEqual({
      name: "Dr Lecturer",
      role: "lecturer",
    });
  });

  it("marks Student Portal resends as student invitations", () => {
    expect(invitationMetadata("Student One", "student")).toEqual({
      name: "Student One",
      role: "student",
    });
  });
});
