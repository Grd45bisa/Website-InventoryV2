import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docuflow - Operasi inventory",
  description: "Aplikasi inventory multi-Owner dan multi-gudang.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Bahasa default produk: Indonesia. Pergantian bahasa menunggu keputusan i18n (TASK-018).
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
