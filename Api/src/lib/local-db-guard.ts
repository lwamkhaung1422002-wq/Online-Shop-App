const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertLocalDatabaseUrl(databaseUrl = process.env.DATABASE_URL): void {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const url = new URL(databaseUrl);
  if (!localHosts.has(url.hostname)) {
    throw new Error(
      `Refusing to modify a non-local database host: ${url.hostname}. Use a localhost PostgreSQL database for local seed/reset/tests.`,
    );
  }
}
