import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/session";

export const { GET, POST } = toNextJsHandler(auth.handler);
