import { BaseProvider, providerFetch } from "./base";
import { sseData } from "../streams";
import type { AIEvent, GenerateInput, Model } from "../types";
import { AppError } from "../../http";
export class AnthropicProvider extends BaseProvider {
  private headers() {
    return {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    };
  }
  async listModels(): Promise<Model[]> {
    if (!process.env.ANTHROPIC_API_KEY) return [];
    const data = (await (
      await providerFetch("https://api.anthropic.com/v1/models?limit=100", {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      })
    ).json()) as { data: { id: string; max_input_tokens?: number }[] };
    return data.data.map((m) => ({
      id: `anthropic/${m.id}`,
      name: m.id,
      provider: "anthropic",
      vision: /^claude-(3|sonnet-|opus-|haiku-)/.test(m.id),
      contextWindow: Math.min(m.max_input_tokens ?? 8192, 8192),
    }));
  }
  async *stream(input: GenerateInput): AsyncGenerator<AIEvent> {
    const response = await providerFetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: this.headers(),
        signal: input.signal,
        body: JSON.stringify({
          model: input.model.name,
          stream: true,
          max_tokens: input.maxTokens,
          system: input.messages
            .filter((m) => m.role === "system")
            .map((m) => m.content)
            .join("\n"),
          messages: input.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
              role: m.role,
              content: [
                ...(m.images ?? []).map((image) => ({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mime,
                    data: image.base64,
                  },
                })),
                {
                  type: "text",
                  text: m.content || "Please describe the attached image.",
                },
              ],
            })),
        }),
      },
    );
    if (!response.body)
      throw new AppError(502, "The provider returned no stream.");
    let done = false;
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const raw of sseData(response.body)) {
      const data = JSON.parse(raw) as {
        type: string;
        delta?: { text?: string };
        message?: { usage?: { input_tokens: number; output_tokens: number } };
        usage?: { output_tokens: number };
      };
      if (data.type === "error")
        throw new AppError(
          502,
          "The provider could not complete this response.",
        );
      if (data.type === "message_start" && data.message?.usage) {
        inputTokens = data.message.usage.input_tokens;
        outputTokens = data.message.usage.output_tokens;
      }
      if (data.type === "content_block_delta" && data.delta?.text)
        yield { type: "text", text: data.delta.text };
      if (data.type === "message_delta" && data.usage)
        outputTokens = data.usage.output_tokens;
      if (data.type === "message_stop") {
        done = true;
        yield {
          type: "usage",
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            estimated: false,
          },
        };
        yield { type: "done" };
      }
    }
    if (!done) throw new AppError(502, "The provider stream was interrupted.");
  }
}
