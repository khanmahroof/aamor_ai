import { BaseProvider, providerFetch } from "./base";
import { sseData } from "../streams";
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
          messages: input.messages.map((m) => ({
            role: m.role,
            content: m.images?.length
              ? [
                  { type: "text", text: m.content },
                  ...m.images.map((image) => ({
                    type: "image_url",
                    image_url: {
                      url: `data:${image.mime};base64,${image.base64}`,
                    },
                  })),
                ]
              : m.content,
          })),
        }),
      },
    );
    if (!response.body)
      throw new AppError(502, "The provider returned no stream.");
    let done = false;
    for await (const raw of sseData(response.body)) {
      if (raw === "[DONE]") {
        done = true;
        yield { type: "done" };
        break;
      }
      const data = JSON.parse(raw) as {
        error?: unknown;
        choices?: { delta?: { content?: string; refusal?: string } }[];
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };
      if (data.error)
        throw new AppError(
          502,
          "The provider could not complete this response.",
        );
      const text =
        data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.delta?.refusal;
      if (text) yield { type: "text", text };
      if (data.usage)
        yield {
          type: "usage",
          usage: {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
            estimated: false,
          },
        };
    }
    if (!done) throw new AppError(502, "The provider stream was interrupted.");
  }
}
