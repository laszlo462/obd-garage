// PROTOTYPE, throwaway. Serves index.html on the LAN so an iPhone on the same Wi-Fi can open it.
//   node prototypes/ui-design/serve.ts [port]
// The page holds only synthetic data (fake VIN, made-up drives), so nothing here needs scrubbing.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const port = Number(process.argv[2] ?? 5180);
const file = join(import.meta.dirname, "index.html");

createServer((_req, res) => {
  // Re-read on every request so an edit shows up on reload.
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(readFileSync(file));
}).listen(port, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a!.address);
  console.log(`serving on:\n${["localhost", ...ips].map((ip) => `  http://${ip}:${port}/?variant=A`).join("\n")}`);
});
