import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { adminUnlocked } from "@/lib/auth/guard";
import { getEventView, activePlayers } from "@/lib/cardsData";
import { EventScreen } from "@/components/cards/EventScreen";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const v = UUID_RE.test(id) ? await getEventView(id) : null;
  if (!v) return {};
  const when = v.event.startsAt.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" });
  const going = v.entries.filter((e) => e.state !== "out").length;
  return {
    title: `${v.event.title} · East London Roundnet`,
    description: `${when}${v.event.location ? `, ${v.event.location}` : ""}. ${going} in so far. Tap to add yourself.`,
    openGraph: { title: v.event.title, description: `${when}${v.event.location ? ` · ${v.event.location}` : ""} · ${going} in so far` },
  };
}

export default async function TournamentPage({ params }: Props) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [v, s] = await Promise.all([getEventView(id), getSession()]);
  if (!v) notFound();
  const org = await adminUnlocked(s);
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-bg pb-10">
      <EventScreen view={v} me={s?.playerId ?? null} org={org} roster={org ? await activePlayers() : []} />
    </div>
  );
}
