"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { players, tournaments, tournamentEntries, tournamentStages, tournamentGames } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/guard";
import { writeAllowed } from "@/lib/auth/rateLimit";
import { createPlayer } from "@/lib/players";
import { planStage, seededOrder, shuffle, validScore, withSub, type EntryState, type StageKind } from "@/lib/cards";
import { getEventView } from "@/lib/cardsData";

// Tournaments ("cards"). Same rules as the league's actions: anyone signed in with the shared
// code can say they're coming, enter scores and sort subs; posting events, checking people in
// and drawing stages is admin-only, once unlocked. Server actions are public endpoints, so
// every argument is checked before it's used.

export type CardsResult = { ok: true; id?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const fail = (error: string): CardsResult => ({ ok: false, error });

function refresh(id?: string) {
  revalidatePath("/cards");
  if (id) revalidatePath(`/cards/${id}`);
  revalidatePath("/"); // the ladder's banner
}

/** Signed in, and under the per-IP cap for tournament writes. */
async function player(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Sign in first." };
  const limit = await writeAllowed("cards");
  if (!limit.ok) return limit;
  return { ok: true, id: s.playerId };
}

// ---------------------------------------------------------------------------------------------
// Events

type EventInput = { title: string; startsAt: string; location: string; notes: string; nets: number; groupTo: number; finalTo: number };

function parseEvent(x: EventInput): { ok: true; v: Omit<typeof tournaments.$inferInsert, "id"> } | { ok: false; error: string } {
  const title = clean(x?.title);
  if (title.length < 2 || title.length > 60) return { ok: false, error: "Give the event a name." };
  const at = new Date(x?.startsAt);
  if (Number.isNaN(at.getTime())) return { ok: false, error: "Pick a date and time." };
  const int = (v: unknown, lo: number, hi: number, d: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : d);
  return {
    ok: true,
    v: {
      title, startsAt: at,
      location: clean(x.location).slice(0, 80), notes: typeof x.notes === "string" ? x.notes.trim().slice(0, 500) : "",
      nets: int(x.nets, 1, 8, 2), groupTo: int(x.groupTo, 5, 25, 15), finalTo: int(x.finalTo, 5, 25, 15),
    },
  };
}

export async function createTournament(x: EventInput): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  const p = parseEvent(x); if (!p.ok) return p;
  const [row] = await db.insert(tournaments).values(p.v).returning({ id: tournaments.id });
  refresh(row.id);
  return { ok: true, id: row.id };
}

export async function updateTournament(id: string, x: EventInput): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  if (!isUuid(id)) return fail("Unknown event.");
  const p = parseEvent(x); if (!p.ok) return p;
  await db.update(tournaments).set(p.v).where(eq(tournaments.id, id));
  refresh(id);
  return { ok: true };
}

export async function deleteTournament(id: string): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  if (!isUuid(id)) return fail("Unknown event.");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tournamentStages).where(eq(tournamentStages.tournamentId, id));
  if (n > 0) return fail("Groups have been drawn, so it can't be deleted. Finish it instead.");
  await db.delete(tournaments).where(eq(tournaments.id, id));
  refresh();
  return { ok: true };
}

export async function finishTournament(id: string): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  if (!isUuid(id)) return fail("Unknown event.");
  await db.transaction(async (tx) => {
    await tx.update(tournamentGames).set({ status: "void" }).where(and(eq(tournamentGames.tournamentId, id), eq(tournamentGames.status, "todo")));
    await tx.update(tournaments).set({ status: "done" }).where(eq(tournaments.id, id));
  });
  refresh(id);
  return { ok: true };
}

export async function reopenTournament(id: string): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  if (!isUuid(id)) return fail("Unknown event.");
  await db.update(tournaments).set({ status: "live" }).where(eq(tournaments.id, id));
  refresh(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Sign-ups and check-in

const STATES = ["going", "here", "out"] as const;

async function upsertEntry(tournamentId: string, playerId: string, state: EntryState) {
  await db.insert(tournamentEntries).values({ tournamentId, playerId, state })
    .onConflictDoUpdate({ target: [tournamentEntries.tournamentId, tournamentEntries.playerId], set: { state, updatedAt: new Date() } });
}

/** Your own place: I'm in (going), I'm here (checked in), or out (can't make it / leaving). */
export async function setMyEntry(tournamentId: string, state: EntryState): Promise<CardsResult> {
  if (!isUuid(tournamentId) || !STATES.includes(state)) return fail("Unknown event.");
  const me = await player(); if (!me.ok) return me;
  const [ev] = await db.select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!ev || ev.status === "done") return fail("This event has finished.");
  await upsertEntry(tournamentId, me.id, state);
  refresh(tournamentId);
  return { ok: true };
}

