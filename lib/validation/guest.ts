import { z } from "zod";

export const guestChatSchema = z.object({
  model: z.string().min(1).max(200),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(8000),
  }).strict()).min(1).max(20),
}).strict().superRefine(({ messages }, ctx) => {
  if (messages.at(-1)?.role !== "user")
    ctx.addIssue({ code: "custom", message: "End with a user message." });
  if (messages.reduce((size, m) => size + m.content.length, 0) > 24000)
    ctx.addIssue({ code: "custom", message: "Guest conversation is full. Start a new chat." });
});
