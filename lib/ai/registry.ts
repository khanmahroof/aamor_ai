import "server-only";
import { OllamaProvider } from "./providers/ollama";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import type { AIProvider, Model, ProviderId } from "./types";
import { AppError } from "../http";
const providers: Record<ProviderId, AIProvider> = {
  ollama: new OllamaProvider(),
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
};
let cached: { until: number; models: Model[]; warnings: string[] } | undefined;
export async function listModels(refresh = false) {
  if (!refresh && cached && cached.until > Date.now()) return cached;
  const models: Model[] = [];
  const warnings: string[] = [];
  await Promise.all(
    Object.entries(providers).map(async ([name, provider]) => {
      try {
        models.push(...(await provider.listModels()));
      } catch {
        warnings.push(
          `${name} is unavailable. Check its server configuration and connection.`,
        );
      }
    }),
  );
  models.sort((a, b) => a.id.localeCompare(b.id));
  return (cached = { models, warnings, until: Date.now() + 15000 });
}
export async function resolveModel(id: string) {
  const model = (await listModels()).models.find((m) => m.id === id);
  if (!model)
    throw new AppError(
      400,
      "This model is unavailable. Refresh models and select an installed model.",
    );
  return { model, provider: providers[model.provider] };
}
