import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
export const storageRoot = () =>
  resolve(
    /* turbopackIgnore: true */ process.env.UPLOAD_DIR || "storage/uploads",
  );
export function storagePath(key: string) {
  if (!/^[a-f0-9-]{36}\.[a-z]{2,4}$/.test(key))
    throw new Error("Invalid storage key.");
  const root = storageRoot();
  const path = resolve(root, key);
  if (!path.startsWith(root + sep)) throw new Error("Invalid storage path.");
  return path;
}
export async function saveFile(buffer: Uint8Array, extension: string) {
  await mkdir(storageRoot(), { recursive: true });
  const key = `${randomUUID()}.${extension}`;
  await writeFile(storagePath(key), buffer, { flag: "wx", mode: 0o600 });
  return key;
}
export async function removeFile(key: string) {
  try {
    await unlink(storagePath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export const readStoredFile = (key: string) =>
  readFile(/* turbopackIgnore: true */ storagePath(key));
