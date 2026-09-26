import { requireUser } from "@/lib/auth/session";
import { checkOrigin, errorResponse, readJson } from "@/lib/http";
import { ownedConversation } from "@/lib/db/conversations";
import { activeGenerations } from "@/lib/chat/active";
import { idSchema } from "@/lib/validation/chat";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    const { conversationId } = z
      .object({ conversationId: idSchema })
      .strict()
      .parse(await readJson(request));
    await ownedConversation(user.id, conversationId);
    const active = activeGenerations.get(conversationId);
    active?.abort.abort();
    if (active) await active.finished;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
