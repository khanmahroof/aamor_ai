import "server-only";
import { getDatabase } from "./client";
import { AppError } from "../http";
export async function ownedConversation(userId: string, id: string) {
  const conversation = await getDatabase().conversation.findFirst({
    where: { id, userId },
  });
  if (!conversation) throw new AppError(404, "Conversation not found.");
  return conversation;
}
export async function createConversation(userId: string) {
  return getDatabase().conversation.create({ data: { userId } });
}
