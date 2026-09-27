import "server-only";
import { OllamaProvider } from "./providers/ollama";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { GroqProvider } from "./providers/groq";
import { defaultProvider } from "./config";
import type { AIProvider, Model, ProviderId } from "./types";
import { AppError } from "../http";
const providers: Record<ProviderId, AIProvider> = {
  ollama: new OllamaProvider(),
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  groq: new GroqProvider(),
};
let cached: { until: number; models: Model[]; warnings: string[] } | undefined;
export async function listModels(refresh = false) {
  if (!refresh && cached && cached.until > Date.now()) return cached;
  const primary = defaultProvider();
  const configured: Record<ProviderId, boolean> = {
    ollama: primary === "ollama",
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY?.trim()) || primary === "groq",
  };
  const results = await Promise.all(
    (Object.keys(providers) as ProviderId[])
      .filter((id) => configured[id])
      .map(async (id) => {
        try {
          return { models: await providers[id].listModels(), warning: "" };
        } catch (error) {
          return {
            models: [],
            warning:
              id === "groq" && error instanceof AppError
                ? error.message
                : `${id} is unavailable. Check its server configuration and connection.`,
          };
        }
      }),
  );
  const models = results.flatMap((result) => result.models);
  models.sort(
    (a, b) =>
      Number(b.provider === primary) - Number(a.provider === primary) ||
      a.id.localeCompare(b.id),
  );
  return (cached = {
    models,
    warnings: results.map((r) => r.warning).filter(Boolean),
    until: Date.now() + 15000,
  });
}
export async function resolveModel(id: string) {
  const result = await listModels();
  const model = result.models.find((m) => m.id === id);
  if (!model) {
    if (id.startsWith("groq/")) {
      if (!process.env.GROQ_API_KEY?.trim())
        throw new AppError(503, "Groq is not configured on this server.");
      throw new AppError(
        503,
        result.warnings.find((warning) => warning.startsWith("Groq")) ||
          "This Groq model is unavailable. Refresh models and choose another.",
      );
    }
    throw new AppError(
      400,
      "This model is unavailable. Refresh models and select an available model.",
    );
  }
  return { model, provider: providers[model.provider] };
}
