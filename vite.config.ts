import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

const apiPort = process.env.API_PORT ?? "3001";

export default defineConfig({
  root: "src/web",
  plugins: [preact()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: { proxy: { "/api": `http://localhost:${apiPort}` } },
});
