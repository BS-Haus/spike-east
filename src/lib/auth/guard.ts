import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { players } from "@/db/schema";
import { getSession, type SessionPayload } from "@/lib/auth/session";
import { adminActive } from "@/lib/auth/admin";

/** Is this session an admin player with admin unlocked right now? */
export async function adminUnlocked(session: SessionPayload | null): Promise<boolean> {
  if (!session || !adminActive(session.adminUntil, Date.now())) return false;
  const [p] = await db.select({ isAdmin: players.isAdmin }).from(players).where(eq(players.id, session.playerId));
  return !!p?.isAdmin;
}

/** Admin actions need an admin player AND an unlocked session: the shared sign-in code lets
 *  anyone pick an admin's name, so the name alone proves nothing. Checked on every call.
 *  Lives outside the "use server" files so it can't itself be called as an action. */
export async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Admins only." };
  const [p] = await db.select({ isAdmin: players.isAdmin }).from(players).where(eq(players.id, session.playerId));
  if (!p?.isAdmin) return { ok: false, error: "Admins only." };
  if (!adminActive(session.adminUntil, Date.now())) return { ok: false, error: "Admin is locked. Enter the admin code." };
  return { ok: true };
}
