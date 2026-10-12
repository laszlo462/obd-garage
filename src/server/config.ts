export type Config = { port: number; dataDir: string };

/** Reads the server settings from the environment. `DATA_DIR` is the data root. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: Number(env.PORT ?? 8080),
    dataDir: env.DATA_DIR ?? "/data",
  };
}
