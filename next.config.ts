import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: () =>
    process.env.NODE_ENV === "development"
      ? [
          {
            source: "/:path*",
            has: [{ type: "host", value: "127.0.0.1" }],
            destination: "http://localhost:3000/:path*",
            permanent: false,
          },
        ]
      : [],
};

/* Workflow transforms the "use workflow"/"use step" directives and mounts
   its durable-execution handlers (ADR 0005). */
export default withWorkflow(nextConfig);
