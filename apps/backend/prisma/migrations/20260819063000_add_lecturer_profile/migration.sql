-- Additive lecturer-profile storage for AUN-QA staff metadata.
-- Identity/contact fields remain on User; this table stores lecturer-specific
-- professional metadata without rewriting existing users or teaching history.
CREATE TABLE "LecturerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gender" TEXT,
    "employmentType" TEXT,
    "fieldOfSpecialization" TEXT,
    "yearsOfExperience" INTEGER,
    "legacyCoursesTaught" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LecturerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LecturerProfile_userId_key" ON "LecturerProfile"("userId");

ALTER TABLE "LecturerProfile"
ADD CONSTRAINT "LecturerProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
