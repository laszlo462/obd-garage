// Starts the Hono server (node --watch) and the Vite dev server together.
// Vite proxies /api to the server. Ctrl+C stops both.
import { type ChildProcess, spawn } from "node:child_process";

const apiPort = process.env.API_PORT ?? "3001";
const env = { ...process.env, PORT: apiPort, API_PORT: apiPort };

const children: ChildProcess[] = [
  spawn(process.execPath, ["--watch", "src/server/index.ts"], { env, stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { env, stdio: "inherit" }),
];

function stop(code = 0) {
  for (const child of children) child.kill();
  process.exit(code);
}

for (const child of children) child.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
