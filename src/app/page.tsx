import SpikeApp from "@/components/SpikeApp";
import { getLeagueData } from "@/lib/leagueData";

export const dynamic = "force-dynamic";

// Where a sign-in may send someone afterwards: only back to a tournament page, never off-site.
const NEXT_RE = /^\/cards(\/[0-9a-f-]{36})?$/i;

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const [data, q] = await Promise.all([getLeagueData(), searchParams]);
  const next = typeof q.next === "string" && NEXT_RE.test(q.next) ? q.next : null;
  return <SpikeApp data={data} signIn={q.signin !== undefined && !data.currentUserId ? { next } : null} />;
}
