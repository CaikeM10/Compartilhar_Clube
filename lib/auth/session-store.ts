import type { User } from "@/lib/types";
import type { createSessionClient } from "./client";

export type SessionSnapshot = { user: User | null; isLoading: boolean };

/** Per-provider memory only. Outdated refreshes must not resurrect a logged-out user. */
export function createSessionStore(client: ReturnType<typeof createSessionClient>) {
  let snapshot: SessionSnapshot = { user: null, isLoading: true };
  const initial = snapshot;
  const listeners = new Set<() => void>();
  let revision = 0;
  let mutating = false;
  const publish = (next: SessionSnapshot) => { snapshot = next; listeners.forEach(fn => fn()); };

  async function refresh() {
    if (mutating) return;
    const current = ++revision;
    let user: User | null = null;
    try { user = (await client.read())?.user ?? null; } catch { /* Fail closed in the visual state. */ }
    if (current === revision) publish({ user, isLoading: false });
  }

  async function login(email: string, password: string) {
    if (mutating) throw new Error("AUTH_OPERATION_PENDING");
    mutating = true;
    ++revision;
    publish({ user: null, isLoading: true });
    try {
      const session = await client.signIn(email, password);
      publish({ user: session.user, isLoading: false });
      return session.destination;
    } catch {
      publish({ user: null, isLoading: false });
      throw new Error("AUTHENTICATION_FAILED");
    } finally { mutating = false; }
  }

  async function logout() {
    if (mutating) throw new Error("AUTH_OPERATION_PENDING");
    mutating = true;
    ++revision;
    try {
      await client.signOut();
      publish({ user: null, isLoading: false });
    } finally { mutating = false; }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh, login, logout,
  };
}
