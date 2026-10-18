import React from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="max-w-md w-full rounded border border-border-default bg-surface-card p-6 text-center space-y-4">
        <EmptyState
          title="Halaman Tidak Ditemukan (404)"
          description="Alamat URL yang Anda tuju tidak tersedia atau berada di luar cakupan rute sistem inventory."
        />
        <Link href="/dashboard" className="inline-block">
          <Button variant="primary">Kembali ke Dasbor</Button>
        </Link>
      </div>
    </div>
  );
}
