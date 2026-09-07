// Standalone transport check. No model calls or application data.
import { createServer } from "node:http";
import { createQueue } from "../node_modules/@workflow/world-local/dist/queue.js";
const delay = Number(process.argv[2] ?? 310000);
const server = createServer((req, res) => {
  req.resume();
  setTimeout(() => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  }, delay);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const queue = createQueue({ baseUrl: `http://127.0.0.1:${server.address().port}` });
const errors = [];
const original = console.error;
console.error = (...args) => {
  errors.push(args);
  original(...args);
};
await queue.queue("__wkf_step_test", { workflowRunId: "probe", stepId: "probe" });
await new Promise((resolve) => setTimeout(resolve, delay + 1500));
try {
  await queue.close();
} catch {
  /* Bun's Undici shim lacks close(). */
}
server.closeAllConnections();
server.close();
if (errors.length) process.exitCode = 1;
console.log(
  JSON.stringify({
    runtime: process.versions.bun ? "bun" : "node",
    delay,
    queueErrors: errors.length,
  }),
);
