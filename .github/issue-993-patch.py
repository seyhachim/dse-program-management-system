from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Prisma: additive nullable column only. No default/backfill so historical rows stay unknown.
replace_once(
    "apps/backend/prisma/schema.prisma",
    "  endTime      String\n  room         String?\n  activityType String   @default(\"Lecture\")",
    "  endTime      String\n  building     String?\n  room         String?\n  activityType String   @default(\"Lecture\")",
)

# Shared Offering contract.
replace_once(
    "packages/shared-types/src/offerings.ts",
    "/** One recurring weekly timetable entry for a class offering. */\nexport const OfferingMeetingInput = z",
    "/** UI default for newly added DSE teaching sessions; never used as a database default/backfill. */\nexport const DEFAULT_OFFERING_BUILDING = \"STEM Building\" as const;\n\n/** One recurring weekly timetable entry for a class offering. */\nexport const OfferingMeetingInput = z",
)
replace_once(
    "packages/shared-types/src/offerings.ts",
    "    endTime: MeetingTimeSchema,\n    room: z.string().trim().max(80, \"Room must be 80 characters or fewer\").optional(),",
    "    endTime: MeetingTimeSchema,\n    building: z.string().trim().max(120, \"Building must be 120 characters or fewer\").optional(),\n    room: z.string().trim().max(80, \"Room must be 80 characters or fewer\").optional(),",
)
replace_once(
    "packages/shared-types/src/offerings.ts",
    "  endTime: string;\n  room: string | null;\n  activityType: MeetingActivityType;\n  /** Derived from start/end time; callers never enter duration separately. */",
    "  endTime: string;\n  building: string | null;\n  room: string | null;\n  activityType: MeetingActivityType;\n  /** Derived from start/end time; callers never enter duration separately. */",
)
replace_once(
    "packages/shared-types/src/offerings.ts",
    "  endTime: string;\n  room: string | null;\n  activityType: MeetingActivityType;\n  durationHours: number;\n}\n\nexport interface LecturerWorkloadSummary",
    "  endTime: string;\n  building: string | null;\n  room: string | null;\n  activityType: MeetingActivityType;\n  durationHours: number;\n}\n\nexport interface LecturerWorkloadSummary",
)

# Student portal schedule contract also exposes the structured location.
replace_once(
    "packages/shared-types/src/student-portal.ts",
    "  endTime: string;\n  room: string | null;\n  activityType: MeetingActivityType;\n}\n\nexport interface PortalCriterionEvidence",
    "  endTime: string;\n  building: string | null;\n  room: string | null;\n  activityType: MeetingActivityType;\n}\n\nexport interface PortalCriterionEvidence",
)

# Backend Offering persistence and lecturer workload projection.
replace_once(
    "apps/backend/src/plugins/offerings/service.ts",
    "      endTime: string;\n      room: string | null;\n      activityType: string;\n    }[];",
    "      endTime: string;\n      building: string | null;\n      room: string | null;\n      activityType: string;\n    }[];",
)
replace_once(
    "apps/backend/src/plugins/offerings/service.ts",
    "{ create: meetings.map((meeting) => ({ ...meeting, room: meeting.room || null })) }",
    "{ create: meetings.map((meeting) => ({ ...meeting, building: meeting.building || null, room: meeting.room || null })) }",
)
replace_once(
    "apps/backend/src/plugins/offerings/service.ts",
    "{ data: meetings.map((meeting) => ({ offeringId: id, ...meeting, room: meeting.room || null })) }",
    "{ data: meetings.map((meeting) => ({ offeringId: id, ...meeting, building: meeting.building || null, room: meeting.room || null })) }",
)
replace_once(
    "apps/backend/src/plugins/offerings/service.ts",
    "            endTime: true,\n            room: true,\n            activityType: true,",
    "            endTime: true,\n            building: true,\n            room: true,\n            activityType: true,",
)
replace_once(
    "apps/backend/src/plugins/offerings/workload.ts",
    "    endTime: string;\n    room: string | null;\n    activityType: MeetingActivityType;",
    "    endTime: string;\n    building: string | null;\n    room: string | null;\n    activityType: MeetingActivityType;",
)

