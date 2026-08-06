-- CreateTable
CREATE TABLE "ProgramLearningOutcome" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramLearningOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramCompetency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramCompetencyPlo" (
    "competencyId" TEXT NOT NULL,
    "ploId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramCompetencyPlo_pkey" PRIMARY KEY ("competencyId","ploId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramLearningOutcome_code_key" ON "ProgramLearningOutcome"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramLearningOutcome_order_key" ON "ProgramLearningOutcome"("order");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCompetency_code_key" ON "ProgramCompetency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCompetency_order_key" ON "ProgramCompetency"("order");

-- CreateIndex
CREATE INDEX "ProgramCompetencyPlo_ploId_idx" ON "ProgramCompetencyPlo"("ploId");

-- AddForeignKey
ALTER TABLE "ProgramCompetencyPlo" ADD CONSTRAINT "ProgramCompetencyPlo_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "ProgramCompetency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCompetencyPlo" ADD CONSTRAINT "ProgramCompetencyPlo_ploId_fkey" FOREIGN KEY ("ploId") REFERENCES "ProgramLearningOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;
