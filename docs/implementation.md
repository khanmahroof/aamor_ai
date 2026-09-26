# Implementation record: phases 3–15

## Phase 3 — Authentication
Created lib/auth/{options,password,session}.ts, lib/validation/auth.ts,
lib/http.ts, lib/rate-limit/index.ts, types/next-auth.d.ts,
app/api/auth/[...nextauth]/route.ts, app/api/register/route.ts,
components/auth-form.tsx, app/login/page.tsx, app/register/page.tsx,
app/chat/page.tsx, scripts/setup.ts, tests/auth.test.ts.
Updated app/page.tsx, package manifests and environment configuration.
NextAuth 4.24.15 is stable and supports Next 16 asynchronous headers/cookies.
JWT sessions use HttpOnly NextAuth cookies; credentials are scrypt-hashed.
Google is optional and does not silently link existing password accounts.
Checks: strict typecheck and 2 authentication unit tests passed. Lint warning
was corrected by using Next navigation.

## Phase 4 — AI providers
Created lib/ai/types.ts, streams.ts, registry.ts, providers/{base,ollama,openai,anthropic}.ts,
app/api/models/route.ts, tests/providers.test.ts.
Ollama discovers installed models/capabilities. Cloud providers are hidden
without keys. All adapters implement generate/stream/listModels.
Checks: typecheck passed; protocol tests cover streaming, usage and premature EOF.
Official API references:
https://docs.ollama.com/api/chat
https://developers.openai.com/api/docs/guides/streaming-responses
https://platform.claude.com/docs/en/build-with-claude/streaming

## Phase 5 — Streaming chat endpoint
Created lib/chat/generate.ts, lib/ai/context/index.ts, lib/validation/chat.ts,
lib/db/conversations.ts, app/api/chat/route.ts, tests/chat.test.ts.
Added Message.position and the message_order migration for deterministic ordering.
Server loads trusted history, validates ownership, limits rates/concurrency/context,
streams chunks and checkpoints partial responses. Checks: typecheck and three
validation/context/rate tests passed.

## Phase 6 — Chat UI
Created components/chat/{chat-client,composer}.tsx, lib/{client-api,ui-types}.ts,
app/api/conversations/route.ts; replaced app/chat/page.tsx and app/globals.css.
Responsive UI, model picker, composer, empty state, real chunk rendering,
manual-scroll handling, and model-offline recovery. Typecheck passed.
Corrected the lint effect warning by scheduling initial loading asynchronously.

## Phase 7 — Conversation management
Created app/api/conversations/[id]/route.ts and components/sidebar/history.tsx.
Added owned list/search/rename/delete, pagination, earlier-message loading,
collapsible navigation and refreshed recent activity in chat-client.tsx.
Search covers titles and persisted message text.

## Phase 8 — Markdown and code
Created components/chat/{markdown,message-list}.tsx; added react-markdown,
remark-gfm and rehype-highlight. Supports tables, lists, links, quotes,
syntax highlighting and copy buttons. Raw HTML is skipped and external
model-generated images are not fetched. Typecheck and lint passed.

## Phase 9 — Stop, regenerate, edit
Added lib/chat/active.ts and app/api/chat/stop/route.ts. Extended validated
chat actions and transactionally replaces responses or truncates later turns.
UI supports inline edits and regeneration without duplicating user messages.
Stop aborts provider fetch, checkpoints partial text, and releases locks.
Typecheck and lint passed.

## Phase 10 — Private uploads
Added PendingUpload and Attachment.extractedText with private_uploads migration.
Created lib/files/{storage,validate,context}.ts, scripts/extract-pdf.mjs,
app/api/uploads/route.ts, app/api/files/[id]/route.ts, chat/attachments.tsx,
tests/files.test.ts. Files use server UUID storage keys and owner-scoped routes.
Images are decoded/resized/re-encoded. PDF parsing runs in a bounded child process.
Only ranked document excerpts enter context. A limited number of recent images are retained within the model context budget;
older excluded images get omission notes. Image inputs require a vision model.
Checks: 2 upload tests, schema generation, typecheck and lint passed.

## Phase 11 — Preferences
Added per-user settings API, validation, settings page and form; theme and preferred
model persist. Custom instructions and temperature feed supported provider requests.
Typecheck/lint passed.

## Phase 12 — Usage and limits
Added authenticated usage page with counts, usage by model, reported vs estimated
tokens, and recent activity. Local use never gets an invented currency cost.
Existing per-user rate and concurrent generation limits are configurable.
Typecheck/lint passed.

## Phase 13 — Security review
Added security headers, CSP, private file serving, bounded hashing concurrency,
safe error responses, explicit ownership guards and request-size enforcement.
No raw model HTML or secrets are rendered. Single-process limits remain a documented
local deployment constraint; cloud credentials are optional and server-only.

## Phase 14 — UI polish and final review
Renamed the application, metadata, package and assistant identity to Aamor.
Separated chat state/network orchestration into use-chat-controller.ts and kept
chat-client.tsx focused on presentation. Added responsive navigation, persistent
theme, accessible status/error feedback, scroll-to-latest, keyboard shortcuts and
model refresh that bypasses cached availability. Preserved the existing user
account and browser draft during verification.

## Phase 15 — Delivery and verification
Replaced the initial README with complete installation, Ollama, optional cloud/OAuth,
configuration, production startup, security boundaries, backup and troubleshooting
instructions. Updated .env.example and database architecture notes.
Production build, TypeScript and lint passed after the final UI refactor.
Dependency audit reported zero vulnerabilities. Final automated test counts are
recorded below after completion. Real Ollama and cloud inference were not live-tested:
Ollama is absent and optional cloud credentials are not configured. The isolated
HTTP integration suite runs a real production Next.js server with a fixture provider.

Final results: 17 unit/database/provider tests and 10 HTTP integration tests passed
(27 total, including parent test cases). Typecheck, ESLint, production build and
npm audit all passed; audit reported 0 vulnerabilities.
