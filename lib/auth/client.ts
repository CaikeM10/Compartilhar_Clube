"use client";
import { createAuthClient } from "better-auth/client";
import type { User } from "@/lib/types";

export type AccountSession = { user: User; destination: "/admin/dashboard" | "/aluno/dashboard" };

/** Uses same-origin cookies; dependency injection is only for isolated tests. */
export function createSessionClient(fetchImpl: typeof fetch = (...args) => fetch(...args), baseURL?: string) {
  const auth = createAuthClient({ baseURL, fetchOptions: { customFetchImpl: fetchImpl } });

  async function read(): Promise<AccountSession | null> {
    const response = await fetchImpl(`${baseURL ?? ""}/api/account/session`, { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error("AUTH_UNAVAILABLE");
    const data = await response.json();
    if (!data.user || !["admin", "student"].includes(data.user.role) ||
        !["/admin/dashboard", "/aluno/dashboard"].includes(data.destination)) throw new Error("INVALID_SESSION_RESPONSE");
    return {
      user: { id: data.user.id, name: data.user.name, email: data.user.email, role: data.user.role, createdAt: new Date(data.user.createdAt) },
      destination: data.destination,
    };
  }

  async function signIn(email: string, password: string) {
    try {
      const result = await auth.signIn.email({ email, password, rememberMe: true });
      if (result.error) throw new Error("AUTHENTICATION_FAILED");
      const session = await read();
      if (!session) throw new Error("AUTHENTICATION_FAILED");
      return session;
    } catch { throw new Error("AUTHENTICATION_FAILED"); }
  }

  async function signOut() {
    const result = await auth.signOut();
    if (result.error) throw new Error("SIGN_OUT_FAILED");
  }

  return { read, signIn, signOut };
}

export const sessionClient = createSessionClient();
