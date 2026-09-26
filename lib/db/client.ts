import "server-only";
import { createDatabaseClient } from "./create-client";

const globalForDb = globalThis as unknown as {
  aamorDb?: ReturnType<typeof createDatabaseClient>;
};

/** Lazy initialization keeps builds independent of a live database. Node runtime only. */
export function getDatabase() {
  if (!globalForDb.aamorDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required.");
    globalForDb.aamorDb = createDatabaseClient(url);
  }
  return globalForDb.aamorDb;
}
