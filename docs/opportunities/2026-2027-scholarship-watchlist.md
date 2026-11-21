# DSE Student Opportunity Bank — scholarship watchlist from 2026–2027 screenshots

**Intake date:** 2026-11-20  
**Status:** CURATOR WATCHLIST ONLY — **not** imported, verified as active calls, or published in the PMS.
**Original evidence:** four user-supplied photographed pages of a Khmer scholarship calendar (numbered rows 1–26). The images include approximate 2026–2027 application periods, degree levels, and scholarship/program names. The full document URL and issuing institution have **not** been independently verified.

## Import decision

These 26 numbered **calendar rows** are **not 26 confirmed open scholarships or 26 necessarily distinct countries**. Some rows mention several scholarships; many include generic government/university offers, and one explicitly references EU programs. A calendar month window is **not** an application deadline.

Do not publish these as open opportunities. Treat each named program below as a *lead* to verify on its own official organizer site, then create a distinct `Opportunity` record only after checking the current call, Cambodian eligibility, degree level, application link, and exact deadline. Because `CreateOpportunityInput` requires a trustworthy HTTPS `sourceUrl`, these screenshots alone are insufficient to publish them in the MVP.

## Screenshot row index (best-effort transcription)

| Row | Destination/category visible or inferred | Named programs visible | Status |
| --- | --- | --- | --- |
| 1 | Country listing; Khmer label needs second review | Government/university scholarships (no clear English program name) | Unverified watchlist |
| 2 | Country listing; Khmer label needs second review | Government/university scholarships (no clear English program name) | Unverified watchlist |
| 3 | Malaysia | MIS (Malaysia International Scholarship) | Unverified watchlist |
| 4 | Indonesia | KNB | Unverified watchlist |
| 5 | Singapore | ASEAN scholarships; SINGA; Dr Goh Keng Swee (GKS) | Unverified watchlist |
| 6 | Vietnam | Government/university scholarships (no clear English program name) | Unverified watchlist |
| 7 | Japan | MEXT; JDS; JICA | Unverified watchlist |
| 8 | South Korea | GKS; KOICA | Unverified watchlist |
| 9 | China | CSC; LEC | Unverified watchlist |
| 10 | Country listing; Khmer label needs second review | ICCR | Unverified watchlist |
| 11 | Country listing; Khmer label needs second review | Government/university scholarships (no clear English program name) | Unverified watchlist |
| 12 | Hungary | Stipendium Hungaricum | Unverified watchlist |
| 13 | Italy | Government/university scholarships (no clear English program name) | Unverified watchlist |
| 14 | Germany | DAAD | Unverified watchlist |
| 15 | United Kingdom | Chevening; Gates Cambridge (printed “Gate Cambridge”) | Unverified watchlist |
| 16 | France | BGF; Eiffel Excellence Scholarship Program | Unverified watchlist |
| 17 | Russia | MGIMO; Open Doors Scholarship; RNFS Grants / University Research Fellowship | Unverified watchlist |
| 18 | Türkiye | Türkiye Burslari | Unverified watchlist |
| 19 | Canada | Canada-ASEAN SEED; Vanier Canada; CFSP | Unverified watchlist |
| 20 | United States | Fulbright; AAUW; SHE-CAN; East-West Center | Unverified watchlist |
| 21 | Country listing; Khmer label needs second review | Government scholarship (no clear English program name) | Unverified watchlist |
| 22 | New Zealand | Manaaki New Zealand | Unverified watchlist |
| 23 | Australia | Australia Awards; RTP | Unverified watchlist |
| 24 | Country listing; Khmer label needs second review | BMEWF; ADC & ITH | Unverified watchlist |
| 25 | EU scholarship grouping | EU Flagship Program; National Government Scholarships; EUMS | Unverified watchlist |
| 26 | International/other scholarship grouping; Khmer label needs second review | Government, university, and specialist scholarships (no clear English program name) | Unverified watchlist |

**Source fidelity note:** Labels marked “needs second review” were too small or ambiguous for reliable transcription. Program names are leads from the photographs, not verified normalized titles. Explicit academic degree levels and dates from the photos should be preserved only after the original PDF or issuer is found; don't infer a fixed closing date from a monthly range.

## Curation priorities for DSE

1. **Undergraduate / current-student relevance:** Check ASEAN scholarships, any summer or exchange options, and degree-specific programmes first. Many listed awards are only for master's/PhD applicants, researchers, government employees, or alumni.
2. **Graduate pathway:** MEXT, GKS, CSC, DAAD, Erasmus/EU, Eiffel, Chevening, Australia Awards, Manaaki, etc. Verify current cycle, Cambodian eligibility and exact level before publication.
3. **Do not overstate eligibility:** JDS may exclude some university lecturers depending on the target organizations; Vanier and other awards can have nomination or residency restrictions; mature professional programs are not automatically undergraduate-eligible.
4. **Refresh strategy:** Each candidate needs its own official source URL, last checked date, exact deadline or `null`, staff review, deduplication and archive plan.
5. **Calendar provenance:** Keep original screenshots in the curator's source archive (this GitHub text file does not contain the six uploaded image binaries). Do not expose personal Messenger conversation content publicly.

## Other two opportunities from the same upload

The two specific, official-source checked calls (Road to 50: U.S.-ASEAN Rising Stars and Obama Foundation Leaders Asia-Pacific 2027–2028) are staged as **Draft** input payloads in [2026-11-20-verified-intake.json](./2026-11-20-verified-intake.json). These are **specialized leadership/alumni** opportunities, not general DSE undergraduate scholarships.

**Release protection:** PR #1285 is still draft with isolated-hosted-auth and staff/student UAT gates. The connected production Supabase project currently has no `Opportunity` table. Do not migrate, seed fake staff identities, or publish until the approved release process is complete.
