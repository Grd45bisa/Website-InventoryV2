/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Commercial Calculation & Order Fulfillment Engine (Pure Functions)
 * 
 * Aturan Bisnis yang Ditegakkan:
 * 1. Urutan Diskon LOCKED (RPD §10.5 & DB-AUD-006):
 *    Diskon Item -> Diskon Nominal Dokumen -> Diskon Persentase Dokumen -> Penukaran Poin Terakhir.
 * 2. Matriks Reopen Source Qty Retur (RPD §10.6 & V2.4.1):
 *    SALAH_KIRIM, PEMBATALAN, SALAH_INPUT = true (kuota terbuka kembali).
 *    CACAT, LAINNYA = false (kuota tidak dibuka).
 * 3. Evaluasi Pemenuhan PO Parsial & Pencegahan Over-Fulfillment (RPD §10.4).
 */

export interface InvoiceLineItem {
  unitPrice: number;
  quantity: number;
  itemDiscountNominal?: number;
}

export interface InvoiceCalculationInput {
  items: InvoiceLineItem[];
  documentDiscountNominal?: number;
  documentDiscountPercentage?: number;
  pointsRedeemedValue?: number;
}

export interface InvoiceCalculationResult {
  grossTotal: number;
  totalItemDiscount: number;
  subtotalAfterItemDiscount: number;
  documentDiscountNominalApplied: number;
  subtotalAfterDocNominal: number;
  documentDiscountPercentageApplied: number;
  subtotalAfterDocPercentage: number;
  pointsRedeemedValueApplied: number;
  finalNetTotal: number;
}

/**
 * Menghitung rincian invoice sesuai urutan diskon LOCKED RPD §10.5
 */
export function calculateInvoiceTotals(input: InvoiceCalculationInput): InvoiceCalculationResult {
  const {
    items,
    documentDiscountNominal = 0,
    documentDiscountPercentage = 0,
    pointsRedeemedValue = 0,
  } = input;

  let grossTotal = 0;
  let totalItemDiscount = 0;
  let subtotalAfterItemDiscount = 0;

  // Langkah 1: Hitung per item (Diskon Item diterapkan pertama)
  for (const item of items) {
    const lineGross = Math.max(0, item.unitPrice * item.quantity);
    const lineDiscount = Math.min(lineGross, Math.max(0, item.itemDiscountNominal || 0));
    grossTotal += lineGross;
    totalItemDiscount += lineDiscount;
    subtotalAfterItemDiscount += (lineGross - lineDiscount);
  }

  // Langkah 2: Diskon Nominal Dokumen diterapkan berikutnya
  const docNominal = Math.min(subtotalAfterItemDiscount, Math.max(0, documentDiscountNominal));
  const subtotalAfterDocNominal = subtotalAfterItemDiscount - docNominal;

  // Langkah 3: Diskon Persentase Dokumen diterapkan setelah diskon nominal
  const percentRate = Math.min(100, Math.max(0, documentDiscountPercentage)) / 100;
  const docPercentDiscount = Math.round(subtotalAfterDocNominal * percentRate * 100) / 100;
  const subtotalAfterDocPercentage = Math.max(0, subtotalAfterDocNominal - docPercentDiscount);

  // Langkah 4: Penukaran Poin Loyalitas Pelanggan diterapkan terakhir
  const pointsApplied = Math.min(subtotalAfterDocPercentage, Math.max(0, pointsRedeemedValue));
  const finalNetTotal = Math.max(0, subtotalAfterDocPercentage - pointsApplied);

  return {
    grossTotal,
    totalItemDiscount,
    subtotalAfterItemDiscount,
    documentDiscountNominalApplied: docNominal,
    subtotalAfterDocNominal,
    documentDiscountPercentageApplied: docPercentDiscount,
    subtotalAfterDocPercentage,
    pointsRedeemedValueApplied: pointsApplied,
    finalNetTotal,
  };
}

export type ReturnReasonCode =
  | 'SALAH_KIRIM'
  | 'PEMBATALAN'
  | 'SALAH_INPUT'
  | 'CACAT'
  | 'LAINNYA';

/**
 * Mengevaluasi apakah retur membuka kembali kuantitas transaksi sumber (reopen_source_qty)
 * Sesuai baseline V2.4.1 (RPD §10.6)
 */
export function evaluateReopenSourceQty(reason: ReturnReasonCode): boolean {
  switch (reason) {
    case 'SALAH_KIRIM':
    case 'PEMBATALAN':
    case 'SALAH_INPUT':
      return true;
    case 'CACAT':
    case 'LAINNYA':
    default:
      return false;
  }
}

export interface POFulfillmentValidationResult {
  isValid: boolean;
  previouslyFulfilledQty: number;
  newFulfillmentQty: number;
  totalFulfilledAfterThis: number;
  requestedTargetQty: number;
  remainingQtyAfterThis: number;
  errorMessage?: string;
}

/**
 * Validasi alokasi pemenuhan PO oleh Goods Out (Mencegah Over-Fulfillment)
 * Sesuai RPD §10.4
 */
export function validatePOFulfillmentAllocation(
  requestedTargetQty: number,
  previouslyFulfilledQty: number,
  newFulfillmentQty: number
): POFulfillmentValidationResult {
  if (newFulfillmentQty <= 0) {
    return {
      isValid: false,
      previouslyFulfilledQty,
      newFulfillmentQty,
      totalFulfilledAfterThis: previouslyFulfilledQty,
      requestedTargetQty,
      remainingQtyAfterThis: requestedTargetQty - previouslyFulfilledQty,
      errorMessage: 'Kuantitas pemenuhan harus lebih besar dari 0.',
    };
  }

  const totalAfter = previouslyFulfilledQty + newFulfillmentQty;

  if (totalAfter > requestedTargetQty) {
    const overage = totalAfter - requestedTargetQty;
    return {
      isValid: false,
      previouslyFulfilledQty,
      newFulfillmentQty,
      totalFulfilledAfterThis: totalAfter,
      requestedTargetQty,
      remainingQtyAfterThis: requestedTargetQty - previouslyFulfilledQty,
      errorMessage: `Over-fulfillment terdeteksi: Alokasi melebihi sisa target PO sebesar ${overage} unit. Target: ${requestedTargetQty}, Sudah terpenuhi: ${previouslyFulfilledQty}, Diminta: ${newFulfillmentQty}.`,
    };
  }

  return {
    isValid: true,
    previouslyFulfilledQty,
    newFulfillmentQty,
    totalFulfilledAfterThis: totalAfter,
    requestedTargetQty,
    remainingQtyAfterThis: requestedTargetQty - totalAfter,
  };
}
