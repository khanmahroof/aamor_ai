import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
) {
  const [version, salt, hash] = (stored ?? "").split(":");
  const valid =
    version === "scrypt-v1" &&
    /^[a-f0-9]{32}$/.test(salt ?? "") &&
    /^[a-f0-9]{128}$/.test(hash ?? "");
  const actual = await derive(password, valid ? salt : "0".repeat(32));
  return valid && timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
