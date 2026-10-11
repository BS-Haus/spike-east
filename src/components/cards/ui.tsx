// The tournament pages' small kit. Unlike the league's screens these are styled with Tailwind
// classes on the same tokens (globals.css @theme), as they were in roundnet-open where they were
// built; the colours are the palette `C` either way. Avatars are the league's own.
import { Avatar, C } from "@/components/spike/ui";
import type { PlayerLite } from "@/lib/cardsData";

export function PAvatar({ p, size = 32, dim = false }: { p?: Pick<PlayerLite, "name" | "color">; size?: number; dim?: boolean }) {
  return <Avatar name={p?.name ?? "?"} color={p?.color ?? C.dimmer} size={size} op={dim ? 0.45 : 1} />;
}

export function Header({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pt-[calc(18px+env(safe-area-inset-top))] pb-4">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[.14em] text-accent">{eyebrow}</div>}
        <h1 className="mt-1 text-[28px] font-black leading-[1.05] tracking-[-.02em] text-balance">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-4 pb-6">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-[12px] font-bold uppercase tracking-[.12em] text-muted">{title}</h2>
        {aside && <div className="text-[12px] text-dim">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export const card = "rounded-2xl border border-white/[.06] bg-surface";
export const btn = "spk-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-bold disabled:opacity-40";
export const btnPrimary = `${btn} bg-accent text-ink`;
export const btnGhost = `${btn} border border-white/[.08] bg-raised text-fg`;
export const btnQuiet = `${btn} text-muted`;
export const input = "min-h-12 w-full rounded-xl border border-white/[.08] bg-panel px-3.5 text-[16px] text-fg placeholder:text-dimmer focus:border-accent/60 focus:outline-none";

export const tierColor = (name: string) => (name === "Gold" ? C.gold : name === "Silver" ? C.silver : name === "Bronze" ? C.bronze : C.accent);

/** Where a guest goes to sign in, coming back here afterwards. */
export const signInHref = (next: string) => `/?signin=1&next=${encodeURIComponent(next)}`;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** London wall-clock parts. Built by hand so server and phone render the exact same text. */
function london(ms: number | Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  const y = n("year"), mo = n("month"), d = n("day");
  return { y, mo, d, h: n("hour"), mi: n("minute"), wd: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() };
}

export function fmtTime(ms: number | Date) {
  const t = london(ms);
  return `${String(t.h).padStart(2, "0")}:${String(t.mi).padStart(2, "0")}`;
}

export function fmtDate(ms: number | Date, withTime = true) {
  const t = london(ms);
  return `${DAYS[t.wd]} ${t.d} ${MONTHS[t.mo - 1]}${withTime ? `, ${fmtTime(ms)}` : ""}`;
}
