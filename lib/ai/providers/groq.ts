import "server-only";
import { z } from "zod";
import { BaseProvider } from "./base";
import { chatCompletionEvents, chatMessages } from "./openai-stream";
import { AppError } from "../../http";
import type { AIEvent, GenerateInput, Model } from "../types";

const baseURL = "https://api.groq.com/openai/v1";
const modelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1).max(200),
      active: z.boolean().optional(),
      context_window: z.number().int().positive().optional(),
      max_completion_tokens: z.number().int().positive().optional(),
    }),
  ),
});
// /models does not document task/modalities metadata. Conservatively recognize
// chat families, exclude moderation/audio/agent systems, and intersect live IDs.
// https://console.groq.com/docs/models (reviewed 2026-09-27)
function isChatModel(id: string) {
  return (
    !/(guard|whisper|tts|orpheus|embed|compound)/i.test(id) &&
    /^(llama-?3[.-]|meta-llama\/llama-4-.*-instruct$|openai\/gpt-oss-\d+b$|qwen\/qwen3[.-]|gemma2-.*-it$|minimaxai\/minimax-m2[.-])/.test(
      id,
    )
  );
}
// Explicitly documented base64 image_url support; unknown models stay text-only.
const visionModels = new Set(["qwen/qwen3.8-27b"]);

function safeError(error: unknown, signal: AbortSignal): never {
  if (signal.aborted) {
    if (signal.reason instanceof Error && signal.reason.name === "TimeoutError")
      throw new AppError(504, "Groq request timed out. Please try again.");
    signal.throwIfAborted();
  }
  if (error instanceof AppError) throw error;
  throw new AppError(503, "Groq is temporarily unavailable.");
}

export class GroqProvider extends BaseProvider {
  private async request(
    path: string,
    init: RequestInit & { signal: AbortSignal },
  ) {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) throw new AppError(503, "Groq is not configured on this server.");
    try {
      init.signal.throwIfAborted();
      const response = await fetch(`${baseURL}${path}`, {
        ...init,
        cache: "no-store",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if (response.status === 401 || response.status === 403)
          throw new AppError(
            502,
            "Groq authentication failed. Check the server configuration.",
          );
        if (response.status === 429)
          throw new AppError(
            429,
            "Groq rate limit reached. Please try again shortly.",
          );
        if (response.status >= 500)
          throw new AppError(503, "Groq is temporarily unavailable.");
        throw new AppError(
          502,
          "Groq rejected this request. Check the selected model and server configuration.",
        );
      }
      return response;
    } catch (error) {
      return safeError(error, init.signal);
    }
  }

  async listModels(): Promise<Model[]> {
    const signal = AbortSignal.timeout(5000);
    try {
      const response = await this.request("/models", { signal });
      const parsed = modelsSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new AppError(502, "Groq returned an invalid model list.");
      const allowlist = new Set(
        (process.env.GROQ_MODELS ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      const seen = new Set<string>();
      const models: Model[] = [];
      for (const m of parsed.data.data) {
        if (
          m.active === false ||
          !isChatModel(m.id) ||
          seen.has(m.id) ||
          (allowlist.size && !allowlist.has(m.id))
        )
          continue;
        seen.add(m.id);
        models.push({
          id: `groq/${m.id}`,
          name: m.id,
          provider: "groq",
          vision: visionModels.has(m.id),
          contextWindow: Math.min(m.context_window ?? 8192, 8192),
          ...(m.max_completion_tokens
            ? { maxOutputTokens: m.max_completion_tokens }
            : {}),
        });
      }
      if (!models.length)
        throw new AppError(
          503,
          "Groq has no supported chat models available. Check GROQ_MODELS and the server configuration.",
        );
      return models;
    } catch (error) {
      return safeError(error, signal);
    }
  }

  async *stream(input: GenerateInput): AsyncGenerator<AIEvent> {
    try {
      if (!input.model.vision && input.messages.some((m) => m.images?.length))
        throw new AppError(
          400,
          "This Groq model does not support images. Choose a vision model.",
        );
      const response = await this.request("/chat/completions", {
        method: "POST",
        signal: input.signal,
        body: JSON.stringify({
          model: input.model.name,
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: Math.min(
            input.maxTokens,
            input.model.maxOutputTokens ?? input.maxTokens,
          ),
          temperature: input.temperature,
          messages: chatMessages(input.messages),
        }),
      });
      if (!response.body)
        throw new AppError(502, "Groq returned no response stream.");
      yield* chatCompletionEvents(response.body, "Groq", input.signal);
    } catch (error) {
      safeError(error, input.signal);
    }
  }
}
