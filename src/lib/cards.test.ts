import { describe, expect, it } from "vitest";
import { splitSizes, groupGames, planStage, tally, rank, groupWinner, netQueues, needsSub, withSub, validScore, winnerScore, groupMembers, groupsOf, finalsOf, eventStandings, seededOrder, type Game, type EventGames } from "./cards";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const pairKey = (x: string, y: string) => [x, y].sort().join("+");

function asGames(groups: ReturnType<typeof planStage>, stageNo = 1): Game[] {
  return groups.flatMap((g) => g.games.map((x) => ({ id: `${stageNo}-${g.groupNo}-${x.seq}`, stageNo, kind: "random" as const, groupNo: g.groupNo, groupName: g.name, seq: x.seq, ord: x.ord, net: g.net, a: x.a, b: x.b, subs: [], scoreA: null, scoreB: null, status: "todo" as const })));
}

describe("splitSizes", () => {
  it("makes groups of 4 and 5", () => {
    expect(splitSizes(8)).toEqual([4, 4]);
    expect(splitSizes(9)).toEqual([5, 4]);
    expect(splitSizes(10)).toEqual([5, 5]);
    expect(splitSizes(12)).toEqual([4, 4, 4]);
    expect(splitSizes(13)).toEqual([5, 4, 4]);
    expect(splitSizes(3)).toEqual([]);
  });
  it("keeps everyone", () => {
    for (let n = 4; n <= 30; n++) expect(splitSizes(n).reduce((a, b) => a + b, 0)).toBe(n);
  });
});

describe("groupGames", () => {
  for (const k of [4, 5, 6, 7]) {
    it(`a group of ${k} never repeats a partner and spreads games evenly`, () => {
      const games = groupGames(ids(k));
      const partners = new Map<string, number>(), played = new Map<string, number>();
      for (const g of games) {
        for (const t of [g.a, g.b]) partners.set(pairKey(t[0], t[1]), (partners.get(pairKey(t[0], t[1])) ?? 0) + 1);
        for (const id of [...g.a, ...g.b]) played.set(id, (played.get(id) ?? 0) + 1);
        expect(new Set([...g.a, ...g.b]).size).toBe(4);
      }
      expect(Math.max(...partners.values())).toBe(1);
      const counts = [...played.values()];
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      if (k <= 5) expect(partners.size).toBe((k * (k - 1)) / 2); // every pairing once
    });
  }
});

describe("planStage", () => {
  it("puts the top of the order in group A / Gold and gives each group its own net", () => {
    const order = ids(10);
    const g = planStage("final", order, 2);
    expect(g.map((x) => x.name)).toEqual(["Gold", "Silver"]);
    expect(g[0].ids).toEqual(order.slice(0, 5));
    expect(g.map((x) => x.net)).toEqual([1, 2]);
  });
  it("shares nets when there are more groups than nets", () => {
    const g = planStage("random", ids(12), 2);
    expect(g.map((x) => x.net)).toEqual([1, 2, 1]);
    const q = netQueues(asGames(g), 2);
    expect(q[0].map((x) => x.groupName)).toEqual(["A", "C", "A", "C", "A", "C"]);
  });
});

describe("tally and ranking", () => {
  it("counts wins and points, but never for a sub", () => {
    const g: Game = { id: "x", stageNo: 1, kind: "random", groupNo: 0, groupName: "A", seq: 1, ord: 0, net: 1, a: ["p0", "p9"], b: ["p2", "p3"], subs: ["p9"], scoreA: 15, scoreB: 10, status: "done" };
    const t = tally([g]);
    expect(t.get("p0")).toMatchObject({ gp: 1, w: 1, pf: 15, pa: 10 });
    expect(t.get("p9")).toBeUndefined();
    expect(t.get("p2")).toMatchObject({ gp: 1, l: 1 });
  });
  it("ranks by win %, then difference per game, players with no games last", () => {
    const r = rank([
      { id: "a", gp: 2, w: 1, l: 1, pf: 30, pa: 20 },
      { id: "b", gp: 3, w: 3, l: 0, pf: 45, pa: 30 },
      { id: "c", gp: 0, w: 0, l: 0, pf: 0, pa: 0 },
      { id: "d", gp: 2, w: 1, l: 1, pf: 30, pa: 29 },
    ]);
    expect(r.map((x) => x.id)).toEqual(["b", "a", "d", "c"]);
  });
  it("finds a group winner, or reports a tie", () => {
    const base = asGames(planStage("random", ids(4), 1));
    const done = base.map((g) => ({ ...g, status: "done" as const, scoreA: g.a.includes("p0") ? 15 : 10, scoreB: g.a.includes("p0") ? 10 : 15 }));
    expect(groupWinner(done).winner).toBe("p0");
    expect(groupWinner(base).winner).toBeNull();
  });
});

describe("dropouts and subs", () => {
  it("flags games with someone who left, and a sub's game doesn't count for them", () => {
    const [g] = asGames(planStage("random", ids(4), 1));
    expect(needsSub(g, new Set([g.a[0]]))).toEqual([g.a[0]]);
    const s = withSub(g, g.a[0], "late");
    expect(s.a).toContain("late");
    expect(s.subs).toEqual(["late"]);
    expect(groupMembers([{ ...g, ...s }])).not.toContain("late");
  });
});

describe("scores", () => {
  it("validates and works out winning scores", () => {
    expect(validScore(15, 13)).toBe(true);
    expect(validScore(15, 15)).toBe(false);
    expect(validScore(-1, 3)).toBe(false);
    expect(winnerScore(9, 15)).toBe(15);
    expect(winnerScore(14, 15)).toBe(16);
  });
});

describe("event views", () => {
  const here = (n: number) => ids(n).map((playerId) => ({ playerId, state: "here" as const }));
  // p0 wins every game it plays, everyone else splits.
  const played = (gs: Game[]) => gs.map((g) => {
    const aWon = g.a.includes("p0") || (!g.b.includes("p0") && g.seq % 2 === 1);
    return { ...g, status: "done" as const, scoreA: aWon ? 15 : 9, scoreB: aWon ? 9 : 15 };
  });

  it("standings count group stages only, and put p0 first", () => {
    const stage1 = played(asGames(planStage("random", ids(8), 2)));
    const finals = asGames(planStage("final", ids(8), 2), 2).map((g) => ({ ...g, kind: "final" as const }));
    const v: EventGames = { entries: here(8), stages: [{ id: "s1", no: 1, kind: "random" }, { id: "s2", no: 2, kind: "final" }], games: [...stage1, ...finals] };
    const table = eventStandings(v);
    expect(table[0].id).toBe("p0");
    expect(table.reduce((n, r) => n + r.gp, 0)).toBe(stage1.length * 4);
    expect(finalsOf(v)?.groups.map((g) => g.name)).toEqual(["Gold", "Silver"]);
    expect(groupsOf(v, 1).every((g) => g.complete)).toBe(true);
  });

  it("seeds late arrivals mid-table, not last", () => {
    const stage1 = played(asGames(planStage("random", ids(8), 2)));
    const v: EventGames = { entries: [...here(8), { playerId: "late", state: "here" }], stages: [{ id: "s1", no: 1, kind: "random" }], games: stage1 };
    const order = seededOrder(v, [...ids(8), "late"]);
    expect(order).toHaveLength(9);
    expect(order[0]).toBe("p0");
    expect(order.indexOf("late")).toBe(4);
  });
});
