import { defaultProvider } from "@/lib/ai/config";
import { checkOrigin, readJson, errorResponse, AppError } from "@/lib/http";
import { registerSchema } from "@/lib/validation/auth";
import { hashPassword } from "@/lib/auth/password";
import { getDatabase } from "@/lib/db/client";
import { limiter } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(req: Request) {
  let release: (() => void) | undefined;
  try {
    checkOrigin(req);
    limiter.consume("registration", 10, 600000);
    release = limiter.acquire("password-work", 4);
    const input = registerSchema.parse(await readJson(req));
    const passwordHash = await hashPassword(input.password);
    try {
      await getDatabase().user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          settings: { create: { preferredProvider: defaultProvider() } },
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw new AppError(
          409,
          "Unable to create this account. Try signing in.",
        );
      throw error;
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  } finally {
    release?.();
  }
}
