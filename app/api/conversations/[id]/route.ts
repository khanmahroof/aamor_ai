import { requireUser } from "@/lib/auth/session";
import { ownedConversation } from "@/lib/db/conversations";
import { getDatabase } from "@/lib/db/client";
import { checkOrigin, errorResponse, readJson } from "@/lib/http";
import { idSchema } from "@/lib/validation/chat";
import { z } from "zod";
import { limiter } from "@/lib/rate-limit";
import { removeFile } from "@/lib/files/storage";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const id = idSchema.parse((await context.params).id);
    const conversation = await ownedConversation(user.id, id);
    const before = z.coerce
      .number()
      .int()
      .min(0)
      .parse(new URL(request.url).searchParams.get("before") ?? 2147483647);
    const messages = await getDatabase().message.findMany({
      where: { conversationId: id, position: { lt: before } },
      orderBy: { position: "desc" },
      take: 101,
      include: {
        attachments: {
          select: { id: true, filename: true, mimeType: true, size: true },
        },
      },
    });
    return Response.json({
      conversation,
      messages: messages.slice(0, 100).reverse(),
      hasMore: messages.length > 100,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  let release: (() => void) | undefined;
  try {
    const user = await requireUser();
    checkOrigin(request);
    const id = idSchema.parse((await context.params).id);
    await ownedConversation(user.id, id);
    release = limiter.acquire(`conversation:${id}`);
    const data = z
      .object({ title: z.string().trim().min(1).max(100) })
      .strict()
      .parse(await readJson(request));
    return Response.json(
      await getDatabase().conversation.update({
        where: { id, userId: user.id },
        data,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  } finally {
    release?.();
  }
}
export async function DELETE(request: Request, context: Context) {
  let release: (() => void) | undefined;
  try {
    const user = await requireUser();
    checkOrigin(request);
    const id = idSchema.parse((await context.params).id);
    await ownedConversation(user.id, id);
    release = limiter.acquire(`conversation:${id}`);
    const files = await getDatabase().attachment.findMany({
      where: { message: { conversationId: id } },
      select: { storagePath: true },
    });
    await getDatabase().conversation.delete({ where: { id, userId: user.id } });
    await Promise.all(
      files.map((file) => removeFile(file.storagePath).catch(() => {})),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  } finally {
    release?.();
  }
}
