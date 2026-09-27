import "server-only";
import { z } from "zod";
import { sseData } from "../streams";
import { AppError } from "../../http";
import type { AIEvent, AIMessage } from "../types";

const usageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
const chunkSchema = z.object({
  error: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            refusal: z.string().nullish(),
          })
          .optional(),
      }),
    )
    .optional(),
  usage: usageSchema.nullish(),
  x_groq: z.object({ usage: usageSchema.nullish() }).optional(),
});

export function chatMessages(messages: AIMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content: m.images?.length
      ? [
          { type: "text", text: m.content },
          ...m.images.map((image) => ({
            type: "image_url",
            image_url: { url: `data:${image.mime};base64,${image.base64}` },
          })),
        ]
      : m.content,
  }));
}

/** Shared, incremental Chat Completions SSE decoding. Never surface raw frames. */
export async function* chatCompletionEvents(
  body: ReadableStream<Uint8Array>,
  label: string,
  signal: AbortSignal,
): AsyncGenerator<AIEvent> {
  let hasText = false;
  try {
    for await (const raw of sseData(body)) {
      signal.throwIfAborted();
      if (raw.trim() === "[DONE]") {
        if (!hasText)
          throw new AppError(
            502,
            `${label} returned an empty response. Please retry.`,
          );
        yield { type: "done" };
        return;
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        throw new AppError(
          502,
          `${label} returned a malformed streaming response.`,
        );
      }
      const parsed = chunkSchema.safeParse(decoded);
      if (!parsed.success)
        throw new AppError(
          502,
          `${label} returned a malformed streaming response.`,
        );
      const data = parsed.data;
      if (data.error)
        throw new AppError(502, `${label} could not complete this response.`);
      const usage = data.usage ?? data.x_groq?.usage;
      if (!data.choices && !usage)
        throw new AppError(
          502,
          `${label} returned a malformed streaming response.`,
        );
      const text =
        data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.delta?.refusal;
      if (text) {
        hasText ||= Boolean(text.trim());
        yield { type: "text", text };
      }
      if (usage)
        yield {
          type: "usage",
          usage: {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            estimated: false,
          },
        };
    }
    throw new AppError(502, `${label} stream was interrupted. Please retry.`);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof AppError) throw error;
    throw new AppError(502, `${label} stream was interrupted. Please retry.`);
  }
}
