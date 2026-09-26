import { BaseProvider, providerFetch } from "./base";
import { lines } from "../streams";
import type { AIEvent, GenerateInput, Model } from "../types";
import { AppError, envNumber } from "../../http";
export class OllamaProvider extends BaseProvider {
  constructor(
    private base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  ) {
    super();
  }
  async listModels(): Promise<Model[]> {
    const response = await providerFetch(`${this.base}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = (await response.json()) as { models?: { name: string }[] };
    return Promise.all(
      (data.models ?? []).slice(0, 50).map(async ({ name }) => {
        let vision = false;
        let contextWindow = 4096;
        try {
          const info = (await (
            await providerFetch(`${this.base}/api/show`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: name }),
              signal: AbortSignal.timeout(5000),
            })
          ).json()) as {
            capabilities?: string[];
            model_info?: Record<string, unknown>;
          };
          vision = info.capabilities?.includes("vision") ?? false;
          const context = Object.entries(info.model_info ?? {}).find(([key]) =>
            key.endsWith(".context_length"),
          )?.[1];
          if (typeof context === "number")
            contextWindow = Math.min(
              context,
              envNumber("OLLAMA_CONTEXT_SIZE", 8192, 2048, 32768),
            );
        } catch {
          /* Unknown capabilities stay conservative. */
        }
        return {
          id: `ollama/${name}`,
          name,
          provider: "ollama" as const,
          vision,
          contextWindow,
        };
      }),
    );
  }
  async *stream(input: GenerateInput): AsyncGenerator<AIEvent> {
    const response = await providerFetch(`${this.base}/api/chat`, {
      method: "POST",
      signal: input.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model.name,
        stream: true,
        messages: input.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.images?.length
            ? { images: m.images.map((i) => i.base64) }
            : {}),
        })),
        options: {
          temperature: input.temperature,
          num_ctx: input.model.contextWindow,
          num_predict: input.maxTokens,
        },
      }),
    });
    if (!response.body)
      throw new AppError(502, "The model returned no response stream.");
    let done = false;
    for await (const line of lines(response.body)) {
      if (!line.trim()) continue;
      const data = JSON.parse(line) as {
        error?: string;
        message?: { content?: string };
        done?: boolean;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      if (data.error)
        throw new AppError(502, "Ollama could not complete this response.");
      if (data.message?.content)
        yield { type: "text", text: data.message.content };
      if (data.done) {
        done = true;
        if (
          typeof data.prompt_eval_count === "number" &&
          typeof data.eval_count === "number"
        )
          yield {
            type: "usage",
            usage: {
              inputTokens: data.prompt_eval_count,
              outputTokens: data.eval_count,
              totalTokens: data.prompt_eval_count + data.eval_count,
              estimated: false,
            },
          };
        yield { type: "done" };
      }
    }
    if (!done)
      throw new AppError(
        502,
        "The model stream was interrupted. Retry the response.",
      );
  }
}
