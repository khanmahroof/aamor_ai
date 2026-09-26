import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./options";
import { getDatabase } from "../db/client";
import { AppError } from "../http";
export async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return getDatabase().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true },
  });
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AppError(401, "Please sign in again.");
  return user;
}
export async function requirePageUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
