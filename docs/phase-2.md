# Phase 2: Prisma and SQLite

## Created
- prisma/schema.prisma: User, Account, Session, Conversation, Message, Attachment, UserSettings, UsageRecord; relationships, indexes, enum types, cascades.
- prisma/migrations/20260925171853_init/migration.sql: initial schema.
- prisma/migrations/migration_lock.toml: SQLite migration provider lock.
- prisma.config.ts: schema/migration locations and environment-backed URL.
- lib/db/create-client.ts: server-only SQLite adapter factory.
- lib/db/client.ts: lazy cached server database client.
- scripts/prepare-database.ts: non-destructive file preparation.
- tests/database.test.ts: isolated migration-backed integration suite.
- docs/database.md: ownership boundaries, lifecycle, and PostgreSQL migration guidance.
- docs/phase-2.md: this record.
- generated/prisma/: generated client (ignored, regenerated on install).
- .env and dev.db: local configuration and migrated database (ignored).

## Modified
- package.json and package-lock.json: pinned Prisma dependencies, generation/migration/test scripts, patched transitive overrides.
- .env.example: clarified project-relative database URL.
- .gitignore: generated client exclusion.
- eslint.config.mjs: exclude generated client from lint.
- app/page.tsx: accurate Phase 2 status.
- README.md: working SQLite installation, migration, testing, and troubleshooting instructions.

## Verification completed
- prisma migrate dev --name init: initial migration applied.
- npm run db:migrate: repeat invocation confirmed already in sync.
- npm run db:validate: schema valid.
- npm run db:generate / postinstall: generated client successfully.
- npm run test:db: 6 passed, 0 failed (parent test plus five behavior checks).
- npm run lint: passed.
- npm run typecheck: passed.
- npm run build: passed.
- npm install audit: zero known vulnerabilities after targeted overrides.

The test suite verifies persistence across reconnects, unique email/provider/session/storage keys,
orphan rejection, cross-owner usage rejection, and cascades without touching dev.db.

## Resolved issues
Prisma 7.10's migration engine failed on this Windows host until the target
SQLite file existed. db:prepare uses exclusive creation, preserving existing
files, and runs before db:migrate/db:deploy.

Prisma tooling brought vulnerable deepmerge-ts/mysql2 versions. Overrides select
8.0.2/3.24.4; migration, config, generation, tests, and build passed afterward.
No downgrade or release candidate was introduced.

## Phase boundary
This phase adds persistence infrastructure, not public data access. Authentication,
session-derived ownership filters, Zod request validation, and file cleanup are
required in subsequent phases. Database relationships alone are not authorization.
Next: Phase 3 authentication.
