import React, { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import { DocumentDetailView } from "./document-detail-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Rincian Dokumen ${id} | Docuflow`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

function DocumentDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse p-2">
      <div className="h-9 bg-surface-muted rounded-lg w-1/3" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-36 bg-surface-muted rounded-xl" />
          <div className="h-64 bg-surface-muted rounded-xl" />
        </div>
        <div className="space-y-6">
          <div className="h-32 bg-surface-muted rounded-xl" />
          <div className="h-48 bg-surface-muted rounded-xl" />
        </div>
      </div>
    </div>
  );
}

async function DocumentDetailContent({ params }: PageProps) {
  const { id } = await params;
  const session = await getServerSessionContext();
  if (!session) {
    redirect("/login");
  }

  const repo = new InventoryRepository();
  const document = repo.getCommercialDocumentById(session.context, id);

  if (!document) {
    notFound();
  }

  // Izin edit ditentukan server (UI hanya mencerminkan). Matriks izin Staff/Sales masih TBD.
  const canEdit =
    session.context.role === "OWNER" &&
    !session.context.isSuperAdminOnBehalf &&
    document.documentType !== "SURAT_JALAN" &&
    document.status !== "CANCELLED";
  const editOptions = canEdit ? repo.getDocumentEditOptions(session.context, id) : null;

  return (
    <DocumentDetailView
      initialDocument={JSON.parse(JSON.stringify(document))}
      canEdit={canEdit}
      editOptions={editOptions ? JSON.parse(JSON.stringify(editOptions)) : null}
    />
  );
}

export default function DocumentDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<DocumentDetailSkeleton />}>
      <DocumentDetailContent params={params} />
    </Suspense>
  );
}
