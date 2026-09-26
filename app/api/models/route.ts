import { requireUser } from "@/lib/auth/session";
import { listModels } from "@/lib/ai/registry";
import { errorResponse } from "@/lib/http";
import { limiter } from "@/lib/rate-limit";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    limiter.consume(`models:${user.id}`, 20);
    const { models, warnings } = await listModels(
      new URL(request.url).searchParams.get("refresh") === "1",
    );
    return Response.json({
      models,
      warnings,
      defaultProvider: process.env.AI_DEFAULT_PROVIDER || "ollama",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
