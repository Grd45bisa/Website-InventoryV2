import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";
import { uiCopy } from "@/lib/ui-copy";
import { ErrorIcon } from "./icons";

type A11yProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FieldShellProps = {
  label: string;
  required?: boolean;
  /** Tampilkan penanda (wajib)/(opsional) pada label. Default true. */
  showRequirement?: boolean;
  hint?: string;
  error?: string;
  /** id kustom; default dibuat otomatis. */
  id?: string;
  className?: string;
  children: (a11y: A11yProps) => ReactNode;
};

const controlBase =
  "w-full rounded-md border bg-surface px-3 text-md text-text-primary " +
  "placeholder:text-text-secondary read-only:bg-surface-muted " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-secondary";

function controlClass(invalid: boolean) {
  return cn(
    controlBase,
    // Error: border danger + ikon/teks pesan (bukan warna saja).
    invalid ? "border-danger" : "border-border-strong hover:border-text-secondary",
  );
}

/**
 * Pembungkus label + hint + error. Label selalu terlihat, error dihubungkan
 * dengan field lewat aria-describedby/aria-invalid (DESIGN_SYSTEM.md 8.2, 10.5).
 */
export function FieldShell({
  label,
  required,
  showRequirement = true,
  hint,
  error,
  id,
  className,
  children,
}: FieldShellProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="text-sm font-medium text-text-primary">
        {label}
        {showRequirement ? (
          <span className="font-normal text-text-secondary">
            {" "}
            ({required ? uiCopy.state.required : uiCopy.state.optional})
          </span>
        ) : null}
      </label>
      {children({
        id: fieldId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-sm font-medium text-danger"
        >
          <ErrorIcon size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="sr-only">{uiCopy.state.errorPrefix} </span>
            {error}
          </span>
        </p>
      ) : null}
    </div>
  );
}

type CommonFieldProps = Omit<FieldShellProps, "children">;

export function TextField({
  label,
  required,
  showRequirement,
  hint,
  error,
  id,
  className,
  ...input
}: CommonFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <FieldShell
      label={label}
      required={required}
      showRequirement={showRequirement}
      hint={hint}
      error={error}
      id={id}
      className={className}
    >
      {(a11y) => (
        <input
          {...a11y}
          required={required}
          className={cn(controlClass(Boolean(error)), "min-h-11 md:min-h-10")}
          {...input}
        />
      )}
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function SelectField({
  label,
  required,
  showRequirement,
  hint,
  error,
  id,
  className,
  options,
  placeholder,
  ...select
}: CommonFieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
    options: SelectOption[];
    /** Opsi kosong pertama, mis. "Pilih gudang". */
    placeholder?: string;
  }) {
  return (
    <FieldShell
      label={label}
      required={required}
      showRequirement={showRequirement}
      hint={hint}
      error={error}
      id={id}
      className={className}
    >
      {(a11y) => (
        <select
          {...a11y}
          required={required}
          className={cn(controlClass(Boolean(error)), "min-h-11 md:min-h-10")}
          {...select}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export function TextareaField({
  label,
  required,
  showRequirement,
  hint,
  error,
  id,
  className,
  ...area
}: CommonFieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  return (
    <FieldShell
      label={label}
      required={required}
      showRequirement={showRequirement}
      hint={hint}
      error={error}
      id={id}
      className={className}
    >
      {(a11y) => (
        <textarea
          {...a11y}
          required={required}
          rows={3}
          className={cn(controlClass(Boolean(error)), "py-2")}
          {...area}
        />
      )}
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  hint,
  error,
  id,
  className,
  ...input
}: Omit<CommonFieldProps, "required" | "showRequirement"> &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type">) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-start gap-3">
        <input
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          className={cn(
            "mt-0.5 size-5 shrink-0 accent-primary disabled:cursor-not-allowed",
            error && "outline outline-2 outline-danger",
          )}
          {...input}
        />
        <label htmlFor={fieldId} className="min-h-6 text-sm text-text-primary">
          {label}
        </label>
      </div>
      {hint ? (
        <p id={hintId} className="pl-8 text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 pl-8 text-sm font-medium text-danger">
          <ErrorIcon size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="sr-only">{uiCopy.state.errorPrefix} </span>
            {error}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function FormField({
  id,
  label,
  hint,
  isRequired,
  children,
  className,
}: {
  id?: string;
  label: string;
  hint?: string;
  isRequired?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-text-primary">
        {label}
        {isRequired ? <span className="text-danger ml-0.5">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function Input({
  className,
  type,
  onClick,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      onClick={(e) => {
        if (type === "date") {
          try {
            e.currentTarget.showPicker?.();
          } catch {}
        }
        onClick?.(e);
      }}
      className={cn(
        "w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary disabled:cursor-not-allowed disabled:bg-surface-muted focus:border-primary focus:outline-none",
        type === "date" && "cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs text-text-primary disabled:cursor-not-allowed disabled:bg-surface-muted focus:border-primary focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary disabled:cursor-not-allowed disabled:bg-surface-muted focus:border-primary focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

