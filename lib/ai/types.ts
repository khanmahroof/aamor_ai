export type ProviderId = "ollama" | "openai" | "anthropic";
export type Model = {
  id: string;
  name: string;
  provider: ProviderId;
  vision: boolean;
  contextWindow: number;
};
export type AIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  images?: { mime: string; base64: string }[];
};
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimated: boolean;
};
export type AIEvent =
  | { type: "text"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done" };
export type GenerateInput = {
  model: Model;
  messages: AIMessage[];
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
};
export interface AIProvider {
  listModels(): Promise<Model[]>;
  stream(input: GenerateInput): AsyncGenerator<AIEvent>;
  generate(input: GenerateInput): Promise<{ text: string; usage?: Usage }>;
}
