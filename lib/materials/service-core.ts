import "server-only";
import type { PrismaClient } from "@prisma/client";
import { materialInput, materialChange } from "./validation";

export class MaterialError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
// Server-only preparation. No public route or UI consumes this service yet.
export function createMaterialService(db: PrismaClient, requireAdmin: () => Promise<unknown>) {
  return {
    async listAdmin() {
      await requireAdmin();
      return db.material.findMany({ orderBy: [{ displayOrder: "asc" }, { id: "asc" }] });
    },
    async create(input: unknown) {
      await requireAdmin();
      const parsed = materialInput.safeParse(input);
      if (!parsed.success) throw new MaterialError(400, "INVALID_MATERIAL");
      return db.material.create({ data: { ...parsed.data, status: "DRAFT" } });
    },
    async change(id: string, input: unknown) {
      await requireAdmin();
      const parsed = materialChange.safeParse(input);
      if (!parsed.success) throw new MaterialError(400, "INVALID_MATERIAL");
      return db.$transaction(async tx => {
        // Optimistic concurrency prevents one administrator from overwriting another.
        const changed = await tx.material.updateMany({
          where: { id, updatedAt: new Date(parsed.data.expectedUpdatedAt) }, data: parsed.data.data,
        });
        if (changed.count !== 1) throw new MaterialError(409, "MATERIAL_CHANGED_OR_MISSING");
        return tx.material.findUniqueOrThrow({ where: { id } });
      });
    },
    // Deletion is deliberately represented by status ARCHIVED through change().
  };
}
