import assert from "node:assert/strict";
import { test } from "node:test";
import { OllamaProvider } from "../lib/ai/providers/ollama";
import { OpenAIProvider } from "../lib/ai/providers/openai";
import { AnthropicProvider } from "../lib/ai/providers/anthropic";
import { sseData } from "../lib/ai/streams";
import type { GenerateInput } from "../lib/ai/types";
const input: GenerateInput = {
  model: {
    id: "ollama/test",
    name: "test",
    provider: "ollama",
    vision: false,
    contextWindow: 4096,
  },
  messages: [{ role: "user", content: "hello" }],
  temperature: 0.7,
  maxTokens: 512,
  signal: new AbortController().signal,
};
test("Ollama generates real incremental chunks and exact usage", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        '{"message":{"content":"Hello "}}\n{"message":{"content":"there"},"done":true,"prompt_eval_count":3,"eval_count":2}\n',
      ),
  );
  const result = await new OllamaProvider().generate(input);
  assert.equal(result.text, "Hello there");
  assert.equal(result.usage?.totalTokens, 5);
  assert.equal(result.usage?.estimated, false);
});
test("premature provider EOF is an error", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response('{"message":{"content":"partial"}}\n'),
  );
  await assert.rejects(new OllamaProvider().generate(input), /interrupted/);
});
test("SSE decoding handles split UTF-8 and multiline frames", async () => {
  const bytes = new TextEncoder().encode("data: héllo\ndata: world\n\n");
  const body = new ReadableStream({
    start(c) {
      for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
      c.close();
    },
  });
  const frames = [];
  for await (const data of sseData(body)) frames.push(data);
  assert.deepEqual(frames, ["héllo\nworld"]);
});
test("OpenAI and Anthropic adapters normalize their stream formats", async (t) => {
  const mock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: {"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}\n\ndata: [DONE]\n\n',
      ),
  );
  assert.equal((await new OpenAIProvider().generate(input)).text, "ok");
  mock.mock.mockImplementation(
    async () =>
      new Response(
        'data: {"type":"message_start","message":{"usage":{"input_tokens":2,"output_tokens":0}}}\n\ndata: {"type":"content_block_delta","delta":{"text":"yes"}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":1}}\n\ndata: {"type":"message_stop"}\n\n',
      ),
  );
  assert.equal(
    (await new AnthropicProvider().generate(input)).usage?.totalTokens,
    3,
  );
});
