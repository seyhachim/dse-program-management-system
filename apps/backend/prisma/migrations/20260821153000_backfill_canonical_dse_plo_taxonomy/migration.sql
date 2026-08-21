-- Issue #536
-- Canonical DSE PLO taxonomy from the approved/reference Course Specification.
--
-- This migration is intentionally limited to programme-level PLO configuration.
-- It does not update CourseSpec rows, so submitted/approved course specifications
-- and their audit history remain untouched.
--
-- Existing non-null taxonomy values are preserved. Missing canonical PLO rows are
-- inserted so a fresh database receives the same taxonomy before the normal seed
-- upserts descriptions/order/active fields.

INSERT INTO "ProgramLearningOutcome" (
    "id",
    "code",
    "description",
    "order",
    "active",
    "createdAt",
    "updatedAt",
    "major",
    "learningDomain",
    "specificOrGeneric",
    "cap"
)
VALUES
    (
        '00000000-0000-4000-8000-000000000101',
        'PLO1',
        'Apply knowledge in data science and engineering to develop appropriate solutions for real-world problems.',
        1,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD1: Knowledge',
        'LD1: Knowledge',
        'Specific',
        'Cognitive'
    ),
    (
        '00000000-0000-4000-8000-000000000102',
        'PLO2',
        'Analyze data-related problems using logical reasoning and systems thinking.',
        2,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD2: Cognitive skills',
        'LD2: Cognitive skills',
        'Specific',
        'Cognitive'
    ),
    (
        '00000000-0000-4000-8000-000000000103',
        'PLO3',
        'Utilize data science tools and technologies to develop technical solutions for practical applications.',
        3,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD3: Psychomotor/Technical skills',
        'LD3: Psychomotor/Technical skills',
        'Specific',
        'Psychomotor'
    ),
    (
        '00000000-0000-4000-8000-000000000104',
        'PLO4',
        'Participate effectively in multicultural and multidisciplinary teams with intercultural competence and responsible citizenship.',
        4,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD4: Interpersonal skills and responsibility',
        'LD4: Interpersonal skills',
        'Generic',
        'Affective'
    ),
    (
        '00000000-0000-4000-8000-000000000105',
        'PLO5',
        'Demonstrate leadership, accountability, and lifelong learning in professional practice.',
        5,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD4: Interpersonal skills and responsibility',
        'LD5: Responsibility',
        'Generic',
        'Affective'
    ),
    (
        '00000000-0000-4000-8000-000000000106',
        'PLO6',
        'Develop innovative and entrepreneurial data-driven solutions that support national development and cultural sustainability in Cambodia and the ASEAN region.',
        6,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD4: Interpersonal skills and responsibility',
        'LD6: Entrepreneurial skills',
        'Specific',
        'Affective'
    ),
    (
        '00000000-0000-4000-8000-000000000107',
        'PLO7',
        'Make ethical decisions that reflect professional responsibility and awareness of social, cultural and environmental impacts.',
        7,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD4: Interpersonal skills and responsibility',
        'LD7: Ethics and Professionalism',
        'Generic',
        'Affective'
    ),
    (
        '00000000-0000-4000-8000-000000000108',
        'PLO8',
        'Communicate ideas and findings clearly through oral, written, and visual form.',
        8,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD5: Communication, information technology, and numerical skills',
        'LD8: Communication',
        'Generic',
        'Affective'
    ),
    (
        '00000000-0000-4000-8000-000000000109',
        'PLO9',
        'Utilize digital technologies and platforms to support communication, collaboration, and data-driven work.',
        9,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD5: Communication, information technology, and numerical skills',
        'LD9: Information technology skills',
        'Specific',
        'Psychomotor'
    ),
    (
        '00000000-0000-4000-8000-000000000110',
        'PLO10',
        'Apply mathematical, logical, and statistical reasoning in data analysis and problem solving.',
        10,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'MD5: Communication, information technology, and numerical skills',
        'LD10: Numerical skills',
        'Specific',
        'Cognitive or Psychomotor'
    )
ON CONFLICT ("code") DO UPDATE
SET
    "major" = COALESCE("ProgramLearningOutcome"."major", EXCLUDED."major"),
    "learningDomain" = COALESCE("ProgramLearningOutcome"."learningDomain", EXCLUDED."learningDomain"),
    "specificOrGeneric" = COALESCE("ProgramLearningOutcome"."specificOrGeneric", EXCLUDED."specificOrGeneric"),
    "cap" = COALESCE("ProgramLearningOutcome"."cap", EXCLUDED."cap"),
    "updatedAt" = CASE
        WHEN "ProgramLearningOutcome"."major" IS NULL
          OR "ProgramLearningOutcome"."learningDomain" IS NULL
          OR "ProgramLearningOutcome"."specificOrGeneric" IS NULL
          OR "ProgramLearningOutcome"."cap" IS NULL
        THEN CURRENT_TIMESTAMP
        ELSE "ProgramLearningOutcome"."updatedAt"
    END;
