import "server-only";
import { redirect } from "next/navigation";
import {
  requireSession, requirePasswordChangeSession, requireAdmin, requirePrincipalAdmin, requireActiveSubscription,
} from "./authorization";
import { createPageAccess } from "./page-access-core";

export const requirePageAccess = createPageAccess(
  { requireSession, requirePasswordChangeSession, requireAdmin, requirePrincipalAdmin, requireActiveSubscription }, redirect,
);
