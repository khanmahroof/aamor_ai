import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Allows postinstall generation before .env exists; never uses cloud credentials.
  datasource: { url: process.env.DATABASE_URL ?? "file:./dev.db" },
});
