import { z } from "zod";
import { isCalendarDay } from "./manual-access-rules";

// Client-safe: limits shared by the server validation and the panel form. Same limits as the operator scripts
// (scripts/provision-production-account.cjs). Better Auth's own default range is 8-128.
export const PASSWORD_MAX = 128;
export const PASSWORD_MIN = { student: 8, admin: 12 } as const;
export const NAME_MAX = 100;
export type RequestedRole = keyof typeof PASSWORD_MIN;

export type UserManagementCode =
  | "INVALID_USER" | "INVALID_PASSWORD" | "PASSWORD_UNCHANGED" | "INVALID_CURRENT_PASSWORD" | "USER_NOT_FOUND"
  | "EMAIL_ALREADY_REGISTERED" | "PROTECTED_ACCOUNT" | "ROLE_UNCHANGED" | "USER_DISABLED" | "USER_CONFLICT"
  // Manual access (lib/admin/manual-access-core.ts).
  | "INVALID_ACCESS" | "INVALID_ACCESS_PERIOD" | "ACCESS_ALREADY_ACTIVE" | "ACCESS_NOT_ACTIVE" | "ACCESS_CONFLICT"
  | "ACCESS_TARGET_NOT_STUDENT";

export class UserManagementError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409 | 422, public readonly code: UserManagementCode) {
    super(code);
    this.name = "UserManagementError";
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_OR_MARKUP = /[\u0000-\u001f\u007f<>]/;
const name = z.string().transform(value => value.normalize("NFC").trim().replace(/\s+/g, " "))
  .refine(value => value.length >= 2 && value.length <= NAME_MAX && !CONTROL_OR_MARKUP.test(value));
const email = z.string().transform(value => value.normalize("NFC").trim().toLowerCase())
  .pipe(z.string().max(254).email());
const password = z.string().max(PASSWORD_MAX);
const role = z.enum(["student", "admin"]);

const calendarDay = z.string().refine(isCalendarDay);
const expectedUpdatedAt = z.string().datetime({ offset: true });
/** Inclusive Fortaleza calendar days; the period rules (today, 366 days) need the clock and run in the service. */
const accessPeriodSchema = z.object({ startDate: calendarDay, endDate: calendarDay }).strict();
const createUserSchema = z.object({ name, email, password, role, access: accessPeriodSchema.optional() }).strict();
const accessActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), startDate: calendarDay, endDate: calendarDay, expectedUpdatedAt: expectedUpdatedAt.nullable() }).strict(),
  z.object({ action: z.literal("renew"), endDate: calendarDay, expectedUpdatedAt }).strict(),
  z.object({ action: z.literal("revoke"), expectedUpdatedAt }).strict(),
]);
const changeRoleSchema = z.object({ role, expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict();
const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(PASSWORD_MAX), newPassword: password }).strict();
const userId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

/** The requested role is only a request: authorization is decided by the server from the database. */
export function parseCreateUser(input: unknown) {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    // A malformed optional access block is reported as such (the account data itself may be fine).
    const accessOnly = parsed.error.issues.every(issue => issue.path[0] === "access");
    throw new UserManagementError(400, accessOnly ? "INVALID_ACCESS" : "INVALID_USER");
  }
  if (parsed.data.password.length < PASSWORD_MIN[parsed.data.role]) throw new UserManagementError(400, "INVALID_PASSWORD");
  // Manual access is for students only: administrators never receive content access through a grant.
  if (parsed.data.access && parsed.data.role !== "student") throw new UserManagementError(400, "INVALID_ACCESS");
  return parsed.data;
}

export type AccessAction =
  | { action: "grant"; startDate: string; endDate: string; expectedUpdatedAt: Date | null }
  | { action: "renew"; endDate: string; expectedUpdatedAt: Date }
  | { action: "revoke"; expectedUpdatedAt: Date };

/** Grant, renew or revoke manual access. Shape only; dates, permissions and concurrency are checked by the service. */
export function parseAccessAction(id: unknown, input: unknown): { id: string; change: AccessAction } {
  const parsedId = userId.safeParse(id);
  if (!parsedId.success) throw new UserManagementError(400, "INVALID_USER");
  const parsed = accessActionSchema.safeParse(input);
  if (!parsed.success) throw new UserManagementError(400, "INVALID_ACCESS");
  const data = parsed.data;
  if (data.action === "grant") {
    return { id: parsedId.data, change: { ...data, expectedUpdatedAt: data.expectedUpdatedAt === null ? null : new Date(data.expectedUpdatedAt) } };
  }
  return { id: parsedId.data, change: { ...data, expectedUpdatedAt: new Date(data.expectedUpdatedAt) } };
}

export function parseChangeRole(id: unknown, input: unknown) {
  const parsedId = userId.safeParse(id);
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) throw new UserManagementError(400, "INVALID_USER");
  return { id: parsedId.data, role: parsed.data.role, expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt) };
}

export function parseChangePassword(input: unknown, minimum: number) {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) throw new UserManagementError(400, "INVALID_PASSWORD");
  if (parsed.data.newPassword.length < minimum) throw new UserManagementError(400, "INVALID_PASSWORD");
  if (parsed.data.newPassword === parsed.data.currentPassword) throw new UserManagementError(400, "PASSWORD_UNCHANGED");
  return parsed.data;
}
