# Database architecture

The Prisma schema and three committed migrations define the persistent SQLite data model. Run commands from the project root; CLI and application both resolve `file:./dev.db` there. `npm run setup` applies migrations without replacing existing data.

| Model | Purpose |
| --- | --- |
| User | Canonical unique email, nullable scrypt password hash, optional verified OAuth identity |
| Account | Google provider linkage, unique provider/account ID |
| Session | Auth.js-compatible schema; the current app uses signed JWT cookie sessions instead |
| Conversation | Owned title, selected provider/model and activity timestamps |
| Message | Ordered conversation turn, role, text, model and completion status |
| Attachment | Message-owned private file metadata and optional extracted document text |
| PendingUpload | Owner-scoped staged uploads awaiting message attachment |
| UserSettings | One row per user with instructions, provider/model, theme and temperature |
| UsageRecord | User/conversation/provider/model, nullable counts and estimated flag |

Message position has a unique `(conversationId, position)` constraint. Regeneration replaces the latest response; editing an earlier user turn removes later messages transactionally. The generation service explicitly updates conversation activity and periodically checkpoints partial output. Interrupted/failed responses retain their status.

A composite `(conversationId, userId)` foreign key prevents usage attribution to another user's conversation. Routes enforce ownership from the session before all reads and writes; child-file ownership is derived through message/conversation relations. The database does not implement row-level authorization.

User deletion cascades to related rows, including conversations and pending uploads. Conversation deletion cascades to messages and usage, and message deletion to attachment metadata. Application routes attempt physical attachment cleanup; direct database deletion does not remove files. Failed filesystem operations can leave orphans, so maintenance should reconcile storage against both Attachment and PendingUpload keys.

Pending uploads become attachments in the send transaction. Pending files older than 24 hours are removed when upload API cleanup runs, subject to ownership/race checks. Extracted text is private database content and is not returned as file metadata to the browser.

`lib/db/create-client.ts` isolates the SQLite adapter. `client.ts` lazily caches the server-only client and avoids query logging. Zod request schemas validate values before persistence. Nullable token counts mean unavailable; estimated usage is explicitly marked.

Back up the database and upload directory together with the application stopped. Keep the authentication secret stable and private. SQLite and the in-memory generation/rate state support one persistent server process; multi-replica operation needs an architecture change.
