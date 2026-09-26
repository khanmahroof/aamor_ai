import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname, basename } from "node:path";
import { test } from "node:test";
import { createDatabaseClient } from "../lib/db/create-client";

test("migrations, persistence, constraints, and cascades on an isolated database", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "aamor-db-test-"));
  const databasePath = join(directory, "test.db");
  const url = `file:${databasePath.replaceAll("\\", "/")}`;
  await writeFile(databasePath, "");
  let db = createDatabaseClient(url);
  try {
    const migration = spawnSync(
      process.execPath,
      [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url },
        encoding: "utf8",
        timeout: 60000,
      },
    );
    assert.equal(
      migration.status,
      0,
      migration.stderr || migration.error?.message,
    );

    const alice = await db.user.create({
      data: {
        email: "alice@example.test",
        settings: { create: {} },
        accounts: {
          create: {
            type: "oauth",
            provider: "google",
            providerAccountId: "alice-test",
          },
        },
        sessions: {
          create: {
            sessionToken: "test-only-session",
            expires: new Date(Date.now() + 60000),
          },
        },
      },
    });
    const bob = await db.user.create({ data: { email: "bob@example.test" } });
    const conversation = await db.conversation.create({
      data: {
        userId: alice.id,
        selectedModel: "ollama/test-model",
        messages: {
          create: {
            role: "user",
            content: "A persisted message",
            attachments: {
              create: {
                filename: "notes.txt",
                mimeType: "text/plain",
                size: 12,
                storagePath: "test/unique-key.txt",
              },
            },
          },
        },
      },
    });

    await t.test("records survive a disconnect and reconnect", async () => {
      await db.$disconnect();
      db = createDatabaseClient(url);
      const saved = await db.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: { messages: true },
      });
      assert.equal(saved.messages[0].content, "A persisted message");
      assert.equal(saved.messages[0].status, "completed");
      assert.equal(
        (
          await db.userSettings.findUniqueOrThrow({
            where: { userId: alice.id },
          })
        ).preferredProvider,
        "ollama",
      );
    });

    await t.test(
      "unique emails, OAuth identities, session tokens, and file keys",
      async () => {
        await assert.rejects(db.user.create({ data: { email: alice.email } }), {
          code: "P2002",
        });
        await assert.rejects(
          db.account.create({
            data: {
              userId: bob.id,
              type: "oauth",
              provider: "google",
              providerAccountId: "alice-test",
            },
          }),
          { code: "P2002" },
        );
        await assert.rejects(
          db.session.create({
            data: {
              userId: bob.id,
              sessionToken: "test-only-session",
              expires: new Date(),
            },
          }),
          { code: "P2002" },
        );
        const message = await db.message.findFirstOrThrow({
          where: { conversationId: conversation.id },
        });
        await assert.rejects(
          db.attachment.create({
            data: {
              messageId: message.id,
              filename: "other.txt",
              mimeType: "text/plain",
              size: 0,
              storagePath: "test/unique-key.txt",
            },
          }),
          { code: "P2002" },
        );
      },
    );

    await t.test(
      "foreign keys reject orphans and usage attributed to a different owner",
      async () => {
        await assert.rejects(
          db.message.create({
            data: {
              conversationId: "missing",
              role: "user",
              content: "orphan",
            },
          }),
          { code: "P2003" },
        );
        await assert.rejects(
          db.usageRecord.create({
            data: {
              userId: bob.id,
              conversationId: conversation.id,
              provider: "ollama",
              model: "test-model",
            },
          }),
          { code: "P2003" },
        );
        await db.usageRecord.create({
          data: {
            userId: alice.id,
            conversationId: conversation.id,
            provider: "ollama",
            model: "test-model",
            estimated: true,
            inputTokens: 4,
            outputTokens: 2,
            totalTokens: 6,
          },
        });
      },
    );

    await t.test(
      "conversation deletion removes messages, attachment metadata, and usage",
      async () => {
        await db.conversation.delete({ where: { id: conversation.id } });
        assert.equal(await db.message.count(), 0);
        assert.equal(await db.attachment.count(), 0);
        assert.equal(await db.usageRecord.count(), 0);
        assert.equal(await db.user.count(), 2);
      },
    );

    await t.test(
      "user deletion cascades through the full owned record graph",
      async () => {
        await db.conversation.create({
          data: {
            userId: alice.id,
            messages: { create: { role: "assistant", content: "test" } },
          },
        });
        await db.user.delete({ where: { id: alice.id } });
        for (const count of await Promise.all([
          db.account.count(),
          db.session.count(),
          db.userSettings.count(),
          db.conversation.count(),
          db.message.count(),
        ]))
          assert.equal(count, 0);
        assert.equal(await db.user.count(), 1);
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: bob.id } })).email,
          bob.email,
        );
      },
    );
  } finally {
    await db.$disconnect();
    // Only the freshly generated test directory is removed; never DATABASE_URL.
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("aamor-db-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
