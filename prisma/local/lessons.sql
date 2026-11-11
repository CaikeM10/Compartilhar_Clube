CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TABLE "lessons" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "videoUrl" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes" > 0 AND "durationMinutes" <= 1440),
  "position" INTEGER NOT NULL CHECK ("position" >= 0),
  "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "lessons_status_position_idx" ON "lessons"("status", "position");
