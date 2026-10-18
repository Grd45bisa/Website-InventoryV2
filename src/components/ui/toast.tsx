"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { uiCopy } from "@/lib/ui-copy";
import { Alert, type Tone } from "./feedback";
import { IconButton } from "./button";
import { CloseIcon } from "./icons";

type ToastInput = { tone?: Tone; title: string; description?: string };
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<{ push: (t: ToastInput) => void } | null>(null);

let nextId = 1;

/**
 * Toast untuk feedback singkat. Error validasi yang butuh tindakan harus tetap
 * dekat field (DESIGN_SYSTEM.md 8.9). Toast danger tidak hilang otomatis.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId++;
      setItems((cur) => [...cur, { ...t, id }]);
      if (t.tone !== "danger") {
        setTimeout(() => dismiss(id), 6000);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label={uiCopy.toast.region}
        className="pointer-events-none fixed inset-x-3 top-4 z-[9999] flex flex-col gap-2 md:inset-x-auto md:right-4 md:top-4 md:w-96"
      >
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto bg-surface shadow-float rounded-lg">
            <Alert
              tone={t.tone ?? "info"}
              title={t.title}
              action={
                <IconButton
                  label={uiCopy.toast.dismiss}
                  onClick={() => dismiss(t.id)}
                  className="-my-1 -mr-1 size-9"
                >
                  <CloseIcon size={16} />
                </IconButton>
              }
            >
              {t.description}
            </Alert>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam ToastProvider");
  return ctx;
}
