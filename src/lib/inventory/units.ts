/**
 * DocuFlow V2.4.1 - Master Satuan & Multiplier Konversi Satuan
 * Sumber: reference-inventory/Frontend/src/hooks/useUnits.js & Backend services
 */

export interface UnitDefinition {
  key: string;
  name: string;
  multiplier: number;
  label: string;
}

export const SUPPORTED_UNITS: UnitDefinition[] = [
  { key: "pcs", name: "Pcs", multiplier: 1, label: "pcs" },
  { key: "pack3", name: "Pack 3", multiplier: 3, label: "pack3 (3 pcs)" },
  { key: "pack6", name: "Pack 6", multiplier: 6, label: "pack6 (6 pcs)" },
  { key: "lusin", name: "Lusin", multiplier: 12, label: "lusin (12 pcs)" },
  { key: "pack", name: "Pack", multiplier: 60, label: "pack (60 pcs / 5 lusin)" },
  { key: "bal10", name: "Bal 10", multiplier: 120, label: "bal10 (120 pcs)" },
  { key: "bal15", name: "Bal 15", multiplier: 180, label: "bal15 (180 pcs)" },
  { key: "bal20", name: "Bal 20", multiplier: 240, label: "bal20 (240 pcs)" },
  { key: "bal25", name: "Bal 25", multiplier: 300, label: "bal25 (300 pcs)" },
  { key: "unit", name: "Unit", multiplier: 1, label: "unit" },
  { key: "box", name: "Box", multiplier: 1, label: "box" },
  { key: "roll", name: "Roll", multiplier: 1, label: "roll" },
];

export const UNIT_MULTIPLIERS: Record<string, number> = {
  pcs: 1,
  piece: 1,
  unit: 1,
  buah: 1,
  pack3: 3,
  pack6: 6,
  lusin: 12,
  dozen: 12,
  pack: 60,
  bal10: 120,
  bal15: 180,
  bal20: 240,
  bal25: 300,
  bal: 300,
  box: 1,
  roll: 1,
};

export function getUnitMultiplier(unitKey: string | null | undefined): number {
  if (!unitKey) return 1;
  const clean = unitKey.trim().toLowerCase();
  return UNIT_MULTIPLIERS[clean] ?? 1;
}

export function formatUnitLabel(unitKey: string | null | undefined): string {
  if (!unitKey) return "pcs";
  const def = SUPPORTED_UNITS.find((u) => u.key.toLowerCase() === unitKey.trim().toLowerCase());
  return def ? def.label : unitKey;
}

export function formatConversionDisplay(
  quantity: number | undefined | null,
  sourceUnit: string | undefined | null,
  targetUnit: "pcs" | "lusin" = "pcs"
): string | null {
  if (typeof quantity !== "number" || isNaN(quantity) || quantity <= 0) return null;
  const cleanSource = (sourceUnit || "pcs").trim().toLowerCase();
  const cleanTarget = targetUnit.toLowerCase();

  // Jika satuan sumber sama persis dengan target, tidak perlu teks konversi
  if (cleanSource === cleanTarget) return null;

  const totalPcs = quantity * getUnitMultiplier(cleanSource);

  if (targetUnit === "pcs") {
    // Jika satuan sumber adalah satuan dasar bernilai 1 pcs (misal pcs, unit), tidak perlu teks konversi
    if (getUnitMultiplier(cleanSource) === 1 && (cleanSource === "pcs" || cleanSource === "unit")) {
      return null;
    }
    const val = Number(totalPcs.toFixed(2));
    return `= ${val.toLocaleString("id-ID")} pcs`;
  } else if (targetUnit === "lusin") {
    const totalLusin = totalPcs / 12;
    const val = Number(totalLusin.toFixed(2));
    return `= ${val.toLocaleString("id-ID")} lusin`;
  }

  return null;
}

export interface SerialUnitResolution {
  isValid: boolean;
  unit: string;
  unitQuantity: number;
  baseQuantity: number;
  errorMessage?: string;
}

/**
 * Validasi dan resolusi kuantitas kanonis Serial Number (SN).
 * Aturan Mutlak Phase 2:
 * 1. SN mewakili 1 PCS -> hasil hitung bertambah 1 PCS.
 * 2. SN mewakili 1 LS (Lusin) dengan konversi resmi 12 PCS -> hasil hitung 12 PCS base.
 * 3. SN mewakili kemasan lain (pack, bal, pack3, dll.) -> hasil hitung mengikuti faktor konversi resmi.
 * 4. Jika satuan tidak terdaftar / invalid, tandai isValid: false (JANGAN otomatis defaulting ke 1 PCS).
 */
export function resolveSerialUnitRepresentation(sn: {
  serialNumber?: string;
  unit?: string | null;
  unitQuantity?: number | null;
  baseQuantity?: number | null;
  productUnit?: string | null;
  conversionFactor?: number | null;
}): SerialUnitResolution {
  const snLabel = sn.serialNumber ?? "UNKNOWN";
  const rawUnit = (sn.unit || sn.productUnit || "").trim().toLowerCase();

  // Jika unit kosong atau tidak ada
  if (!rawUnit) {
    return {
      isValid: false,
      unit: "UNKNOWN",
      unitQuantity: 0,
      baseQuantity: 0,
      errorMessage: `Serial Number '${snLabel}' tidak memiliki informasi satuan yang valid.`,
    };
  }

  // Jika produk memiliki konfigurasi konversi eksplisit (custom conversionFactor > 0), utamakan faktor tersebut
  // Sebaliknya, gunakan tabel pengali resmi UNIT_MULTIPLIERS
  const hasCustomFactor = typeof sn.conversionFactor === "number" && !isNaN(sn.conversionFactor) && sn.conversionFactor > 0;
  const standardMultiplier = UNIT_MULTIPLIERS[rawUnit];

  if (!hasCustomFactor && standardMultiplier === undefined) {
    return {
      isValid: false,
      unit: rawUnit,
      unitQuantity: 0,
      baseQuantity: 0,
      errorMessage: `Satuan '${sn.unit}' pada Serial Number '${snLabel}' tidak valid atau tidak terdaftar di sistem.`,
    };
  }

  const effectiveMultiplier = hasCustomFactor ? sn.conversionFactor! : standardMultiplier;
  const unitQty = Number(sn.unitQuantity) > 0 ? Number(sn.unitQuantity) : 1;

  // Jika baseQuantity sudah tersimpan secara eksplisit dan konsisten pada SN (mencegah konversi ganda)
  let baseQty = Number(sn.baseQuantity);
  if (!baseQty || isNaN(baseQty) || baseQty <= 0) {
    baseQty = unitQty * effectiveMultiplier;
  }

  if (baseQty <= 0 || isNaN(baseQty)) {
    return {
      isValid: false,
      unit: rawUnit,
      unitQuantity: unitQty,
      baseQuantity: 0,
      errorMessage: `Kuantitas dasar untuk Serial Number '${snLabel}' tidak valid (${baseQty}).`,
    };
  }

  return {
    isValid: true,
    unit: rawUnit,
    unitQuantity: unitQty,
    baseQuantity: baseQty,
  };
}
