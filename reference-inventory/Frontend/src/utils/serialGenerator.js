/**
 * Serial Number Generation Utility & Helpers
 * Handles template tokens, unit short codes, sequence calculation, and collision prevention.
 */

// Default unit names in serial number (as requested: default uses current unit names)
export const DEFAULT_UNIT_SHORT_CODES = {
  pcs: 'PCS',
  piece: 'PCS',
  lusin: 'LUSIN',
  dozen: 'LUSIN',
  pack: 'PACK',
  pack3: 'PACK3',
  pack6: 'PACK6',
  bal5: 'BAL5',
  bal10: 'BAL10',
  bal15: 'BAL15',
  bal20: 'BAL20',
  bal25: 'BAL25',
  bal: 'BAL25', // Legacy fallback mapped to bal25
};

export const DEFAULT_SERIAL_SETTINGS = {
  template: '{SKU}-{UNIT}-{DDMMYYYY}{SEQ}',
  seqLength: 4,
  defaultMode: 'manual', // 'manual' | 'auto'
  unitShortCodes: DEFAULT_UNIT_SHORT_CODES,
};

export const SERIAL_TOKENS = [
  { token: '{SKU}', label: 'SKU Produk' },
  { token: '{UNIT}', label: 'Singkatan Satuan' },
  { token: '{DDMMYYYY}', label: 'Tanggal (DDMMYYYY)' },
  { token: '{YYYY}', label: 'Tahun 4 Digit' },
  { token: '{YY}', label: 'Tahun 2 Digit' },
  { token: '{MM}', label: 'Bulan 2 Digit' },
  { token: '{DD}', label: 'Hari 2 Digit' },
  { token: '{SEQ}', label: 'Nomor Urut' },
];

/**
 * Resolves the short code for a unit according to settings or defaults.
 */
