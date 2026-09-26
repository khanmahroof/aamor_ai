import { z } from "zod";
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
});
export const registerSchema = loginSchema
  .extend({ name: z.string().trim().min(1).max(80) })
  .strict();
