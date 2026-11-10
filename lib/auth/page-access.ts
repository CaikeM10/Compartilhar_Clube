import "server-only";
import { redirect } from "next/navigation";
import { requireSession, requireAdmin, requireActiveSubscription } from "./authorization";
import { createPageAccess } from "./page-access-core";

export const requirePageAccess = createPageAccess(
  { requireSession, requireAdmin, requireActiveSubscription }, redirect,
);
