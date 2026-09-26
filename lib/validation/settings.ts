import { z } from "zod";
export const settingsSchema = z
  .object({
    systemPrompt: z.string().max(8000),
    preferredProvider: z.enum(["ollama", "openai", "anthropic"]),
    preferredModel: z.string().max(200).nullable(),
    temperature: z.number().min(0).max(1),
    theme: z.enum(["system", "light", "dark"]),
  })
  .strict();
export type SettingsInput = z.infer<typeof settingsSchema>;
