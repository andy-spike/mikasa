"use client";

/**
 * The browser half of Better Auth. The base URL is the current origin, so
 * the same bundle works on localhost, previews and production.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
