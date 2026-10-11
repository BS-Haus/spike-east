// Tournaments ("cards"), as pure functions: no database, no React. Everything the event page
// shows (who's on which net, group tables, finals winners) is derived from the list of games.
// Ported from BS-Haus/roundnet-open. Tournament games never feed the league's ratings: they
// live in their own tables and only this module reads them.

export type StageKind = "random" | "seeded" | "final";
export type GameStatus = "todo" | "done" | "void";

export type Game = {
  id: string;
  stageNo: number;
  kind: StageKind;
  groupNo: number;
  groupName: string;
  seq: number;
  ord: number;
  net: number;
  a: [string, string];
  b: [string, string];
  subs: string[];
  scoreA: number | null;
  scoreB: number | null;
  status: GameStatus;
};

export type Planned = { a: [string, string]; b: [string, string] };
export type PlannedGroup = { groupNo: number; name: string; net: number; ids: string[]; games: (Planned & { seq: number; ord: number })[] };

export const TIERS = ["Gold", "Silver", "Bronze", "Copper"];

/** Split n players into groups of 4–5 (6–7 only when the numbers force it, e.g. 6 or 7 people). */
export function splitSizes(n: number): number[] {
  if (n < 4) return [];
  const g = Math.max(1, Math.floor(n / 4));
  const base = Math.floor(n / g), extra = n % g;
  return Array.from({ length: g }, (_, i) => base + (i < extra ? 1 : 0));
}

export const gamesForSize = (k: number) => (k === 4 ? 3 : k);
export const gamesEachForSize = (k: number) => (k === 4 ? 3 : Math.round((gamesForSize(k) * 4) / k));

/**
 * Every partner pairing once. 4 players: 3 games, all play every game. 5 players: 5 games, one
 * sits out each game in turn, everyone plays 4 and partners each other person once. Bigger
 * groups fall back to a searched schedule with no repeat partners.
 */
export function groupGames(ids: string[], rnd: () => number = Math.random): Planned[] {
  const k = ids.length;
  if (k === 4) {
    return ([[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]] as const).map(([p, q, r, t]) => ({ a: [ids[p], ids[q]], b: [ids[r], ids[t]] }));
  }
  if (k === 5) {
    return [0, 1, 2, 3, 4].map((i) => ({ a: [ids[(i + 1) % 5], ids[(i + 4) % 5]], b: [ids[(i + 2) % 5], ids[(i + 3) % 5]] }));
  }
  return searchSchedule(ids, k, rnd);
}

/** Local search for groups of 6+: one net, `rounds` games, no repeat partners, even sit-outs. */
export function searchSchedule(ids: string[], rounds: number, rnd: () => number = Math.random): Planned[] {
  const N = ids.length;
  const cost = (R: number[][]) => {
    const P = new Map<string, number>(), O = new Map<string, number>();
    const k = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);
    for (const g of R) {
      for (const [x, y] of [[g[0], g[1]], [g[2], g[3]]]) P.set(k(x, y), (P.get(k(x, y)) ?? 0) + 1);
      for (const x of [g[0], g[1]]) for (const y of [g[2], g[3]]) O.set(k(x, y), (O.get(k(x, y)) ?? 0) + 1);
    }
    let c = 0;
    for (const v of P.values()) c += 10 * Math.max(0, v - 1);
    for (const v of O.values()) c += Math.max(0, v - 2);
    return c;
  };
  let best: number[][] = [], bestC = Infinity;
  for (let restart = 0; restart < 40 && bestC > 0; restart++) {
    // Rest rotates to whoever has played least so far; ties broken at random each restart.
    const played = new Array(N).fill(0);
    const R: number[][] = [];
    for (let r = 0; r < rounds; r++) {
      const order = [...Array(N).keys()].map((x) => [x, rnd()] as const).sort((x, y) => played[x[0]] - played[y[0]] || x[1] - y[1]).map((x) => x[0]);
      const four = order.slice(0, 4);
      four.forEach((x) => played[x]++);
      R.push(four);
    }
    let c = cost(R);
    for (let it = 0; it < 3000 && c > 0; it++) {
      const g = R[Math.floor(rnd() * rounds)];
      const i = Math.floor(rnd() * 4), j = Math.floor(rnd() * 4);
      if ((i >> 1) === (j >> 1)) continue;
      [g[i], g[j]] = [g[j], g[i]];
      const c2 = cost(R);
      if (c2 <= c) c = c2;
      else [g[i], g[j]] = [g[j], g[i]];
    }
    if (c < bestC) { bestC = c; best = R.map((x) => x.slice()); }
  }
  return best.map((g) => ({ a: [ids[g[0]], ids[g[1]]], b: [ids[g[2]], ids[g[3]]] }));
}

