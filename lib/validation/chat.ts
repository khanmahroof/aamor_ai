import { z } from "zod";
export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const chatSchema = z
  .object({
    conversationId: idSchema,
    model: z.string().min(1).max(200),
    action: z.enum(["send", "retry", "edit"]).default("send"),
    messageId: idSchema.optional(),
    messages: z
      .array(
        z
          .object({
            role: z.literal("user"),
            content: z.string().trim().min(1).max(32000),
          })
          .strict(),
      )
      .max(1)
      .default([]),
    attachments: z
      .array(idSchema)
      .max(3)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate attachments.",
      )
      .default([]),
  })
  .strict()
  .superRefine((data, context) => {
    if (
      (data.action === "send" || data.action === "edit") &&
      data.messages.length !== 1
    )
      context.addIssue({
        code: "custom",
        message: "One user message is required.",
      });
    if (data.action !== "send" && !data.messageId)
      context.addIssue({
        code: "custom",
        message: "Choose the user message to retry.",
      });
    if (data.action !== "send" && data.attachments.length)
      context.addIssue({
        code: "custom",
        message: "New attachments can only be added to a new message.",
      });
  });
