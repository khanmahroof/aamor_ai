import "server-only";
import type { ProviderId } from "./types";
export function defaultProvider(): ProviderId {
  const value = process.env.AI_DEFAULT_PROVIDER;
  return value === "groq" || value === "openai" || value === "anthropic"
    ? value
    : "ollama";
}
