/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Kalkulasi nilai Dokumen Komersial (fungsi murni, tanpa dependensi server).
 *
 * Aturan urutan diskon LOCKED:
 * diskon item -> diskon nominal dokumen -> diskon persentase dokumen -> penukaran poin terakhir.
 *
 * Dipakai oleh repository (sumber kebenaran, server) dan oleh preview pada form edit (klien).
 * Preview klien hanya untuk pengalaman pengguna; nilai yang disimpan selalu dihitung ulang server.
 */

export type DocumentLineDiscountType = "NOMINAL" | "PERCENTAGE" | "NONE";

export interface DocumentLineCalcInput {
  quantity: number;
  unitPrice: number;
  discountType: DocumentLineDiscountType;
  discountValue: number;
}

export interface DocumentLineCalcResult {
  gross: number;
  discount: number;
  lineTotal: number;
}

export interface DocumentTotalsResult {
  subtotal: number;
  itemDiscount: number;
  totalAmount: number;
  lines: DocumentLineCalcResult[];
}

/** Diskon item pada baris: NOMINAL = potongan total baris (Rp), PERCENTAGE = % dari nilai kotor baris. */
export function calculateDocumentLine(line: DocumentLineCalcInput): DocumentLineCalcResult {
  const gross = Math.round(line.quantity * line.unitPrice);
  let discount = 0;
  if (line.discountType === "NOMINAL") {
    discount = Math.round(line.discountValue);
  } else if (line.discountType === "PERCENTAGE") {
    const safePct = Math.min(100, Math.max(0, line.discountValue));
    discount = Math.round(gross * (safePct / 100));
  }
  discount = Math.min(Math.max(0, discount), gross);
  return { gross, discount, lineTotal: gross - discount };
}

export function calculateDocumentTotals(input: {
  lines: DocumentLineCalcInput[];
  docNominalDiscount: number;
  docPercentageDiscount: number;
  pointsRedeemed: number;
}): DocumentTotalsResult {
  const lines = input.lines.map(calculateDocumentLine);
  const subtotal = lines.reduce((acc, l) => acc + l.gross, 0);
  const itemDiscount = lines.reduce((acc, l) => acc + l.discount, 0);

  const step1 = Math.max(0, subtotal - itemDiscount);
  const step2 = Math.max(0, step1 - input.docNominalDiscount);
  const safeDocPct = Math.min(100, Math.max(0, input.docPercentageDiscount));
  const step3 = Math.max(0, step2 * (1 - safeDocPct / 100));
  const step4 = Math.max(0, step3 - input.pointsRedeemed);

  return { subtotal, itemDiscount, totalAmount: Math.round(step4), lines };
}
