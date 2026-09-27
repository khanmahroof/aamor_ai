import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type Server } from "node:http";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sseData } from "../lib/ai/streams";
const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as { port: number }).port),
    ),
  );
const stopServer = (server: Server) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

test(
  "HTTP integration: authentication, ownership, real streaming, editing, uploads, limits",
  { timeout: 180000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "aamor-e2e-"));
    const database = join(directory, "test.db");
    await writeFile(database, "");
    let received: { role: string; content: string; images?: string[] }[] = [];
    const provider = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/tags")
        return res.end(
          JSON.stringify({
            models: [{ name: "test-model" }, { name: "test-vision" }],
          }),
        );
      if (req.url === "/api/show")
        return res.end(
          JSON.stringify({
            capabilities: ["completion", "vision"],
            model_info: { "test.context_length": 8192 },
          }),
        );
      if (req.url !== "/api/chat") {
        res.statusCode = 404;
        return res.end();
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      received = data.messages;
      const prompt = received.at(-1)?.content ?? "";
      if (prompt.includes("PROVIDER_ERROR")) {
        res.statusCode = 500;
        return res.end("private provider detail");
      }
      res.setHeader("Content-Type", "application/x-ndjson");
      if (prompt.includes("EMPTY_RESPONSE"))
        return res.end('{"done":true,"message":{"content":""}}\n');
      res.write(JSON.stringify({ message: { content: "A streamed " } }) + "\n");
      const timer = setTimeout(
        () => {
          res.end(
            JSON.stringify({
              message: {
                content: "answer.\n\n```js\nconst local = true;\n```",
              },
              done: true,
              prompt_eval_count: 15,
              eval_count: 9,
            }) + "\n",
          );
        },
        prompt.includes("SLOW_RESPONSE") ? 15000 : 120,
      );
      res.on("close", () => clearTimeout(timer));
    });
    const providerPort = await listen(provider);
    const reservation = createServer();
    const port = await listen(reservation);
    await stopServer(reservation);
    const origin = `http://127.0.0.1:${port}`;
    const env = {
      ...process.env,
      DATABASE_URL: `file:${database.replaceAll("\\", "/")}`,
      AUTH_SECRET: randomBytes(48).toString("hex"),
      NEXTAUTH_URL: origin,
      OLLAMA_BASE_URL: `http://127.0.0.1:${providerPort}`,
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      UPLOAD_DIR: join(directory, "uploads"),
      GROQ_API_KEY: "",
      AI_DEFAULT_PROVIDER: "ollama",
      CHAT_RATE_LIMIT: "50",
      CHAT_TIMEOUT_MS: "5000",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    let app: ChildProcess | undefined;
    let logs = "";
    class Client {
      cookies = new Map<string, string>();
      async request(path: string, init: RequestInit = {}) {
        const response = await fetch(origin + path, {
          ...init,
          redirect: "manual",
          headers: {
            Origin: origin,
            Cookie: [...this.cookies]
              .map(([key, value]) => `${key}=${value}`)
              .join("; "),
            ...init.headers,
          },
        });
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(";")[0];
          const separator = pair.indexOf("=");
          this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
        }
        return response;
      }
      json(path: string, data: unknown, method = "POST") {
        return this.request(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      }
      async account(email: string) {
        const password = "eight123";
        assert.equal(
          (
            await this.json("/api/register", {
              name: "Test person",
              email,
              password,
            })
          ).status,
          201,
        );
        const csrf = await (await this.request("/api/auth/csrf")).json();
        const login = await this.request("/api/auth/callback/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            csrfToken: csrf.csrfToken,
            email,
            password,
            json: "true",
            callbackUrl: origin + "/chat",
          }),
        });
        assert.equal(login.status, 200);
        const session = await (await this.request("/api/auth/session")).json();
        assert.ok(session.user?.id, JSON.stringify(session));
        assert.equal(session.user.email, email);
        assert.equal((await this.json("/api/register", { name: "Duplicate", email, password })).status, 409);
      }
    }
    const alice = new Client();
    const bob = new Client();
    const anonymous = new Client();
    type Event = {
      type: string;
      text?: string;
      status?: string;
      error?: string;
      userMessage?: { id: string };
      usage?: { estimated: boolean };
    };
    async function events(response: Response) {
      assert.equal(
        response.status,
        200,
        await (response.status === 200 ? Promise.resolve("") : response.text()),
      );
      const result: Event[] = [];
      for await (const data of sseData(response.body!))
        result.push(JSON.parse(data));
      return result;
    }
    let conversationId = "";
    let firstUserId = "";
    let fileId = "";
    const chat = (text: string, extra = {}) =>
      alice.json("/api/chat", {
        conversationId,
        model: "ollama/test-model",
        messages: [{ role: "user", content: text }],
        ...extra,
      });
    try {
      const migration = spawnSync(
        process.execPath,
        [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
        { env, encoding: "utf8", timeout: 60000 },
      );
      assert.equal(migration.status, 0, migration.stderr);
      app = spawn(
        process.execPath,
        [
          resolve("node_modules/next/dist/bin/next"),
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      app.stdout?.on("data", (chunk) => {
        logs = (logs + chunk).slice(-12000);
      });
      app.stderr?.on("data", (chunk) => {
        logs = (logs + chunk).slice(-12000);
      });
      let ready = false;
      for (let i = 0; i < 120; i++) {
        try {
          if ((await fetch(origin + "/api/auth/csrf")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await delay(250);
      }
      assert.ok(ready, logs);
      await t.test(
        "private APIs reject anonymous access while the guest page is public",
        async () => {
          assert.equal(
            (await anonymous.request("/api/conversations")).status,
            401,
          );
          assert.equal((await anonymous.request("/api/models")).status, 401);
          assert.equal((await anonymous.request("/api/settings")).status, 401);
          assert.equal((await anonymous.json("/api/chat", {})).status, 401);
          const page = await anonymous.request("/chat");
          assert.equal(page.status, 200);
          assert.match(await page.text(), /Guest chat/);
          assert.equal((await anonymous.request("/settings")).status, 307);
        },
      );
      await t.test("guests stream without accounts, cannot access private data, and respect origin and usage limits", async () => {
        const models = await (await anonymous.request("/api/guest/models")).json();
        assert.equal(models.models[0].provider, "ollama");
        const input = { model: "ollama/test-model", messages: [{ role: "user", content: "Hello as a guest" }] };
        assert.equal((await anonymous.request("/api/guest/chat", { method: "POST", headers: { Origin: "https://untrusted.test", "Content-Type": "application/json" }, body: JSON.stringify(input) })).status, 403);
        assert.equal((await anonymous.json("/api/guest/chat", { ...input, conversationId: "private" })).status, 400);
        const guestEvents = await events(await anonymous.json("/api/guest/chat", input));
        assert.ok(guestEvents.some((event) => event.type === "text"));
        assert.ok(guestEvents.some((event) => event.type === "done"));
        assert.equal((await anonymous.request("/api/conversations")).status, 401);
        const failure = await events(await anonymous.json("/api/guest/chat", { ...input, messages: [{ role: "user", content: "PROVIDER_ERROR" }] }));
        assert.ok(failure.some((event) => event.type === "error"));
        assert.ok(!JSON.stringify(failure).includes("private provider detail"));
        // Invalid attempts also consume the global abuse budget.
        for (let i = 0; i < 7; i++) await anonymous.json("/api/guest/chat", {});
        const limited = await anonymous.json("/api/guest/chat", input);
        assert.equal(limited.status, 429);
        assert.ok(limited.headers.get("retry-after"));
      });
      await alice.account("alice@example.test");
      await bob.account("bob@example.test");
      await t.test(
        "create, persist and isolate conversations and settings",
        async () => {
          const created = await alice.json("/api/conversations", {});
          assert.equal(created.status, 201);
          conversationId = (await created.json()).id;
          assert.equal(
            (await bob.request(`/api/conversations/${conversationId}`)).status,
            404,
          );
          assert.equal(
            (
              await bob.json(
                `/api/conversations/${conversationId}`,
                { title: "stolen" },
                "PATCH",
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await bob.json(
                `/api/conversations/${conversationId}`,
                {},
                "DELETE",
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await bob.json("/api/chat", {
                conversationId,
                model: "ollama/test-model",
                messages: [{ role: "user", content: "bad" }],
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await alice.json(
                "/api/settings",
                { systemPrompt: "Use concise answers.", theme: "dark" },
                "PATCH",
              )
            ).status,
            200,
          );
          assert.equal(
            (await (await bob.request("/api/settings")).json()).systemPrompt,
            "",
          );
          assert.equal(
            (await alice.json("/api/settings", { userId: "other" }, "PATCH"))
              .status,
            400,
          );
          const noOrigin = await alice.request("/api/conversations", {
            method: "POST",
            headers: { Origin: "https://evil.test" },
          });
          assert.equal(noOrigin.status, 403);
        },
      );
      await t.test(
        "streamed chunks, completed save, usage, and model context",
        async () => {
          const chunks = await events(await chat("Hello integration test"));
          assert.ok(chunks.filter((e) => e.type === "text").length >= 2);
          assert.equal(chunks.at(-1)?.status, "completed");
          assert.equal(chunks.at(-1)?.usage?.estimated, false);
          firstUserId = chunks[0].userMessage!.id;
          assert.equal(received[0].content, "Use concise answers.");
          const saved = await (
            await alice.request(`/api/conversations/${conversationId}`)
          ).json();
          assert.equal(saved.messages.length, 2);
          assert.ok(saved.messages[1].content.includes("streamed answer"));
          assert.equal(
            (
              await (
                await alice.request("/api/conversations?q=integration")
              ).json()
            ).items.length,
            1,
          );
          assert.equal(
            (await chat("invalid", { model: "ollama/not-installed" })).status,
            400,
          );
          assert.equal(
            (await chat("invalid", { userId: "other" })).status,
            400,
          );
        },
      );
      await t.test(
        "regenerate does not duplicate users; edits remove later turns",
        async () => {
          await events(
            await chat("", {
              action: "retry",
              messageId: firstUserId,
              messages: [],
            }),
          );
          assert.equal(
            (
              await (
                await alice.request(`/api/conversations/${conversationId}`)
              ).json()
            ).messages.length,
            2,
          );
          await events(await chat("Second user turn"));
          await events(
            await chat("Edited first turn", {
              action: "edit",
              messageId: firstUserId,
            }),
          );
          const saved = await (
            await alice.request(`/api/conversations/${conversationId}`)
          ).json();
          assert.equal(saved.messages.length, 2);
          assert.equal(saved.messages[0].content, "Edited first turn");
        },
      );
      await t.test(
        "uploads are private and passed as document context",
        async () => {
          const form = new FormData();
          form.append(
            "file",
            new File(["The secret project name is Juniper."], "notes.txt", {
              type: "text/plain",
            }),
          );
          const upload = await alice.request("/api/uploads", {
            method: "POST",
            body: form,
          });
          assert.equal(upload.status, 201);
          fileId = (await upload.json()).id;
          assert.equal((await bob.request(`/api/files/${fileId}`)).status, 404);
          assert.equal(
            (await anonymous.request(`/api/files/${fileId}`)).status,
            401,
          );
          assert.equal(
            (await bob.json("/api/files/" + fileId, {}, "DELETE")).status,
            404,
          );
          await events(
            await chat("What is the project name?", { attachments: [fileId] }),
          );
          assert.ok(received.at(-1)?.content.includes("Juniper"));
          assert.equal(
            (await alice.request(`/api/files/${fileId}`)).status,
            200,
          );
          const text = await (
            await alice.request(`/api/conversations/${conversationId}`)
          ).text();
          assert.ok(!text.includes("storagePath"));
          assert.ok(!text.includes("extractedText"));
          const forged = new FormData();
          forged.append(
            "file",
            new File(["not an image"], "fake.png", { type: "image/png" }),
          );
          assert.equal(
            (
              await alice.request("/api/uploads", {
                method: "POST",
                body: forged,
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "PDF text is extracted locally in the bounded parser process",
        async () => {
          const text =
            "BT /F1 12 Tf 50 700 Td (Local PDF test: the answer is Juniper.) Tj ET";
          const objects = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
          ];
          let pdf = "%PDF-1.4\n";
          const offsets = [0];
          for (const [index, object] of objects.entries()) {
            offsets.push(Buffer.byteLength(pdf));
            pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
          }
          const xref = Buffer.byteLength(pdf);
          pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
            .slice(1)
            .map((offset) => String(offset).padStart(10, "0") + " 00000 n ")
            .join(
              "\n",
            )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
          const form = new FormData();
          form.append(
            "file",
            new File([pdf], "sample.pdf", { type: "application/pdf" }),
          );
          const response = await alice.request("/api/uploads", {
            method: "POST",
            body: form,
          });
          const uploaded = await response.json();
          assert.equal(response.status, 201, JSON.stringify(uploaded));
          await events(
            await chat("What is the answer in this PDF?", {
              attachments: [uploaded.id],
            }),
          );
          assert.ok(received.at(-1)?.content.includes("Local PDF test"));
        },
      );
      await t.test(
        "concurrent generation is limited; stop saves a partial response",
        async () => {
          const stream = await chat("SLOW_RESPONSE");
          assert.equal(stream.status, 200);
          const iterator = sseData(stream.body!)[Symbol.asyncIterator]();
          await iterator.next();
          await iterator.next();
          assert.equal((await chat("Concurrent message")).status, 429);
          assert.equal(
            (await alice.json("/api/chat/stop", { conversationId })).status,
            200,
          );
          await iterator.return?.();
          const saved = await (
            await alice.request(`/api/conversations/${conversationId}`)
          ).json();
          assert.equal(saved.messages.at(-1).status, "interrupted");
          assert.ok(saved.messages.at(-1).content);
        },
      );
      await t.test(
        "timeouts, empty replies and provider errors remain safe and recoverable",
        async () => {
          const timeout = await events(await chat("SLOW_RESPONSE"));
          assert.equal(timeout.at(-1)?.status, "interrupted");
          assert.ok(timeout.some((e) => e.error?.includes("timed out")));
          const empty = await events(await chat("EMPTY_RESPONSE"));
          assert.equal(empty.at(-1)?.status, "failed");
          const failure = await events(await chat("PROVIDER_ERROR"));
          assert.equal(failure.at(-1)?.status, "failed");
          assert.ok(
            !JSON.stringify(failure).includes("private provider detail"),
          );
        },
      );
      await t.test(
        "usage renders and deletion revokes file access",
        async () => {
          assert.equal((await alice.request("/usage")).status, 200);
          assert.equal(
            (
              await alice.json(
                `/api/conversations/${conversationId}`,
                {},
                "DELETE",
              )
            ).status,
            200,
          );
          assert.equal(
            (await alice.request(`/api/files/${fileId}`)).status,
            404,
          );
          assert.equal(
            (await alice.request(`/api/conversations/${conversationId}`))
              .status,
            404,
          );
        },
      );
    } catch (error) {
      console.error(logs);
      throw error;
    } finally {
      if (app && app.exitCode === null) {
        app.kill();
        await new Promise((resolve) => {
          app!.once("exit", resolve);
          setTimeout(resolve, 3000);
        });
      }
      await stopServer(provider);
      assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
      assert.ok(basename(directory).startsWith("aamor-e2e-"));
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 300,
      });
    }
  },
);
