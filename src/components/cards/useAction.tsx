"use client";

import { useState, useTransition } from "react";
import type { CardsResult as Result } from "@/app/actions/cards";

/** Runs a server action with a pending state and a toast for errors (or a success message). */
export function useAction() {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ msg: string; bad: boolean } | null>(null);
  const run = (fn: () => Promise<Result>, ok?: string, after?: (r: Result) => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) setToast({ msg: r.error, bad: true });
        else if (ok) setToast({ msg: ok, bad: false });
        after?.(r);
      } catch {
        setToast({ msg: "Couldn't reach the server. Check your signal and try again.", bad: true });
      }
      setTimeout(() => setToast(null), 3200);
    });
  const node = toast ? (
    <div role="status" className={`spk-toast fixed left-1/2 top-[calc(12px+env(safe-area-inset-top))] z-50 max-w-[calc(100%-32px)] rounded-full px-4 py-2.5 text-[13.5px] font-bold shadow-lg ${toast.bad ? "bg-loss text-ink" : "bg-accent text-ink"}`}>
      {toast.msg}
    </div>
  ) : null;
  return { run, pending, toast: node };
}
