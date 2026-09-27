import "server-only";
import { AppError } from "../../http";
import type {
  AIEvent,
  AIProvider,
  GenerateInput,
  Model,
  Usage,
} from "../types";
export abstract class BaseProvider implements AIProvider {
  abstract listModels(): Promise<Model[]>;
  abstract stream(input: GenerateInput): AsyncGenerator<AIEvent>;
  async generate(input: GenerateInput) {
    let text = "";
    let usage: Usage | undefined;
    for await (const event of this.stream(input)) {
      if (event.type === "text") text += event.text;
      if (event.type === "usage") usage = event.usage;
      if (text.length > 1000000)
        throw new AppError(502, "Response exceeded the safety limit.");
    }
    return { text, usage };
  }
}
export async function providerFetch(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new AppError(
      503,
      "Model provider is unavailable. Check the server configuration and connection.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(
      response.status === 429 ? 429 : 502,
      response.status === 429
        ? "The provider is rate limiting requests. Please retry later."
        : "The provider rejected the request. Check the model and server configuration.",
    );
  }
  return response;
}
