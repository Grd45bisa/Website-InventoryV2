"use client";

/**
 * DocuFlow Inventory SaaS V2.4.1
 * Halaman Login Enterprise & Pemulihan Akun
 * Desain bersih, warna datar (flat colors), tanpa efek berlebihan, tanpa emoji.
 * Mendukung password manager (autocomplete), show/hide password toggle, dan aksesibilitas WCAG AA.
 */

import { useState, useActionState } from "react";
import Link from "next/link";
import { signInAction, requestPasswordResetAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";

export default function LoginPage() {
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const togglePassword = () => setShowPassword((prev) => !prev);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loginState, loginFormAction, isLoginPending] = useActionState(
    signInAction,
    null
  );

  const [resetState, resetFormAction, isResetPending] = useActionState(
    async (prev: { success: boolean; error?: string } | null, formData: FormData) => {
      const res = await requestPasswordResetAction(prev, formData);
      if (res.success) {
        setResetSuccess(true);
      }
      return res;
    },
    null
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 py-8 sm:px-6 lg:px-8">
      <main className="w-full max-w-md rounded-lg border border-border bg-surface p-6 sm:p-8">
        {/* Brand Header */}
        <header className="mb-6 flex flex-col items-center text-center">
          <div
            aria-hidden="true"
            className="mb-3 flex size-11 items-center justify-center rounded-lg bg-primary text-lg font-bold text-surface"
          >
            D
          </div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
            DocuFlow Inventory
          </h1>
          <p className="mt-1 text-xs text-text-secondary sm:text-sm">
            {isResetMode
              ? "Masukkan email terdaftar untuk menerima instruksi pemulihan kata sandi."
              : "Sistem Manajemen Inventaris & Logistik Multi-Tenant"}
          </p>
        </header>

        {/* Mode Reset Password */}
        {isResetMode ? (
          <div>
            {resetSuccess ? (
              <div className="space-y-4">
                <Alert
                  variant="success"
                  title="Permintaan Diterima"
                  description="Jika alamat email terdaftar dalam sistem, tautan instruksi pemulihan kata sandi telah dikirimkan ke kotak masuk Anda."
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setIsResetMode(false);
                    setResetSuccess(false);
                  }}
                >
                  Kembali ke Halaman Masuk
                </Button>
              </div>
            ) : (
              <form action={resetFormAction} className="space-y-4">
                {resetState?.error ? (
                  <Alert
                    variant="danger"
                    title="Gagal Memproses"
                    description={resetState.error}
                  />
                ) : null}

                <div className="space-y-1.5">
                  <label
                    htmlFor="reset-email"
                    className="block text-xs font-medium text-text-primary"
                  >
                    Alamat Email Kerja <span className="text-danger">*</span>
                  </label>
                  <input
                    id="reset-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="nama@perusahaan.com"
                    className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    loading={isResetPending}
                    loadingLabel="Mengirim tautan..."
                  >
                    Kirim Instruksi Pemulihan
                  </Button>
                </div>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setIsResetMode(false)}
                    className="text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    Kembali ke halaman masuk
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : isLoginPending ? (
          <div className="space-y-4 py-6" aria-busy="true" aria-live="polite">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="size-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Memverifikasi Akun & Sesi...</h2>
                <p className="text-xs text-text-secondary mt-1">
                  Memvalidasi otorisasi tenant dan menyiapkan dasbor kerja.
                </p>
              </div>
            </div>

            {/* Skeleton loading indicators */}
            <div className="space-y-2.5 pt-3 animate-pulse">
              <div className="h-3 w-full rounded bg-surface-muted" />
              <div className="h-3 w-5/6 rounded bg-surface-muted" />
              <div className="h-3 w-3/4 rounded bg-surface-muted" />
            </div>
          </div>
        ) : (
          <form action={loginFormAction} className="space-y-4">
            {loginState?.error ? (
              <Alert
                variant="danger"
                title="Autentikasi Gagal"
                description={loginState.error}
              />
            ) : null}

            {/* Email Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-text-primary"
              >
                Alamat Email <span className="text-danger">*</span>
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="nama@perusahaan.com"
                className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Password Field with Show/Hide Toggle */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-text-primary"
                >
                  Kata Sandi <span className="text-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsResetMode(true)}
                  className="text-xs text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  Lupa kata sandi?
                </button>
              </div>

              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="w-full rounded-md border border-border-strong bg-surface py-2 pr-10 pl-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-secondary hover:text-text-primary focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOffIcon size={16} aria-hidden="true" />
                  ) : (
                    <EyeIcon size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center">
              <input
                id="remember-me"
                name="rememberMe"
                type="checkbox"
                className="size-4 rounded border-border-strong text-primary focus:ring-primary"
              />
              <label
                htmlFor="remember-me"
                className="ml-2 block text-xs text-text-secondary"
              >
                Ingat sesi saya di peramban ini
              </label>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={isLoginPending}
                loadingLabel="Memverifikasi kredensial..."
              >
                Masuk ke Sistem
              </Button>
            </div>
          </form>
        )}

        {/* Footer Enterprise */}
        <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-text-muted">
          <p>&copy; 2026 DocuFlow. Hak cipta dilindungi.</p>
          <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-text-secondary">
            <Link href="#" className="hover:underline">
              Pusat Bantuan
            </Link>
            <span aria-hidden="true">•</span>
            <Link href="#" className="hover:underline">
              Kebijakan Privasi
            </Link>
            <span aria-hidden="true">•</span>
            <Link href="#" className="hover:underline">
              Ketentuan Layanan
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
