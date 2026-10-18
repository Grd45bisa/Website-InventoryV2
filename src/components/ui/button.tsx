import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-4 shrink-0 rounded-full border-2 border-current border-t-transparent",
        "animate-[docuflow-spin_0.8s_linear_infinite]",
        className,
      )}
    />
  );
}

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-surface border-primary hover:bg-primary-hover hover:border-primary-hover",
  secondary:
    "bg-surface text-text-primary border-border-strong hover:bg-surface-muted",
  ghost:
    "bg-transparent text-text-primary border-transparent hover:bg-surface-muted",
  danger: "bg-danger text-surface border-danger hover:opacity-90",
};

// Target sentuh ~44 px pada mobile untuk md/lg (DESIGN_SYSTEM.md 5.4).
const sizeClass: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm md:min-h-10",
  lg: "min-h-12 px-5 text-md",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Menampilkan proses nyata dan mencegah submit ganda. */
  loading?: boolean;
  /** Teks aksesibel saat loading, mis. "Menyimpan". */
  loadingLabel?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingLabel ? <span>{loadingLabel}</span> : children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Tombol hanya-ikon; accessible name wajib lewat `label`. */
export function IconButton({
  label,
  children,
  className,
  type = "button",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-transparent",
        "text-text-primary transition-colors hover:bg-surface-muted disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
