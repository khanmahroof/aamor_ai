import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth/options";
import { errorResponse, readBytes, AppError } from "@/lib/http";
import { limiter } from "@/lib/rate-limit";
export const runtime = "nodejs";
const handler = NextAuth(authOptions);
type Context = { params: Promise<{ nextauth: string[] }> };
export async function GET(req: NextRequest, context: Context) {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
    return errorResponse(
      new AppError(503, "Authentication is not configured. Run npm run setup."),
    );
  return handler(req, context);
}
export async function POST(req: NextRequest, context: Context) {
  try {
    limiter.consume("auth-global", 60);
    const bytes = await readBytes(req, 16384);
    return GET(
      new NextRequest(req.url, {
        method: "POST",
        headers: req.headers,
        body: bytes,
      }),
      context,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