/** Admin: check someone in or out, or take them off the list. */
export async function setEntry(tournamentId: string, playerId: string, state: EntryState | "remove"): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  if (!isUuid(tournamentId) || !isUuid(playerId)) return fail("Unknown player.");
  if (state === "remove") await db.delete(tournamentEntries).where(and(eq(tournamentEntries.tournamentId, tournamentId), eq(tournamentEntries.playerId, playerId)));
  else if (STATES.includes(state)) await upsertEntry(tournamentId, playerId, state);
  else return fail("Unknown state.");
  refresh(tournamentId);
  return { ok: true };
}

/** Admin: check someone in on the day by name. A league player if one has that name, otherwise
 *  a new league player (shared sign-in code, like Manage players) who can sign in afterwards. */
export async function addWalkIn(tournamentId: string, nameIn: string): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  const name = clean(nameIn);
  if (!isUuid(tournamentId)) return fail("Unknown event.");
  if (name.length < 1 || name.length > 30) return fail("Enter a name.");
  let [p] = await db.select({ id: players.id }).from(players).where(sql`lower(${players.displayName}) = ${name.toLowerCase()}`);
  if (!p) {
    const created = await createPlayer(name);
    if (!created.ok) return created;
    p = { id: created.id };
  }
  await upsertEntry(tournamentId, p.id, "here");
  refresh(tournamentId);
  return { ok: true, id: p.id };
}

// ---------------------------------------------------------------------------------------------
// Stages. A drawn game never changes shape: late arrivals join the next stage, and anyone who
// leaves is covered by a sub.

export async function drawStage(tournamentId: string, kind: StageKind): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  if (!isUuid(tournamentId) || !["random", "seeded", "final"].includes(kind)) return fail("Unknown event.");
  const v = await getEventView(tournamentId);
  if (!v) return fail("Unknown event.");
  if (v.event.status === "done") return fail("This event has finished. Reopen it first.");
  const present = v.entries.filter((e) => e.state === "here").map((e) => e.playerId);
  if (present.length < 4) return fail("Check in at least 4 players first.");
  const order = kind === "random" ? shuffle(present) : seededOrder(v, present);
  const plan = planStage(kind, order, v.event.nets);
  const stageNo = (v.stages.at(-1)?.no ?? 0) + 1;
  await db.transaction(async (tx) => {
    await tx.update(tournamentGames).set({ status: "void" }).where(and(eq(tournamentGames.tournamentId, tournamentId), eq(tournamentGames.status, "todo")));
    const [st] = await tx.insert(tournamentStages).values({ tournamentId, no: stageNo, kind }).returning({ id: tournamentStages.id });
    const rows = plan.flatMap((g) => g.games.map((x) => ({
      tournamentId, stageId: st.id, groupNo: g.groupNo, groupName: g.name, seq: x.seq, ord: x.ord, net: g.net,
      a1: x.a[0], a2: x.a[1], b1: x.b[0], b2: x.b[1],
    })));
    await tx.insert(tournamentGames).values(rows);
    await tx.update(tournaments).set({ status: "live" }).where(eq(tournaments.id, tournamentId));
  });
  refresh(tournamentId);
  return { ok: true };
}

/** Admin: take back the latest stage if nothing in it has been played. */
export async function undoStage(tournamentId: string): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  const v = isUuid(tournamentId) ? await getEventView(tournamentId) : null;
  const last = v?.stages.at(-1);
  if (!v || !last) return fail("Nothing to undo.");
  if (v.games.some((g) => g.stageNo === last.no && g.status === "done")) return fail("Games in this stage have scores, so it can't be undone.");
  const prev = v.stages.at(-2);
  await db.transaction(async (tx) => {
    await tx.delete(tournamentStages).where(eq(tournamentStages.id, last.id));
    if (prev) {
      // Bring back the previous stage's unplayed games.
      const ids = v.games.filter((g) => g.stageNo === prev.no && g.status === "void" && g.scoreA == null).map((g) => g.id);
      if (ids.length) await tx.update(tournamentGames).set({ status: "todo" }).where(inArray(tournamentGames.id, ids));
    } else await tx.update(tournaments).set({ status: "upcoming" }).where(eq(tournaments.id, tournamentId));
  });
  refresh(tournamentId);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Games

