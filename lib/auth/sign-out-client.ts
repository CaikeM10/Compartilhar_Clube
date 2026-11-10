"use client";

import { sessionClient } from "./client";

/** Compatibility export; UI callers should use useAuth().logout() to update state. */
export const signOutAccount = () => sessionClient.signOut();
