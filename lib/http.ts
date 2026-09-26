import { z } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError)
    return Response.json(
      { error: error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  const known = error instanceof AppError;
  return Response.json(
    {
      error: known ? error.message : "Something went wrong. Please try again.",
    },
    {
      status: known ? error.status : 500,
      headers:
        known && error.retryAfter
          ? { "Retry-After": String(error.retryAfter) }
          : undefined,
    },
  );
}
export async function readBytes(request: Request, maximum: number) {
  if (Number(request.headers.get("content-length")) > maximum)
    throw new AppError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel();
        throw new AppError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError(415, "Expected JSON.");
  const bytes = await readBytes(
    request,
    envNumber("MAX_REQUEST_SIZE_KB", 256, 1, 1024) * 1024,
  );
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError(400, "Invalid JSON.");
  }
}
export function checkOrigin(request: Request) {
  const expected = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    .origin;
  if (request.headers.get("origin") !== expected)
    throw new AppError(403, "Request origin is not allowed.");
}
export function envNumber(
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}
