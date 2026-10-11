"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setMyEntry, createTournament } from "@/app/actions/cards";
import { useAction } from "@/components/cards/useAction";
import { btnPrimary, btnGhost, input, signInHref } from "@/components/cards/ui";
import type { EntryState } from "@/lib/cards";

export function RsvpButton({ eventId, mine, signedIn }: { eventId: string; mine: EntryState | null; signedIn: boolean }) {
  const { run, pending, toast } = useAction();
  if (!signedIn) return <Link href={signInHref(`/cards/${eventId}`)} className={`${btnPrimary} shrink-0`}>Sign in</Link>;
  const inIt = mine === "going" || mine === "here";
  return (
    <>
      {toast}
      <button
        disabled={pending}
        onClick={() => run(() => setMyEntry(eventId, inIt ? "out" : "going"), inIt ? "You're down as not coming" : "You're in. See you there!")}
        className={`${inIt ? btnGhost : btnPrimary} shrink-0`}
        aria-pressed={inIt}
      >
        {inIt ? "✓ In" : "I'm in"}
      </button>
    </>
  );
}

/** Next Sunday at 11:00, London time, as a datetime-local value. */
function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T11:00`;
}

export function NewEvent() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { run, pending, toast } = useAction();
  const [f, setF] = useState({ title: "Sunday cards", startsAt: nextSunday(), location: "Victoria Park", notes: "", nets: 2, groupTo: 15, finalTo: 15 });
  if (!open) return <button onClick={() => setOpen(true)} className="spk-press font-bold text-accent">+ New event</button>;
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="grid gap-1 text-[12.5px] font-semibold text-muted">
      {label}
      <input className={input} type={type} value={f[k] as string | number} onChange={(e) => setF({ ...f, [k]: type === "number" ? Number(e.target.value) : e.target.value })} />
    </label>
  );
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setOpen(false)}>
      {toast}
      <form
        className="spk-sheet mx-auto grid w-full max-w-[480px] gap-3 rounded-t-3xl border-t border-white/[.08] bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] text-left"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createTournament({ ...f, startsAt: new Date(f.startsAt).toISOString() }), "Event posted", (r) => {
            if (r.ok && r.id) { setOpen(false); router.push(`/cards/${r.id}`); }
          });
        }}
      >
        <h2 className="text-[20px] font-black text-fg">New event</h2>
        {field("title", "Name")}
        {field("startsAt", "Date and time", "datetime-local")}
        {field("location", "Where")}
        <div className="grid grid-cols-3 gap-2">
          {field("nets", "Nets", "number")}
          {field("groupTo", "Groups to", "number")}
          {field("finalTo", "Finals to", "number")}
        </div>
        <label className="grid gap-1 text-[12.5px] font-semibold text-muted">
          Notes for players (optional)
          <textarea className={`${input} min-h-20 py-3`} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Bring water. We'll be by the boating lake." />
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} className={`${btnGhost} flex-1`}>Cancel</button>
          <button disabled={pending} className={`${btnPrimary} flex-[2]`}>{pending ? "Posting…" : "Post event"}</button>
        </div>
      </form>
    </div>
  );
}
