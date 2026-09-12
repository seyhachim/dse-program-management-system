# DSE PMS authentication email templates

DSE PMS uses Supabase Auth for account invitations. The canonical hosted-project invite template is `supabase-invite-email.html` in this directory, with its subject stored in `supabase-invite-email.subject.txt`.

## Role-aware invitation

**Subject**

```text
You're invited to DSE Program Management System
```

The template intentionally keeps `{{ .ConfirmationURL }}` as the activation target. Supabase generates and validates that secure invitation URL. Do not replace it with an application-generated token or a password.

DSE PMS sends trusted invitation metadata through `inviteUserByEmail`:

- `name` -> available in the template as `{{ .Data.name }}`
- `role` -> available as `{{ .Data.role }}`

The HTML personalizes the greeting with `{{ .Data.name }}` and safely falls back to `DSE colleague`. Because Supabase uses one **Invite user** template for every invited PMS role, role-specific copy is conditional:

- `lecturer` -> assigned teaching information, course specifications, schedules, assessments, programme resources, and teaching services;
- `student` -> Student Portal access to enrolled courses, schedules, attendance information, **published** results, announcements, and learning resources;
- other invitable roles -> neutral role-safe onboarding copy.

The student wording intentionally says **published results**. An invitation never bypasses existing result-publication, authorization, enrollment, or other academic visibility rules.

The header loads the existing PNG PWA icon from `{{ .SiteURL }}/pwa-icon-192.png`. The message remains understandable if an email client blocks remote images.

## Student Portal invitation safety

A first Student Portal invitation and a resend both remain admin-only through the existing `accounts:create` permission boundary.

A first student invitation requires the canonical Student roster row to exist for the institutional email, the Student to be `Active`, and no portal User to be linked already. The official Student ID is **not** required while it is still pending; this follows the programme decision in #1032 and never copies email into `Student.studentId`.

The Students page also exposes **Resend expired invite**. Resend is deliberately narrower than password recovery:

- the Student must still be `Active` and have an institutional email;
- the Student must already be linked to a PMS User with the `student` role;
- Student, PMS User, and Supabase Auth emails must match;
- the existing Supabase identity must still be an unconfirmed, never-signed-in invitation;
- confirmed, signed-in, non-invite, wrong-role, or mismatched identities fail closed and are never deleted;
- a successful resend rotates only the pending Supabase Auth identity and updates the existing PMS User `authId`.

Student UUID, official Student ID, cohort membership, enrollment, attendance, results, CourseSpecs, QA evidence, and other academic records are not rewritten by resend.

## Apply to hosted Supabase

1. Open the production Supabase project.
2. Go to **Authentication -> Email Templates**.
3. Select **Invite user**.
4. Set the subject to the exact contents of `docs/auth/supabase-invite-email.subject.txt`.
5. Copy the full contents of `docs/auth/supabase-invite-email.html` into the template body.
6. Save the template.
7. In **Authentication -> URL Configuration**, verify the production DSE PMS site URL and allowed redirect URLs. The Site URL must also serve `/pwa-icon-192.png` for the email header icon.
8. Verify the Render backend environment variable `SUPABASE_INVITE_REDIRECT_URL` points to the intended deployed DSE PMS invitation/login destination. Do not change or expose `SUPABASE_SERVICE_ROLE_KEY`.

Supabase hosted projects store email-template configuration outside this repository; merging this file does not automatically change the hosted Auth template. Applying the hosted template therefore remains an explicit production-configuration step.

## Production verification

Use non-privileged test accounts/emails that are safe to invite.

For a lecturer, from the DSE PMS **Lecturers** page use **Invite to DSE** and verify lecturer-specific teaching copy. For a student, use one Active test Student with an institutional email from the **Students** page and verify:

- subject is the DSE PMS subject above;
- recipient name renders correctly;
- DSE icon loads when remote images are allowed, while the email still reads correctly when images are blocked;
- student-specific Student Portal copy is shown and refers only to published results;
- CTA reads **Activate DSE Account**;
- CTA URL is a Supabase Auth verification URL and redirects only to the configured DSE PMS destination;
- the raw link fallback is present;
- no password, service-role key, access token, student record data, or academic data appears in the message;
- accepting the invitation reaches the existing DSE PMS account-setup/sign-in flow;
- the account receives only the access already allowed by the existing PMS authorization/publication model.

For a still-pending Student Portal invitation, use **Resend expired invite** and verify a fresh branded invitation arrives. Then activate/sign in to the test account and confirm the same resend action fails closed rather than rotating an active credential.

For another safe non-lecturer/non-student role, verify the neutral role-safe copy still renders.

## Rollback

If the hosted template renders incorrectly, restore the previous **Invite user** template in Supabase Dashboard. This template rollback is presentation-only and does not modify PMS Users, Student records, lecturer profiles, role assignments, offerings, CourseSpecs, results, attendance, or QA records.

## Security notes

- Keep `{{ .ConfirmationURL }}` in both the CTA and fallback URL.
- Never commit Supabase access tokens, service-role keys, invitation URLs, or recipient data.
- Do not enable email-provider link tracking that rewrites Supabase Auth links.
- The application backend remains the authority for who can send invitations (`accounts:create`).
- Do not use resend as account recovery. Active accounts must use the appropriate recovery flow rather than rotating their Auth identity.
