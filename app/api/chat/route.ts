import { requireUser } from "@/lib/auth/session";
import { checkOrigin, errorResponse, readJson } from "@/lib/http";
import { chatSchema } from "@/lib/validation/chat";
import { generateChat } from "@/lib/chat/generate";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    return await generateChat(
      user.id,
      chatSchema.parse(await readJson(request)),
      request,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
