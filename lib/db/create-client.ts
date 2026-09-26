import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";

/** Keep the database driver isolated here for a future PostgreSQL adapter. */
export function createDatabaseClient(url: string) {
  if (!url.startsWith("file:") || url.length <= 5) {
    throw new Error("DATABASE_URL must be a local SQLite file URL.");
  }
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
    // Never log queries: they may contain private messages or auth data.
    log: [],
  });
}
