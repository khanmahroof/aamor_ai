import { currentUser } from "@/lib/auth/session";
import { ChatClient } from "@/components/chat/chat-client";
import { GuestChat } from "@/components/chat/guest-chat";
export default async function Chat() {
  const user = await currentUser();
  if (!user) return <GuestChat />;
  return <ChatClient name={user.name ?? "friend"} />;
}