export function resolveUnitShortCode(unitKey, settings) {
  if (!unitKey) return 'PCS';
  const cleanKey = String(unitKey).trim().toLowerCase();
  const configuredCodes = settings?.serial_number_settings?.unitShortCodes || settings?.unitShortCodes || {};

  if (configuredCodes[cleanKey]) {
    return String(configuredCodes[cleanKey]).trim().toUpperCase();
  }

  // Fallback to custom_units if present in settings
  if (settings?.custom_units && Array.isArray(settings.custom_units)) {
    const matched = settings.custom_units.find((u) => u.key?.toLowerCase() === cleanKey);
    if (matched?.short_code) {
      return String(matched.short_code).trim().toUpperCase();
    }
  }

  // Fallback to default presets
  if (DEFAULT_UNIT_SHORT_CODES[cleanKey]) {
    return DEFAULT_UNIT_SHORT_CODES[cleanKey];
  }

  // If no code configured and user opted to keep original name
  if (settings?.serial_number_settings?.useOriginalIfEmpty) {
    return cleanKey.toUpperCase();
  }

  // Clean uppercase fallback
  return cleanKey.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/**
 * Formats a single date into tokens.
 */
export function getDateTokens(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const validDate = isNaN(date.getTime()) ? new Date() : date;

  const yyyy = String(validDate.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(validDate.getMonth() + 1).padStart(2, '0');
  const dd = String(validDate.getDate()).padStart(2, '0');
  const ddmmyyyy = `${dd}${mm}${yyyy}`;

  return { yyyy, yy, mm, dd, ddmmyyyy };
}

/**
 * Builds a preview or single serial number from tokens.
 */
export function buildSerialNumber({ sku, unitCode, dateStr, seqNum, settings }) {
  const cfg = { ...DEFAULT_SERIAL_SETTINGS, ...(settings?.serial_number_settings || settings || {}) };
  const template = cfg.template || '{SKU}-{UNIT}-{DDMMYYYY}{SEQ}';
  const seqLength = Math.max(1, Number(cfg.seqLength) || 4);
  const formattedSeq = String(seqNum || 1).padStart(seqLength, '0');

  const { yyyy, yy, mm, dd, ddmmyyyy } = getDateTokens(dateStr);
  const cleanSku = String(sku || 'SKU').trim().toUpperCase().replace(/\s+/g, '-');
  const cleanUnit = String(unitCode || 'PCS').trim().toUpperCase();

  return template
    .replace(/{SKU}/g, cleanSku)
    .replace(/{UNIT}/g, cleanUnit)
    .replace(/{DDMMYYYY}/g, ddmmyyyy)
    .replace(/{YYYY}/g, yyyy)
    .replace(/{YY}/g, yy)
    .replace(/{MM}/g, mm)
    .replace(/{DD}/g, dd)
    .replace(/{SEQ}/g, formattedSeq);
}

/**
 * Extracts the highest existing sequence number for a specific prefix to avoid collision.
 * Checks against existing serial numbers in database and currently assigned drafts.
 */
export function getNextSequenceNumber({ prefix, existingSerials = [], currentDrafts = [], seqLength = 4 }) {
  let maxSeq = 0;
  const cleanPrefix = prefix.toUpperCase();

  const allStrings = [
    ...existingSerials.map((s) => (typeof s === 'string' ? s : s.serialNumber || s.serial_number || '')),
    ...currentDrafts.map((d) => (typeof d === 'string' ? d : d.serialNumber || ''))
  ];

  for (const raw of allStrings) {
    if (!raw) continue;
    const str = String(raw).trim().toUpperCase();
    if (str.startsWith(cleanPrefix)) {
      const suffix = str.slice(cleanPrefix.length);
      const matched = suffix.match(/^(\d+)/);
      if (matched) {
        const num = parseInt(matched[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  return maxSeq + 1;
}

/**
 * Generates batch serial number drafts for given eligible goods-in items.
 * @param {Array} targetItems - array of items with { itemKey, sku, label, serialUnit, remainingQty, multiplier }
 * @param {string} dateStr - document issue date or today
 * @param {Array} existingSerials - already saved serials from database
 * @param {Array} currentDrafts - existing draft rows in modal
 * @param {Object} settings - workspace settings
 * @returns {Array} array of draft objects ready for assignmentDrafts: [{ _key, itemKey, serialNumber, serialUnit }]
 */
export function generateBatchSerialNumbers({
  targetItems = [],
  dateStr,
  existingSerials = [],
  currentDrafts = [],
  settings = {},
}) {
  const cfg = { ...DEFAULT_SERIAL_SETTINGS, ...(settings?.serial_number_settings || settings || {}) };
  const seqLength = Math.max(1, Number(cfg.seqLength) || 4);
  const newDrafts = [];
  const accumulatedDrafts = [...currentDrafts];

  for (const item of targetItems) {
    const unitKey = item.serialUnit || item.sourceItem?.metadata?.qtyUnit || 'pcs';
    const unitShort = resolveUnitShortCode(unitKey, settings);
    const sku = item.sku || item.label || 'ITEM';

    // Calculate how many serial numbers to generate based on remaining unit quantity
    const remainingUnits = Math.max(0, Math.floor(item.remainingUnits ?? item.remainingQty ?? 1));
    if (remainingUnits <= 0) continue;

    // Build the prefix up to {SEQ}
    const { yyyy, yy, mm, dd, ddmmyyyy } = getDateTokens(dateStr);
    const cleanSku = String(sku).trim().toUpperCase().replace(/\s+/g, '-');
    const cleanUnit = String(unitShort).trim().toUpperCase();

    // The static prefix before sequence number
    const prefixTemplate = cfg.template || '{SKU}-{UNIT}-{DDMMYYYY}{SEQ}';
    const prefixBeforeSeq = prefixTemplate
      .replace(/{SKU}/g, cleanSku)
      .replace(/{UNIT}/g, cleanUnit)
      .replace(/{DDMMYYYY}/g, ddmmyyyy)
      .replace(/{YYYY}/g, yyyy)
      .replace(/{YY}/g, yy)
      .replace(/{MM}/g, mm)
      .replace(/{DD}/g, dd)
      .replace(/{SEQ}.*$/, '');

    let currentSeq = getNextSequenceNumber({
      prefix: prefixBeforeSeq,
      existingSerials,
      currentDrafts: accumulatedDrafts,
      seqLength,
    });

    const takenSerialsSet = new Set([
      ...existingSerials.map((s) => String(typeof s === 'string' ? s : s.serialNumber || s.serial_number || '').trim().toLowerCase()),
      ...accumulatedDrafts.map((d) => String(typeof d === 'string' ? d : d.serialNumber || '').trim().toLowerCase()),
    ]);

    for (let i = 0; i < remainingUnits; i++) {
      let serialNumber = '';

      // Skip any sequence that is already registered in DB or active drafts
      while (true) {
        const formattedSeq = String(currentSeq).padStart(seqLength, '0');
        serialNumber = (cfg.template || '{SKU}-{UNIT}-{DDMMYYYY}{SEQ}')
          .replace(/{SKU}/g, cleanSku)
          .replace(/{UNIT}/g, cleanUnit)
          .replace(/{DDMMYYYY}/g, ddmmyyyy)
          .replace(/{YYYY}/g, yyyy)
          .replace(/{YY}/g, yy)
          .replace(/{MM}/g, mm)
          .replace(/{DD}/g, dd)
          .replace(/{SEQ}/g, formattedSeq);

        currentSeq++;
        const lowerSn = serialNumber.toLowerCase();
        if (!takenSerialsSet.has(lowerSn)) {
          takenSerialsSet.add(lowerSn);
          break;
        }
      }

      const draftObj = {
        _key: crypto.randomUUID(),
        itemKey: item.itemKey,
        serialNumber,
        serialUnit: unitKey,
      };

      newDrafts.push(draftObj);
      accumulatedDrafts.push(draftObj);
    }
  }

  return newDrafts;
}