export function shuffle<T>(xs: T[], rnd: () => number = Math.random): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Lay out a stage. `ordered` is the player order: shuffled for a random stage, best first for
 * seeded and finals, so group A / Gold gets the top of the table. Groups share nets in turn,
 * and `ord` interleaves their games so two groups on one net alternate.
 */
export function planStage(kind: StageKind, ordered: string[], nets: number, rnd: () => number = Math.random): PlannedGroup[] {
  const sizes = splitSizes(ordered.length);
  const G = sizes.length;
  let at = 0;
  return sizes.map((k, groupNo) => {
    const ids = ordered.slice(at, (at += k));
    const name = kind === "final" ? (TIERS[groupNo] ?? `Tier ${groupNo + 1}`) : String.fromCharCode(65 + groupNo);
    const games = groupGames(kind === "random" ? ids : shuffle(ids, rnd), rnd).map((g, i) => ({ ...g, seq: i + 1, ord: i * G + groupNo }));
    return { groupNo, name, net: (groupNo % Math.max(1, nets)) + 1, ids, games };
  });
}

// ---------------------------------------------------------------------------------------------

export type Line = { id: string; gp: number; w: number; l: number; pf: number; pa: number };

const players = (g: Game) => [...g.a, ...g.b];
export const isDone = (g: Game) => g.status === "done" && g.scoreA != null && g.scoreB != null;

/** Win/loss lines from finished games. A sub's appearance never counts for the sub. */
export function tally(games: Game[], ids?: Iterable<string>): Map<string, Line> {
  const t = new Map<string, Line>();
  const line = (id: string) => t.get(id) ?? (t.set(id, { id, gp: 0, w: 0, l: 0, pf: 0, pa: 0 }), t.get(id)!);
  if (ids) for (const id of ids) line(id);
  for (const g of games) {
    if (!isDone(g)) continue;
    const aWon = g.scoreA! > g.scoreB!;
    for (const [side, won, f, a] of [[g.a, aWon, g.scoreA!, g.scoreB!], [g.b, !aWon, g.scoreB!, g.scoreA!]] as const) {
      for (const id of side) {
        if (g.subs.includes(id)) continue;
        const r = line(id);
        r.gp++; won ? r.w++ : r.l++; r.pf += f; r.pa += a;
      }
    }
  }
  return t;
}

/** Best first: win %, then point difference per game, then wins. Players yet to play go last. */
export function rank(lines: Iterable<Line>): Line[] {
  const pct = (r: Line) => (r.gp ? r.w / r.gp : 0);
  const pdg = (r: Line) => (r.gp ? (r.pf - r.pa) / r.gp : 0);
  return [...lines].sort((x, y) => Number(!x.gp) - Number(!y.gp) || pct(y) - pct(x) || pdg(y) - pdg(x) || y.w - x.w);
}

/** Inside one group, points (= wins) decide, then point difference. */
export function groupRank(lines: Iterable<Line>): Line[] {
  return [...lines].sort((x, y) => y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa));
}

/** Everyone who appears in a group's games (minus anyone who only ever subbed in). */
export function groupMembers(games: Game[]): string[] {
  const subOnly = new Set<string>();
  const all = new Set<string>();
  for (const g of games) for (const id of players(g)) { all.add(id); if (g.subs.includes(id)) subOnly.add(id); }
  for (const g of games) for (const id of players(g)) if (!g.subs.includes(id)) subOnly.delete(id);
  return [...all].filter((id) => !subOnly.has(id));
}

/** A finished group's winner, or the tied pair when first place is level on wins and difference. */
export function groupWinner(games: Game[]): { winner: string | null; tied: string[] } {
  const live = games.filter((g) => g.status !== "void");
  if (!live.length || live.some((g) => !isDone(g))) return { winner: null, tied: [] };
  const rows = groupRank(tally(live, groupMembers(live)).values());
  if (rows.length > 1 && rows[0].w === rows[1].w && rows[0].pf - rows[0].pa === rows[1].pf - rows[1].pa) {
    return { winner: null, tied: [rows[0].id, rows[1].id] };
  }
  return { winner: rows[0]?.id ?? null, tied: [] };
}

