import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActiveContextProvider } from "@/lib/demo/active-context-provider";
import { AppShellClient } from "@/components/shell/app-shell-client";
import { getServerSessionContext } from "@/lib/auth/server-session";

/**
 * Metadata privasi route aplikasi privat (RPD §8 & TASK-050)
 * Menegakkan proteksi agar mesin pencari tidak mengindeks data tenant atau transaksi operasional.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

/**
 * Komponen terotentikasi server-side yang membaca cookies sesi dan context tenant.
 * Berjalan di dalam Suspense boundary untuk kepatuhan Next.js 16 Partial Prerendering.
 */
async function AuthenticatedShell({ children }: { children: ReactNode }) {
  const sessionData = await getServerSessionContext();

  if (!sessionData) {
    redirect("/login");
  }

  return (
    <ActiveContextProvider
      key={`${sessionData.sessionId}-${sessionData.user.id}-${sessionData.context.ownerId}-${sessionData.context.warehouseId || ""}`}
      initialIdentity={{
        fullName: sessionData.user.fullName,
        email: sessionData.user.email,
      }}
      initialContext={sessionData.context}
      availableWarehouses={sessionData.availableWarehouses}
    >
      <AppShellClient>{children}</AppShellClient>
    </ActiveContextProvider>
  );
}

/**
 * Layout aplikasi terautentikasi DocuFlow V2.4.1 (TASK-011).
 * Menegakkan otorisasi server-side: sesi login wajib valid.
 * Pengguna tanpa sesi sah akan langsung dialihkan ke /login di server (tanpa bypass DEMO_IDENTITY).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-muted" />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}
