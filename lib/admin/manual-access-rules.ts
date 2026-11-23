// Client-safe rules for manual (administrative) access. Pure functions, no dependencies: used by the server service,
// the listing and the panel form. The server always applies them again; the browser copy is convenience only.
//
// Calendar days are Fortaleza days (UTC-3, no daylight saving time), the time zone shown to students. A period
// "from day A to day B" means access from 00:00 of A until the end of B: startsAt = A 00:00, endsAt = (B + 1) 00:00
// (exclusive). Expiry needs no job: every access check compares endsAt with the current instant.

export const MANUAL_ACCESS_MAX_DAYS = 366;
export const ACCESS_TIME_ZONE = "America/Fortaleza";
const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ManualAccessStatus = "active" | "scheduled" | "expired" | "revoked" | "none";
export type ManualAccessView = {
  status: ManualAccessStatus;
  /** Exact instants (ISO) and the matching inclusive Fortaleza calendar days. */
  startsAt: string | null;
  endsAt: string | null;
  firstDay: string | null;
  lastDay: string | null;
  /** Optimistic concurrency token for renew/revoke (null when the student never had a grant). */
  updatedAt: string | null;
};
export type PaidAccessStatus = "active" | "scheduled" | "inactive" | "none";
export type PaidAccessView = { status: PaidAccessStatus; endsAt: string | null; lastDay: string | null };

type GrantRecord = { startsAt: Date; endsAt: Date; revokedAt: Date | null; updatedAt: Date };

/** True only for a real calendar day written as YYYY-MM-DD. */
export function isCalendarDay(value: string) {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** Fortaleza calendar day (YYYY-MM-DD) of an instant. */
export function fortalezaDay(at: Date) {
  return new Date(at.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

/** Instant at which a Fortaleza calendar day starts. */
export function dayStart(day: string) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + OFFSET_MS);
}

export function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Number of calendar days from `from` to `to`, both inclusive. */
export function inclusiveDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1;
}

/** Inclusive last day of a period whose exclusive end is `endsAt`. */
export function lastDayOf(endsAt: Date) {
  return fortalezaDay(new Date(endsAt.getTime() - 1));
}

/** Formats YYYY-MM-DD as DD/MM/AAAA without time-zone conversions. */
export function formatDay(day: string) {
  const match = ISO_DAY.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

export function manualAccessStatus(grant: Pick<GrantRecord, "startsAt" | "endsAt" | "revokedAt"> | null, at: Date): ManualAccessStatus {
  if (!grant) return "none";
  if (grant.revokedAt !== null) return "revoked";
  if (grant.endsAt.getTime() <= at.getTime()) return "expired";
  if (grant.startsAt.getTime() > at.getTime()) return "scheduled";
  return "active";
}

export function toManualAccessView(grant: GrantRecord | null, at: Date): ManualAccessView {
  if (!grant) return { status: "none", startsAt: null, endsAt: null, firstDay: null, lastDay: null, updatedAt: null };
  return {
    status: manualAccessStatus(grant, at),
    startsAt: grant.startsAt.toISOString(), endsAt: grant.endsAt.toISOString(),
    firstDay: fortalezaDay(grant.startsAt), lastDay: lastDayOf(grant.endsAt), updatedAt: grant.updatedAt.toISOString(),
  };
}

/**
 * New grant from `startDate` to `endDate` (inclusive Fortaleza days). Null when invalid: start before today or more
 * than MANUAL_ACCESS_MAX_DAYS ahead, end before start, or longer than MANUAL_ACCESS_MAX_DAYS days.
 */
export function grantPeriod(startDate: string, endDate: string, at: Date) {
  if (!isCalendarDay(startDate) || !isCalendarDay(endDate)) return null;
  const today = fortalezaDay(at);
  if (startDate < today || inclusiveDays(today, startDate) > MANUAL_ACCESS_MAX_DAYS) return null;
  if (endDate < startDate || inclusiveDays(startDate, endDate) > MANUAL_ACCESS_MAX_DAYS) return null;
  return { startsAt: dayStart(startDate), endsAt: dayStart(addDays(endDate, 1)) };
}

/**
 * Renewal of a grant that is still active or scheduled: the new last day must be later than the current one and the
 * remaining validity, counted from today (or from the start of a scheduled grant), is at most MANUAL_ACCESS_MAX_DAYS.
 */
export function renewalEnd(endDate: string, grant: Pick<GrantRecord, "startsAt" | "endsAt">, at: Date) {
  if (!isCalendarDay(endDate)) return null;
  const endsAt = dayStart(addDays(endDate, 1));
  if (endsAt.getTime() <= grant.endsAt.getTime()) return null;
  const today = fortalezaDay(at);
  const firstDay = fortalezaDay(grant.startsAt);
  const base = firstDay > today ? firstDay : today;
  if (inclusiveDays(base, endDate) > MANUAL_ACCESS_MAX_DAYS) return null;
  return { endsAt };
}

/**
 * Paid subscription summary for the panel, from the subscriptions that are `active` and not yet ended. Contiguous
 * periods (the webhook stacks renewals right after the current end) are shown as one validity. Read-only display:
 * the access decision itself is made by requireActiveSubscription() on the server.
 */
export function toPaidAccessView(current: { startDate: Date; endDate: Date }[], total: number, at: Date): PaidAccessView {
  const periods = [...current].filter(row => row.endDate.getTime() > at.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (periods.length === 0) return { status: total > 0 ? "inactive" : "none", endsAt: null, lastDay: null };
  let end = periods[0].endDate;
  for (const period of periods.slice(1)) {
    if (period.startDate.getTime() > end.getTime()) break;
    if (period.endDate.getTime() > end.getTime()) end = period.endDate;
  }
  const status: PaidAccessStatus = periods[0].startDate.getTime() <= at.getTime() ? "active" : "scheduled";
  return { status, endsAt: end.toISOString(), lastDay: lastDayOf(end) };
}

/** Panel labels (display only: the access decision is requireActiveSubscription() on the server). */
export function paidAccessLabel(paid: PaidAccessView) {
  if (paid.status === "active") return `vigente até ${formatDay(paid.lastDay ?? "")}`;
  if (paid.status === "scheduled") return `agendada até ${formatDay(paid.lastDay ?? "")}`;
  if (paid.status === "inactive") return "sem assinatura vigente";
  return "nenhuma";
}

export function manualAccessLabel(access: ManualAccessView) {
  if (access.status === "active") return `ativo até ${formatDay(access.lastDay ?? "")}`;
  if (access.status === "scheduled") return `agendado de ${formatDay(access.firstDay ?? "")} a ${formatDay(access.lastDay ?? "")}`;
  if (access.status === "expired") return `expirado em ${formatDay(access.lastDay ?? "")}`;
  if (access.status === "revoked") return "revogado";
  return "não concedido";
}
