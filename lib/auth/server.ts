import "server-only";
import { PrismaClient } from "@prisma/client";
import { createServerAuth, readAuthEnvironment, type ServerAuth } from "./config";

// Lazy initialization: importing a route/building must not contact the database
// or require production credentials. No migrations or schema writes here.
let instance: { auth: ServerAuth; db: PrismaClient } | undefined;

export function getAuthInfrastructure() {
  if (!instance) {
    const environment = readAuthEnvironment(process.env);
    // Separate log-free client so auth failures cannot leak through lib/prisma logs.
    const db = new PrismaClient({ log: [] });
    instance = { db, auth: createServerAuth(db, environment) };
  }
  return instance;
}
