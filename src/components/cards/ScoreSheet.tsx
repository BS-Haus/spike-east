"use client";

import { useState } from "react";
import Link from "next/link";
import { enterScore, clearScore, setSkipped, subIn } from "@/app/actions/cards";
import { useAction } from "@/components/cards/useAction";
import { PAvatar, btnPrimary, btnGhost, btnQuiet, signInHref } from "@/components/cards/ui";
import { isDone, winnerScore, type Game } from "@/lib/cards";
import type { PlayerLite } from "@/lib/cardsData";

/**
 * Tap the team that won, then the losers' score: the winners' score follows from the game
 * length (win by two). One-handed, no keyboard. Also where subs and skips are sorted.
 */
export function ScoreSheet({ game, eventId, people, to, canScore, org, candidates, out, onClose }: {
  game: Game; eventId: string; people: Record<string, PlayerLite>; to: number; canScore: boolean; org: boolean;
  candidates: string[]; out: Set<string>; onClose: () => void;
}) {
  const { run, pending, toast } = useAction();
  const done = isDone(game);
  const [winner, setWinner] = useState<"a" | "b" | null>(done ? (game.scoreA! > game.scoreB! ? "a" : "b") : null);
  const [loser, setLoser] = useState<number | null>(done ? Math.min(game.scoreA!, game.scoreB!) : null);
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subAll, setSubAll] = useState(true);
  const name = (id: string) => people[id]?.name ?? "?";
  const team = (ids: string[]) => ids.map(name).join(" & ");
  const w = loser == null ? null : winnerScore(loser, to);
  const scoreA = winner === "a" ? w : loser, scoreB = winner === "b" ? w : loser;
  const label = game.kind === "final" ? `${game.groupName} final` : `Group ${game.groupName}`;
  const save = () => {
    if (scoreA == null || scoreB == null) return;
    run(() => enterScore(game.id, scoreA, scoreB), "Score saved", (r) => r.ok && onClose());
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      {toast}
      <div role="dialog" aria-label={`${label}, game ${game.seq}`} className="spk-sheet mx-auto max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl border-t border-white/[.08] bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
        <div className="flex items-baseline justify-between">
          <div className="text-[12px] font-bold uppercase tracking-[.12em] text-accent">{label} · game {game.seq}</div>
          <div className="text-[12px] text-dim">to {to}, win by 2</div>
        </div>

        {game.status === "void" ? (
          <div className="mt-4 grid gap-3">
            <p className="text-[15px]">This game was skipped.</p>
            <button disabled={pending} onClick={() => run(() => setSkipped(game.id, false), "Game is back on", (r) => r.ok && onClose())} className={btnGhost}>Put it back on</button>
          </div>
        ) : !canScore ? (
          <div className="mt-4 grid gap-3">
            <p className="text-[15px] font-bold">{team(game.a)} vs {team(game.b)}</p>
            <p className="text-[14px] text-muted">Sign in with the league code to enter scores.</p>
            <Link href={signInHref(`/cards/${eventId}`)} className={btnPrimary}>Sign in</Link>
          </div>
        ) : (
          <>
            <div className="mt-4 text-[15px] font-extrabold">Who won?</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["a", "b"] as const).map((side) => {
                const ids = game[side];
                const on = winner === side;
                return (
                  <button key={side} onClick={() => setWinner(side)} aria-pressed={on} className={`spk-press min-h-20 rounded-2xl border p-3 text-left ${on ? "border-accent bg-accent text-ink" : "border-white/[.08] bg-raised"}`}>
                    <div className="flex -space-x-1.5">{ids.map((id) => <PAvatar key={id} p={people[id]} size={26} />)}</div>
                    <div className="mt-2 text-[14.5px] font-extrabold leading-tight">{team(ids)}</div>
                  </button>
                );
              })}
            </div>

            {winner && (
              <>
                <div className="mt-5 text-[15px] font-extrabold">{team(game[winner === "a" ? "b" : "a"])} scored</div>
                <div className="mt-2 grid grid-cols-6 gap-1.5">
                  {Array.from({ length: to + 6 }, (_, n) => n).map((n) => (
                    <button key={n} onClick={() => setLoser(n)} aria-pressed={loser === n} className={`spk-press tnum h-11 rounded-xl font-mono text-[15px] font-bold ${loser === n ? "bg-accent text-ink" : n >= to - 1 ? "bg-panel text-muted" : "bg-raised"}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-dim">From {to - 1} up it&apos;s deuce: the winners get two more.</p>
              </>
            )}

            <button disabled={pending || scoreA == null} onClick={save} className={`${btnPrimary} mt-5 h-14 w-full text-[16px]`}>
              {scoreA == null ? "Pick the winner and score" : `Save · ${team(game[winner!])} win ${w}–${loser}`}
            </button>

            {done && org && <button disabled={pending} onClick={() => run(() => clearScore(game.id), "Score cleared", (r) => r.ok && onClose())} className={`${btnQuiet} mt-2 w-full`}>Clear this score</button>}

            {game.status === "todo" && (
              <div className="mt-5 border-t border-white/[.06] pt-4">
                <div className="text-[15px] font-extrabold">Someone can&apos;t play?</div>
                <p className="mt-1 text-[13px] text-muted">Swap in a sub. The result still counts for the other three, but not for the sub.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...game.a, ...game.b].map((id) => (
                    <button key={id} onClick={() => setSubFor(subFor === id ? null : id)} aria-pressed={subFor === id} className={`spk-press rounded-full px-3 py-1.5 text-[13.5px] font-bold ${subFor === id ? "bg-loss text-ink" : out.has(id) ? "border border-loss/50 text-loss" : "border border-white/[.08] bg-raised"}`}>
                      {name(id)}{out.has(id) ? " (left)" : ""}
                    </button>
                  ))}
                </div>
                {subFor && (
                  <div className="mt-3">
                    <div className="text-[13px] font-semibold text-muted">Who&apos;s going on for {name(subFor)}?</div>
                    {out.has(subFor) && (
                      <label className="mt-2 flex items-center gap-2 text-[13px] text-muted">
                        <input type="checkbox" checked={subAll} onChange={(e) => setSubAll(e.target.checked)} className="h-4 w-4 accent-[#cbfb4f]" />
                        Also for {name(subFor)}&apos;s other games left in this stage
                      </label>
                    )}
                    {candidates.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {candidates.map((id) => (
                          <button key={id} disabled={pending} onClick={() => run(() => subIn(game.id, subFor, id, out.has(subFor) && subAll), `${name(id)} is subbing in`, (r) => r.ok && onClose())} className="spk-press inline-flex items-center gap-2 rounded-full border border-white/[.08] bg-raised py-1 pl-1 pr-3 text-[13.5px] font-semibold">
                            <PAvatar p={people[id]} size={24} />{name(id)}
                          </button>
                        ))}
                      </div>
                    ) : <p className="mt-2 text-[13px] text-dim">Nobody else is checked in right now.</p>}
                  </div>
                )}
                <button disabled={pending} onClick={() => run(() => setSkipped(game.id, true), "Game skipped", (r) => r.ok && onClose())} className={`${btnQuiet} mt-3 px-0`}>Skip this game instead</button>
              </div>
            )}
          </>
        )}
        <button onClick={onClose} className={`${btnGhost} mt-4 w-full`}>Close</button>
      </div>
    </div>
  );
}
