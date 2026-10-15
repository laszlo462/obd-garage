import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

const apiPort = process.env.API_PORT ?? "3001";

export default defineConfig({
  root: "src/web",
  plugins: [preact()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  // A regex key, so the web module /api.tsx is not proxied with the /api/... routes.
  server: { proxy: { "^/api/": `http://localhost:${apiPort}` } },
});
