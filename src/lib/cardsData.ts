import "server-only";
import { and, asc, desc, eq, gte, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { players, tournaments, tournamentEntries, tournamentStages, tournamentGames } from "@/db/schema";
import { finalsOf, type EntryState, type Game, type StageKind, type StageRow } from "@/lib/cards";

// The tournament pages' server loader: database rows in, the plain shapes src/lib/cards.ts
// derives everything from out. Players are the league's own (`players`).

export type PlayerLite = { id: string; name: string; color: string };
export type TournamentRow = typeof tournaments.$inferSelect;
export type Entry = { playerId: string; state: EntryState; at: number };

export type EventView = {
  event: TournamentRow;
  entries: Entry[];
  stages: StageRow[];
  games: Game[];
  people: Record<string, PlayerLite>;
};

const lite = (p: { id: string; displayName: string; color: string }): PlayerLite => ({ id: p.id, name: p.displayName, color: p.color });

function toGame(g: typeof tournamentGames.$inferSelect, st: Map<string, StageRow>): Game {
  const s = st.get(g.stageId)!;
  return {
    id: g.id, stageNo: s.no, kind: s.kind, groupNo: g.groupNo, groupName: g.groupName, seq: g.seq, ord: g.ord, net: g.net,
    a: [g.a1, g.a2], b: [g.b1, g.b2], subs: g.subs ?? [], scoreA: g.scoreA, scoreB: g.scoreB, status: g.status as Game["status"],
  };
}

/** Everyone who can be checked in: the league's active players, A–Z. */
export async function activePlayers(): Promise<PlayerLite[]> {
  const ps = await db.select({ id: players.id, displayName: players.displayName, color: players.color }).from(players).where(eq(players.isActive, true)).orderBy(asc(players.displayName));
  return ps.map(lite);
}

export async function getEventView(id: string): Promise<EventView | null> {
  const [event] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!event) return null;
  const [ens, sts, gs] = await Promise.all([
    db.select().from(tournamentEntries).where(eq(tournamentEntries.tournamentId, id)).orderBy(asc(tournamentEntries.createdAt)),
    db.select().from(tournamentStages).where(eq(tournamentStages.tournamentId, id)).orderBy(asc(tournamentStages.no)),
    db.select().from(tournamentGames).where(eq(tournamentGames.tournamentId, id)),
  ]);
  const stageRows = sts.map((s) => ({ id: s.id, no: s.no, kind: s.kind as StageKind }));
  const stMap = new Map(stageRows.map((s) => [s.id, s]));
  const ids = new Set<string>(ens.map((e) => e.playerId));
  gs.forEach((g) => [g.a1, g.a2, g.b1, g.b2].forEach((x) => ids.add(x)));
  const ps = ids.size ? await db.select({ id: players.id, displayName: players.displayName, color: players.color }).from(players).where(inArray(players.id, [...ids])) : [];
  return {
    event,
    entries: ens.map((e) => ({ playerId: e.playerId, state: e.state as EntryState, at: e.createdAt.getTime() })),
    stages: stageRows,
    games: gs.map((g) => toGame(g, stMap)),
    people: Object.fromEntries(ps.map((p) => [p.id, lite(p)])),
  };
}

export type EventCard = TournamentRow & { going: number; here: number; mine: EntryState | null; champion: string | null };

export async function getEventCards(me: string | null): Promise<{ upcoming: EventCard[]; live: EventCard[]; past: EventCard[] }> {
  const evs = await db.select().from(tournaments).orderBy(desc(tournaments.startsAt));
  const ens = evs.length ? await db.select().from(tournamentEntries).where(inArray(tournamentEntries.tournamentId, evs.map((e) => e.id))) : [];
  const done = evs.filter((e) => e.status === "done").slice(0, 12);
  const champs = new Map<string, string | null>();
  for (const e of done) {
    const v = await getEventView(e.id);
    const gold = v ? finalsOf(v)?.groups[0] : undefined;
    champs.set(e.id, gold?.winner ? v!.people[gold.winner]?.name ?? null : null);
  }
  const card = (e: TournamentRow): EventCard => {
    const mine = ens.filter((x) => x.tournamentId === e.id);
    return {
      ...e,
      going: mine.filter((x) => x.state !== "out").length,
      here: mine.filter((x) => x.state === "here").length,
      mine: (me && (mine.find((x) => x.playerId === me)?.state as EntryState)) || null,
      champion: champs.get(e.id) ?? null,
    };
  };
  return {
    live: evs.filter((e) => e.status === "live").map(card),
    upcoming: evs.filter((e) => e.status === "upcoming").reverse().map(card),
    past: done.map(card),
  };
}

export type NextTournament = { id: string; title: string; startsAt: number; live: boolean };

/** What the ladder's banner points at: a tournament on now, else the next one in the coming
 *  fortnight. Null when there's nothing, or before the tables exist. */
export async function nextTournament(now: number): Promise<NextTournament | null> {
  try {
    const [row] = await db
      .select({ id: tournaments.id, title: tournaments.title, startsAt: tournaments.startsAt, status: tournaments.status })
      .from(tournaments)
      .where(or(eq(tournaments.status, "live"), and(ne(tournaments.status, "done"), gte(tournaments.startsAt, new Date(now - 12 * 3_600_000)))))
      .orderBy(desc(eq(tournaments.status, "live")), asc(tournaments.startsAt))
      .limit(1);
    if (!row) return null;
    if (row.status !== "live" && row.startsAt.getTime() > now + 14 * 86_400_000) return null;
    return { id: row.id, title: row.title, startsAt: row.startsAt.getTime(), live: row.status === "live" };
  } catch {
    return null;
  }
}
