import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Printer, Trash2, AlertCircle, Barcode, RotateCcw, RefreshCw, Settings as SettingsIcon, AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, Smartphone, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings } from '../../utils/api.js';
import { useUnits } from '../../hooks/useUnits.js';
import { generateBatchSerialNumbers, getDateTokens, resolveUnitShortCode } from '../../utils/serialGenerator.js';
import GoodsInReturnModal from './GoodsInReturnModal.jsx';
import SerialSettingsModal from './SerialSettingsModal.jsx';
import LabelSizePicker from '../../components/LabelSizePicker.jsx';
import { openLabelPrintWindow, DEFAULT_LABEL_SIZE } from '../../utils/labelPrint.js';
import { describeUnitQty } from '../../utils/reportUnits.js';
import SecretEmailButton from '../../components/SecretEmailButton/SecretEmailButton.jsx';
import './GoodsInDetailModal.css';

const UNIT_LABEL = { pcs: 'pcs', piece: 'pcs', lusin: 'lusin', dozen: 'lusin', pack: 'pack', pack3: 'pack3', pack6: 'pack6', bal5: 'bal5', bal10: 'bal10', bal15: 'bal15', bal20: 'bal20', bal25: 'bal25', bal: 'bal' };
const MULTIPLIERS = { pcs: 1, piece: 1, pack3: 3, pack6: 6, lusin: 12, dozen: 12, pack: 60, bal5: 60, bal10: 120, bal15: 180, bal20: 240, bal25: 300, bal: 300 };
const SERIAL_UNIT_MULTIPLIERS = { pcs: 1, piece: 1, pack3: 3, pack6: 6, lusin: 12, dozen: 12, pack: 60, bal5: 60, bal10: 120, bal15: 180, bal20: 240, bal25: 300, bal: 300 };

const LUSIN_UNITS = new Set([
  'lusin', 'dozen', 'pack', 'bal5', 'bal10', 'bal15', 'bal20', 'bal25', 'bal',
]);

function playBeep(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
      if (navigator?.vibrate) navigator.vibrate(50);
    } else if (type === 'warning') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(370, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
      if (navigator?.vibrate) navigator.vibrate([60, 40, 60]);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      if (navigator?.vibrate) navigator.vibrate([100, 50, 100]);
    }
  } catch {
    // AudioContext unsupported or blocked by browser policy
  }
}

function isLusinUnit(unit) {
  if (!unit) return false;
  const u = String(unit).toLowerCase().trim();
  if (u === 'pack3' || u === 'pk3' || u === 'pack6' || u === 'pk6' || u === 'pcs' || u === 'piece') {
    return false;
  }
  if (LUSIN_UNITS.has(u)) return true;
  if (u.includes('lusin') || u.includes('doz') || u.includes('bal')) return true;
  if (u === 'pack' || u === 'pk') return true;
  return false;
}

function formatDocumentQty(totalLusin, totalPcs) {
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

function toCamel(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camelKey] = toCamel(val);
  }
  return out;
}

