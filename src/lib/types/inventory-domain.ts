/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Kontrak Domain Ledger, Saldo, Reservasi, dan Serial Number (Fase 4 Fondasi)
 * Berdasarkan RPD §7.4, §10, Desain Database Tahap 3, dan AUDIT_FINALISASI_DATABASE
 */

export type TrackingMode = 'SERIAL' | 'NON_SERIAL';

export type LedgerEntryType =
  | 'GOODS_IN_POSTED'
  | 'GOODS_OUT_COMPLETED'
  | 'STOCK_ADJUSTMENT_POSTED'
  | 'RETURN_IN_POSTED';

export type ReservationStatus =
  | 'ACTIVE'
  | 'RELEASED_COMPLETED'
  | 'RELEASED_CANCELLED';

export type SerialLifecycleStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'QUARANTINE'
  | 'CONSUMED_OUT'
  | 'DECOMMISSIONED';

/**
 * Entri Buku Besar (Inventory Ledger) — Sumber Tunggal Kebenaran Pergerakan Stok
 * Sifat: Append-Only, Immutable. Saldo fisik direkonstruksi dari SUM(quantityDeltaBase).
 */
export interface LedgerEntry {
  id: string;
  sequenceNumber: number;
  ownerId: string;
  warehouseId: string;
  productId: string;
  locationId: string | null;
  entryType: LedgerEntryType;
  sourceDocType: 'GOODS_IN' | 'GOODS_OUT' | 'STOCK_OPNAME_ADJUSTMENT' | 'RETURN';
  sourceDocId: string;
  sourceLineId: string;
  quantityDeltaBase: number; // Positif untuk penambahan stok, negatif untuk pengurangan stok. Harus integer untuk SERIAL.
  serialIds?: string[];      // Daftar ID unit serial jika trackingMode === 'SERIAL'
  actorUserId: string;
  occurredAt: string;        // ISO DateTime
  notes?: string;
}

/**
 * Entri Reservasi Stok (Goods Out Pending & PO Fulfillment)
 * Menahan kuota kuantitas atau unit serial tanpa memotong saldo fisik.
 */
export interface ReservationEntry {
  id: string;
  ownerId: string;
  warehouseId: string;
  productId: string;
  sourceDocType: 'GOODS_OUT_PENDING' | 'PURCHASE_ORDER_ALLOCATION';
  sourceDocId: string;
  sourceLineId: string;
  reservedBaseQty: number;   // Kuantitas dasar yang ditahan
  serialIds?: string[];      // Daftar SN unik yang ditahan jika SERIAL
  status: ReservationStatus;
  createdAt: string;
  releasedAt: string | null;
  releasedReason?: 'COMPLETED' | 'CANCELLED_SOFT_DELETE' | 'EXPIRED';
}

/**
 * Registry Serial Number Aktif (Owner-Wide Guard)
 * Menegakkan invariant: SN aktif tidak boleh ada di dua gudang dalam satu Owner.
 */
export interface ActiveSerialRecord {
  serialId: string;
  serialNumberNormalized: string;
  ownerId: string;
  warehouseId: string;
  productId: string;
  status: SerialLifecycleStatus;
  registeredAt: string;
}

/**
 * Proyeksi Saldo Stok Gudang
 * Hanyalah proyeksi (cache/rekonstruksi) dari ledger dan reservasi aktif.
 */
export interface ReconstructedStockBalance {
  ownerId: string;
  warehouseId: string;
  productId: string;
  physicalStock: number;   // Dari SUM(ledger.quantityDeltaBase)
  reservedStock: number;   // Dari SUM(active_reservations.reservedBaseQty)
  availableStock: number;  // physicalStock - reservedStock (tidak boleh negatif)
}
