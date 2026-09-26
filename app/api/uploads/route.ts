import { requireUser } from "@/lib/auth/session";
import {
  checkOrigin,
  readBytes,
  errorResponse,
  envNumber,
  AppError,
} from "@/lib/http";
import { validateUpload } from "@/lib/files/validate";
import { saveFile, removeFile } from "@/lib/files/storage";
import { extractText } from "@/lib/files/context";
import { getDatabase } from "@/lib/db/client";
import { limiter } from "@/lib/rate-limit";
import { cleanExpiredUploads } from "@/lib/files/cleanup";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await requireUser();
    await cleanExpiredUploads(user.id);
    return Response.json(
      await getDatabase().pendingUpload.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, filename: true, mimeType: true, size: true },
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  let key: string | undefined;
  let release: (() => void) | undefined;
  try {
    const user = await requireUser();
    checkOrigin(request);
    limiter.consume(`uploads:${user.id}`, 20);
    release = limiter.acquire("upload-processing", 2);
    const db = getDatabase();
    await cleanExpiredUploads(user.id);
    if ((await db.pendingUpload.count({ where: { userId: user.id } })) >= 20)
      throw new AppError(
        429,
        "You have too many unused uploads. Remove some attachments first.",
      );
    const bytes = await readBytes(
      request,
      envNumber("MAX_UPLOAD_SIZE_MB", 10, 1, 20) * 1024 * 1024 + 65536,
    );
    let form: FormData;
    try {
      form = await new Response(bytes, {
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch {
      throw new AppError(400, "Invalid file upload.");
    }
    const file = form.get("file");
    if (!(file instanceof File))
      throw new AppError(400, "Select a file to upload.");
    const data = await validateUpload(file);
    key = await saveFile(data.buffer, data.extension);
    const extractedText = await extractText(key, data.mimeType);
    const saved = await db.pendingUpload.create({
      data: {
        userId: user.id,
        filename: data.filename,
        mimeType: data.mimeType,
        size: data.buffer.length,
        storagePath: key,
        extractedText,
      },
      select: { id: true, filename: true, mimeType: true, size: true },
    });
    return Response.json(saved, { status: 201 });
  } catch (error) {
    if (key) await removeFile(key).catch(() => {});
    return errorResponse(error);
  } finally {
    release?.();
  }
}
