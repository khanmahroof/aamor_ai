import { listModels } from "@/lib/ai/registry";
import { defaultProvider } from "@/lib/ai/config";
import { errorResponse } from "@/lib/http";
import { limiter } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function GET() {
  try {
    limiter.consume("guest-models", 100);
    // Guests share the cache; refresh cannot force unlimited provider requests.
    const { models, warnings } = await listModels();
    return Response.json({ models, warnings, defaultProvider: defaultProvider() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return errorResponse(error); }
}
