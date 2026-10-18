import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWorkspaceSettings } from '../utils/api.js';
import { useApp } from '../context/AppContext.jsx';

export const DEFAULT_UNITS = [
  { key: 'pcs', name: 'Pcs', baseType: 'pcs', baseValue: 1, multiplier: 1, isLocked: true, description: '1 Pcs' },
  { key: 'lusin', name: 'Lusin', baseType: 'pcs', baseValue: 12, multiplier: 12, isLocked: true, description: '12 Pcs' },
  { key: 'pack', name: 'Pack', baseType: 'lusin', baseValue: 5, multiplier: 60, isLocked: false, description: '5 Lusin (60 Pcs)' },
  { key: 'bal10', name: 'Bal 10', baseType: 'lusin', baseValue: 10, multiplier: 120, isLocked: false, description: '10 Lusin (120 Pcs)' },
  { key: 'bal15', name: 'Bal 15', baseType: 'lusin', baseValue: 15, multiplier: 180, isLocked: false, description: '15 Lusin (180 Pcs)' },
  { key: 'bal20', name: 'Bal 20', baseType: 'lusin', baseValue: 20, multiplier: 240, isLocked: false, description: '20 Lusin (240 Pcs)' },
  { key: 'bal25', name: 'Bal 25', baseType: 'lusin', baseValue: 25, multiplier: 300, isLocked: false, description: '25 Lusin (300 Pcs)' },
];

export const ONLINE_UNITS = [
  { key: 'pcs', name: 'Pcs', baseType: 'pcs', baseValue: 1, multiplier: 1, isLocked: true, description: '1 Pcs' },
  { key: 'pack3', name: 'Pack 3', baseType: 'pcs', baseValue: 3, multiplier: 3, isLocked: false, description: '3 Pcs' },
  { key: 'pack6', name: 'Pack 6', baseType: 'pcs', baseValue: 6, multiplier: 6, isLocked: false, description: '6 Pcs' },
  { key: 'lusin', name: 'Lusin', baseType: 'pcs', baseValue: 12, multiplier: 12, isLocked: true, description: '12 Pcs' },
];

export function getDefaultUnitsForWarehouse(warehouse) {
  const isOnline = warehouse?.code?.toUpperCase() === 'ONLINE' || warehouse?.name?.toLowerCase().includes('online');
  return isOnline ? ONLINE_UNITS : DEFAULT_UNITS;
}

export function formatDocumentQty(totalLusin, totalPcs) {
  let lusin = totalLusin || 0;
  let pcs = totalPcs || 0;

  if (lusin % 1 !== 0) {
    const extraPcs = Math.round((lusin % 1) * 12);
    lusin = Math.floor(lusin);
    pcs += extraPcs;
  }

  lusin = Math.round(lusin);
  pcs = Math.round(pcs);

  if (lusin > 0 && pcs > 0) {
    return `${lusin.toLocaleString('id-ID')} lusin ${pcs.toLocaleString('id-ID')} pcs`;
  }
  if (lusin > 0) {
    return `${lusin.toLocaleString('id-ID')} lusin`;
  }
  if (pcs > 0) {
    return `${pcs.toLocaleString('id-ID')} pcs`;
  }
  return '0 pcs';
}

export function useUnits() {
  const { activeWarehouse, activeWarehouseId } = useApp();
  const { data: settings } = useQuery({
    queryKey: ['workspace-settings', activeWarehouseId || 'default'],
    queryFn: getWorkspaceSettings,
    staleTime: 60000,
  });

  const fallbackUnits = useMemo(() => {
    return getDefaultUnitsForWarehouse(activeWarehouse);
  }, [activeWarehouse]);

  const units = useMemo(() => {
    const rawUnits = settings?.custom_units;
    if (Array.isArray(rawUnits) && rawUnits.length > 0) {
      return rawUnits;
    }
    return fallbackUnits;
  }, [settings?.custom_units, fallbackUnits]);

  const multipliers = useMemo(() => {
    const map = {
      pcs: 1,
      piece: 1,
      pack3: 3,
      pack6: 6,
      lusin: 12,
      dozen: 12,
      pack: 60,
      bal5: 60,
      bal10: 120,
      bal15: 180,
      bal20: 240,
      bal25: 300,
      bal: 300, // Legacy fallback
    };

    units.forEach((u) => {
      if (u.key) {
        const k = u.key.toLowerCase().trim();
        // Protect system primary keys per AGENTS.md rules
        if (k === 'bal' || k === 'bal25') {
          map[k] = 300;
        } else if (k === 'pack') {
          map[k] = 60;
        } else if (k === 'pack3') {
          map[k] = 3;
        } else if (k === 'pack6') {
          map[k] = 6;
        } else if (k === 'pcs' || k === 'piece') {
          map[k] = 1;
        } else if (k === 'lusin' || k === 'dozen') {
          map[k] = 12;
        } else {
          map[k] = Number(u.multiplier || (u.baseType === 'lusin' ? u.baseValue * 12 : u.baseValue) || 1);
        }
      }
    });

    return map;
  }, [units]);

  const isLusinUnit = useMemo(() => {
    return (unitKey) => {
      if (!unitKey) return false;
      const clean = String(unitKey).toLowerCase().trim();
      const found = units.find((u) => u.key && u.key.toLowerCase().trim() === clean);
      if (found) {
        return found.baseType === 'lusin';
      }
      if (clean === 'pack3' || clean === 'pk3' || clean === 'pack6' || clean === 'pk6' || clean === 'pcs' || clean === 'piece') {
        return false;
      }
      if (['lusin', 'dozen', 'pack', 'bal', 'bal5', 'bal10', 'bal15', 'bal20', 'bal25'].includes(clean)) {
        return true;
      }
      if (clean.includes('lusin') || clean.includes('doz') || clean.includes('bal')) return true;
      return false;
    };
  }, [units]);

  const formatUnitOption = (unitKey) => {
    if (!unitKey) return '';
    const keyClean = String(unitKey).toLowerCase();
    const found = units.find((u) => u.key.toLowerCase() === keyClean);
    if (!found) {
      if (keyClean === 'bal') return 'bal (25 lusin)';
      if (keyClean === 'pack3') return 'pack3 (3 pcs)';
      if (keyClean === 'pack6') return 'pack6 (6 pcs)';
      return keyClean;
    }
    if (found.key === 'pcs') return 'pcs';
    if (found.key === 'pack3') return 'pack3 (3 pcs)';
    if (found.key === 'pack6') return 'pack6 (6 pcs)';
    if (found.baseType === 'lusin') {
      return `${found.key} (${found.baseValue} lusin)`;
    }
    if (found.key === 'lusin') return 'lusin (12 pcs)';
    return `${found.key} (${found.baseValue} pcs)`;
  };

  const getMultiplier = (unitKey) => {
    if (!unitKey) return 1;
    const clean = String(unitKey).toLowerCase();
    return multipliers[clean] || 1;
  };

  const getUnitLabel = (unitKey) => {
    if (!unitKey) return '';
    const clean = String(unitKey).toLowerCase().trim();
    return units.find((unit) => String(unit.key).toLowerCase().trim() === clean)?.name || unitKey;
  };

  return {
    units,
    customUnits: units,
    multipliers,
    isLusinUnit,
    formatDocumentQty,
    formatUnitOption,
    getMultiplier,
    getUnitLabel,
  };
}