async function gameFor(gameId: string) {
  if (!isUuid(gameId)) return null;
  const [g] = await db.select().from(tournamentGames).where(eq(tournamentGames.id, gameId));
  return g ?? null;
}

/** Anyone signed in can enter or correct a score, in any order. */
export async function enterScore(gameId: string, scoreA: number, scoreB: number): Promise<CardsResult> {
  if (!validScore(scoreA, scoreB)) return fail("Scores must be whole numbers and can't be level.");
  const me = await player(); if (!me.ok) return me;
  const g = await gameFor(gameId); if (!g) return fail("Unknown game.");
  if (g.status === "void") return fail("This game was skipped.");
  await db.update(tournamentGames).set({ scoreA, scoreB, status: "done", enteredById: me.id, updatedAt: new Date() }).where(eq(tournamentGames.id, gameId));
  refresh(g.tournamentId);
  return { ok: true };
}

/** Admin: wipe a score (the game goes back to being played). */
export async function clearScore(gameId: string): Promise<CardsResult> {
  const admin = await requireAdmin(); if (!admin.ok) return admin;
  const g = await gameFor(gameId); if (!g) return fail("Unknown game.");
  await db.update(tournamentGames).set({ scoreA: null, scoreB: null, status: "todo", updatedAt: new Date() }).where(eq(tournamentGames.id, gameId));
  refresh(g.tournamentId);
  return { ok: true };
}

/** Skip a game nobody can play (or bring a skipped one back). */
export async function setSkipped(gameId: string, skipped: boolean): Promise<CardsResult> {
  const me = await player(); if (!me.ok) return me;
  const g = await gameFor(gameId); if (!g) return fail("Unknown game.");
  if (g.status === "done") return fail("This game already has a score.");
  await db.update(tournamentGames).set({ status: skipped === true ? "void" : "todo", updatedAt: new Date() }).where(eq(tournamentGames.id, gameId));
  refresh(g.tournamentId);
  return { ok: true };
}

/** Put a sub in for someone in a game still to play. The result won't count for the sub. */
export async function subIn(gameId: string, fromId: string, subId: string, allRemaining = false): Promise<CardsResult> {
  const me = await player(); if (!me.ok) return me;
  const g = await gameFor(gameId); if (!g) return fail("Unknown game.");
  if (!isUuid(fromId) || !isUuid(subId)) return fail("Pick who's coming off and who's going on.");
  if (g.status !== "todo") return fail("Only games still to play can have a sub.");
  const four = [g.a1, g.a2, g.b1, g.b2];
  if (!four.includes(fromId)) return fail("That player isn't in this game.");
  if (four.includes(subId)) return fail("That player is already in this game.");
  const [entry] = await db.select({ state: tournamentEntries.state }).from(tournamentEntries).where(and(eq(tournamentEntries.tournamentId, g.tournamentId), eq(tournamentEntries.playerId, subId)));
  if (entry?.state !== "here") return fail("Only someone checked in can sub.");
  // Optionally cover every game the player still had left in this stage, where the sub is free to.
  const targets = allRemaining === true
    ? (await db.select().from(tournamentGames).where(and(eq(tournamentGames.stageId, g.stageId), eq(tournamentGames.status, "todo")))).filter((x) => [x.a1, x.a2, x.b1, x.b2].includes(fromId) && ![x.a1, x.a2, x.b1, x.b2].includes(subId))
    : [g];
  await db.transaction(async (tx) => {
    for (const t of targets) {
      const next = withSub({ a: [t.a1, t.a2], b: [t.b1, t.b2], subs: t.subs ?? [] }, fromId, subId);
      await tx.update(tournamentGames).set({ a1: next.a[0], a2: next.a[1], b1: next.b[0], b2: next.b[1], subs: next.subs, updatedAt: new Date() }).where(eq(tournamentGames.id, t.id));
    }
  });
  refresh(g.tournamentId);
  return { ok: true };
}
