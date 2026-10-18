"use client";

import { useSyncExternalStore } from "react";

/** Breakpoint md (768 px) dan lg (1024 px) mengikuti token di globals.css. */
export const MEDIA = {
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
} as const;

/**
 * Membaca media query tanpa effect/setState. Snapshot server = `serverValue`
 * agar markup awal deterministik; nilai sebenarnya dipakai setelah hydration.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
