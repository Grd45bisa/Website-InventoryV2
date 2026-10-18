"use client";

import { uiCopy } from "@/lib/ui-copy";
import { Button } from "./button";

/**
 * Pagination sederhana: state halaman, rentang data, dan batas jelas. Filter/konteks
 * dipertahankan oleh pemanggil karena hanya `page` yang berubah (DESIGN_SYSTEM.md 8.11).
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
}: {
  /** 1-indexed. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label={uiCopy.table.pagination}
      className="flex flex-col items-center gap-3 border-t border-border px-3 py-3 sm:flex-row sm:justify-between"
    >
      <p className="tabular text-sm text-text-secondary" aria-live="polite">
        {uiCopy.table.rangeOf(from, to, total)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {uiCopy.table.previous}
        </Button>
        <span className="tabular min-w-28 text-center text-sm text-text-primary">
          {uiCopy.table.pageOf(page, pageCount)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          {uiCopy.table.next}
        </Button>
      </div>
    </nav>
  );
}
