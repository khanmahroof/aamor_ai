import "server-only";
import { getDatabase } from "../db/client";
import { removeFile } from "./storage";
export async function cleanExpiredUploads(userId: string) {
  const db = getDatabase();
  const before = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const files = await db.pendingUpload.findMany({
    where: { userId, createdAt: { lt: before } },
  });
  for (const file of files) {
    const removed = await db.pendingUpload.deleteMany({
      where: { id: file.id, userId, createdAt: { lt: before } },
    });
    if (removed.count) await removeFile(file.storagePath).catch(() => {});
  }
}
