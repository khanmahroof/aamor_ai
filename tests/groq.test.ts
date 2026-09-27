import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { GroqProvider } from "../lib/ai/providers/groq";
import { listModels, resolveModel } from "../lib/ai/registry";
import { defaultProvider } from "../lib/ai/config";
import { selectModel } from "../lib/ai/select-model";
import { settingsSchema } from "../lib/validation/settings";
import { AppError } from "../lib/http";
import type { GenerateInput } from "../lib/ai/types";
const modelName = "openai/gpt-oss-20b";
const provider = new GroqProvider();
const input: GenerateInput = {
  model: {
    id: `groq/${modelName}`,
    name: modelName,
    provider: "groq",
    vision: false,
    contextWindow: 8192,
  },
  messages: [
    { role: "system", content: "Be clear." },
    { role: "user", content: "Hello" },
  ],
  temperature: 0.7,
  maxTokens: 512,
  signal: new AbortController().signal,
};
const token = "test-only-groq-credential";
function environment(t: TestContext, values: Record<string, string> = {}) {
  const next = {
    GROQ_API_KEY: token,
    GROQ_MODELS: "",
    AI_DEFAULT_PROVIDER: "groq",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    ...values,
  };
  const previous = Object.fromEntries(
    Object.keys(next).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, next);
  t.after(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}
function discovery(ids = [modelName]) {
  return Response.json({
    data: ids.map((id) => ({
      id,
      active: true,
      context_window: 131072,
      max_completion_tokens: 16384,
    })),
  });
}
const delta = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const done = "data: [DONE]\n\n";

test("Groq missing configuration makes no network call and returns a safe error", async (t) => {
  environment(t, { GROQ_API_KEY: "" });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not call fetch");
  });
  await assert.rejects(provider.listModels(), /Groq is not configured/);
  await assert.rejects(provider.generate(input), /Groq is not configured/);
  const result = await listModels(true);
  assert.deepEqual(result.models, []);
  assert.match(result.warnings.join(), /Groq is not configured/);
  assert.doesNotMatch(result.warnings.join(), /Ollama/i);
  await assert.rejects(resolveModel(input.model.id), /Groq is not configured/);
});

test("Groq live discovery filters non-chat/inactive models and deduplicates", async (t) => {
  environment(t);
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.groq.com/openai/v1/models");
    assert.equal(
      new Headers(init.headers).get("Authorization"),
      `Bearer ${token}`,
    );
    return Response.json({
      data: [
        modelName,
        modelName,
        "llama-3.3-70b-versatile",
        "qwen/qwen3.8-27b",
        "whisper-large-v3",
        "canopylabs/orpheus-v1-english",
        "meta-llama/llama-prompt-guard-2-22m",
        "openai/gpt-oss-safeguard-20b",
        "groq/compound",
        "unknown-model",
      ]
        .map((id) => ({ id, active: true, context_window: 131072 }))
        .concat([
          { id: "llama-3.1-8b-instant", active: false, context_window: 8192 },
        ]),
    });
  });
  const models = await provider.listModels();
  assert.equal(models.length, 3);
  assert.equal(models.find((m) => m.name === modelName)?.vision, false);
  assert.equal(models.find((m) => m.name === "qwen/qwen3.8-27b")?.vision, true);
  assert.ok(models.every((m) => m.contextWindow === 8192));
  assert.ok(!JSON.stringify(models).includes(token));
});

test("Groq allowlist intersects live supported models and rejects an empty result", async (t) => {
  environment(t, {
    GROQ_MODELS: ` ${modelName},whisper-large-v3,missing-model,${modelName} `,
  });
  t.mock.method(globalThis, "fetch", async () =>
    discovery([modelName, "llama-3.3-70b-versatile", "whisper-large-v3"]),
  );
  assert.deepEqual(
    (await provider.listModels()).map((m) => m.name),
    [modelName],
  );
  process.env.GROQ_MODELS = "missing-model";
  await assert.rejects(provider.listModels(), /no supported chat models/);
});

test("Groq registry/default skips Ollama and chooses the cloud default", async (t) => {
  environment(t, { OPENAI_API_KEY: "test-only-openai" });
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "https://api.groq.com/openai/v1/models");
    return discovery();
  });
  assert.equal(defaultProvider(), "groq");
  const result = await listModels(true);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.models[0].provider, "groq");
  assert.ok(
    (await resolveModel(input.model.id)).provider instanceof GroqProvider,
  );
  assert.equal(
    selectModel(result.models, "", null, defaultProvider()),
    input.model.id,
  );
  assert.equal(
    selectModel(result.models, "", "openai/gpt-4.1-mini", defaultProvider()),
    "openai/gpt-4.1-mini",
  );
  assert.equal(
    settingsSchema
      .partial()
      .safeParse({ preferredProvider: "groq", preferredModel: input.model.id })
      .success,
    true,
  );
});

test("Groq failure does not remove a configured OpenAI model or leak upstream errors", async (t) => {
  environment(t, { OPENAI_API_KEY: "test-only-openai" });
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(token, { status: 401 }),
  );
  const result = await listModels(true);
  assert.ok(result.models.some((m) => m.provider === "openai"));
  assert.deepEqual(result.warnings, [
    "Groq authentication failed. Check the server configuration.",
  ]);
  assert.ok(!JSON.stringify(result).includes(token));
});

test("Ollama remains discoverable when it is the server default", async (t) => {
  environment(t, { AI_DEFAULT_PROVIDER: "ollama", GROQ_API_KEY: "" });
  t.mock.method(globalThis, "fetch", async (url: string) =>
    url.endsWith("/api/tags")
      ? Response.json({ models: [{ name: "local-test" }] })
      : Response.json({ capabilities: ["completion"] }),
  );
  const result = await listModels(true);
  assert.equal(result.models[0].id, "ollama/local-test");
  assert.equal(defaultProvider(), "ollama");
});

