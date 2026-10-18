"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { BarcodeIcon, VolumeUpIcon, VolumeOffIcon, AlertTriangleIcon } from "@/components/ui/icons";
import { soundFeedback } from "@/lib/audio/sound-feedback";
import { scanStockOpnameSerialAction } from "@/lib/inventory/actions";
import type { StockOpnameScanResult } from "@/lib/db/repositories/inventory-repository";

interface StockOpnameScannerPanelProps {
  sessionId: string;
  activeArea: { id: string; name: string; status: string } | null;
  isReadOnly: boolean;
  onScanSuccess: (result: StockOpnameScanResult) => void;
  onOpenErrorDrawer: () => void;
  errorCount: number;
}

export function StockOpnameScannerPanel({
  sessionId,
  activeArea,
  isReadOnly,
  onScanSuccess,
  onOpenErrorDrawer,
  errorCount,
}: StockOpnameScannerPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFocusLocked, setIsFocusLocked] = useState(true);
  const [lastResult, setLastResult] = useState<StockOpnameScanResult | null>(null);
  const [flashStatus, setFlashStatus] = useState<"idle" | "success" | "warning" | "error">("idle");

  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Inisialisasi status audio mute dari helper
  useEffect(() => {
    setIsMuted(soundFeedback.isMuted());
  }, []);

  // Fokuskan input saat panel aktif, area berubah, atau fokus kunci aktif
  const focusInput = useCallback(() => {
    if (inputRef.current && !isReadOnly && activeArea && activeArea.status !== "CANCELLED") {
      inputRef.current.focus();
    }
  }, [isReadOnly, activeArea]);

  useEffect(() => {
    focusInput();
  }, [focusInput, activeArea?.id]);

  // Shortcut Alt+S untuk memulihkan fokus scanner
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        focusInput();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusInput]);

  function handleToggleMute() {
    const next = soundFeedback.toggleMute();
    setIsMuted(next);
  }

  async function handleScanSubmit(val: string) {
    const clean = val.trim();
    // 0 ms instant clearing sesuai spesifikasi FR-SO-05 / AC-SO-04
    setInputValue("");

    if (!clean || isProcessing || !activeArea || isReadOnly) {
      return;
    }

    if (activeArea.status === "CANCELLED") {
      setFlashStatus("error");
      setLastResult({
        success: false,
        resultType: "INACTIVE_AREA",
        message: `Area '${activeArea.name}' telah dibatalkan dan tidak menerima scan.`,
        serialNumber: clean,
        areaId: activeArea.id,
        areaName: activeArea.name,
        timestamp: new Date().toISOString(),
      });
      soundFeedback.playError();
      return;
    }

    setIsProcessing(true);

    try {
      const result = await scanStockOpnameSerialAction({
        sessionId,
        areaId: activeArea.id,
        serialNumber: clean,
      });

      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
      }

      setLastResult(result);

      if (result.success) {
        setFlashStatus("success");
        soundFeedback.playSuccess();
        onScanSuccess(result);
      } else if (
        result.resultType === "DUPLICATE_IN_AREA" ||
        result.resultType === "DUPLICATE_CROSS_AREA"
      ) {
        setFlashStatus("warning");
        soundFeedback.playWarning();
      } else {
        setFlashStatus("error");
        soundFeedback.playError();
      }

      flashTimerRef.current = setTimeout(() => {
        setFlashStatus("idle");
      }, 1500);
    } catch {
      setFlashStatus("error");
      soundFeedback.playError();
      setLastResult({
        success: false,
        resultType: "UNREGISTERED_SERIAL",
        message: "Terjadi kesalahan jaringan saat memproses scan.",
        serialNumber: clean,
        areaId: activeArea.id,
        areaName: activeArea.name,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsProcessing(false);
      if (isFocusLocked) {
        focusInput();
      }
    }
  }

  const isAreaDisabled = !activeArea || activeArea.status === "CANCELLED" || isReadOnly;

  let borderColor = "border-border";
  let statusBadgeColor = "bg-muted text-muted-foreground";

  if (flashStatus === "success") {
    borderColor = "border-emerald-600 ring-2 ring-emerald-600";
    statusBadgeColor = "bg-emerald-100 text-emerald-800";
  } else if (flashStatus === "warning") {
    borderColor = "border-amber-600 ring-2 ring-amber-600";
    statusBadgeColor = "bg-amber-100 text-amber-800";
  } else if (flashStatus === "error") {
    borderColor = "border-rose-600 ring-2 ring-rose-600";
    statusBadgeColor = "bg-rose-100 text-rose-800";
  }

  return (
    <div className={`p-4 border rounded-md bg-surface transition-colors ${borderColor}`}>
      {/* Baris Atas: Info Scanner, Area Target, & Kontrol Audio */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <BarcodeIcon size={20} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Scanner Barcode SN</span>
          {activeArea && (
            <span className="text-xs px-2 py-0.5 rounded bg-muted font-medium text-foreground">
              Area: {activeArea.name}
            </span>
          )}
          {isProcessing && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium animate-pulse">
              Memproses...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleToggleMute}
            title={isMuted ? "Aktifkan Audio Feedback" : "Bisukan Audio Feedback"}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {isMuted ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <VolumeOffIcon size={16} />
                <span>Bisu</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <VolumeUpIcon size={16} />
                <span>Suara Aktif</span>
              </span>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsFocusLocked(!isFocusLocked);
              focusInput();
            }}
            title="Kunci fokus keyboard pada scanner (Alt+S)"
            className={`h-8 px-2 text-xs ${
              isFocusLocked ? "text-primary font-medium" : "text-muted-foreground"
            }`}
          >
            {isFocusLocked ? "Fokus Terkunci" : "Fokus Bebas"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onOpenErrorDrawer}
            className="h-8 px-2.5 text-xs relative"
          >
            <AlertTriangleIcon size={14} className="mr-1 text-amber-600" />
            <span>Riwayat Error</span>
            {errorCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                {errorCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Input Scanner Utama */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          disabled={isAreaDisabled}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleScanSubmit(inputValue);
            }
          }}
          onBlur={() => {
            if (isFocusLocked && !isAreaDisabled) {
              // Pulihkan fokus setelah delay kecil agar klik tombol lain tetap dapat dieksekusi
              setTimeout(() => {
                if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
                  focusInput();
                }
              }, 120);
            }
          }}
          placeholder={
            isReadOnly
              ? "Sesi Stock Opname terkunci (read-only)"
              : !activeArea
              ? "Pilih area terlebih dahulu untuk memindai"
              : activeArea.status === "CANCELLED"
              ? "Area dibatalkan — scanner nonaktif"
              : "Arahkan scanner ke barcode SN lalu tekan Enter... (Alt+S fokus)"
          }
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          className="w-full h-11 px-3.5 pr-24 text-sm font-mono bg-background border rounded border-border focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
        />

        <div className="absolute right-2 top-1.5 flex items-center">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isAreaDisabled || !inputValue.trim() || isProcessing}
            onClick={() => handleScanSubmit(inputValue)}
            className="h-8 px-3 text-xs"
          >
            Kirim
          </Button>
        </div>
      </div>

      {/* Baris Status / Feedback Pemindaian Terakhir */}
      {lastResult && (
        <div
          className={`mt-2.5 p-2 rounded text-xs flex items-start justify-between gap-2 border ${
            lastResult.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : lastResult.resultType === "DUPLICATE_IN_AREA" ||
                lastResult.resultType === "DUPLICATE_CROSS_AREA"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="space-y-0.5">
            <div className="font-semibold flex items-center gap-1.5">
              <span>
                {lastResult.success
                  ? "[VALID] SN VALID & TERCATAT"
                  : lastResult.resultType === "DUPLICATE_IN_AREA"
                  ? "[DUPLIKAT] DUPLIKAT DI AREA INI"
                  : lastResult.resultType === "DUPLICATE_CROSS_AREA"
                  ? "[DUPLIKAT] DUPLIKAT LINTAS AREA"
                  : lastResult.resultType === "INVALID_UNIT"
                  ? "[INVALID] SATUAN INVALID PERLU AUDIT"
                  : "[ASING] SN TIDAK TERDAFTAR DI SNAPSHOT"}
              </span>
              <span className="font-mono text-[11px] px-1 py-0.2 rounded bg-black/5">
                {lastResult.serialNumber}
              </span>
            </div>
            <p className="text-[11px]">{lastResult.message}</p>
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {new Date(lastResult.timestamp).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      )}
    </div>
  );
}
