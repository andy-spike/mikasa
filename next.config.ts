import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

/* Workflow transforms the "use workflow"/"use step" directives and mounts
   its durable-execution handlers (ADR 0005). */
export default withWorkflow(nextConfig);