/** Each net's queue of games still to play, in order: [0] is on now, [1] is next. */
export function netQueues(games: Game[], nets: number): Game[][] {
  const todo = games.filter((g) => g.status === "todo").sort((x, y) => x.stageNo - y.stageNo || x.ord - y.ord);
  return Array.from({ length: Math.max(1, nets) }, (_, i) => todo.filter((g) => g.net === i + 1));
}

/** Games still to play that include someone who has left: they need a sub (or skipping). */
export function needsSub(g: Game, out: Set<string>): string[] {
  return g.status === "todo" ? players(g).filter((id) => out.has(id)) : [];
}

/** Swap `from` for `sub` in a game; the sub is recorded so the result doesn't count for them. */
export function withSub(g: Pick<Game, "a" | "b" | "subs">, from: string, sub: string): { a: [string, string]; b: [string, string]; subs: string[] } {
  const swap = (side: [string, string]) => side.map((x) => (x === from ? sub : x)) as [string, string];
  return { a: swap(g.a), b: swap(g.b), subs: [...new Set([...g.subs.filter((s) => s !== from), sub])] };
}

/** A valid finished score: whole numbers 0–99, no draws. */
export function validScore(a: unknown, b: unknown): boolean {
  return Number.isInteger(a) && Number.isInteger(b) && (a as number) >= 0 && (b as number) >= 0 && (a as number) <= 99 && (b as number) <= 99 && a !== b;
}

/** The winner's score for a loser's score in a game to `to`, win by two. */
export const winnerScore = (loser: number, to: number) => Math.max(to, loser + 2);

/** Rough minutes for a stage: the busiest net's games, at ~(to/1.6 + 3) min each. */
export function stageMinutes(sizes: number[], nets: number, to: number): number {
  const per = new Array(Math.max(1, nets)).fill(0);
  sizes.forEach((k, i) => (per[i % per.length] += gamesForSize(k)));
  return Math.round(Math.max(0, ...per) * (to / 1.6 + 3));
}

// ---------------------------------------------------------------------------------------------
// Views of one event: what the event page shows, derived from its entries, stages and games.

export type EntryState = "going" | "here" | "out";
export type StageRow = { id: string; no: number; kind: StageKind };
/** Just enough of an event for the derivations below. */
export type EventGames = { entries: { playerId: string; state: EntryState }[]; stages: StageRow[]; games: Game[] };

export type GroupView = { stageNo: number; kind: StageKind; groupNo: number; name: string; net: number; games: Game[]; table: Line[]; winner: string | null; tied: string[]; complete: boolean };

export function groupsOf(v: EventGames, stageNo: number): GroupView[] {
  const gs = v.games.filter((g) => g.stageNo === stageNo);
  const nos = [...new Set(gs.map((g) => g.groupNo))].sort((a, b) => a - b);
  return nos.map((groupNo) => {
    const games = gs.filter((g) => g.groupNo === groupNo).sort((a, b) => a.seq - b.seq);
    const live = games.filter((g) => g.status !== "void");
    const table = groupRank(tally(live, groupMembers(games)).values());
    const { winner, tied } = groupWinner(games);
    return { stageNo, kind: games[0].kind, groupNo, name: games[0].groupName, net: games[0].net, games, table, winner, tied, complete: live.every(isDone) };
  });
}

/** The latest finals stage, if one has been drawn. */
export function finalsOf(v: EventGames): { stageNo: number; groups: GroupView[] } | null {
  const st = [...v.stages].reverse().find((s) => s.kind === "final");
  return st ? { stageNo: st.no, groups: groupsOf(v, st.no) } : null;
}

/** The event's standings across its group stages (finals are scored separately). */
export function eventStandings(v: EventGames): Line[] {
  const present = v.entries.filter((e) => e.state === "here").map((e) => e.playerId);
  return rank(tally(v.games.filter((g) => g.kind !== "final"), present).values());
}

/**
 * The order the next seeded stage or finals draws from: best first. Anyone with no games yet
 * (a late arrival) slots in mid-table rather than at the bottom: they haven't lost anything.
 */
export function seededOrder(v: EventGames, present: string[]): string[] {
  const ranked = eventStandings(v).filter((r) => present.includes(r.id));
  const played = ranked.filter((r) => r.gp > 0).map((r) => r.id);
  const fresh = ranked.filter((r) => r.gp === 0).map((r) => r.id);
  const mid = Math.floor(played.length / 2);
  return [...played.slice(0, mid), ...fresh, ...played.slice(mid)];
}
