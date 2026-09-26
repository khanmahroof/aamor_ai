import "dotenv/config";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";

const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:") || url.length <= 5 || url.includes("?")) {
  throw new Error("Set DATABASE_URL to a local file path, e.g. file:./dev.db.");
}
const path = resolve(url.slice(5));
mkdirSync(dirname(path), { recursive: true });
// Prisma 7.10 on Windows needs the file to exist before migrate dev.
// Exclusive creation never truncates an existing database.
try {
  closeSync(openSync(path, "wx", 0o600));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
}
