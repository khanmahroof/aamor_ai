import { requirePageUser } from "@/lib/auth/session";
import { ChatClient } from "@/components/chat/chat-client";
export default async function Chat() {
  const user = await requirePageUser();
  return <ChatClient name={user.name ?? "friend"} />;
}