# Legacy Offering form: new sessions default to STEM Building; existing null remains blank on edit.
replace_once(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    "  MEETING_ACTIVITY_TYPES,\n  MEETING_DAYS,",
    "  DEFAULT_OFFERING_BUILDING,\n  MEETING_ACTIVITY_TYPES,\n  MEETING_DAYS,",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    "appendMeeting({ dayOfWeek: \"Monday\", startTime: \"08:00\", endTime: \"09:00\", room: \"\", activityType: \"Lecture\" })",
    "appendMeeting({ dayOfWeek: \"Monday\", startTime: \"08:00\", endTime: \"09:00\", building: DEFAULT_OFFERING_BUILDING, room: \"\", activityType: \"Lecture\" })",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    "<div className=\"grid gap-3 sm:grid-cols-2 lg:grid-cols-5\">",
    "<div className=\"grid gap-3 sm:grid-cols-2 lg:grid-cols-6\">",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    "<Field label=\"End\" error={errors.meetings?.[index]?.endTime?.message} required><Input type=\"time\" {...register(`meetings.${index}.endTime`)} /></Field>\n              <Field label=\"Room\"",
    "<Field label=\"End\" error={errors.meetings?.[index]?.endTime?.message} required><Input type=\"time\" {...register(`meetings.${index}.endTime`)} /></Field>\n              <Field label=\"Building\" error={errors.meetings?.[index]?.building?.message} optional><Input placeholder=\"STEM Building\" maxLength={120} {...register(`meetings.${index}.building`)} /></Field>\n              <Field label=\"Room\"",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/offering-form-page.tsx",
    "meetings: offering.meetings.map(({ id: _id, durationHours: _durationHours, room, ...meeting }) => ({ ...meeting, room: room ?? \"\" })),",
    "meetings: offering.meetings.map(({ id: _id, durationHours: _durationHours, building, room, ...meeting }) => ({ ...meeting, building: building ?? \"\", room: room ?? \"\" })),",
)

# Exact-curriculum Offering form: same default/preservation behavior.
replace_once(
    "apps/frontend/app/(shell)/offerings/curriculum-bound-offering-form-page.tsx",
    "  CreateCurriculumBoundOfferingInputSchema,\n  UpdateCurriculumBoundOfferingInputSchema,",
    "  CreateCurriculumBoundOfferingInputSchema,\n  DEFAULT_OFFERING_BUILDING,\n  UpdateCurriculumBoundOfferingInputSchema,",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/curriculum-bound-offering-form-page.tsx",
    "  endTime: \"09:00\",\n  room: \"\",",
    "  endTime: \"09:00\",\n  building: DEFAULT_OFFERING_BUILDING,\n  room: \"\",",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/curriculum-bound-offering-form-page.tsx",
    "offering.meetings.map(({ id: _id, durationHours: _duration, room, ...meeting }) => ({\n            ...meeting,\n            room: room ?? \"\",\n          })),",
    "offering.meetings.map(({ id: _id, durationHours: _duration, building, room, ...meeting }) => ({\n            ...meeting,\n            building: building ?? \"\",\n            room: room ?? \"\",\n          })),",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/curriculum-bound-offering-form-page.tsx",
    "<div key={index} className=\"grid gap-2 rounded-lg border border-border p-3 md:grid-cols-6\">",
    "<div key={index} className=\"grid gap-2 rounded-lg border border-border p-3 md:grid-cols-7\">",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/curriculum-bound-offering-form-page.tsx",
    "                    <Input type=\"time\" value={meeting.endTime} onChange={(event) => changeMeeting(index, { endTime: event.target.value })} />\n                    <Input placeholder=\"Room\"",
    "                    <Input type=\"time\" value={meeting.endTime} onChange={(event) => changeMeeting(index, { endTime: event.target.value })} />\n                    <Input aria-label=\"Building\" placeholder=\"STEM Building\" maxLength={120} value={meeting.building ?? \"\"} onChange={(event) => changeMeeting(index, { building: event.target.value })} />\n                    <Input placeholder=\"Room\"",
)

# Course Offerings list display includes both structured location parts.
replace_once(
    "apps/frontend/lib/offering-list-view.ts",
    "  endTime: string;\n  room: string | null;\n};",
    "  endTime: string;\n  building: string | null;\n  room: string | null;\n};",
)
replace_once(
    "apps/frontend/lib/offering-list-view.ts",
    "        endTime: meeting.endTime,\n        room: meeting.room,",
    "        endTime: meeting.endTime,\n        building: meeting.building,\n        room: meeting.room,",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/offerings-client.tsx",
    "                {entry.startTime}–{entry.endTime}\n                {entry.room ? ` · Room ${entry.room}` : \"\"}",
    "                {entry.startTime}–{entry.endTime}\n                {entry.building ? ` · ${entry.building}` : \"\"}\n                {entry.room ? ` · Room ${entry.room}` : \"\"}",
)
replace_once(
    "apps/frontend/app/(shell)/offerings/offerings-client.tsx",
    "                        {meeting.startTime}–{meeting.endTime}\n                        {meeting.room ? ` · Room ${meeting.room}` : \"\"}",
    "                        {meeting.startTime}–{meeting.endTime}\n                        {meeting.building ? ` · ${meeting.building}` : \"\"}\n                        {meeting.room ? ` · Room ${meeting.room}` : \"\"}",
)

# Student mobile schedule consumes the new location field without inventing it for legacy rows.
replace_once(
    "apps/frontend/app/(shell)/portal/schedule/portal-schedule.tsx",
    '<span className="break-words">{meeting.room || "Room TBA"}</span>',
    '<span className="break-words">{[meeting.building, meeting.room ? `Room ${meeting.room}` : null].filter(Boolean).join(" · ") || "Location TBA"}</span>',
)

