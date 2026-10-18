"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { uiCopy } from "@/lib/ui-copy";
import { Button } from "./button";
import { TextareaField } from "./form-fields";
import { CloseIcon } from "./icons";

export type DialogProps = {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** "sheet": dialog di desktop, full screen di mobile. "drawer": panel kiri (navigasi mobile). */
  variant?: "sheet" | "drawer";
  /** Ukuran modal: default (36rem) atau wide (1000px responsif untuk detail dokumen) */
  size?: "default" | "wide";
  /** Label aksesibel untuk drawer tanpa judul terlihat. */
  hideTitle?: boolean;
  /** Bila true, dialog bertindak sebagai popup konfirmasi kecil Yes/No (tidak dibuat fullscreen di mobile) */
  isConfirm?: boolean;
  className?: string;
  contentClassName?: string;
};

let openDialogCount = 0;
let prevBodyOverflow = "";
let prevHtmlOverflow = "";

function lockPageScroll() {
  if (typeof document === "undefined") return;
  if (openDialogCount === 0) {
    prevBodyOverflow = document.body.style.overflow;
    prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }
  openDialogCount++;
}

function unlockPageScroll() {
  if (typeof document === "undefined") return;
  openDialogCount = Math.max(0, openDialogCount - 1);
  if (openDialogCount === 0) {
    document.body.style.overflow = prevBodyOverflow;
    document.documentElement.style.overflow = prevHtmlOverflow;
  }
}

/**
 * Dialog berbasis elemen <dialog> native: focus trap, Escape, dan pengembalian
 * fokus ke pemicu ditangani browser (DESIGN_SYSTEM.md 8.5, 10.11). Tidak ada dependency baru.
 */
export function Dialog({
  open,
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "sheet",
  size = "default",
  hideTitle = false,
  isConfirm = false,
  className,
  contentClassName,
}: DialogProps) {
  const isVisible = open ?? isOpen ?? false;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isVisible && !el.open) el.showModal();
    if (!isVisible && el.open) el.close();
  }, [isVisible]);

  // Kunci scroll halaman latar belakang (body & html) saat dialog terbuka
  useEffect(() => {
    if (!isVisible) return;
    lockPageScroll();
    return () => {
      unlockPageScroll();
    };
  }, [isVisible]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={() => {
        // Event close juga terpicu saat ditutup programatik (isVisible=false); abaikan.
        if (isVisible) onClose();
      }}
      onClick={(e) => {
        // Klik pada backdrop (target = elemen dialog itu sendiri) menutup dialog.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "bg-surface p-0 text-text-primary shadow-float",
        // 1. Popup Konfirmasi (Yes/No, Hapus, Logout, Tolak PO) -> Tetap popup kecil / bottom sheet, BUKAN fullscreen
        variant === "sheet" && isConfirm &&
          "m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-64px)] rounded-xl max-md:mb-0 max-md:w-full max-md:max-w-full max-md:rounded-b-none",
        // 2. Modal Form / Konten Standard (default size) -> Fullscreen di mobile/tablet (< 1024px), centered popup di desktop (>= 1024px)
        variant === "sheet" && !isConfirm && size === "default" &&
          "m-auto my-auto w-[min(36rem,calc(100vw-32px))] max-w-[36rem] max-h-[calc(100dvh-64px)] rounded-xl overflow-hidden max-lg:fixed max-lg:inset-0 max-lg:m-0 max-lg:w-screen max-lg:max-w-none max-lg:h-dvh max-lg:max-h-none max-lg:rounded-none max-lg:border-none",
        // 3. Modal Form / Worksheet Lebar (wide size) -> Fullscreen di mobile/tablet (< 1024px), centered popup di desktop (>= 1024px)
        variant === "sheet" && !isConfirm && size === "wide" &&
          "m-auto my-auto w-[min(1000px,calc(100vw-32px))] max-w-[1000px] max-h-[calc(100dvh-64px)] rounded-xl overflow-hidden max-lg:fixed max-lg:inset-0 max-lg:m-0 max-lg:w-screen max-lg:max-w-none max-lg:h-dvh max-lg:max-h-none max-lg:rounded-none max-lg:border-none",
        variant === "drawer" &&
          "m-0 mr-auto h-dvh max-h-dvh w-[min(20rem,85vw)] rounded-none",
        className,
      )}
    >
      {isVisible ? (
        <div className={cn(
          variant === "drawer"
            ? "flex h-full flex-col"
            : isConfirm
            ? "p-5"
            : size === "wide"
            ? "flex flex-col h-full max-h-[calc(100dvh-64px)] max-lg:max-h-none max-lg:h-dvh overflow-hidden"
            : "flex flex-col h-full max-h-[calc(100dvh-64px)] max-lg:max-h-none max-lg:h-dvh overflow-hidden p-5 max-lg:p-4",
          contentClassName
        )}>
          {isConfirm ? (
            <>
              <h2
                id={titleId}
                className={cn(
                  variant === "sheet" && "text-lg font-semibold",
                  hideTitle && "sr-only",
                )}
              >
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-1 text-sm text-text-secondary">
                  {description}
                </p>
              ) : null}
            </>
          ) : !hideTitle ? (
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-border-default/60 shrink-0">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className={cn(
                    variant === "sheet" && "text-base sm:text-lg font-bold text-text-primary",
                  )}
                >
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-0.5 text-xs text-text-secondary">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
                aria-label="Tutup modal"
              >
                <CloseIcon size={18} />
              </button>
            </div>
          ) : (
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
          )}
          {children ? (
            <div
              className={cn(
                size === "wide"
                  ? cn("flex min-h-0 flex-1 flex-col overflow-hidden", !hideTitle && "mt-3")
                  : !isConfirm
                  ? "flex min-h-0 flex-1 flex-col overflow-y-auto mt-3"
                  : cn(variant === "sheet" && (!hideTitle ? "mt-4" : "")),
                variant === "drawer" && "flex min-h-0 flex-1 flex-col",
              )}
            >
              {children}
            </div>
          ) : null}
          {footer ? (
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end shrink-0">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** Jelaskan objek terpengaruh dan dampak tindakan (DESIGN_SYSTEM.md 9.3). */
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  /** Bila true, alasan wajib diisi sebelum konfirmasi. */
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
  /** Konfirmasi UI bukan pengganti validasi/otorisasi server. */
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onCancel } = props;
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={props.title}
      description={props.description}
      isConfirm={true}
    >
      {/* Dirender hanya saat open agar state alasan ter-reset setiap dibuka. */}
      {open ? <ConfirmBody {...props} /> : null}
    </Dialog>
  );
}

function ConfirmBody({
  confirmLabel,
  cancelLabel = uiCopy.dialog.cancel,
  tone = "primary",
  requireReason = false,
  reasonLabel = "Alasan",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (requireReason && reason.trim() === "") {
          setError(uiCopy.dialog.reasonRequired);
          return;
        }
        onConfirm(reason.trim());
      }}
      className="flex flex-col gap-4"
    >
      {requireReason ? (
        <TextareaField
          label={reasonLabel}
          required
          value={reason}
          error={error}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError(undefined);
          }}
        />
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* Aksi destruktif bukan default: urutan sekunder lalu utama. */}
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          type="submit"
          variant={tone === "danger" ? "danger" : "primary"}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
