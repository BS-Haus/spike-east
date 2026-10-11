import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { adminUnlocked } from "@/lib/auth/guard";
import { getEventCards, type EventCard } from "@/lib/cardsData";
import { Header, Section, card, fmtDate } from "@/components/cards/ui";
import { RsvpButton, NewEvent } from "@/components/cards/HomeBits";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournaments · East London Roundnet",
  description: "Weekend cards tournaments: small groups, a new partner every game, then finals.",
};

function Row({ e, signedIn }: { e: EventCard; signedIn: boolean }) {
  return (
    <div className={`${card} spk-up flex items-center gap-3 p-4`}>
      <Link href={`/cards/${e.id}`} className="min-w-0 flex-1">
        <div className="text-[12.5px] font-bold text-accent">{fmtDate(e.startsAt)}</div>
        <div className="mt-0.5 truncate text-[17px] font-extrabold">{e.title}</div>
        <div className="mt-0.5 truncate text-[13px] text-muted">
          {e.location ? `${e.location} · ` : ""}{e.going} {e.going === 1 ? "player" : "players"} in
        </div>
      </Link>
      {e.status === "upcoming" && <RsvpButton eventId={e.id} mine={e.mine} signedIn={signedIn} />}
    </div>
  );
}

export default async function TournamentsPage() {
  const s = await getSession();
  const [{ upcoming, live, past }, org] = await Promise.all([getEventCards(s?.playerId ?? null), adminUnlocked(s)]);
  return (
    <main className="mx-auto min-h-dvh max-w-[480px] bg-bg pb-10">
      <div className="px-5 pt-[calc(14px+env(safe-area-inset-top))]">
        <Link href="/" className="spk-press text-[13px] font-bold text-muted">← Ladder</Link>
      </div>
      <Header eyebrow="East London Roundnet" title="Tournaments" />
      <p className="-mt-2 px-5 pb-5 text-[14.5px] leading-relaxed text-muted">
        Weekend cards. You play in small groups with a new partner every game, then regroup by level, so every game is a close one. Tournament games don&apos;t count towards the ladder.
      </p>

      {live.length > 0 && (
        <Section title="On now">
          <div className="grid gap-2.5">
            {live.map((e) => (
              <Link key={e.id} href={`/cards/${e.id}`} className="spk-press spk-up flex items-center gap-3 rounded-2xl bg-accent p-4 text-ink">
                <span className="spk-live h-2.5 w-2.5 rounded-full bg-ink" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-black">{e.title}</div>
                  <div className="text-[13px] font-semibold opacity-75">{e.here} playing · scores, groups and who&apos;s on</div>
                </div>
                <span aria-hidden="true" className="text-xl font-black">→</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="Coming up" aside={org ? <NewEvent /> : undefined}>
        {upcoming.length ? (
          <div className="grid gap-2.5">{upcoming.map((e) => <Row key={e.id} e={e} signedIn={!!s} />)}</div>
        ) : (
          <div className={`${card} p-5 text-[14px] text-muted`}>
            Nothing scheduled yet. {org ? "Tap New event to post the next one." : "The next one will appear here once it's posted in the WhatsApp group."}
          </div>
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Past events">
          <div className={`${card} divide-y divide-white/[.05]`}>
            {past.map((e) => (
              <Link key={e.id} href={`/cards/${e.id}`} className="spk-press flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-bold">{e.title}</div>
                  <div className="text-[12.5px] text-dim">{fmtDate(e.startsAt, false)} · {e.here || e.going} played</div>
                </div>
                {e.champion && <span className="shrink-0 rounded-full bg-gold/15 px-2.5 py-1 text-[12px] font-bold text-gold">★ {e.champion}</span>}
              </Link>
            ))}
          </div>
        </Section>
      )}
    </main>
  );
}
