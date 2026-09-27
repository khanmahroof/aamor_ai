import { BaseProvider, providerFetch } from "./base";
import { chatCompletionEvents, chatMessages } from "./openai-stream";
import type { AIEvent, GenerateInput, Model } from "../types";
import { AppError } from "../../http";
export class OpenAIProvider extends BaseProvider {
  async listModels(): Promise<Model[]> {
    if (!process.env.OPENAI_API_KEY) return [];
    // Explicit chat-model allowlist; avoids listing embedding/audio-only models.
    return (process.env.OPENAI_MODELS || "gpt-4.1-mini")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({
        id: `openai/${name}`,
        name,
        provider: "openai",
        vision: /^(gpt-4o|gpt-4\.1)/.test(name),
        contextWindow: 8192,
      }));
  }
  async *stream(input: GenerateInput): AsyncGenerator<AIEvent> {
    const response = await providerFetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        signal: input.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: input.model.name,
          stream: true,
          store: false,
          stream_options: { include_usage: true },
          max_completion_tokens: input.maxTokens,
          ...(/^gpt-4/.test(input.model.name)
            ? { temperature: input.temperature }
            : {}),
          messages: chatMessages(input.messages),
        }),
      },
    );
    if (!response.body)
      throw new AppError(502, "The provider returned no stream.");
    yield* chatCompletionEvents(response.body, "OpenAI", input.signal);
  }
}
