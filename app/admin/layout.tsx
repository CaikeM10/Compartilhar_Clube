import type { ReactNode } from "react";
import { requirePageAccess } from "@/lib/auth/page-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminAreaLayout({ children }: { children: ReactNode }) {
  await requirePageAccess("admin");
  return children;
}
