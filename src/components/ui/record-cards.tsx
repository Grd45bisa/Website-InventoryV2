"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { uiCopy } from "@/lib/ui-copy";
import { EmptyState, ErrorState, Skeleton } from "./feedback";
import type { DataStatus } from "./data-table";
import { GridIcon, ListIcon } from "./icons";

export type CollectionView = "list" | "grid";

/**
 * Switcher List/Grid (WIREFRAME.md 4.2-4.3). Status terpilih ditandai dengan
 * aria-pressed, border tebal, dan ikon berbeda (bukan warna saja).
 */
export function ViewSwitcher({
  value,
  onChange,
}: {
  value: CollectionView;
  onChange: (next: CollectionView) => void;
}) {
  const options: Array<{ key: CollectionView; label: string; icon: ReactNode }> = [
    { key: "list", label: uiCopy.table.viewList, icon: <ListIcon size={18} /> },
    { key: "grid", label: uiCopy.table.viewGrid, icon: <GridIcon size={18} /> },
  ];
  return (
    <div
      role="group"
      aria-label={uiCopy.table.viewSwitcher}
      className="inline-flex overflow-hidden rounded-md border border-border-strong"
    >
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium md:min-h-10",
              selected
                ? "bg-primary text-surface"
                : "bg-surface text-text-primary hover:bg-surface-muted",
            )}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type RecordCardsProps<T> = {
  /** Nama daftar untuk pembaca layar. */
  label: string;
  items: T[];
  getId: (item: T) => string;
  /** Isi kartu; status, nomor dokumen, dan nilai penting tidak boleh dibuang. */
  renderCard: (item: T) => ReactNode;
  /**
   * list: satu kartu per baris (transaksi/dokumen).
   * grid: dua kolom di mobile (satu kolom di bawah 375 px), lebih banyak di layar lebar.
   */
  layout: CollectionView;
  status?: DataStatus;
  empty?: ReactNode;
  onRetry?: () => void;
  skeletonCount?: number;
};

export function RecordCards<T>({
  label,
  items,
  getId,
  renderCard,
  layout,
  status = "ready",
  empty,
  onRetry,
  skeletonCount = 4,
}: RecordCardsProps<T>) {
  if (status === "error") return <ErrorState onRetry={onRetry} />;
  if (status === "ready" && items.length === 0) {
    return <>{empty ?? <EmptyState />}</>;
  }

  return (
    <ul
      aria-label={label}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "grid gap-3",
        layout === "grid"
          ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          : "grid-cols-1",
      )}
    >
      {status === "loading"
        ? Array.from({ length: skeletonCount }, (_, i) => (
            <li key={`sk-${i}`} className="rounded-lg border border-border bg-surface p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
              <Skeleton className="mt-4 h-3 w-2/3" />
            </li>
          ))
        : items.map((item) => (
            <li
              key={getId(item)}
              className="min-w-0 rounded-lg border border-border bg-surface p-3"
            >
              {renderCard(item)}
            </li>
          ))}
    </ul>
  );
}
