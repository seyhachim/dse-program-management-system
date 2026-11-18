# Student Attendance Permission Letters — Data Handling and Release Policy (DRAFT)

**Status:** PROPOSED ONLY — not an approved University or DSE policy. **No production student uploads until QA Center and IT Office approval.**  
**Owner:** DSE programme coordinator; approving authorities: RUPP QA Center and IT Office.  
**Review date:** 18 Nov 2026. Related: #1311 / PR #1312.

## Authority and precedence

Reference: **RUPP Data Protection Policy — stamped**, official file held in the RUPP/DSE controlled Drive, including:
- Sections 5.5–5.7: storage limitation, integrity/confidentiality, accountability.
- Sections 6.5 and 7: IT Office Data Custodian; QA Center approval of any new dataset's classification.
- Sections 7.1 and 8: role-based access, MFA, QA-approved access lists and storage protocols for Confidential/Highly Confidential information.
- Section 9: external disclosure/third-party processor requires a formal Data Processing Agreement (DPA) approved in advance by QA Center.
- Sections 11–13: subject requests, QA Center Master Retention Schedule, security incident response.
- Section 12 suggested retention table: **Student Academic Records — Permanent / Secure Archival**; it does **not expressly label attendance permission-letter attachments** as that category.

**Do not invent a shorter student-letter retention period.** QA Center must decide whether attachments are classified as student academic records (and archived permanently), another temporary record category governed by the Master Retention Schedule, or a mixed category with special medical/sensitive exceptions. The 12-month example discussed earlier is NOT approved.

## Proposed scope

- **Purpose:** support lecturer adjudication of an existing Attendance **Permission Pending** entry for one course and session. A submitted letter is never automatic approval or a substitute for the canonical attendance record.
- **Content minimization:** accept official evidence only. Request the minimum proof of excuse required; do not request diagnoses, medical histories, national identification numbers, or financial details unless separately approved. If evidence contains sensitive health/identity data, treat as potentially **Highly Confidential** pending QA classification.
- **Who can access:** (a) submitting student: submission status and filename for own exact enrolled offering; (b) currently assigned lecturer/co-lecturer, programme coordinator, or global administrator: only within their authorized scope. All permission and storage access lists require institutional approval; no blanket lecturer access.
- **Identity:** individual accounts only, appropriate MFA for Confidential data under RUPP policy. Verify that PMS login actually enforces the required MFA before enabling real data.
- **Files:** PDF/JPG/PNG, up to 5 MiB; opaque random keys; no public object URLs, no email attachment copies, no direct Storage policies for anon/authenticated roles. Backend service credentials must remain server-side. Reviewer receives a short-lived 60-second signed download URL, not permanent access.
- **Hosting:** PMS Supabase project currently runs in Tokyo. Before processing real student data, RUPP QA Center/IT Office must approve the hosting/processor and review a signed data-processing arrangement with the service provider. Do not assume a cloud vendor's standard terms fulfill RUPP approval.

## Retention and disposal: approval required

| Decision | Proposed handling | Status |
|---|---|---|
| Official record class | QA Center maps attendance permission evidence to a Master Retention Schedule category | **UNCONFIRMED** |
| Retention start event | QA Center decides based on class date / close of semester / final appeal closure | **UNCONFIRMED** |
| Retention duration | Use the official Master Retention Schedule; do not substitute arbitrary 90-day/12-month limits | **UNCONFIRMED** |
| Active appeal / investigation | Suspend disposal until any approved legal/academic hold has ended | **PROPOSED** |
| Secure disposal | Delete both private Storage object and database evidence metadata, preserve only permitted audit proof, report partial failures | **DESIGN NOT IMPLEMENTED** |
| Access and deletion logs | Record authenticated actor, document ID, scope, timestamps, action, and disposition without logging the actual document content | **DESIGN NOT IMPLEMENTED** |

**Launch rule:** until QA classifies this dataset and approves the schedule and access list, use synthetic data only. Do not schedule permanent retention or automatic deletion arbitrarily.

## Operational controls / gates

- [ ] QA Center signs off classification, Master Retention Schedule category/duration, storage/processor DPA, and user access lists.
- [ ] IT Office signs off storage architecture, encryption, backups, data restoration, key handling, access logging, and incident escalation.
- [ ] PMS enforces MFA for the confidential-document roles and audits document submission/access/download/deletion.
- [ ] Define how to handle corrections/replacements and student's rights of access/rectification or deletion requests through QA process.
- [ ] Establish a way to delete Storage and database references consistently when authorized, and ensure no orphan files remain.
- [ ] Confirm uploaded files are not executable/served inline (force download), and consider malware/content scanning before broadly accepting medical/ID evidence.
- [ ] Test privacy/security with synthetic records in a **separate** Supabase Storage project and separate PMS staging DB.
- [ ] Review only after complete CI, controlled staging test, and human approval; merge/deploy the application separately from this policy document.

## Current verification limitations

- CI covers synthetic backend HTTP upload and reviewer signed-download integration with a mock Storage endpoint, but **real hosted Supabase Storage is not yet validated end to end**.
- The isolated `dse-pms-auth-test` Supabase project is paused. Restore attempt on 18 Nov 2026 was rejected because the DSE Free organization already uses its two active project slots (production PMS and Life Dashboard). Do **not** pause either live project, reuse the production bucket for a test, or use real student documents as fixtures.
- Options for an isolated Storage test: an independently funded/approved project; a separate organization/project chosen by the account owner; or a local Supabase Storage stack using synthetic data (not a hosted equivalent).

**This document records outstanding approval decisions; it is not a claim that RUPP's policy authorizes this deployment.**
