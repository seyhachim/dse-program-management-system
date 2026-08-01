-- CreateIndex
CREATE INDEX "Course_lecturerId_idx" ON "Course"("lecturerId");

-- CreateIndex
CREATE INDEX "CourseSpecCloAssessmentMethod_assessmentMethodId_idx" ON "CourseSpecCloAssessmentMethod"("assessmentMethodId");

-- CreateIndex
CREATE INDEX "CourseSpecCloTeachingMethod_teachingMethodId_idx" ON "CourseSpecCloTeachingMethod"("teachingMethodId");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_idx" ON "Enrollment"("studentId");

-- CreateIndex
CREATE INDEX "Offering_lecturerId_idx" ON "Offering"("lecturerId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "Rubric_ownerId_idx" ON "Rubric"("ownerId");

-- CreateIndex
CREATE INDEX "RubricCell_levelId_idx" ON "RubricCell"("levelId");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");
