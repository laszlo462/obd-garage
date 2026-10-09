# Node 24 runs the server's TypeScript directly, with no build step

The server runs as `node src/server/index.ts` on Node 24 (type stripping is stable from 24.12), the same version everywhere: locally, in Claude Code cloud sessions (installed by the cloud setup script, since they ship Node 20–22), and in the `node:24-alpine` image. `tsc --noEmit` type-checks; only the client is built (by Vite). We chose this over `tsx` or compiling to `dist/` to keep one runtime and no server build.

## Consequences

Server code is limited to erasable TypeScript syntax: imports carry the `.ts` extension, types come in through `import type`, and there are no enums, namespaces or parameter properties. `tsconfig.json` enforces this with `erasableSyntaxOnly`, `verbatimModuleSyntax` and `allowImportingTsExtensions`. Node ignores `tsconfig.json` at runtime, so path aliases do not work on the server.
