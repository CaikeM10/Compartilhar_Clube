import "server-only";
import type { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

export function readAuthEnvironment(env: NodeJS.ProcessEnv) {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.trim().length < 32) throw new Error("AUTH_SECRET_REQUIRED_MIN_32_CHARACTERS");
  let url: URL;
  try { url = new URL(env.BETTER_AUTH_URL ?? ""); }
  catch { throw new Error("AUTH_URL_REQUIRED"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && local && env.NODE_ENV !== "production"))) {
    throw new Error("AUTH_URL_INVALID_USE_HTTPS_OR_LOCAL_DEVELOPMENT");
  }
  return { secret, baseURL: url.origin, secureCookies: url.protocol === "https:" };
}

/** Dependency injection is for isolated integration tests; never accepts browser input. */
export function createServerAuth(db: PrismaClient, environment: ReturnType<typeof readAuthEnvironment>) {
  return betterAuth({
    appName: "Compartilhar Clube",
    baseURL: environment.baseURL,
    basePath: "/api/auth",
    secret: environment.secret,
    trustedOrigins: [environment.baseURL],
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: { type: ["STUDENT", "ADMIN"], defaultValue: "STUDENT", required: false, input: false, returned: false },
        disabledAt: { type: "date", required: false, input: false, returned: false },
      },
      // No deletion endpoint until financial retention and Restrict handling are designed.
      deleteUser: { enabled: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: environment.secureCookies,
      cookiePrefix: "compartilhar-clube",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/", secure: environment.secureCookies },
      crossSubDomainCookies: { enabled: false },
    },
    // Avoid logging raw adapter errors, credentials or user records.
    logger: { disabled: true },
    hooks: {
      before: createAuthMiddleware(async ctx => {
        if (["/sign-up/email", "/update-user"].includes(ctx.path)) {
          const body = ctx.body as Record<string, unknown> | undefined;
          if (body && ["role", "emailVerified", "disabledAt", "userId", "id"].some(key => Object.hasOwn(body, key))) {
            throw new APIError("BAD_REQUEST", { message: "Invalid user fields" });
          }
        }
        // Also deny existing sessions of accounts blocked after sign-in.
        // Logout remains available so a blocked user can clear their cookie.
        if (ctx.path !== "/sign-out" && ctx.headers?.has("cookie")) {
          const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
          if (session) {
            const user = await db.user.findUnique({ where: { id: session.user.id }, select: { disabledAt: true } });
            if (!user || user.disabledAt !== null) throw new APIError("FORBIDDEN", { message: "Access denied" });
          }
        }
      }),
    },
    databaseHooks: {
      session: {
        create: {
          before: async session => {
            const user = await db.user.findUnique({ where: { id: session.userId }, select: { disabledAt: true } });
            if (!user || user.disabledAt !== null) throw new APIError("FORBIDDEN", { message: "Access denied" });
            return { data: session };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

export type ServerAuth = ReturnType<typeof createServerAuth>;
