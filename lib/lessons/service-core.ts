import "server-only";
import type { PrismaClient } from "@prisma/client";
import { lessonInput, lessonChange } from "./validation";

export class LessonError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
type Guards = { requireAdmin: () => Promise<unknown>; requireActiveSubscription: () => Promise<unknown> };
const orderBy = [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }] as const;
const summary = { id: true, title: true, description: true, durationMinutes: true, position: true } as const;
const adminFields = { ...summary, status: true, videoUrl: true } as const;

export function createLessonService(db: PrismaClient, guards: Guards) {
  return {
    async listAdmin() {
      await guards.requireAdmin();
      return db.lesson.findMany({ orderBy: [...orderBy], select: adminFields });
    },
    async listPublished() {
      await guards.requireActiveSubscription();
      return db.lesson.findMany({ where: { status: "PUBLISHED" }, orderBy: [...orderBy], select: summary });
    },
    async watch(id: string) {
      await guards.requireActiveSubscription();
      const lesson = await db.lesson.findFirst({ where: { id, status: "PUBLISHED" }, select: { ...summary, videoUrl: true } });
      if (!lesson) throw new LessonError(404, "LESSON_NOT_FOUND");
      return lesson;
    },
    async create(input: unknown) {
      await guards.requireAdmin();
      const parsed = lessonInput.safeParse(input);
      if (!parsed.success) throw new LessonError(400, "INVALID_LESSON");
      return db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(61420318)');
        const last = await tx.lesson.aggregate({ _max: { position: true } });
        return tx.lesson.create({ data: { ...parsed.data, position: (last._max.position ?? -1) + 1 }, select: adminFields });
      });
    },
    async change(id: string, input: unknown) {
      await guards.requireAdmin();
      const parsed = lessonChange.safeParse(input);
      if (!parsed.success) throw new LessonError(400, "INVALID_LESSON");
      return db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(61420318)');
        const current = await tx.lesson.findUnique({ where: { id } });
        if (!current) throw new LessonError(404, "LESSON_NOT_FOUND");
        const change = parsed.data;
        if (change.action === "move") {
          const rows = await tx.lesson.findMany({ orderBy: [...orderBy], select: { id: true } });
          const index = rows.findIndex(row => row.id === id);
          const next = index + (change.direction === "up" ? -1 : 1);
          if (next >= 0 && next < rows.length) [rows[index], rows[next]] = [rows[next], rows[index]];
          for (let position = 0; position < rows.length; position++) {
            await tx.lesson.update({ where: { id: rows[position].id }, data: { position } });
          }
        } else {
          // Revalidate stored video before publication, even if the data came from outside this UI.
          if (change.action === "status" && change.status === "PUBLISHED" && !lessonInput.safeParse({
            title: current.title, description: current.description, videoUrl: current.videoUrl, durationMinutes: current.durationMinutes,
          }).success) throw new LessonError(400, "INVALID_LESSON");
          await tx.lesson.update({ where: { id }, data: change.action === "edit" ? change.data : { status: change.status } });
        }
        return tx.lesson.findUniqueOrThrow({ where: { id }, select: adminFields });
      });
    },
  };
}
