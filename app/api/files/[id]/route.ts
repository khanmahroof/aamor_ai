import { requireUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import { AppError, checkOrigin, errorResponse } from "@/lib/http";
import { idSchema } from "@/lib/validation/chat";
import { readStoredFile, removeFile } from "@/lib/files/storage";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const id = idSchema.parse((await context.params).id);
    const db = getDatabase();
    const file =
      (await db.attachment.findFirst({
        where: { id, message: { conversation: { userId: user.id } } },
      })) ??
      (await db.pendingUpload.findFirst({ where: { id, userId: user.id } }));
    if (!file) throw new AppError(404, "File not found.");
    let bytes: Buffer;
    try {
      bytes = await readStoredFile(file.storagePath);
    } catch {
      throw new AppError(404, "File is no longer available.");
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${file.mimeType.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    const id = idSchema.parse((await context.params).id);
    const db = getDatabase();
    const file = await db.pendingUpload.findFirst({
      where: { id, userId: user.id },
    });
    if (!file) throw new AppError(404, "Unused upload not found.");
    await db.pendingUpload.delete({ where: { id, userId: user.id } });
    await removeFile(file.storagePath);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
