-- Honorific is an optional, explicitly selected form of address.
-- It is intentionally independent from LecturerProfile.gender and User.title.
CREATE TYPE "UserHonorific" AS ENUM ('Mr', 'Ms', 'Mrs', 'Mx', 'Dr', 'Prof');

ALTER TABLE "User"
ADD COLUMN "honorific" "UserHonorific";