function formatDate(dateStr) {
  if (!dateStr) return 'â€”';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatLusinPcs(totalPcs) {
  const count = Math.max(0, Math.round(totalPcs || 0));
  const lusin = Math.floor(count / 12);
  const pcs = count % 12;

  if (lusin > 0 && pcs > 0) {
    return `${lusin.toLocaleString('id-ID')} lusin ${pcs.toLocaleString('id-ID')} pcs`;
  }
  if (lusin > 0) {
    return `${lusin.toLocaleString('id-ID')} lusin`;
  }
  return `${pcs.toLocaleString('id-ID')} pcs`;
}

function getGoodsInGroupedProducts(doc, assignedSerials = [], returnedSerialsSet = new Set(), activeMultipliers = MULTIPLIERS, isLusinFn = isLusinUnit) {
  const rawItems = (doc?.items && doc.items.length > 0) ? doc.items : (doc?.metadata?.items ?? []);
  const groupMap = new Map();

  rawItems.forEach((item) => {
    const isSerial = item.metadata?.isSerial === true;
    const productId = item.product_id ?? item.productId ?? item.sku ?? item.item_name ?? item.itemName;
    const name = item.item_name || item.itemName || item.productName || item.name || 'Produk';
    const sku = item.sku || 'â€”';

    let unit = (item.metadata?.qtyUnit || item.qtyUnit || item.unit || 'pcs').toLowerCase();
    const rawQty = isSerial ? 1 : Number(item.metadata?.qtyInput ?? item.quantity ?? item.qty ?? 1);
    const mult = activeMultipliers[unit] || (isLusinFn(unit) ? 12 : 1);
    const pcs = rawQty * mult;

    if (!groupMap.has(productId)) {
      groupMap.set(productId, {
        productId,
        name,
        sku,
        totalPcs: 0,
        totalLusin: 0,
        totalPcsOnly: 0,
        itemCount: 0,
        serials: [],
      });
    }

    const current = groupMap.get(productId);
    current.totalPcs += pcs;
    if (isLusinFn(unit)) {
      current.totalLusin += (rawQty * mult) / 12;
    } else {
      current.totalPcsOnly += pcs;
    }
    current.itemCount += 1;

    // Check if item itself has serial number
    const snMeta = item.metadata?.serialNumber || item.serialNumber;
    if (snMeta && !returnedSerialsSet.has(String(snMeta).trim().toLowerCase())) {
      if (!current.serials.includes(snMeta)) {
        current.serials.push(snMeta);
      }
    }
  });

  // Assign serials from assignedSerials
  if (Array.isArray(assignedSerials)) {
    assignedSerials.forEach((s) => {
      const snStr = String(s.serialNumber ?? s.serial_number ?? '').trim();
      if (!snStr) return;
      if (returnedSerialsSet.has(snStr.toLowerCase())) return;

      const sProdId = s.productId ?? s.product_id;
      const sDocItemId = s.goodsInItemId ?? s.goods_in_item_id;

      let matched = null;
      if (sProdId && groupMap.has(sProdId)) {
        matched = groupMap.get(sProdId);
      } else {
        for (const g of groupMap.values()) {
          if (g.productId === sProdId || g.productId === sDocItemId || (s.sku && g.sku === s.sku)) {
            matched = g;
            break;
          }
        }
      }

      if (matched) {
        if (!matched.serials.includes(snStr)) {
          matched.serials.push(snStr);
        }
      }
    });
  }

  // Sort serials naturally (alphanumeric order)
  for (const g of groupMap.values()) {
    g.serials.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }

  return Array.from(groupMap.values());
}

function getCompanyInfo(settings, user) {
  const companyData = settings?.company || settings?.app?.company || settings?.app || settings || {};
  const companyName =
    companyData.companyName ||
    companyData.name ||
    settings?.company_name ||
    settings?.companyName ||
    settings?.company_profile?.name ||
    settings?.workspace_name ||
    user?.workspace?.name ||
    'Hoga Baby | Puffy | Gentle love';

  const companyAddress = companyData.companyAddress || companyData.address || '';
  const companyCity = companyData.companyCity || companyData.city || '';
  const companyPhone = companyData.companyPhone || companyData.phone || '';
  const companyEmail = companyData.companyEmail || companyData.email || '';
  const companyLogo = companyData.companyLogo || companyData.logoUrl || settings?.documents?.brandLogos?.[0] || '';

  const addressLine = [companyAddress, companyCity].filter((v) => String(v ?? '').trim()).join(', ');
  const contactLine = [companyPhone ? `Telp: ${companyPhone}` : '', companyEmail].filter((v) => String(v ?? '').trim()).join(' Â· ');

  return {
    companyName,
    companyAddress,
    companyCity,
    companyPhone,
    companyEmail,
    companyLogo,
    addressLine,
    contactLine,
  };
}

function buildGoodsInDocumentHtml({ doc, groupedProducts, grandTotalPcs, companyInfo }) {
  const issueDateFormatted = formatDate(doc.issue_date || doc.created_at);
  const grandTotalLusin = groupedProducts.reduce((sum, p) => sum + (p.totalLusin || 0), 0);
  const grandTotalPcsOnly = groupedProducts.reduce((sum, p) => sum + (p.totalPcsOnly || 0), 0);
  const totalLusinPcs = formatDocumentQty(grandTotalLusin, grandTotalPcsOnly);

  const rowsHtml = groupedProducts.map((p, idx) => {
    const serialsHtml = (p.serials && p.serials.length > 0)
      ? `<div style="margin-top: 2px; padding: 2px 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 8.5px; line-height: 1.3; color: #334155; word-break: break-all; letter-spacing: -0.1px;">
          <strong style="color: #0f172a; font-size: 9px;">No. Seri (${p.serials.length}):</strong> ${p.serials.join(', ')}
        </div>`
      : '';

    const formattedItemQty = formatDocumentQty(p.totalLusin, p.totalPcsOnly);

    return `
    <tr>
      <td style="text-align: center; width: 35px; vertical-align: top; padding: 4px 6px;">${idx + 1}</td>
      <td style="vertical-align: top; padding: 4px 6px;">
        <div style="font-weight: 700; color: #0f172a; font-size: 11.5px; line-height: 1.25;">${p.name}</div>
        ${serialsHtml}
      </td>
      <td style="width: 90px; text-align: center; font-family: monospace; font-size: 10.5px; color: #475569; vertical-align: top; white-space: nowrap; padding: 4px 6px;">${p.sku || 'â€”'}</td>
      <td style="width: 90px; text-align: right; font-weight: 700; white-space: nowrap; color: #0f172a; vertical-align: top; padding: 4px 6px; font-size: 11.5px;">${formattedItemQty}</td>
    </tr>
  `;
  }).join('');

  const logoHtml = companyInfo?.companyLogo ? `
    <div style="margin-right: 12px; display: flex; align-items: center;">
      <img src="${companyInfo.companyLogo}" alt="Logo" style="max-height: 40px; max-width: 100px; object-fit: contain;" />
    </div>
  ` : '';

  const subInfoHtml = [
    companyInfo?.addressLine,
    companyInfo?.contactLine,
  ].filter(Boolean).join('<br/>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=800, initial-scale=1">
  <title>Surat Bukti Penerimaan Barang - ${doc.document_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1e293b;
      background-color: #f8fafc;
      padding: 16px;
      font-size: 11.5px;
      line-height: 1.4;
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }
    .print-container {
      width: 800px;
      min-width: 800px;
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      padding: 20px 24px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 2px 4px -1px rgba(0,0,0,0.05);
    }
    .no-print-bar {
      width: 800px;
      min-width: 800px;
      max-width: 800px;
      margin: 0 auto 12px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      text-decoration: none;
    }
    .btn-primary {
      background: #2563eb;
      color: #ffffff;
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary {
      background: #ffffff;
      color: #475569;
      border: 1px solid #cbd5e1;
    }
    .btn-secondary:hover { background: #f1f5f9; }
    
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .company-title {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
      text-transform: uppercase;
    }
    .company-sub {
      font-size: 10.5px;
      color: #64748b;
      margin-top: 1px;
      line-height: 1.3;
    }
    .doc-title-block {
      text-align: right;
    }
    .doc-title {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-number {
      font-family: monospace;
      font-size: 12px;
      font-weight: 700;
      color: #2563eb;
      margin-top: 1px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px 12px;
      margin-bottom: 10px;
      padding: 8px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .meta-label {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
    }
    .meta-value {
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
    }

    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    table.items-table thead {
      display: table-header-group;
    }
    table.items-table th, table.items-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      font-size: 11px;
    }
    table.items-table th {
      background: #f1f5f9;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10px;
      color: #334155;
      letter-spacing: 0.5px;
      padding: 6px;
    }
    table.items-table tbody tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    table.items-table tbody tr:nth-child(even) {
      background: #fafafa;
    }
    .total-row td {
      background: #f8fafc !important;
      font-size: 12px;
      font-weight: 700;
      border-top: 2px solid #0f172a;
      padding: 6px 8px;
    }

    .signatures-section {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 32px;
      margin-top: 16px;
      padding-top: 6px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-box {
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 56px;
    }
    .sig-role {
      font-size: 10px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
    }
    .sig-line {
      border-bottom: 1px solid #0f172a;
      width: 65%;
      margin: 0 auto;
    }

    @media print {
      @page {
        size: A4;
        margin: 8mm 10mm 8mm 10mm;
      }
      body {
        background: #ffffff !important;
        padding: 0 !important;
        width: 100% !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print-bar { display: none !important; }
      .print-container {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
      }
      .doc-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: flex-start !important;
      }
      .meta-grid {
        display: grid !important;
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .signatures-section {
        display: grid !important;
        grid-template-columns: repeat(2, 1fr) !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div style="font-weight: 700; font-size: 13px;">Preview Dokumen Penerimaan Barang (${doc.document_number})</div>
    <div style="display: flex; gap: 8px;">
      <button onclick="window.print()" class="btn btn-primary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"></path><rect x="6" y="14" width="12" height="8" rx="1"></rect></svg>
        Cetak Sekarang
      </button>
      <button onclick="window.close()" class="btn btn-secondary">
        Tutup
      </button>
    </div>
  </div>

  <div class="print-container">
    <div class="doc-header">
      <div style="display: flex; align-items: center;">
        ${logoHtml}
        <div>
          <div class="company-title">${companyInfo?.companyName || 'DOCUFLOW'}</div>
          ${subInfoHtml ? `<div class="company-sub">${subInfoHtml}</div>` : `<div class="company-sub">Dokumen Bukti Penerimaan Barang Gudang</div>`}
        </div>
      </div>
      <div class="doc-title-block">
        <div class="doc-title">BARANG MASUK</div>
        <div class="doc-number">${doc.document_number}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-item">
        <span class="meta-label">Tanggal Transaksi:</span>
        <span class="meta-value">${issueDateFormatted}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Pemasok / Sumber:</span>
        <span class="meta-value">${doc.contact_name || 'â€”'}</span>
      </div>
      <div class="meta-item" style="grid-column: span 2;">
        <span class="meta-label">Catatan:</span>
        <span class="meta-value" style="font-weight: 400;">${doc.notes || 'â€”'}</span>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 32px; text-align: center;">No</th>
          <th>Nama Produk</th>
          <th style="width: 85px; text-align: center;">SKU</th>
          <th style="width: 85px; text-align: right;">Jumlah</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row">
          <td colspan="3" style="text-align: right; font-weight: 800; text-transform: uppercase;">Total Keseluruhan</td>
          <td style="text-align: right; font-weight: 800; color: #0f172a; font-size: 12px;">${totalLusinPcs}</td>
        </tr>
      </tbody>
    </table>

    <div class="signatures-section">
      <div class="sig-box">
        <span class="sig-role">Pengirim / Vendor</span>
        <div class="sig-line"></div>
      </div>
      <div class="sig-box">
        <span class="sig-role">Diterima (Gudang)</span>
        <div class="sig-line"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}


function detectPreferredUnit(s, itemQtyUnit, customUnits = null) {
  const metaUnit = s.metadata?.serialUnit || s.serialUnit;
  if (metaUnit && metaUnit !== 'piece' && metaUnit !== 'pcs') return metaUnit;
  if (metaUnit === 'pcs' || metaUnit === 'piece') return 'pcs';

  const sn = String(s.serialNumber ?? s.serial_number ?? '').toLowerCase();
  if (Array.isArray(customUnits)) {
    const sorted = [...customUnits].sort((a, b) => (b.key?.length || 0) - (a.key?.length || 0));
    for (const u of sorted) {
      const k = String(u.key).toLowerCase().trim();
      if (!k || k === 'pcs' || k === 'piece') continue;
      if (sn.includes(k)) return k === 'dozen' ? 'lusin' : k;
    }
  }

  if (sn.includes('10bl') || sn.includes('bal10')) return 'bal10';
  if (sn.includes('15bl') || sn.includes('bal15')) return 'bal15';
  if (sn.includes('20bl') || sn.includes('bal20')) return 'bal20';
  if (sn.includes('25bl') || sn.includes('bal25')) return 'bal25';
  if (sn.includes('5bl') || sn.includes('bal5')) return 'bal5';
  if (sn.includes('bal') || sn.includes('bl')) return 'bal';
  if (sn.includes('pack3') || sn.includes('pk3')) return 'pack3';
  if (sn.includes('pack6') || sn.includes('pk6')) return 'pack6';
  if (sn.includes('pack') || sn.includes('pk')) return 'pack';
  if (sn.includes('lusin') || sn.includes('doz')) return 'lusin';

  const sDocItemId = s.goodsInItemId ?? s.goods_in_item_id;
  const unitMap = {
    pcs: 'pcs',
    piece: 'pcs',
    lusin: 'lusin',
    dozen: 'lusin',
    pack: 'pack',
    pack3: 'pack3',
    pack6: 'pack6',
    bal5: 'bal5',
    bal10: 'bal10',
    bal15: 'bal15',
    bal20: 'bal20',
    bal25: 'bal25',
    bal: 'bal'
  };
  if (Array.isArray(customUnits)) {
    customUnits.forEach((u) => {
      if (u.key) unitMap[u.key] = u.key;
    });
  }

  if (sDocItemId && itemQtyUnit && (unitMap[itemQtyUnit] || itemQtyUnit)) {
    return unitMap[itemQtyUnit] || itemQtyUnit;
  }

  return 'pcs';
}

export default function GoodsInDetailModal({ doc, onClose }) {
  const { t, user } = useApp();
  const [staffUnlocked, setStaffUnlocked] = useState(false);

  const roleName = user?.role?.toLowerCase();
  const isOwnerOrSuperAdmin = ['owner', 'super_admin'].includes(roleName);
  const isStaff = roleName === 'staff';
  const canManageGoodsIn = isOwnerOrSuperAdmin || (isStaff && staffUnlocked);
  const { units, formatUnitOption, multipliers, isLusinUnit: hookIsLusinUnit } = useUnits();
  const [labelSize, setLabelSize] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LABEL_SIZE;
    return window.localStorage.getItem('docuflow_label_size') || DEFAULT_LABEL_SIZE;
  });
  const queryClient = useQueryClient();

  const handleLabelSizeChange = (nextSize) => {
    setLabelSize(nextSize);
    try {
      window.localStorage.setItem('docuflow_label_size', nextSize);
    } catch {
      // storage tidak tersedia, abaikan
    }
  };

  // Staff shortcut: Ctrl + Shift + D to toggle action buttons (Hapus & Return)
  useEffect(() => {
    if (!isStaff) return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setStaffUnlocked((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStaff]);

  const activeMultipliers = useMemo(() => {
    return {
      ...MULTIPLIERS,
      ...(multipliers || {}),
    };
  }, [multipliers]);

  const unitMap = useMemo(() => {
    const map = {
      pcs: 'pcs',
      piece: 'pcs',
      lusin: 'lusin',
      dozen: 'lusin',
      pack: 'pack',
      pack3: 'pack3',
      pack6: 'pack6',
      bal: 'bal',
      bal5: 'bal5',
      bal10: 'bal10',
      bal15: 'bal15',
      bal20: 'bal20',
      bal25: 'bal25',
    };
    (units || []).forEach((u) => {
      if (u.key) map[u.key] = u.key;
    });
    return map;
  }, [units]);

  const { data: settings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  const [currentDoc, setCurrentDoc] = useState(doc);

  const [returnTargetItem, setReturnTargetItem] = useState(null);
  const [returnTargetItems, setReturnTargetItems] = useState(null);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [showReturnsHistory, setShowReturnsHistory] = useState(() => (doc?.metadata?.returns?.length ?? 0) > 0);
  const [restoringReturnId, setRestoringReturnId] = useState(null);

  useEffect(() => {
    setCurrentDoc(doc);
    setStaffUnlocked(false);
    if ((doc?.metadata?.returns?.length ?? 0) > 0) {
      setShowReturnsHistory(true);
    }
  }, [doc]);

  const [showAssignmentRow, setShowAssignmentRow] = useState(false);
  const [assignMode, setAssignMode] = useState('manual');
  const [autoTargetItemKey, setAutoTargetItemKey] = useState('all');
  const [showSerialSettingsModal, setShowSerialSettingsModal] = useState(false);
  const [manualDrafts, setManualDrafts] = useState(() => [
    { itemKey: '', serialNumber: '', serialUnit: 'pcs', _key: crypto.randomUUID() }
  ]);
  const [autoDrafts, setAutoDrafts] = useState([]);

  const assignmentDrafts = assignMode === 'auto' ? autoDrafts : manualDrafts;

  const assignmentDropdownUnits = useMemo(() => {
    const list = [...(units || [])];
    const seen = new Set(list.map((u) => u.key?.toLowerCase().trim()));

    const addUnitKey = (key) => {
      if (!key) return;
      const clean = String(key).toLowerCase().trim();
      if (!seen.has(clean)) {
        seen.add(clean);
        list.push({
          key: clean,
          name: clean,
          baseType: ['bal5', 'bal10', 'bal15', 'bal20', 'bal25', 'bal', 'pack'].includes(clean) ? 'lusin' : 'pcs',
          baseValue: activeMultipliers[clean] || 1,
          multiplier: activeMultipliers[clean] || 1,
        });
      }
    };

    // Ensure all units from document items are included
    (currentDoc?.items ?? []).forEach((item) => {
      addUnitKey(item.metadata?.qtyUnit);
      addUnitKey(item.qtyUnit);
    });

    // Ensure all drafted serial units are included
    assignmentDrafts.forEach((d) => {
      addUnitKey(d.serialUnit);
    });

    // Ensure standard defaults are present
    ['pcs', 'pack3', 'pack6', 'lusin', 'pack', 'bal5', 'bal10', 'bal15', 'bal20', 'bal25', 'bal'].forEach(addUnitKey);

    return list;
  }, [units, currentDoc?.items, assignmentDrafts, activeMultipliers]);

  const setAssignmentDrafts = useCallback((updater) => {
    if (assignMode === 'auto') {
      setAutoDrafts(updater);
    } else {
      setManualDrafts(updater);
    }
  }, [assignMode]);

  useEffect(() => {
    if (settings?.serial_number_settings?.defaultMode) {
      setAssignMode(settings.serial_number_settings.defaultMode);
    }
  }, [settings?.serial_number_settings?.defaultMode]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const serialInputRefs = useRef({});

  const handleDelete = async () => {
    if (!canManageGoodsIn) return;
    if (!window.confirm(t('goodsIn.delete.confirm'))) return;
    setDeleting(true);
    setDeleteError(null);
    const previousGoodsIn = queryClient.getQueryData(['goods-in']);
    queryClient.setQueryData(['goods-in'], (current) =>
      Array.isArray(current) ? current.filter((item) => item.id !== currentDoc.id) : current
    );
    try {
      const res = await api.delete(`/api/workspace/documents/${currentDoc.id}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const err = new Error(payload?.error?.message || payload?.message || t('goodsIn.delete.failed'));
        err.status = res.status;
        throw err;
      }

      queryClient.invalidateQueries({ queryKey: ['goods-in'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-serials'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      
      onClose();
    } catch (err) {
      queryClient.setQueryData(['goods-in'], previousGoodsIn);
      const isConflict = err.status === 409 || (err.message && (err.message.toLowerCase().includes('tidak dapat dihapus') || err.message.toLowerCase().includes('conflict') || err.message.toLowerCase().includes('sudah dikeluarkan')));
      if (!isConflict) {
        console.error(err);
      } else {
        console.warn('[GoodsIn] Penghapusan dibatalkan karena konflik:', err.message);
      }
      setDeleteError({
        message: err.message || t('goodsIn.delete.failed'),
        isConflict,
      });
      setDeleting(false);
    }
  };

  // â”€â”€ Fetch Serial Numbers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { data: allSerials = [] } = useQuery({
    queryKey: ['product-serials', 'goods-in-document', currentDoc.id],
    queryFn: async () => {
      const res = await api.get(`/api/workspace/product-serials?goodsInDocumentId=${encodeURIComponent(currentDoc.id)}&limit=1000`);
      if (!res.ok) throw new Error('Failed to load serials');
      const json = await res.json();
      return toCamel(json.data ?? []);
    },
  });

  // Serials already assigned to this document
  const assignedSerials = useMemo(() => {
    return allSerials.filter((s) => {
      const sDocId = s.goodsInDocumentId ?? s.goods_in_document_id;
      return sDocId === currentDoc.id || String(sDocId) === String(currentDoc.id);
    });
  }, [allSerials, currentDoc.id]);

  // Unique Goods Out Document IDs linked to serials in this document
  const uniqueGoodsOutDocIds = useMemo(() => {
    const ids = new Set();
    assignedSerials.forEach((s) => {
      const gid = s.goodsOutDocumentId ?? s.goods_out_document_id;
      if (gid) ids.add(String(gid));
    });
    return Array.from(ids);
  }, [assignedSerials]);

  const { data: goodsOutDocMap = {} } = useQuery({
    queryKey: ['goods-out-docs-summary', uniqueGoodsOutDocIds],
    queryFn: async () => {
      if (uniqueGoodsOutDocIds.length === 0) return {};
      const map = {};
      await Promise.all(
        uniqueGoodsOutDocIds.map(async (docId) => {
          try {
            const res = await api.get(`/api/workspace/documents/${docId}`);
            if (res.ok) {
              const json = await res.json();
              if (json?.data?.document_number) {
                map[docId] = json.data.document_number;
              }
            }
          } catch (e) {
            console.warn(`Failed to fetch doc ${docId}`, e);
          }
        })
      );
      return map;
    },
    enabled: uniqueGoodsOutDocIds.length > 0,
    staleTime: 300000,
  });

  const returns = currentDoc.metadata?.returns ?? [];

  const returnedSerialsSet = useMemo(() => {
    const set = new Set();
    returns.forEach((r) => {
      (r.items ?? []).forEach((ri) => {
        if (ri.isSerial && ri.serialNumber) {
          set.add(String(ri.serialNumber).trim().toLowerCase());
        }
      });
    });
    return set;
  }, [returns]);

  const handlePrintDocument = async () => {
    const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      if (currentDoc?.id) {
        try {
          const res = await api.get(`/api/workspace/documents/${currentDoc.id}/pdf`, { responseType: 'blob' });
          if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Barang-Masuk-${currentDoc.document_number || 'dokumen'}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            return;
          }
        } catch (e) {
          console.warn('Mobile PDF download failed, falling back to window print:', e);
        }
      }
    }

    const grouped = getGoodsInGroupedProducts(currentDoc, assignedSerials, returnedSerialsSet, activeMultipliers, hookIsLusinUnit);
    const grandTotalPcs = grouped.reduce((sum, p) => sum + p.totalPcs, 0);
    const companyInfo = getCompanyInfo(settings, user);

    const htmlContent = buildGoodsInDocumentHtml({
      doc: currentDoc,
      groupedProducts: grouped,
      grandTotalPcs,
      companyInfo,
    });

    const printWin = window.open('', '_blank', 'width=900,height=750');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(htmlContent);
      printWin.document.close();
    }
  };

  const returnedNonSerialQtyMap = useMemo(() => {
    const map = {};
    returns.forEach((r) => {
      (r.items ?? []).forEach((ri) => {
        if (!ri.isSerial) {
          const key = ri.itemId || ri.productId;
          if (key) {
            map[key] = (map[key] || 0) + (ri.returnedQty || 0);
          }
        }
      });
    });
    return map;
  }, [returns]);

  // Derived received items rows (parents representing remaining, child representing assigned)
  const derivedRows = useMemo(() => {
    const rows = [];
    const eligible = [];
    const usedSerialIds = new Set();

    (currentDoc.items ?? []).forEach((item, idx) => {
      const itemProductId = item.productId ?? item.product_id;
      const itemId = item.id || item.itemId || itemProductId || `item-${idx}`;
      const itemKey = `item-${idx}-${itemId}`;
      const itemQtyUnit = item.metadata?.qtyUnit || 'pcs';
      const itemQtyInput = item.metadata?.qtyInput ?? item.quantity ?? 1;

      // Subtract previously returned non-serial quantities
      const returnedQtyForThisItem = returnedNonSerialQtyMap[item.id] || returnedNonSerialQtyMap[itemProductId] || 0;
      const effectiveQtyInput = Math.max(0, itemQtyInput - returnedQtyForThisItem);
      const totalPcsQty = effectiveQtyInput * (activeMultipliers[itemQtyUnit] || 1);

      const itemSerialUnitKey = unitMap[itemQtyUnit] || itemQtyUnit || 'pcs';
      const serialPcsWeight = activeMultipliers[itemSerialUnitKey] || activeMultipliers[itemQtyUnit] || 1;

      // Pass 1: Find serials assigned to this specific document item line (matching direct sDocItemId OR preferred unit)
      const itemSerials = assignedSerials.filter((s) => {
        if (usedSerialIds.has(s.id)) return false;

        const sDocItemId = s.goodsInItemId ?? s.goods_in_item_id;
        const sProdId = s.productId ?? s.product_id;

        // 1. Direct match on item ID / itemKey
        if (sDocItemId && (sDocItemId === item.id || String(sDocItemId) === String(item.id) || sDocItemId === itemId || sDocItemId === itemKey)) {
          usedSerialIds.add(s.id);
          return true;
        }

        // 2. Product ID match AND preferred unit match (e.g. SN with '20BL' matches 'bal20', SN without '20BL' matches 'pack')
        if ((!sDocItemId || sDocItemId === itemProductId) && itemProductId && (sProdId === itemProductId || String(sProdId) === String(itemProductId))) {
          const prefUnit = detectPreferredUnit(s, itemQtyUnit, units);
          if (prefUnit === itemSerialUnitKey) {
            usedSerialIds.add(s.id);
            return true;
          }
        }

        return false;
      });

      const getSerialPcsWeight = (s) => {
        const u = detectPreferredUnit(s, itemQtyUnit, units);
        if (u && u !== 'piece' && u !== 'pcs') {
          return activeMultipliers[u] || serialPcsWeight;
        }
        return serialPcsWeight;
      };

      // Pass 2 fallback: assign remaining unassigned serials for this product ID ONLY if preferred unit matches
      const currentAssignedPcs = () => itemSerials.reduce((sum, s) => {
        return sum + getSerialPcsWeight(s);
      }, 0);

      if (currentAssignedPcs() < totalPcsQty) {
        assignedSerials.forEach((s) => {
          if (usedSerialIds.has(s.id)) return;
          const sDocItemId = s.goodsInItemId ?? s.goods_in_item_id;
          const sProdId = s.productId ?? s.product_id;
          if (sProdId && itemProductId && (sProdId === itemProductId || String(sProdId) === String(itemProductId))) {
            const prefUnit = detectPreferredUnit(s, itemQtyUnit, units);
            if ((!sDocItemId || sDocItemId === item.id || sDocItemId === itemId || sDocItemId === itemProductId) &&
                (prefUnit === itemSerialUnitKey || prefUnit === 'piece' || prefUnit === 'pcs') &&
                currentAssignedPcs() < totalPcsQty) {
              itemSerials.push(s);
              usedSerialIds.add(s.id);
            }
          }
        });
      }

      const assignedPcsQty = itemSerials.reduce((sum, s) => {
        return sum + getSerialPcsWeight(s);
      }, 0);

      const remainingPcsQty = Math.max(0, totalPcsQty - assignedPcsQty);

      // Parent row (remaining qty)
      if (remainingPcsQty > 0) {
        const mult = activeMultipliers[itemQtyUnit] || 1;
        const rawDisplayRem = remainingPcsQty / mult;
        const displayRemainingQty = Number.isInteger(rawDisplayRem) ? rawDisplayRem : Number(rawDisplayRem.toFixed(2));

        rows.push({
          type: 'parent',
          rowId: `parent-${itemKey}`,
          itemKey,
          itemId: item.id || item.itemId || null,
          productName: item.item_name || item.itemName || 'â€”',
          sku: item.sku,
          tracking: 'Normal',
          serialNumber: 'â€”',
          qty: displayRemainingQty,
          qtyUnit: itemQtyUnit,
          level: 'parent',
          productId: itemProductId,
          isReturned: false,
        });

        eligible.push({
          itemKey,
          label: item.item_name || item.itemName || 'â€”',
          sku: item.sku,
          remainingQty: remainingPcsQty, // in pcs
          productId: itemProductId,
          itemId,
          sourceItem: item,
          qtyUnit: itemQtyUnit,
          serialUnit: itemSerialUnitKey, // locked unit derived from how item was received
        });
      }

      // Child rows
      itemSerials.forEach((serialRow, sIdx) => {
        const snStr = serialRow.serialNumber ?? serialRow.serial_number;
        const isRet = returnedSerialsSet.has(String(snStr).trim().toLowerCase());
        // If serial has been returned/deleted, completely remove from active goods table
        if (isRet) return;

        const sUnit = detectPreferredUnit(serialRow, itemQtyUnit);
        const resolvedUnit = (sUnit && sUnit !== 'piece' && sUnit !== 'pcs') ? sUnit : itemSerialUnitKey;
        const displayUnit = UNIT_LABEL[resolvedUnit] || itemQtyUnit || 'pcs';

        const sStatus = String(serialRow.status || '').toLowerCase();
        const goodsOutDocId = serialRow.goodsOutDocumentId ?? serialRow.goods_out_document_id;
        const isOut = sStatus === 'out' || sStatus === 'dispatched' || Boolean(goodsOutDocId);

        rows.push({
          type: 'serial',
          rowId: `serial-${itemKey}-${serialRow.id}-${sIdx}`,
          itemKey,
          itemId: item.id || item.itemId || null,
          productName: item.item_name || item.itemName || 'â€”',
          sku: item.sku,
          tracking: 'Serial',
          serialNumber: snStr,
          qty: 1,
          qtyUnit: displayUnit,
          level: 'child',
          productId: itemProductId,
          isReturned: false,
          isOut,
          status: isOut ? 'out' : (serialRow.status || 'available'),
          goodsOutDocumentId: goodsOutDocId || null,
          serialId: serialRow.id,
        });
      });
    });

    return { rows, eligible };
  }, [currentDoc.items, assignedSerials, returnedSerialsSet, returnedNonSerialQtyMap, activeMultipliers, unitMap, units]);

  const { rows: displayRows, eligible: eligibleItems } = derivedRows;

  const toggleSelectRow = (rowId) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const isAllSelected = displayRows.length > 0 && displayRows.every((r) => selectedRowIds.has(r.rowId));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(displayRows.map((r) => r.rowId)));
    }
  };

  const handleOpenReturn = (row) => {
    if (!canManageGoodsIn) return;
    if (row.isOut) {
      alert('Nomor seri ini telah keluar melalui transaksi Barang Keluar dan tidak dapat diretur.');
      return;
    }
    setReturnTargetItems(null);
    setReturnTargetItem({
      itemKey: row.itemKey,
      itemId: row.itemId,
      productId: row.productId,
      productName: row.productName,
      sku: row.sku,
      isSerial: row.type === 'serial',
      serialNumber: row.serialNumber !== 'â€”' ? row.serialNumber : null,
      qtyUnit: row.qtyUnit,
      qty: row.qty,
      maxQty: row.qty,
    });
  };

  const handleOpenBulkReturn = () => {
    if (!canManageGoodsIn) return;
    const selected = displayRows
      .filter((row) => selectedRowIds.has(row.rowId) && !row.isOut && !row.isReturned)
      .map((row) => ({
        itemKey: row.itemKey,
        itemId: row.itemId,
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        isSerial: row.type === 'serial',
        serialNumber: row.serialNumber !== 'â€”' ? row.serialNumber : null,
        qtyUnit: row.qtyUnit,
        qty: row.qty,
        maxQty: row.qty,
      }));

    if (selected.length === 0) return;
    setReturnTargetItem(null);
    setReturnTargetItems(selected);
  };

  const handleReturnSuccess = async (updatedDoc) => {
    if (updatedDoc) setCurrentDoc(updatedDoc);
    setSelectedRowIds(new Set());
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['goods-in'] }),
      queryClient.invalidateQueries({ queryKey: ['documents'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['product-serials'] }),
      queryClient.invalidateQueries({ queryKey: ['reports'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.refetchQueries({ queryKey: ['product-serials', 'goods-in-document', currentDoc.id] }),
    ]);
  };

  const handleRestoreReturn = async (returnRecord) => {
    if (!canManageGoodsIn) return;
    if (!returnRecord || !returnRecord.id || restoringReturnId) return;

    const itemCount = (returnRecord.items || []).length;
    const reasonLabel =
      returnRecord.reason === 'cacat_supplier' ? 'Cacat / Rusak Supplier' :
      returnRecord.reason === 'salah_kirim' ? 'Salah Kirim Supplier' :
      returnRecord.reason === 'batal_masuk' ? 'Batal Masuk Gudang' :
      returnRecord.reason === 'cacat_produk' ? 'Cacat / Rusak' :
      returnRecord.reason === 'salah_produk' ? 'Salah Produk' :
      returnRecord.reason === 'batal_beli' ? 'Batal Beli' : (returnRecord.reason || 'Retur');

    const confirmed = window.confirm(
      `Batalkan retur "${reasonLabel}"?\n\n` +
      `Sebanyak ${itemCount} barang / nomor seri yang ada pada entri retur ini akan dipulihkan kembali ke stok gudang dan aktif kembali di penerimaan ini.`
    );
    if (!confirmed) return;

    setRestoringReturnId(returnRecord.id);
    try {
      const res = await api.post(`/api/workspace/documents/${currentDoc.id}/returns/${returnRecord.id}/restore`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Gagal membatalkan retur barang');
      }
      const json = await res.json();
      if (json?.data) {
        setCurrentDoc(json.data);
      }
      setSelectedRowIds(new Set());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['goods-in'] }),
        queryClient.invalidateQueries({ queryKey: ['documents'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['product-serials'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.refetchQueries({ queryKey: ['product-serials', 'goods-in-document', currentDoc.id] }),
      ]);
    } catch (err) {
      console.error('Failed to restore return:', err);
      alert(err.message || 'Gagal membatalkan retur barang');
    } finally {
      setRestoringReturnId(null);
    }
  };

  // Helper to find the first eligible item that still has remaining capacity left after drafting
  const getFirstAvailableItem = (draftsList) => {
    const consumed = {};
    draftsList.forEach((d) => {
      if (d.itemKey) {
        const multiplier = activeMultipliers[d.serialUnit] || 1;
        consumed[d.itemKey] = (consumed[d.itemKey] || 0) + multiplier;
      }
    });

    const found = eligibleItems.find((item) => {
      const drafted = consumed[item.itemKey] || 0;
      return item.remainingQty - drafted > 0;
    });

    return found ? found.itemKey : (eligibleItems[0]?.itemKey ?? '');
  };

  // Real-time Reactive Validation Errors
  const draftErrors = useMemo(() => {
    const errors = {};
    const seenSerials = new Set();
    const consumed = {};

    assignmentDrafts.forEach((draft, idx) => {
      if (!draft.itemKey) {
        errors[idx] = t('goodsIn.detail.selectItem');
        return;
      }

      // Check unit capacity limits
      const multiplier = activeMultipliers[draft.serialUnit] || 1;
      consumed[draft.itemKey] = (consumed[draft.itemKey] || 0) + multiplier;

      const matchedItem = eligibleItems.find((item) => item.itemKey === draft.itemKey);
      if (matchedItem && consumed[draft.itemKey] > matchedItem.remainingQty) {
        errors[idx] = t('goodsIn.detail.exceedsQty', { maxQty: matchedItem.remainingQty });
        return;
      }

      const sn = draft.serialNumber.trim().toLowerCase();
      if (sn) {
        // System-wide duplicate check (even historical/deleted ones in DB)
        const isSysDup = allSerials.some(
          (s) => (s.serialNumber ?? s.serial_number ?? '').toLowerCase() === sn
        );
        if (isSysDup) {
          errors[idx] = t('goodsIn.detail.serialDuplicateSys');
          return;
        }

        // Batch duplicate check
        if (seenSerials.has(sn)) {
          errors[idx] = t('goodsIn.detail.serialDuplicateBatch');
          return;
        }

        seenSerials.add(sn);
      }
    });

    return errors;
  }, [assignmentDrafts, eligibleItems, allSerials]);

  // Disable "Add" states if draft is already full or has errors
  const totalEligibleQty = useMemo(() => {
    return eligibleItems.reduce((sum, item) => sum + item.remainingQty, 0);
  }, [eligibleItems]);

  const totalDraftedQty = useMemo(() => {
    return assignmentDrafts.reduce((sum, d) => sum + (activeMultipliers[d.serialUnit] || 1), 0);
  }, [assignmentDrafts, activeMultipliers]);

  const isAllQtyFilled = totalDraftedQty >= totalEligibleQty;
  const hasEmptyOrError = assignmentDrafts.length === 0 || assignmentDrafts.some((d, idx) => !d.serialNumber.trim() || draftErrors[idx]);
  const isAddSerialDisabled = isAllQtyFilled || hasEmptyOrError;

  // Helper: get locked serialUnit from itemKey
  const getSerialUnitForItem = (itemKey) => {
    const found = eligibleItems.find((item) => item.itemKey === itemKey);
    return found?.serialUnit ?? found?.qtyUnit ?? 'pcs';
  };

  const handleGenerateAutoSerials = async (targetKey = autoTargetItemKey, overrideSettings = null) => {
    if (!eligibleItems || eligibleItems.length === 0) return;

    let targetList = [];
    if (targetKey === 'all') {
      targetList = eligibleItems.map((item) => {
        const mult = activeMultipliers[item.serialUnit] || activeMultipliers[item.qtyUnit] || 1;
        const remainingUnits = Math.max(1, Math.round(item.remainingQty / mult));
        return {
          ...item,
          remainingUnits,
        };
      });
    } else {
      const found = eligibleItems.find((i) => i.itemKey === targetKey);
      if (found) {
        const mult = activeMultipliers[found.serialUnit] || activeMultipliers[found.qtyUnit] || 1;
        const remainingUnits = Math.max(1, Math.round(found.remainingQty / mult));
        targetList = [{ ...found, remainingUnits }];
      }
    }

    if (targetList.length === 0) return;

    const activeSettings = overrideSettings
      ? { ...settings, serial_number_settings: overrideSettings }
      : settings;

    // Fetch all serials system-wide (not just this doc) so the generator
    // can avoid collisions with serial numbers used in other documents.
    let allSerialsForGen = allSerials;
    try {
      const freshRes = await api.get('/api/workspace/product-serials?limit=5000');
      if (freshRes.ok) {
        const freshJson = await freshRes.json();
        allSerialsForGen = toCamel(freshJson.data ?? []);
      }
    } catch (_) {
      // fallback to cached allSerials
    }

    const generated = generateBatchSerialNumbers({
      targetItems: targetList,
      dateStr: currentDoc?.issueDate || currentDoc?.issue_date,
      existingSerials: allSerialsForGen,
      currentDrafts: [],
      settings: activeSettings,
    });

    if (generated.length > 0) {
      setAutoDrafts(generated);
    }
  };

  // Auto-select first item when panel opens in manual mode
  useEffect(() => {
    if (showAssignmentRow && eligibleItems.length > 0) {
      if (assignMode === 'manual') {
        setManualDrafts((current) => {
          if (current.length === 1 && !current[0].itemKey) {
            const defaultKey = getFirstAvailableItem([]);
            const lockedUnit = getSerialUnitForItem(defaultKey);
            return [{
              ...current[0],
              itemKey: defaultKey,
              serialUnit: lockedUnit,
            }];
          }
          return current;
        });
      }
    }
  }, [showAssignmentRow, eligibleItems, assignMode]);

  // Key Down in serial input row: add new draft row below & focus it
  const handleSerialKeyDown = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    if (isAddSerialDisabled) return;

    // Calculate next available item for pre-selection
    const nextItemKey = getFirstAvailableItem(assignmentDrafts);
    if (!nextItemKey) return;

    const newKey = crypto.randomUUID();
    const lockedUnit = getSerialUnitForItem(nextItemKey);
    setAssignmentDrafts((current) => [
      ...current,
      { itemKey: nextItemKey, serialNumber: '', serialUnit: lockedUnit, _key: newKey }
    ]);

    setTimeout(() => {
      serialInputRefs.current[newKey]?.focus();
    }, 50);
  };

  // Batch serials applier for paste & camera
  const applySerialsBatch = useCallback((serialsList) => {
    if (!serialsList || serialsList.length === 0) return 0;
    const cleanList = serialsList.map((s) => String(s).trim()).filter(Boolean);
    if (cleanList.length === 0) return 0;

    let appliedCount = 0;
    setManualDrafts((current) => {
      const next = [...current];
      let sIdx = 0;

      // 1. Fill empty rows first
      for (let i = 0; i < next.length && sIdx < cleanList.length; i++) {
        if (!next[i].serialNumber.trim()) {
          next[i] = { ...next[i], serialNumber: cleanList[sIdx] };
          sIdx++;
          appliedCount++;
        }
      }

      // 2. Append new rows while within total eligible pcs
      while (sIdx < cleanList.length) {
        const sumDrafted = next.reduce((sum, d) => sum + (activeMultipliers[d.serialUnit] || 1), 0);
        if (sumDrafted >= totalEligibleQty) break;

        const nextItemKey = getFirstAvailableItem(next);
        if (!nextItemKey) break;

        const lockedUnit = getSerialUnitForItem(nextItemKey);
        next.push({
          _key: crypto.randomUUID(),
          itemKey: nextItemKey,
          serialUnit: lockedUnit,
          serialNumber: cleanList[sIdx],
        });
        sIdx++;
        appliedCount++;
      }

      return next;
    });

    if (assignMode !== 'manual') setAssignMode('manual');
    if (appliedCount > 0) {
      playBeep('success');
    }
    return appliedCount;
  }, [totalEligibleQty, activeMultipliers, eligibleItems, assignMode]);

  const handleSaveSerials = async () => {
    // Final check for errors
    const errorCount = Object.keys(draftErrors).length;
    const isAnyEmpty = assignmentDrafts.some((d) => !d.serialNumber.trim() || !d.itemKey);
    if (errorCount > 0 || isAnyEmpty) return;

    setIsSubmitting(true);

    /** Build the insert payload from the current drafts list. */
    const buildPayload = (drafts) => drafts
      .map((draft) => {
        const matched = eligibleItems.find((el) => el.itemKey === draft.itemKey);
        if (!matched) return null;
        const sNum = draft.serialNumber ? draft.serialNumber.trim() : '';
        if (!sNum) return null;
        return {
          productId: matched.productId,
          serialNumber: sNum,
          status: 'available',
          goodsInDocumentId: currentDoc.id,
          goodsInItemId: (matched.itemId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(matched.itemId))) ? matched.itemId : null,
          metadata: {
            source: 'goods_in_completion',
            serialUnit: draft.serialUnit,
            unitQty: activeMultipliers[draft.serialUnit] || 1,
          },
        };
      })
      .filter(Boolean);

    try {
      let currentDrafts = [...assignmentDrafts];
      let serialsToInsert = buildPayload(currentDrafts);

      if (serialsToInsert.length === 0) return;

      // Single atomic batch POST to server
      let batchRes = await api.post('/api/workspace/product-serials/batch', {
        serials: serialsToInsert,
      });

      // ── Auto-fix duplicates (mode auto only) ────────────────────────────
      // If the server returns 400 because of a duplicate serial number and we
      // are in auto-generate mode, fetch the latest serials from the server,
      // regenerate replacements for the conflicting entries, and retry once.
      if (!batchRes.ok && assignMode === 'auto') {
        const errJson = await batchRes.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || errJson?.message || '';
        const isDuplicate = errMsg.toLowerCase().includes('duplikat') || errMsg.toLowerCase().includes('duplicate');

        if (isDuplicate) {
          // Fetch all current serials from server (system-wide) to get fresh data
          let freshSerials = allSerials;
          try {
            const freshRes = await api.get('/api/workspace/product-serials?limit=5000');
            if (freshRes.ok) {
              const freshJson = await freshRes.json();
              freshSerials = toCamel(freshJson.data ?? []);
            }
          } catch (_) {/* use cached */}

          // Build a set of all taken serial numbers (case-insensitive)
          const takenSet = new Set(
            freshSerials.map((s) => String(s.serialNumber || s.serial_number || '').trim().toLowerCase())
          );

          // Find which drafts have a conflict
          const conflictIndices = new Set(
            currentDrafts
              .map((d, i) => (takenSet.has(d.serialNumber.trim().toLowerCase()) ? i : -1))
              .filter((i) => i >= 0)
          );

          if (conflictIndices.size > 0) {
            // Regenerate only the conflicting slots using fresh data
            const cfg = {
              ...{ template: '{SKU}-{UNIT}-{DDMMYYYY}{SEQ}', seqLength: 4 },
              ...(settings?.serial_number_settings || {}),
            };
            const seqLength = Math.max(1, Number(cfg.seqLength) || 4);
            const dateStr = currentDoc?.issueDate || currentDoc?.issue_date;
            const { yyyy, yy, mm, dd, ddmmyyyy } = getDateTokens(dateStr);

            const newDrafts = currentDrafts.map((draft, i) => {
              if (!conflictIndices.has(i)) return draft;
              const matched = eligibleItems.find((el) => el.itemKey === draft.itemKey);
              if (!matched) return draft;

              const unitKey = draft.serialUnit || matched.serialUnit || 'pcs';
              const cleanSku = String(matched.sku || matched.label || 'ITEM').trim().toUpperCase().replace(/\s+/g, '-');
              const cleanUnit = String(resolveUnitShortCode(unitKey, settings)).trim().toUpperCase();

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

              // Find next unused sequence number
              let seq = 1;
              const allStrings = [...freshSerials.map((s) => String(s.serialNumber || s.serial_number || '')), ...takenSet];
              for (const raw of allStrings) {
                const str = String(raw).trim().toUpperCase();
                if (str.startsWith(prefixBeforeSeq.toUpperCase())) {
                  const suffix = str.slice(prefixBeforeSeq.length);
                  const m = suffix.match(/^(\d+)/);
                  if (m) { const n = parseInt(m[1], 10); if (!isNaN(n) && n >= seq) seq = n + 1; }
                }
              }

              // Find a slot not already in takenSet or the current newDrafts accumulation
              let newSn = '';
              while (true) {
                const fmtSeq = String(seq).padStart(seqLength, '0');
                newSn = prefixTemplate
                  .replace(/{SKU}/g, cleanSku)
                  .replace(/{UNIT}/g, cleanUnit)
                  .replace(/{DDMMYYYY}/g, ddmmyyyy)
                  .replace(/{YYYY}/g, yyyy)
                  .replace(/{YY}/g, yy)
                  .replace(/{MM}/g, mm)
                  .replace(/{DD}/g, dd)
                  .replace(/{SEQ}/g, fmtSeq);
                seq++;
                if (!takenSet.has(newSn.toLowerCase())) {
                  takenSet.add(newSn.toLowerCase()); // reserve it
                  break;
                }
              }

              return { ...draft, serialNumber: newSn };
            });

            // Update autoDrafts so UI reflects new serial numbers
            setAutoDrafts(newDrafts);
            currentDrafts = newDrafts;
            serialsToInsert = buildPayload(newDrafts);

            // Retry insert with the fresh serial numbers
            batchRes = await api.post('/api/workspace/product-serials/batch', {
              serials: serialsToInsert,
            });
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────

      if (!batchRes.ok) {
        const errJson = await batchRes.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || errJson?.message || 'Gagal menyimpan nomor seri secara batch');
      }

      // Invalidate only the queries whose underlying data actually changed.
      // product-serials/batch does not touch product stock, so ['products']
      // is intentionally left alone here to avoid an unnecessary
      // GET /products?limit=1000 refetch storm.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-serials', 'goods-in-document', currentDoc.id] }),
        queryClient.invalidateQueries({ queryKey: ['product-serials', 'goods-in-counts'] }),
        queryClient.invalidateQueries({ queryKey: ['product-serial-index'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-documents'] }),
        queryClient.invalidateQueries({ queryKey: ['goods-in'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      ]);

      // Reset assignment drafts form
      setManualDrafts([{ itemKey: '', serialNumber: '', serialUnit: 'pcs', _key: crypto.randomUUID() }]);
      setAutoDrafts([]);
      setShowAssignmentRow(false);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Terjadi kesalahan saat menyimpan nomor seri.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintAll = async () => {
    if (!assignedSerials || assignedSerials.length === 0) {
      alert('Tidak ada nomor seri yang dapat dicetak.');
      return;
    }

    // Open print window synchronously on user click gesture so browser popup blocker does NOT block it
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Menyiapkan Label Cetak...</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background-color: #f8fafc;
              color: #475569;
            }
            .spinner {
              width: 36px;
              height: 36px;
              border: 3px solid #cbd5e1;
              border-top-color: #2563eb;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
              margin-bottom: 16px;
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">Menyiapkan Label Cetak</div>
          <div style="font-size: 13px; color: #94a3b8;">Sedang membuat kode barcode & QR. Mohon tunggu...</div>
        </body>
        </html>
      `);
    }

    const items = [];
    const processedSerialIds = new Set();

    const toLabelItem = (s, productName, itemQtyUnit) => ({
      serial: String(s.serialNumber || s.serial_number || '').trim(),
      productName,
      unitText: describeUnitQty(detectPreferredUnit(s, itemQtyUnit, units), {
        multipliers,
        customUnits: units,
      }).text,
    });

    // Group & sort serials by currentDoc.items order
    for (const item of (currentDoc.items ?? [])) {
      const itemProductId = item.productId ?? item.product_id;
      const itemId = item.id || item.itemId || itemProductId;
      const productName = item.item_name || item.itemName || item.name || item.sku || '';
      const itemQtyUnit = item.metadata?.qtyUnit || item.qtyUnit || item.unit;

      // Find serials for this item line
      const itemSerials = assignedSerials.filter((s) => {
        if (processedSerialIds.has(s.id)) return false;
        const sItemId = s.goodsInItemId ?? s.goods_in_item_id;
        const sProdId = s.productId ?? s.product_id;

        if (sItemId && (sItemId === item.id || String(sItemId) === String(item.id) || sItemId === itemId)) {
          return true;
        }
        if (sProdId && itemProductId && (sProdId === itemProductId || String(sProdId) === String(itemProductId))) {
          return true;
        }
        return false;
      });

      // Sort serials for this item in natural alphanumeric order (0001, 0002, 0003...)
      itemSerials.sort((a, b) => {
        const snA = String(a.serialNumber || a.serial_number || '');
        const snB = String(b.serialNumber || b.serial_number || '');
        return snA.localeCompare(snB, undefined, { numeric: true, sensitivity: 'base' });
      });

      for (const s of itemSerials) {
        processedSerialIds.add(s.id);
        const labelItem = toLabelItem(s, productName, itemQtyUnit);
        if (!labelItem.serial) continue;
        items.push(labelItem);
      }
    }

    // Fallback: any remaining assigned serials not tied to currentDoc.items
    const remainingSerials = assignedSerials.filter((s) => !processedSerialIds.has(s.id));
    remainingSerials.sort((a, b) => {
      const snA = String(a.serialNumber || a.serial_number || '');
      const snB = String(b.serialNumber || b.serial_number || '');
      return snA.localeCompare(snB, undefined, { numeric: true, sensitivity: 'base' });
    });

    for (const s of remainingSerials) {
      const labelItem = toLabelItem(s, '', null);
      if (!labelItem.serial) continue;
      items.push(labelItem);
    }

    if (items.length === 0) {
      if (win) win.close();
      alert('Tidak ada data nomor seri yang valid untuk dicetak.');
      return;
    }

    const ready = await openLabelPrintWindow({
      items,
      title: 'Print All Labels',
      sizeKey: labelSize,
      existingWindow: win,
    });

    if (!ready) {
      alert('Mohon izinkan pop-up di browser untuk mencetak label.');
    }
  };

  return (
    <div
      className="gi-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gi-detail-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="gi-detail-modal gi-modal">
        {/* Header */}
        <div className="gi-modal__header">
          <div>
            <h2 id="gi-detail-title" className="gi-modal__title">
              {t('goodsIn.detail.title')}
            </h2>
            <span className="gi-detail__ref">
              {currentDoc.document_number}
            </span>
          </div>
          <div className="gi-detail__header-right">
            <span className="chip chip-success">{t('goodsIn.status.completed')}</span>
            <SecretEmailButton documentId={currentDoc.id} documentType="goods_in" buttonTitle="Push Email" />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handlePrintDocument}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              title="Cetak Dokumen Barang Masuk"
            >
              <Printer size={14} />
              <span>Cetak Dokumen</span>
            </button>
            <button
              type="button"
              className="gi-modal__close-btn"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="gi-modal__body">
          {/* Details */}
          <div className="gi-modal__info-card">
            <h4 className="gi-modal__info-title">{t('goodsIn.modal.transactionDetails')}</h4>
            <div className="gi-modal__info-grid">
              <div className="gi-modal__field">
                <span className="gi-modal__field-label">{t('goodsIn.detail.date')}</span>
                <input type="text" className="input" value={formatDate(currentDoc.issue_date)} disabled readOnly />
              </div>
              <div className="gi-modal__field">
                <span className="gi-modal__field-label">{t('goodsIn.detail.source')}</span>
                <input type="text" className="input" value={currentDoc.contact_name || t('goodsIn.detail.noSource')} disabled readOnly />
              </div>
              <div className="gi-modal__field gi-modal__field--full">
                <span className="gi-modal__field-label">{t('goodsIn.detail.notes')}</span>
                <textarea className="input gi-modal__notes" value={currentDoc.notes || t('goodsIn.detail.noNotes')} disabled readOnly />
              </div>
            </div>
          </div>

          {deleteError && (
            <div className={`gi-detail__error-banner ${deleteError.isConflict ? 'gi-detail__error-banner--conflict' : ''}`}>
              <div className="gi-detail__error-banner-header">
                <div className="gi-detail__error-banner-icon">
                  {deleteError.isConflict ? <ShieldAlert size={18} /> : <AlertCircle size={18} />}
                </div>
                <div className="gi-detail__error-banner-content">
                  <h4 className="gi-detail__error-banner-title">
                    {deleteError.isConflict ? 'Dokumen Tidak Dapat Dihapus' : 'Gagal Menghapus Dokumen'}
                  </h4>
                  <p className="gi-detail__error-banner-msg">
                    {deleteError.message}
                  </p>
                  {deleteError.isConflict && canManageGoodsIn && (
                    <p className="gi-detail__error-banner-note">
                      Solusi: Gunakan tombol Return pada baris barang terkait untuk membalikkan item yang belum keluar tanpa menghapus seluruh dokumen.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="gi-detail__error-banner-close"
                  onClick={() => setDeleteError(null)}
                  title="Tutup Pesan"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Received Items section */}
          <div className="gi-modal__worksheet">
            <div className="gi-detail__items-header">
              <div className="gi-detail__items-title-group">
                <Barcode size={16} className="gi-detail__icon-muted" />
                <h4 className="gi-modal__items-title">{t('goodsIn.detail.receivedItems')}</h4>
                <span className="chip gi-detail__items-count">
                  {currentDoc.items?.length || 0} items
                </span>
              </div>
              <div className="gi-detail__items-actions">
                <button
                  type="button"
                  onClick={() => setShowAssignmentRow((prev) => !prev)}
                  disabled={eligibleItems.length === 0}
                  className="gi-modal__add-row-btn"
                >
                  <Plus size={14} />
                  <span>{t('goodsIn.detail.addSerial')}</span>
                </button>
                <LabelSizePicker
                  value={labelSize}
                  onChange={handleLabelSizeChange}
                  disabled={assignedSerials.length === 0}
                  ariaLabel={t('goodsIn.detail.printLabels')}
                />
                <button
                  type="button"
                  onClick={handlePrintAll}
                  disabled={assignedSerials.length === 0}
                  className="btn btn-secondary btn-sm"
                >
                  <Printer size={14} />
                  <span>{t('goodsIn.detail.printLabels')}</span>
                </button>
              </div>
            </div>

            {/* Inline Serial Number Assignment Panel */}
            {showAssignmentRow && eligibleItems.length > 0 && (
              <div className="gi-detail__assign-panel">
                {/* Professional Assign Toolbar */}
                <div className="gi-detail__assign-toolbar">
                  <div className="gi-detail__segmented">
                    <button
                      type="button"
                      className={`gi-detail__seg-btn ${assignMode === 'manual' ? 'gi-detail__seg-btn--active' : ''}`}
                      onClick={() => setAssignMode('manual')}
                    >
                      Manual
                    </button>
                    <button
                      type="button"
                      className={`gi-detail__seg-btn ${assignMode === 'auto' ? 'gi-detail__seg-btn--active' : ''}`}
                      onClick={() => setAssignMode('auto')}
                    >
                      Auto Generate
                    </button>
                  </div>

                  <div className="gi-detail__assign-controls">
                    {assignMode === 'auto' && (
                      <>
                        <div className="gi-detail__target-wrap">
                          <span className="gi-detail__target-lbl">Target:</span>
                          <select
                            className="input select gi-detail__target-select"
                            value={autoTargetItemKey}
                            onChange={(e) => setAutoTargetItemKey(e.target.value)}
                          >
                            <option value="all">Semua Item ({eligibleItems.length})</option>
                            {eligibleItems.map((item) => {
                              const mult = activeMultipliers[item.serialUnit] || activeMultipliers[item.qtyUnit] || 1;
                              const remUnits = Math.round(item.remainingQty / mult);
                              return (
                                <option key={item.itemKey} value={item.itemKey}>
                                  {item.label} ({remUnits} {item.serialUnit})
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <button
                          type="button"
                          className={`btn ${autoDrafts.length > 0 ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                          onClick={() => handleGenerateAutoSerials(autoTargetItemKey)}
                          title={autoDrafts.length > 0 ? 'Generate Ulang' : 'Generate Serial Number'}
                        >
                          <RefreshCw size={12} />
                          <span>{autoDrafts.length > 0 ? 'Generate Ulang' : 'Generate Serial Number'}</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowSerialSettingsModal(true)}
                    >
                      <SettingsIcon size={12} />
                      <span>Format & Satuan</span>
                    </button>
                  </div>
                </div>

                {/* Visual Progress Bar & Summary */}
                <div className="gi-detail__progress-wrap">
                  <div className="gi-detail__progress-header">
                    <div className="gi-detail__progress-label">
                      <span className="gi-detail__progress-title">Progres Pengisian:</span>
                      <span className={`gi-detail__progress-count ${isAllQtyFilled ? 'gi-detail__progress-count--done' : ''}`}>
                        {totalDraftedQty} / {totalEligibleQty} unit ({assignmentDrafts.length} serial)
                      </span>
                    </div>
                    <span className={`gi-detail__progress-percent ${isAllQtyFilled ? 'gi-detail__progress-percent--done' : ''}`}>
                      {isAllQtyFilled ? 'âœ“ 100% Lengkap' : `${Math.min(100, Math.round((totalDraftedQty / (totalEligibleQty || 1)) * 100))}%`}
                    </span>
                  </div>
                  <div className="gi-detail__progress-track">
                    <div
                      className={`gi-detail__progress-fill ${isAllQtyFilled ? 'gi-detail__progress-fill--done' : ''}`}
                      style={{ width: `${Math.min(100, (totalDraftedQty / (totalEligibleQty || 1)) * 100)}%` }}
                    />
                  </div>
                </div>

                {assignMode === 'auto' && (
                  <div className="gi-detail__assign-meta">
                    <span className="gi-detail__meta-item">
                      Format: <code>{settings?.serial_number_settings?.template || '{SKU}-{UNIT}-{DDMMYYYY}{SEQ}'}</code>
                    </span>
                    {assignmentDrafts.length > 0 && (
                      <>
                        <span className="gi-detail__meta-dot">â€¢</span>
                        <span className="gi-detail__meta-item">{assignmentDrafts.length} serial digenerate</span>
                      </>
                    )}
                  </div>
                )}

                {assignMode === 'auto' && assignmentDrafts.length === 0 ? (
                  <div className="gi-detail__auto-empty">
                    <p className="gi-detail__auto-empty-title">Nomor Seri Belum Digenerate</p>
                    <p className="gi-detail__auto-empty-desc">
                      Pilih target item di atas lalu klik tombol <strong>Generate Serial Number</strong> untuk mengisi daftar serial secara otomatis.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleGenerateAutoSerials(autoTargetItemKey)}
                    >
                      <RefreshCw size={12} />
                      <span>Generate Serial Number</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Desktop headers */}
                    <div className="gi-detail__assign-headers">
                      <div className="gi-detail__assign-header--item">{t('goodsIn.detail.assignItemCol')}</div>
                      <div className="gi-detail__assign-header--unit">{t('goodsIn.detail.assignUnitCol')}</div>
                      <div className="gi-detail__assign-header--serial">{t('goodsIn.detail.assignSerialCol')}</div>
                      <div className="gi-detail__assign-header--action"></div>
                    </div>

                    {/* Rows */}
                    <div className="gi-detail__assign-rows">
                      {assignmentDrafts.map((draft, idx) => {
                    const errorMsg = draftErrors[idx];

                    return (
                      <div key={draft._key} className="gi-detail__assign-row">
                        <div className="flex-row-desktop">
                          
                          {/* Item Dropdown */}
                          <div className="gi-detail__assign-field">
                            <select
                              className="input select"
                              value={draft.itemKey}
                              onChange={(e) => {
                                const val = e.target.value;
                                const lockedUnit = getSerialUnitForItem(val);
                                setAssignmentDrafts((current) =>
                                  current.map((d, i) => i === idx ? { ...d, itemKey: val, serialUnit: lockedUnit } : d)
                                );
                              }}
                            >
                              <option value="">{t('goodsIn.detail.selectItem')}</option>
                              {eligibleItems.map((item) => {
                                const unit = item.sourceItem?.metadata?.qtyUnit || item.qtyUnit || 'pcs';
                                const qty = item.sourceItem?.metadata?.qtyInput ?? item.sourceItem?.quantity ?? 1;
                                const mult = activeMultipliers[unit] || 1;
                                const remainingInUnit = item.remainingQty / mult;
                                return (
                                  <option key={item.itemKey} value={item.itemKey}>
                                    {item.label} ({qty} {unit}) - {item.sku || 'â€”'} (sisa: {remainingInUnit} {unit})
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {/* Unit Select â€” locked to item's receiving unit */}
                          <div className="gi-detail__assign-field--unit">
                            <select
                              className="input select"
                              value={draft.serialUnit}
                              disabled={!!draft.itemKey}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAssignmentDrafts((current) =>
                                  current.map((d, i) => i === idx ? { ...d, serialUnit: val } : d)
                                );
                              }}
                            >
                              {assignmentDropdownUnits.map((u) => (
                                <option key={u.key} value={u.key}>
                                  {formatUnitOption(u.key) || u.name || u.key}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Serial Input */}
                          <div className="gi-detail__assign-field--serial">
                            <input
                              type="text"
                              className={`input ${errorMsg ? 'gi-sn__input--dup' : ''}`}
                              placeholder={t('goodsIn.detail.serialPlaceholder')}
                              value={draft.serialNumber}
                              ref={(el) => {
                                if (el) serialInputRefs.current[draft._key] = el;
                              }}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAssignmentDrafts((current) =>
                                  current.map((d, i) => i === idx ? { ...d, serialNumber: val } : d)
                                );
                              }}
                              onKeyDown={(e) => handleSerialKeyDown(e, idx)}
                              onPaste={(e) => {
                                const pasteData = e.clipboardData.getData('text');
                                const serials = pasteData
                                  .split(/[\r\n\t]+/)
                                  .map((s) => s.trim())
                                  .filter((s) => s.length > 0);

                                if (serials.length > 1) {
                                  e.preventDefault();
                                  setAssignmentDrafts((current) => {
                                    const nextDrafts = [...current];
                                    const currentTemplate = current[idx];

                                    for (let i = 0; i < serials.length; i++) {
                                      const targetIdx = idx + i;
                                      const serialVal = serials[i];

                                      if (targetIdx < nextDrafts.length) {
                                        nextDrafts[targetIdx] = {
                                          ...nextDrafts[targetIdx],
                                          serialNumber: serialVal,
                                          itemKey: nextDrafts[targetIdx].itemKey || currentTemplate.itemKey,
                                          serialUnit: nextDrafts[targetIdx].itemKey ? nextDrafts[targetIdx].serialUnit : currentTemplate.serialUnit,
                                        };
                                      } else {
                                        const tempDrafts = nextDrafts.slice(0, targetIdx);
                                        const sumDrafted = tempDrafts.reduce((sum, d) => sum + (activeMultipliers[d.serialUnit] || 1), 0);
                                        if (sumDrafted >= totalEligibleQty) {
                                          break;
                                        }

                                        const nextItemKey = getFirstAvailableItem(nextDrafts);
                                        if (!nextItemKey) break;

                                        const lockedUnit = getSerialUnitForItem(nextItemKey);

                                        nextDrafts.push({
                                          _key: crypto.randomUUID(),
                                          itemKey: nextItemKey,
                                          serialUnit: lockedUnit,
                                          serialNumber: serialVal,
                                        });
                                      }
                                    }
                                    return nextDrafts;
                                  });
                                }
                              }}
                            />
                            {errorMsg && (
                              <span className="gi-detail__assign-error">{errorMsg}</span>
                            )}
                          </div>

                          {/* Delete row */}
                          <div className="gi-detail__assign-field--remove">
                            <button
                              type="button"
                              className="gi-line-item__remove-btn"
                              disabled={assignmentDrafts.length === 1}
                              onClick={() => {
                                setAssignmentDrafts((current) => current.filter((_, i) => i !== idx));
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom action bar â€” right-aligned */}
                <div className="gi-detail__assign-bottom" style={{ justifyContent: 'flex-end' }}>
                  {assignMode === 'manual' && (
                    <button
                      type="button"
                      className="gi-detail__add-row-dashed"
                      disabled={isAddSerialDisabled}
                      onClick={() => {
                        if (isAddSerialDisabled) return;
                        const nextItemKey = getFirstAvailableItem(assignmentDrafts);
                        if (!nextItemKey) return;
                        const lockedUnit = getSerialUnitForItem(nextItemKey);
                        const newKey = crypto.randomUUID();
                        setAssignmentDrafts((current) => [
                          ...current,
                          { itemKey: nextItemKey, serialNumber: '', serialUnit: lockedUnit, _key: newKey }
                        ]);
                        setTimeout(() => {
                          serialInputRefs.current[newKey]?.focus();
                        }, 50);
                      }}
                    >
                      <Plus size={14} />
                      <span>{t('goodsIn.detail.addSerial')}</span>
                    </button>
                  )}
                  <div className="gi-detail__assign-bottom-actions">
                    <span className={`gi-detail__bottom-status-pill ${isAllQtyFilled ? 'gi-detail__bottom-status-pill--ready' : ''}`}>
                      {isAllQtyFilled ? 'âœ“ Siap Disimpan' : `${totalDraftedQty}/${totalEligibleQty} Terisi`}
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm gi-detail__save-serials-btn"
                      onClick={handleSaveSerials}
                      disabled={isSubmitting || hasEmptyOrError || !isAllQtyFilled}
                    >
                      {isSubmitting ? t('goodsIn.detail.saving') : t('goodsIn.detail.saveSerials')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
            )}

            {/* Bulk Selection Bar */}
            {canManageGoodsIn && selectedRowIds.size > 0 && (
              <div className="gi-detail__bulk-bar">
                <div className="gi-detail__bulk-info">
                  <span className="gi-detail__bulk-badge">{selectedRowIds.size}</span>
                  <span>barang / serial dipilih</span>
                </div>
                <div className="gi-detail__bulk-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedRowIds(new Set())}
                  >
                    Batal Pilih
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handleOpenBulkReturn}
                  >
                    <RotateCcw size={14} />
                    <span>Hapus / Return ({selectedRowIds.size}) Terpilih</span>
                  </button>
                </div>
              </div>
            )}

            {/* Desktop items table */}
            <div className="gi-modal__table-desktop">
              <div className="gi-modal__table-wrapper">
                <table className="gi-modal__table">
                  <colgroup>
                    {canManageGoodsIn && <col style={{ width: '4%' }} />}
                    <col style={{ width: canManageGoodsIn ? '5%' : '6%' }} />
                    <col style={{ width: canManageGoodsIn ? '28%' : '34%' }} />
                    <col style={{ width: canManageGoodsIn ? '12%' : '14%' }} />
                    <col style={{ width: canManageGoodsIn ? '9%' : '10%' }} />
                    <col style={{ width: canManageGoodsIn ? '22%' : '24%' }} />
                    <col style={{ width: canManageGoodsIn ? '10%' : '12%' }} />
                    {canManageGoodsIn && <col style={{ width: '10%' }} />}
                  </colgroup>
                  <thead>
                    <tr>
                      {canManageGoodsIn && (
                        <th style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                            title="Pilih Semua"
                            style={{ cursor: 'pointer' }}
                          />
                        </th>
                      )}
                      <th style={{ textAlign: 'center' }}>No</th>
                      <th>{t('goodsIn.line.product')}</th>
                      <th>{t('goodsIn.line.sku')}</th>
                      <th>Tracking</th>
                      <th>{t('goodsIn.detail.assignSerialCol')}</th>
                      <th style={{ textAlign: 'right' }}>{t('goodsIn.line.qty')}</th>
                      {canManageGoodsIn && <th style={{ textAlign: 'center' }}>Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={canManageGoodsIn ? 8 : 6} style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--color-text-muted, #64748b)' }}>
                          {returns.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>
                                Seluruh barang pada penerimaan ini telah diretur / dihapus.
                              </span>
                              <span style={{ fontSize: '12px' }}>
                                Anda dapat mengembalikannya ke stok gudang melalui tombol <strong>Batalkan Retur &amp; Pulihkan</strong> pada riwayat retur di bawah.
                              </span>
                            </div>
                          ) : (
                            t('goodsIn.modal.noItems')
                          )}
                        </td>
                      </tr>
                    ) : (
                      displayRows.map((row, idx) => {
                      const isSelected = selectedRowIds.has(row.rowId);
                      return (
                        <tr
                          key={row.rowId}
                          className={`${row.type === 'serial' ? 'gi-detail__tr-serial' : ''} ${row.isOut ? 'gi-detail__tr-serial--dispatched' : ''} ${isSelected ? 'gi-detail__tr--selected' : ''}`}
                        >
                          {canManageGoodsIn && (
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={row.isReturned || row.isOut}
                                onChange={() => toggleSelectRow(row.rowId)}
                                title={row.isOut ? 'Nomor seri sudah keluar dan tidak dapat diretur' : (row.isReturned ? 'Sudah diretur' : 'Pilih barang')}
                                style={{ cursor: (row.isReturned || row.isOut) ? 'not-allowed' : 'pointer' }}
                              />
                            </td>
                          )}
                          <td className="gi-detail__td-number">
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className={row.type === 'parent' ? 'gi-detail__td-name--parent' : 'gi-detail__td-name--serial'}>
                            {row.productName}
                          </td>
                          <td className="gi-detail__td-sku">{row.sku || 'â€”'}</td>
                          <td>
                            {row.type === 'serial' ? (
                              <span className="chip chip-success chip-sm">Serial</span>
                            ) : (
                              <span className="chip chip-sm">Normal</span>
                            )}
                          </td>
                          <td>
                            {row.type === 'serial' ? (
                              <div className="gi-detail__serial-cell-wrap">
                                <span className="gi-line-item__sku-disabled gi-detail__serial-cell">
                                  {row.serialNumber}
                                </span>
                                {row.isOut ? (
                                  <span
                                    className="gi-detail__badge-dispatched"
                                    title={row.goodsOutDocumentId && goodsOutDocMap[row.goodsOutDocumentId]
                                      ? `Dikeluarkan melalui Dokumen: ${goodsOutDocMap[row.goodsOutDocumentId]}`
                                      : 'Nomor seri telah dikeluarkan / terjual'}
                                  >
                                    <AlertTriangle size={11} />
                                    <span>Sudah Keluar</span>
                                    {row.goodsOutDocumentId && goodsOutDocMap[row.goodsOutDocumentId] && (
                                      <span className="gi-detail__out-doc-ref">({goodsOutDocMap[row.goodsOutDocumentId]})</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="gi-detail__badge-available" title="Nomor seri tersedia di gudang">
                                    <CheckCircle2 size={11} />
                                    <span>Tersedia</span>
                                  </span>
                                )}
                              </div>
                            ) : 'â€”'}
                          </td>
                          <td className="gi-detail__td-qty">
                            {row.qty} {row.qtyUnit}
                          </td>
                          {canManageGoodsIn && (
                            <td style={{ textAlign: 'center' }}>
                              {row.isReturned ? (
                                <span className="chip chip-warning chip-sm">Returned</span>
                              ) : row.isOut ? (
                                <button
                                  type="button"
                                  className="gi-detail__row-return-btn gi-detail__row-return-btn--disabled"
                                  disabled
                                  title="Nomor seri ini sudah keluar melalui transaksi Barang Keluar dan tidak dapat diretur langsung."
                                >
                                  <RotateCcw size={13} />
                                  <span>Return</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="gi-detail__row-return-btn"
                                  title={row.type === 'serial' ? 'Return / Hapus Serial ini' : 'Return / Kurangi Jumlah Barang ini'}
                                  onClick={() => handleOpenReturn(row)}
                                >
                                  <RotateCcw size={13} />
                                  <span>Return</span>
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile items cards */}
            <div className="gi-modal__cards-mobile">
              {displayRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: 'var(--color-text-muted, #64748b)' }}>
                  {returns.length > 0 ? (
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>
                        Seluruh barang pada penerimaan ini telah diretur / dihapus.
                      </p>
                      <p style={{ margin: '6px 0 0 0', fontSize: '12px' }}>
                        Gunakan tombol <strong>Batalkan Retur &amp; Pulihkan</strong> di riwayat retur bawah untuk mengembalikannya ke stok gudang.
                      </p>
                    </div>
                  ) : (
                    t('goodsIn.modal.noItems')
                  )}
                </div>
              ) : (
                displayRows.map((row, idx) => {
                const isSelected = selectedRowIds.has(row.rowId);
                return (
                  <div
                    key={row.rowId}
                    className={`gi-line-item-card ${row.type === 'serial' ? 'gi-detail__card--serial' : 'gi-detail__card--normal'} ${isSelected ? 'gi-detail__card--selected' : ''}`}
                  >
                    {canManageGoodsIn && !row.isReturned && !row.isOut && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(row.rowId)}
                          />
                          <span>Pilih Barang Ini</span>
                        </label>
                      </div>
                    )}
                    <div className="gi-line-item-card__field">
                      <label className="gi-line-item-card__label">No / Product</label>
                      <div className="gi-detail__card-product">
                        #{idx + 1} - {row.productName}
                      </div>
                    </div>
                    <div className="gi-line-item-card__grid">
                      <div>
                        <label className="gi-line-item-card__label">{t('goodsIn.line.sku')}</label>
                        <div>{row.sku || 'â€”'}</div>
                      </div>
                      <div>
                        <label className="gi-line-item-card__label">Tracking</label>
                        <div>{row.tracking}</div>
                      </div>
                    </div>
                    {row.type === 'serial' && (
                      <div className="gi-line-item-card__field">
                        <label className="gi-line-item-card__label">{t('goodsIn.detail.assignSerialCol')}</label>
                        <div className="gi-detail__card-serial-wrap">
                          <span className="gi-line-item__sku-disabled gi-detail__card-serial-badge">
                            {row.serialNumber}
                          </span>
                          {row.isOut ? (
                            <span className="gi-detail__badge-dispatched">
                              <AlertTriangle size={11} />
                              <span>Sudah Keluar</span>
                              {row.goodsOutDocumentId && goodsOutDocMap[row.goodsOutDocumentId] && (
                                <span className="gi-detail__out-doc-ref">({goodsOutDocMap[row.goodsOutDocumentId]})</span>
                              )}
                            </span>
                          ) : (
                            <span className="gi-detail__badge-available">
                              <CheckCircle2 size={11} />
                              <span>Tersedia</span>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="gi-line-item-card__field">
                      <label className="gi-line-item-card__label">{t('goodsIn.modal.qtyCol')}</label>
                      <div><strong>{row.qty}</strong> {row.qtyUnit}</div>
                    </div>

                    {canManageGoodsIn && (
                      <div className="gi-line-item-card__field" style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
                        {row.isReturned ? (
                          <span className="chip chip-warning chip-sm">Returned</span>
                        ) : row.isOut ? (
                          <button
                            type="button"
                            className="gi-detail__row-return-btn gi-detail__row-return-btn--block gi-detail__row-return-btn--disabled"
                            disabled
                            title="Nomor seri sudah keluar"
                          >
                            <RotateCcw size={13} />
                            <span>Sudah Keluar (Tidak Dapat Diretur)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="gi-detail__row-return-btn gi-detail__row-return-btn--block"
                            onClick={() => handleOpenReturn(row)}
                          >
                            <RotateCcw size={13} />
                            <span>{row.type === 'serial' ? 'Return / Hapus Serial' : 'Return / Kurangi Barang'}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }))}
            </div>

            {/* Return History Card â€” Positioned strictly below the table */}
            {returns.length > 0 && (
              <div className="gi-modal__returns-card">
                <div
                  className="gi-modal__returns-header"
                  onClick={() => setShowReturnsHistory((prev) => !prev)}
                  style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <RotateCcw size={15} className="gi-detail__icon-muted" />
                    <h4 className="gi-modal__items-title" style={{ margin: 0, fontSize: '13px' }}>
                      Riwayat Retur & Penghapusan Barang ({returns.length})
                    </h4>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-interactive, #2563eb)' }}>
                    {showReturnsHistory ? 'Sembunyikan â–²' : 'Lihat Riwayat â–¼'}
                  </span>
                </div>
                {showReturnsHistory && (
                  <div className="gi-modal__returns-list" style={{ marginTop: 'var(--space-2)' }}>
                    {returns.map((ret, rIdx) => (
                      <div key={ret.id || rIdx} className="gi-modal__return-entry">
                        <div className="gi-modal__return-entry-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="chip chip-warning chip-sm">
                              {ret.reason === 'cacat_supplier' ? 'Cacat / Rusak Supplier' :
                               ret.reason === 'salah_kirim' ? 'Salah Kirim Supplier' :
                               ret.reason === 'batal_masuk' ? 'Batal Masuk Gudang' :
                               ret.reason === 'cacat_produk' ? 'Cacat / Rusak' :
                               ret.reason === 'salah_produk' ? 'Salah Produk' :
                               ret.reason === 'batal_beli' ? 'Batal Beli' : ret.reason}
                            </span>
                            <span className="gi-modal__return-date">{formatDate(ret.date)}</span>
                            <span className="chip chip-neutral chip-sm" style={{ fontSize: '11px' }}>
                              {(ret.items || []).length} item
                            </span>
                          </div>
                          {canManageGoodsIn && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs gi-modal__restore-btn"
                              onClick={() => handleRestoreReturn(ret)}
                              disabled={restoringReturnId === ret.id}
                              title="Batalkan retur ini dan pulihkan kembali barang / nomor seri ke gudang"
                            >
                              <RotateCcw size={12} className={restoringReturnId === ret.id ? 'gi-detail__spin' : ''} />
                              <span>{restoringReturnId === ret.id ? 'Memulihkan...' : 'Batalkan Retur & Pulihkan'}</span>
                            </button>
                          )}
                        </div>
                        {ret.notes && (
                          <p className="gi-modal__return-notes">"{ret.notes}"</p>
                        )}
                        <div className="gi-modal__return-items">
                          {(ret.items || []).map((ri, iIdx) => (
                            <span key={iIdx} className="gi-modal__return-item-badge">
                              {ri.isSerial ? `SN: ${ri.serialNumber}` : `${ri.returnedQty} ${ri.qtyUnit}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

        {/* Footer */}
        <div className="gi-modal__footer" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div>
            {canManageGoodsIn && (
              <button
                type="button"
                className="btn btn-danger btn-md interactive"
                onClick={handleDelete}
                disabled={deleting || isSubmitting}
              >
                {deleting ? '...' : t('goodsIn.action.delete')}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn-secondary btn-md interactive"
              onClick={handlePrintDocument}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={15} />
              <span>Cetak Dokumen</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-md interactive"
              onClick={onClose}
              disabled={deleting}
            >
              {t('goodsIn.detail.close')}
            </button>
          </div>
        </div>
      </div>

      {/* Return confirmation modal */}
      {(returnTargetItem || returnTargetItems) && (
        <GoodsInReturnModal
          doc={currentDoc}
          targetItem={returnTargetItem}
          targetItems={returnTargetItems}
          onClose={() => {
            setReturnTargetItem(null);
            setReturnTargetItems(null);
          }}
          onSuccess={handleReturnSuccess}
        />
      )}

      {/* Serial Number & Units Settings Modal */}
      {showSerialSettingsModal && (
        <SerialSettingsModal
          isOpen={showSerialSettingsModal}
          onClose={() => setShowSerialSettingsModal(false)}
          currentSettings={settings}
          onSaved={(newSettings) => {
            if (assignMode === 'auto' && autoDrafts.length > 0) {
              handleGenerateAutoSerials(autoTargetItemKey, newSettings);
            }
          }}
        />
      )}

    </div>
  );
}