# Contract and projection tests.
replace_once(
    "packages/shared-types/src/offerings.test.ts",
    "  endTime: \"10:00\",\n  room: \"A203\",",
    "  endTime: \"10:00\",\n  building: \"STEM Building\",\n  room: \"A203\",",
)
replace_once(
    "packages/shared-types/src/offerings.test.ts",
    "test(\"meeting validation accepts room/time and derives no user-entered duration\", () => {\n  const meeting = OfferingMeetingInput.parse(VALID_MEETING);\n  expect(meeting.room).toBe(\"A203\");\n  expect(\"duration\" in meeting).toBe(false);\n});",
    "test(\"meeting validation accepts building/room/time and derives no user-entered duration\", () => {\n  const meeting = OfferingMeetingInput.parse(VALID_MEETING);\n  expect(meeting.building).toBe(\"STEM Building\");\n  expect(meeting.room).toBe(\"A203\");\n  expect(\"duration\" in meeting).toBe(false);\n});\n\ntest(\"meeting building is optional, trimmed, and length-limited\", () => {\n  expect(OfferingMeetingInput.parse({ ...VALID_MEETING, building: undefined }).building).toBeUndefined();\n  expect(OfferingMeetingInput.parse({ ...VALID_MEETING, building: \"  STEM Building  \" }).building).toBe(\"STEM Building\");\n  expect(OfferingMeetingInput.safeParse({ ...VALID_MEETING, building: \"B\".repeat(121) }).success).toBe(false);\n});",
)
replace_once(
    "apps/backend/src/plugins/offerings/workload.test.ts",
    "      endTime: \"10:00\",\n      room: \"A203\",",
    "      endTime: \"10:00\",\n      building: \"STEM Building\",\n      room: \"A203\",",
)
replace_once(
    "apps/backend/src/plugins/offerings/workload.test.ts",
    "      endTime: \"14:30\",\n      room: \"B105\",",
    "      endTime: \"14:30\",\n      building: \"Engineering Building\",\n      room: \"B105\",",
)
replace_once(
    "apps/backend/src/plugins/offerings/workload.test.ts",
    "  expect(result.scheduleRows.map((row) => row.room)).toEqual([\"A203\", \"B105\"]);",
    "  expect(result.scheduleRows.map((row) => row.building)).toEqual([\"STEM Building\", \"Engineering Building\"]);\n  expect(result.scheduleRows.map((row) => row.room)).toEqual([\"A203\", \"B105\"]);",
)

# List-view fixtures prove building is carried separately and legacy null stays null.
path = Path("apps/frontend/lib/offering-list-view.test.ts")
text = path.read_text(encoding="utf-8")
text = text.replace('              endTime: "10:00",\n              room: "305",', '              endTime: "10:00",\n              building: "STEM Building",\n              room: "305",', 1)
text = text.replace('              endTime: "08:30",\n              room: "305",', '              endTime: "08:30",\n              building: "STEM Building",\n              room: "305",', 1)
text = text.replace('              endTime: "08:30",\n              room: "306",', '              endTime: "08:30",\n              building: null,\n              room: "306",', 1)
text = text.replace('              endTime: "10:00",\n              room: "306",', '              endTime: "10:00",\n              building: "STEM Building",\n              room: "306",', 1)
text = text.replace('        endTime: "08:30",\n        room: "306",', '        endTime: "08:30",\n        building: null,\n        room: "306",', 1)
text = text.replace('        endTime: "10:00",\n        room: "306",', '        endTime: "10:00",\n        building: "STEM Building",\n        room: "306",', 1)
text = text.replace('        endTime: "08:30",\n        room: "305",', '        endTime: "08:30",\n        building: "STEM Building",\n        room: "305",', 1)
text = text.replace('        endTime: "10:00",\n        room: "305",', '        endTime: "10:00",\n        building: "STEM Building",\n        room: "305",', 1)
if text.count('building: "STEM Building"') < 6 or text.count("building: null") < 2:
    raise SystemExit("offering-list-view.test.ts: building fixture replacements incomplete")
path.write_text(text, encoding="utf-8")

# Additive migration only: historical rows remain NULL until an evidence-backed update.
migration = Path("apps/backend/prisma/migrations/20260910152500_add_offering_meeting_building/migration.sql")
migration.parent.mkdir(parents=True, exist_ok=True)
migration.write_text('ALTER TABLE "OfferingMeeting" ADD COLUMN "building" TEXT;\n', encoding="utf-8")

# Remove this temporary patch machinery from the resulting feature commit.
Path(".github/issue-993-patch.py").unlink(missing_ok=True)
Path(".github/workflows/issue-993-apply.yml").unlink(missing_ok=True)
