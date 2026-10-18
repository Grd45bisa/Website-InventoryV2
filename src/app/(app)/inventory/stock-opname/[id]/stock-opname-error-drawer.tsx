"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { CloseIcon, AlertTriangleIcon } from "@/components/ui/icons";
import {
  getStockOpnameScanErrorsAction,
  archiveStockOpnameScanErrorsAction,
} from "@/lib/inventory/actions";

interface StockOpnameErrorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  activeArea: { id: string; name: string } | null;
  onErrorsChanged?: () => void;
}

interface ScanErrorItem {
  id: string;
  areaId: string;
  scannedValue: string;
  errorType: string;
  errorMessage: string | null;
  isArchived: boolean;
  createdAt: string;
}

export function StockOpnameErrorDrawer({
  isOpen,
  onClose,
  sessionId,
  activeArea,
  onErrorsChanged,
}: StockOpnameErrorDrawerProps) {
  const [errors, setErrors] = useState<ScanErrorItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [filterType, setFilterType] = useState<string>("ALL");

  const loadErrors = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const res = await getStockOpnameScanErrorsAction(
        sessionId,
        activeArea?.id
      );
      if (res.success && res.errors) {
        setErrors(res.errors);
      }
    } catch {
      // Abaikan jika gagal memuat
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, activeArea?.id]);

  useEffect(() => {
    if (isOpen) {
      loadErrors();
    }
  }, [isOpen, loadErrors]);

  async function handleArchiveAll() {
    if (!confirm("Arsipkan seluruh riwayat error pada sesi ini? Data historis audit tetap terjaga.")) {
      return;
    }

    setIsArchiving(true);
    try {
      const res = await archiveStockOpnameScanErrorsAction(sessionId);
      if (res.success) {
        await loadErrors();
        onErrorsChanged?.();
      }
    } catch {
      alert("Gagal mengarsipkan riwayat error scan.");
    } finally {
      setIsArchiving(false);
    }
  }

  if (!isOpen) return null;

  const filteredErrors = errors.filter((err) => {
    if (filterType === "ALL") return true;
    return err.errorType === filterType;
  });

  function getBadge(errorType: string) {
    switch (errorType) {
      case "DUPLICATE_IN_AREA":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">Duplikat Area</span>;
      case "DUPLICATE_CROSS_AREA":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">Duplikat Lintas Area</span>;
      case "INVALID_UNIT":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800">Satuan Invalid</span>;
      case "UNREGISTERED_SERIAL":
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800">Tidak Terdaftar</span>;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface h-full flex flex-col shadow-xl border-l border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Drawer */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon size={20} className="text-amber-600" />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Riwayat Error Scan
              </h2>
              <p className="text-xs text-muted-foreground">
                {activeArea ? `Area: ${activeArea.name}` : "Seluruh Area Sesi"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Tutup Riwayat Error"
            className="h-8 w-8 p-0"
          >
            <CloseIcon size={18} />
          </Button>
        </div>

        {/* Toolbar & Filter */}
        <div className="p-3 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground mr-1">Filter:</span>
            {["ALL", "DUPLICATE_IN_AREA", "DUPLICATE_CROSS_AREA", "UNREGISTERED_SERIAL"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filterType === t
                    ? "bg-primary text-white"
                    : "bg-surface hover:bg-muted text-foreground border border-border"
                }`}
              >
                {t === "ALL"
                  ? "Semua"
                  : t === "DUPLICATE_IN_AREA"
                  ? "Area Sama"
                  : t === "DUPLICATE_CROSS_AREA"
                  ? "Lintas Area"
                  : "Asing/Snapshot"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadErrors}
              disabled={isLoading}
              className="h-7 text-xs px-2"
            >
              {isLoading ? "Memuat..." : "Refresh"}
            </Button>
            {errors.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleArchiveAll}
                disabled={isArchiving}
                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
              >
                {isArchiving ? "Mengarsipkan..." : "Arsipkan"}
              </Button>
            )}
          </div>
        </div>

        {/* Daftar Error */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isLoading && errors.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Memuat riwayat error scan...
            </div>
          ) : filteredErrors.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm font-medium text-foreground">
                Tidak ada catatan error scan
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Semua pemindaian pada area ini tercatat sukses atau riwayat telah diarsipkan.
              </p>
            </div>
          ) : (
            filteredErrors.map((item) => (
              <div
                key={item.id}
                className="p-3 border rounded-md bg-surface border-border text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getBadge(item.errorType)}
                    <span className="font-mono font-semibold text-foreground">
                      {item.scannedValue}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
                {item.errorMessage && (
                  <p className="text-muted-foreground text-[11px]">
                    {item.errorMessage}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Info */}
        <div className="p-3 border-t border-border bg-muted/20 text-center text-[11px] text-muted-foreground">
          Total {filteredErrors.length} entri riwayat error sementara (tersimpan di server tanpa merusak ledger).
        </div>
      </div>
    </div>
  );
}
