import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { DesignSystemDemo } from "./design-system-demo";

export const metadata: Metadata = {
  title: "Demo Design System - Docuflow",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  return (
    <>
      <PageHeader
        title="Demo Design System"
        description="Halaman internal untuk meninjau token dan komponen bersama Fase 2. Bukan halaman produk dan bukan bagian sitemap."
      />
      <DesignSystemDemo />
    </>
  );
}
