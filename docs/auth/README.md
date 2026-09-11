# DSE PMS authentication email templates

DSE PMS uses Supabase Auth for account invitations. The canonical hosted-project invite template is `supabase-invite-email.html` in this directory.

## Lecturer invitation

**Subject**

```text
You're invited to DSE Program Management System
```

The template intentionally keeps `{{ .ConfirmationURL }}` as the activation target. Supabase generates and validates that secure invitation URL. Do not replace it with an application-generated token or a password.

DSE PMS already sends trusted invitation metadata through `inviteUserByEmail`:

- `name` -> available in the template as `{{ .Data.name }}`
- `role` -> available as `{{ .Data.role }}`

The HTML currently personalizes the greeting with `{{ .Data.name }}` and falls back to `Lecturer` when no name is present.

## Apply to hosted Supabase

1. Open the production Supabase project.
2. Go to **Authentication -> Email Templates**.
3. Select **Invite user**.
4. Set the subject to `You're invited to DSE Program Management System`.
5. Copy the full contents of `docs/auth/supabase-invite-email.html` into the template body.
6. Save the template.
7. In **Authentication -> URL Configuration**, verify the production DSE PMS site URL and allowed redirect URLs.
8. Verify the Render backend environment variable `SUPABASE_INVITE_REDIRECT_URL` points to the intended deployed DSE PMS invitation/login destination. Do not change or expose `SUPABASE_SERVICE_ROLE_KEY`.

Supabase hosted projects store email-template configuration outside this repository; merging this file does not automatically change the hosted Auth template.

## Production verification

Use a non-privileged test lecturer account/email that is safe to invite. From the DSE PMS **Lecturers** page, use the existing **Invite to DSE** action and verify:

- subject is the DSE PMS subject above;
- recipient name renders correctly;
- CTA reads **Activate DSE Account**;
- CTA URL is a Supabase Auth verification URL and redirects only to the configured DSE PMS destination;
- the raw link fallback is present;
- no password, service-role key, access token, or academic data appears in the message;
- accepting the invitation reaches the existing DSE PMS account-setup/sign-in flow;
- the lecturer receives only the role/access already granted by the existing PMS authorization model.

For a pending invitation, also verify the existing **Resend invitation** flow uses the same branded Supabase template.

## Rollback

If the hosted template renders incorrectly, restore the previous **Invite user** template in Supabase Dashboard. This is presentation-only configuration: rollback does not modify PMS `User`, lecturer profiles, role assignments, offerings, CourseSpecs, results, attendance, or QA records.

## Security notes

- Keep `{{ .ConfirmationURL }}` in both the CTA and fallback URL.
- Never commit Supabase access tokens, service-role keys, invitation URLs, or recipient data.
- Do not enable email-provider link tracking that rewrites Supabase Auth links.
- The application backend remains the authority for who can send invitations (`accounts:create`).
