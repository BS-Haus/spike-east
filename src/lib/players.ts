import "server-only";
import { db } from "@/db";
import { players } from "@/db/schema";
import { hashPin, sharedCode } from "@/lib/auth/pin";

const PLAYER_COLORS = ["#BEF264", "#5EEAD4", "#F9A8D4", "#93C5FD", "#FDA4AF", "#FCD34D", "#C4B5FD", "#FDBA74", "#67E8F9", "#A3E635", "#F0ABFC", "#FCA5A5"];

/**
 * Add a league player: a free slug to sign in as, a colour nobody has yet, and the shared code.
 * Used by Manage players and by a tournament's walk-ins. Callers check admin first.
 */
export async function createPlayer(displayName: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = displayName.trim();
  const code = sharedCode();
  if (!code) return { ok: false, error: "Set SPIKE_PIN (4–8 digits) before adding players." };
  const baseSlug = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "") || "player";
  const existing = await db.select({ name: players.name, color: players.color }).from(players);
  const taken = new Set(existing.map((p) => p.name));
  let slug = baseSlug, n = 1;
  while (taken.has(slug)) slug = `${baseSlug}${++n}`;
  const usedColors = new Set(existing.map((p) => p.color));
  const color = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[existing.length % PLAYER_COLORS.length];
  const pinHash = await hashPin(code);
  const [row] = await db.insert(players).values({ name: slug, displayName: trimmed, color, pinHash }).returning({ id: players.id });
  return { ok: true, id: row.id };
}
