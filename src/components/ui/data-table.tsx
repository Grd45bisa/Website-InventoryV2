"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { uiCopy } from "@/lib/ui-copy";
import { EmptyState, ErrorState, Skeleton } from "./feedback";
import { ArrowDownIcon, ArrowUpIcon, SortIcon } from "./icons";

export type SortState = { key: string; direction: "asc" | "desc" } | null;
export type DataStatus = "ready" | "loading" | "error";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Kuantitas dan nilai uang: right (DESIGN_SYSTEM.md 8.8). */
  align?: "left" | "right";
  /** Tampilkan tombol sort hanya bila server/data benar-benar mendukung. */
  sortable?: boolean;
  /** Sembunyikan kolom sekunder di bawah breakpoint tertentu sebelum mengecilkan font. */
  hideBelow?: "md" | "lg";
};

const hideClass = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

export function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

type DataTableProps<T> = {
  /** Nama tabel untuk pembaca layar; juga label region yang dapat di-scroll. */
  caption: string;
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  status?: DataStatus;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  /** Konten empty state (bedakan belum ada data vs hasil filter kosong). */
  empty?: ReactNode;
  onRetry?: () => void;
  skeletonRows?: number;
  onRowClick?: (row: T) => void;
};

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  status = "ready",
  sort = null,
  onSortChange,
  empty,
  onRetry,
  skeletonRows = 5,
  onRowClick,
}: DataTableProps<T>) {
  if (status === "error") return <ErrorState onRetry={onRetry} />;
  if (status === "ready" && rows.length === 0) {
    return <>{empty ?? <EmptyState />}</>;
  }

  return (
    // tabIndex agar area scroll horizontal dapat dijangkau keyboard.
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      aria-busy={status === "loading" || undefined}
      className="overflow-x-auto"
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key ? sort.direction : null;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    c.sortable
                      ? active === "asc"
                        ? "ascending"
                        : active === "desc"
                          ? "descending"
                          : "none"
                      : undefined
                  }
                  className={cn(
                    "border-b border-border px-3 py-2 font-semibold text-text-primary",
                    c.align === "right" && "text-right",
                    c.hideBelow && hideClass[c.hideBelow],
                  )}
                >
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(nextSort(sort, c.key))}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1 rounded-sm font-semibold",
                        c.align === "right" && "flex-row-reverse",
                      )}
                    >
                      <span>{c.header}</span>
                      <span className="sr-only">
                        {active === "asc"
                          ? uiCopy.table.sortAscending
                          : active === "desc"
                            ? uiCopy.table.sortDescending
                            : uiCopy.table.sortNone}
                      </span>
                      {active === "asc" ? (
                        <ArrowUpIcon size={14} />
                      ) : active === "desc" ? (
                        <ArrowDownIcon size={14} />
                      ) : (
                        <SortIcon size={14} className="text-text-secondary" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {status === "loading"
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={`sk-${i}`} className="border-b border-border">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn("px-3 py-3", c.hideBelow && hideClass[c.hideBelow])}
                    >
                      <Skeleton className="h-4 w-full max-w-40" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={getRowId(row)}
                  className={cn(
                    "border-b border-border hover:bg-surface-muted",
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-3 py-3 align-middle text-text-primary",
                        c.align === "right" && "tabular text-right",
                        c.hideBelow && hideClass[c.hideBelow],
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {status === "loading" ? (
        <p role="status" className="sr-only">
          {uiCopy.state.loading}
        </p>
      ) : null}
    </div>
  );
}
