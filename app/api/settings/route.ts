import { requireUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import { checkOrigin, errorResponse, readJson } from "@/lib/http";
import { settingsSchema } from "@/lib/validation/settings";
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(
      await getDatabase().userSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    checkOrigin(request);
    const data = settingsSchema.partial().parse(await readJson(request));
    return Response.json(
      await getDatabase().userSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...data },
        update: data,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
