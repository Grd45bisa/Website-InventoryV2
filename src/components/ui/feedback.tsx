import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { uiCopy } from "@/lib/ui-copy";
import { Button, Spinner } from "./button";
import {
  CheckCircleIcon,
  ClockIcon,
  ErrorIcon,
  InfoIcon,
  WarningIcon,
} from "./icons";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Warna hanya garis/ikon; teks memakai text-primary agar kontras lolos (lihat globals.css). */
const toneBox: Record<Tone, string> = {
  neutral: "border-border-strong bg-surface-muted",
  info: "border-info bg-info-soft",
  success: "border-success bg-success-soft",
  warning: "border-warning bg-warning-soft",
  danger: "border-danger bg-danger-soft",
};

const toneIconColor: Record<Tone, string> = {
  neutral: "text-text-secondary",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/** Bentuk ikon berbeda per tone agar status tidak hanya dibedakan lewat warna. */
export function ToneIcon({ tone, size = 16 }: { tone: Tone; size?: number }) {
  const className = cn("shrink-0", toneIconColor[tone]);
  switch (tone) {
    case "success":
      return <CheckCircleIcon size={size} className={className} />;
    case "warning":
      return <WarningIcon size={size} className={className} />;
    case "danger":
      return <ErrorIcon size={size} className={className} />;
    case "info":
      return <InfoIcon size={size} className={className} />;
    default:
      return <ClockIcon size={size} className={className} />;
  }
}

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  /** Label teks status wajib; mengikuti state machine modul. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium text-text-primary",
        toneBox[tone],
        className,
      )}
    >
      <ToneIcon tone={tone} />
      <span>{children}</span>
    </span>
  );
}

export function Badge({
  variant = "neutral",
  size = "md",
  children,
  className,
}: {
  variant?: Tone | "outline";
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
}) {
  const tone = variant === "outline" ? "neutral" : variant;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-text-primary",
        toneBox[tone],
        size === "sm" && "px-1.5 py-0 text-[11px]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = "info",
  variant,
  title,
  description,
  children,
  action,
  className,
}: {
  tone?: Tone;
  variant?: Tone;
  title?: string;
  description?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const effectiveTone = variant ?? tone;
  const content = children ?? description;
  return (
    <div
      role={effectiveTone === "danger" || effectiveTone === "warning" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-sm text-text-primary",
        toneBox[effectiveTone],
        className,
      )}
    >
      <ToneIcon tone={effectiveTone} size={20} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {content ? <div className={cn(title && "mt-0.5 text-xs text-text-secondary")}>{content}</div> : null}
      </div>
      {action}
    </div>
  );
}

export const FeedbackState = EmptyState;


export function LoadingState({
  label = uiCopy.state.loading,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-10 text-sm text-text-secondary",
        className,
      )}
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

/** Blok kerangka; hanya struktur, tidak menampilkan angka/record palsu. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-[docuflow-pulse_1.6s_ease-in-out_infinite] rounded-md bg-surface-muted",
        className,
      )}
    />
  );
}

export function EmptyState({
  title = uiCopy.state.emptyTitle,
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  /** CTA hanya bila aksi benar-benar tersedia bagi pengguna. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-10 text-center",
        className,
      )}
    >
      <p className="text-md font-semibold text-text-primary">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = uiCopy.state.errorTitle,
  description = uiCopy.state.errorHint,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  /** Berikan hanya jika retry aman dan idempoten. */
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-10 text-center",
        className,
      )}
    >
      <ErrorIcon size={24} className="text-danger" />
      <p className="text-md font-semibold text-text-primary">{title}</p>
      <p className="max-w-md text-sm text-text-secondary">{description}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          {uiCopy.state.retry}
        </Button>
      ) : null}
    </div>
  );
}

export function UnauthorizedState({
  title = "Akses Dibatasi",
  description = "Peran Anda atau penetapan gudang aktif saat ini tidak memiliki wewenang untuk membuka modul ini.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-2 rounded border border-warning/30 bg-warning-soft px-4 py-10 text-center",
        className,
      )}
    >
      <WarningIcon size={28} className="text-warning" />
      <p className="text-md font-semibold text-text-primary">{title}</p>
      <p className="max-w-md text-sm text-text-secondary">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