test("Groq streams split UTF-8 incrementally, preserves messages, and consumes x_groq usage", async (t) => {
  environment(t);
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(init.signal, input.signal);
    const body = JSON.parse(String(init.body));
    assert.deepEqual(body.messages, input.messages);
    assert.equal(body.stream, true);
    assert.equal(body.store, undefined);
    assert.equal(body.max_completion_tokens, 512);
    return new Response(
      new ReadableStream({
        start(c) {
          controller = c;
        },
      }),
    );
  });
  const events = provider.stream(input);
  const first = events.next();
  const bytes = new TextEncoder().encode(delta("héllo"));
  for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
  assert.deepEqual((await first).value, { type: "text", text: "héllo" });
  controller.enqueue(
    new TextEncoder().encode(
      'data: {"choices":[],"x_groq":{"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}}\n\n' +
        done,
    ),
  );
  const usage = await events.next();
  assert.equal(usage.value?.type, "usage");
  if (usage.value?.type === "usage")
    assert.equal(usage.value.usage.totalTokens, 5);
  assert.deepEqual((await events.next()).value, { type: "done" });
  assert.equal((await events.next()).done, true);
});

for (const [label, body] of [
  ["malformed JSON", "data: {bad secret-data\n\n"],
  ["invalid delta type", 'data: {"choices":[{"delta":{"content":123}}]}\n\n'],
  ["invalid event shape", "data: null\n\n"],
  ["upstream error", `data: {"error":{"message":"${token}"}}\n\n`],
  ["premature EOF", delta("partial")],
  ["empty completion", done],
] as const)
  test(`Groq safely rejects ${label}`, async (t) => {
    environment(t);
    t.mock.method(globalThis, "fetch", async () => new Response(body));
    await assert.rejects(provider.generate(input), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.match(error.message, /Groq/);
      assert.ok(!error.message.includes(token));
      return true;
    });
  });

for (const [status, pattern] of [
  [400, /Groq rejected/],
  [401, /Groq authentication failed/],
  [403, /Groq authentication failed/],
  [429, /Groq rate limit reached/],
  [500, /Groq is temporarily unavailable/],
] as const)
  test(`Groq HTTP ${status} is sanitized for discovery and generation`, async (t) => {
    environment(t);
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(token, { status }),
    );
    for (const operation of [
      () => provider.listModels(),
      () => provider.generate(input),
    ])
      await assert.rejects(operation(), (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.match(error.message, pattern);
        assert.equal(
          error.status,
          status === 429 ? 429 : status >= 500 ? 503 : 502,
        );
        assert.ok(!error.message.includes(token));
        return true;
      });
  });

test("Groq network and malformed discovery failures do not expose raw errors", async (t) => {
  environment(t);
  const mock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error(token);
  });
  await assert.rejects(
    provider.generate(input),
    /Groq is temporarily unavailable/,
  );
  mock.mock.mockImplementation(async () =>
    Response.json({ data: [{ id: 3 }] }),
  );
  await assert.rejects(provider.listModels(), /invalid model list/);
});

test("Groq cancellation preserves the emitted prefix and aborts the request", async (t) => {
  environment(t);
  const abort = new AbortController();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) =>
      new Response(
        new ReadableStream({
          start(c) {
            controller = c;
            init.signal?.addEventListener(
              "abort",
              () => c.error(init.signal?.reason),
              { once: true },
            );
          },
        }),
      ),
  );
  const stream = provider.stream({ ...input, signal: abort.signal });
  const first = stream.next();
  controller.enqueue(new TextEncoder().encode(delta("partial")));
  assert.deepEqual((await first).value, { type: "text", text: "partial" });
  const next = stream.next();
  abort.abort();
  await assert.rejects(
    next,
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});

test("Groq propagates timeouts safely for discovery and streaming", async (t) => {
  environment(t);
  const timeout = new AbortController();
  timeout.abort(new DOMException("private timeout detail", "TimeoutError"));
  t.mock.method(AbortSignal, "timeout", () => timeout.signal);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("should not fetch after abort");
  });
  await assert.rejects(provider.listModels(), /Groq request timed out/);
  await assert.rejects(
    provider.generate({ ...input, signal: timeout.signal }),
    /Groq request timed out/,
  );
});

test("Groq vision is explicit and output respects model limits", async (t) => {
  environment(t);
  const messages = [
    {
      role: "user" as const,
      content: "Describe",
      images: [{ mime: "image/png", base64: "aGVsbG8=" }],
    },
  ];
  await assert.rejects(
    provider.generate({ ...input, messages }),
    /does not support images/,
  );
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.max_completion_tokens, 128);
      assert.equal(
        body.messages[0].content[1].image_url.url,
        "data:image/png;base64,aGVsbG8=",
      );
      return new Response(delta("image") + done);
    },
  );
  assert.equal(
    (
      await provider.generate({
        ...input,
        messages,
        model: {
          ...input.model,
          name: "qwen/qwen3.8-27b",
          vision: true,
          maxOutputTokens: 128,
        },
      })
    ).text,
    "image",
  );
});

test("Groq timeout interrupts a pending HTTP request", async (t) => {
  environment(t);
  const abort = new AbortController();
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  });
  const pending = provider.generate({ ...input, signal: abort.signal });
  abort.abort(new DOMException("private timeout detail", "TimeoutError"));
  await assert.rejects(pending, /Groq request timed out/);
});
