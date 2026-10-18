"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { uiCopy } from "@/lib/ui-copy";
import { Button, IconButton } from "./button";
import { TextField } from "./form-fields";
import { CloseIcon } from "./icons";

export type ActiveFilter = { key: string; label: string };

/**
 * Toolbar daftar: search selalu terlihat; filter sekunder dibuka lewat tombol di mobile
 * dan inline di md ke atas. Filter aktif dapat dikenali (chip bertuliskan) dan dibersihkan.
 */
export function ListToolbar({
  searchLabel = "Pencarian",
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  activeFilters = [],
  onRemoveFilter = () => {},
  onClearFilters = () => {},
  trailing,
}: {
  searchLabel?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Kontrol filter (SelectField dll.); hanya render yang benar-benar berfungsi. */
  filters?: ReactNode;
  activeFilters?: ActiveFilter[];
  onRemoveFilter?: (key: string) => void;
  onClearFilters?: () => void;
  /** Mis. ViewSwitcher. */
  trailing?: ReactNode;
}) {

  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-muted p-3">
      <div className="flex items-end gap-2 sm:gap-3">
        <TextField
          type="search"
          label={searchLabel}
          showRequirement={false}
          value={searchValue}
          placeholder={searchPlaceholder}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-w-0 flex-1"
        />
        <div className="flex shrink-0 items-center gap-2">
          {filters ? (
            <Button
              variant="secondary"
              aria-expanded={filtersOpen}
              aria-controls={panelId}
              onClick={() => setFiltersOpen((v) => !v)}
              className="md:hidden"
            >
              {uiCopy.table.filters}
              {activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
            </Button>
          ) : null}
          {trailing}
        </div>
      </div>

      {filters ? (
        <div
          id={panelId}
          className={cn(
            "grid-cols-1 gap-3 sm:grid-cols-2 md:grid md:grid-cols-3",
            filtersOpen ? "grid" : "hidden",
          )}
        >
          {filters}
        </div>
      ) : null}

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text-primary">
            {uiCopy.table.activeFilters}:
          </span>
          <ul className="contents">
            {activeFilters.map((f) => (
              <li
                key={f.key}
                className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface pl-2 text-sm"
              >
                <span>{f.label}</span>
                <IconButton
                  label={uiCopy.table.removeFilter(f.label)}
                  onClick={() => onRemoveFilter(f.key)}
                  className="size-9"
                >
                  <CloseIcon size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            {uiCopy.state.clearFilters}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
