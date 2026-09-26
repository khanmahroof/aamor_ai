import { requireUser } from "@/lib/auth/session";
import { checkOrigin, errorResponse } from "@/lib/http";
import { createConversation } from "@/lib/db/conversations";
import { limiter } from "@/lib/rate-limit";
import { getDatabase } from "@/lib/db/client";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const q = z
      .string()
      .max(200)
      .parse(url.searchParams.get("q") ?? "");
    const skip = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(url.searchParams.get("skip") ?? 0);
    const items = await getDatabase().conversation.findMany({
      where: {
        userId: user.id,
        ...(q
          ? {
              OR: [
                { title: { contains: q } },
                { messages: { some: { content: { contains: q } } } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 51,
      skip,
    });
    return Response.json({
      items: items.slice(0, 50),
      hasMore: items.length > 50,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    limiter.consume(`new-chat:${user.id}`, 30);
    return Response.json(await createConversation(user.id), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
