import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

export const LABEL_SIZES = {
  standard: {
    key: 'standard',
    label: '38 × 25 mm',
    widthMm: 38,
    heightMm: 25,
  },
  compact: {
    key: 'compact',
    label: '40 × 20 mm',
    widthMm: 40,
    heightMm: 20,
  },
};

export const DEFAULT_LABEL_SIZE = 'standard';

export function getLabelSize(sizeKey) {
  return LABEL_SIZES[sizeKey] ?? LABEL_SIZES[DEFAULT_LABEL_SIZE];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serialTextClass(serial) {
  const len = String(serial ?? '').length;
  if (len > 26) return 'serial-text serial-text--xs';
  if (len > 20) return 'serial-text serial-text--md';
  return 'serial-text';
}

function renderStandardLabel(d) {
  return `
        <div class="label label--format-1d">
          <div class="product-name">${escapeHtml(d.productName)}</div>
          <img src="${d.barcode1dUrl || d.barcodeUrl}" class="barcode-img barcode-img--1d" alt="${escapeHtml(d.serial)}" />
          <img src="${d.qrUrl || d.barcodeUrl}" class="barcode-img barcode-img--qr" alt="${escapeHtml(d.serial)}" style="display:none;" />
          <div class="${serialTextClass(d.serial)}">${escapeHtml(d.serial)}</div>
        </div>`;
}

function renderCompactLabel(d) {
  const unitLine = d.unitText
    ? `<div class="label-unit">${escapeHtml(d.unitText)}</div>`
    : '';

  return `
        <div class="label label--compact label--format-1d">
          <div class="label-main">
            <div class="barcode-container">
              <img src="${d.barcode1dUrl || d.barcodeUrl}" class="barcode-img barcode-img--1d" alt="${escapeHtml(d.serial)}" />
              <img src="${d.qrUrl || d.barcodeUrl}" class="barcode-img barcode-img--qr" alt="${escapeHtml(d.serial)}" style="display:none;" />
            </div>
            <div class="label-info">
              <div class="product-name">${escapeHtml(d.productName)}</div>
              ${unitLine}
            </div>
          </div>
          <div class="label-foot">
            <span class="${serialTextClass(d.serial)}">${escapeHtml(d.serial)}</span>
          </div>
        </div>`;
}

export function buildLabelHtml(labelsData, title, sizeKey = DEFAULT_LABEL_SIZE) {
  const size = getLabelSize(sizeKey);
  const isCompact = size.key === 'compact';
  const pageModifier = isCompact ? 'page--compact' : '';
  const renderLabel = isCompact ? renderCompactLabel : renderStandardLabel;

  const labelsHtml = (labelsData ?? [])
    .map(
      (d, index) => `
      <div class="page ${pageModifier}">
        <span class="no-print page-number">Label ${index + 1} of ${labelsData.length}</span>
        ${renderLabel(d)}
      </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; }
    .label { display: flex; flex-direction: column; align-items: center; justify-content: space-between; box-sizing: border-box; background: white; overflow: hidden; width: 100%; height: 100%; }
    .product-name { font-weight: 800; text-align: center; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: #000000; text-transform: uppercase; word-break: break-word; width: 100%; }
    .barcode-img { width: auto; height: auto; display: block; object-fit: contain; }
    .barcode-img--1d { width: 95%; max-height: 13mm; image-rendering: pixelated; }
    .barcode-img--qr { max-height: 13mm; aspect-ratio: 1/1; }
    .serial-text { font-family: "Courier New", Courier, monospace; font-weight: 700; letter-spacing: 0.5px; text-align: center; color: #000000; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .label--compact { flex-direction: column; align-items: stretch; justify-content: space-between; }
    .label--compact .label-main { display: flex; align-items: center; gap: 1.4mm; min-height: 0; flex: 1 1 auto; }
    .label--compact .barcode-container { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; width: 48%; }
    .label--compact .barcode-img--1d { width: 100%; max-height: 11mm; }
    .label--compact .barcode-img--qr { width: 12mm; height: 12mm; }
    .label--compact .label-info { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 0.4mm; }
    .label--compact .product-name { text-align: left; width: auto; }
    .label--compact .label-unit { font-size: 5.5pt; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.2px; line-height: 1; white-space: nowrap; }
    .label--compact .label-foot { display: flex; align-items: center; justify-content: center; width: 100%; border-top: 0.2mm solid #cbd5e1; padding-top: 0.3mm; }
    .label--compact .serial-text { width: auto; max-width: 100%; }
    .serial-text--md { font-size: 6.4pt; letter-spacing: 0.2px; }
    .serial-text--xs { font-size: 5.6pt; letter-spacing: 0; }
    
    @media screen {
      body { padding-top: 80px; padding-bottom: 40px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
      .header-bar { position: fixed; top: 0; left: 0; right: 0; height: 64px; background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; z-index: 1000; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.05); }
      .header-title { font-weight: 700; font-size: 16px; color: #0f172a; display: flex; align-items: center; gap: 8px; }
      .header-badge { font-size: 11px; font-weight: 700; color: #475569; background: #e2e8f0; border-radius: 999px; padding: 3px 10px; }
      .header-actions { display: flex; align-items: center; gap: 10px; }
      .format-toggle { display: inline-flex; background: #f1f5f9; border-radius: 8px; padding: 2px; border: 1px solid #cbd5e1; gap: 2px; }
      .format-btn { border: none; background: transparent; padding: 5px 12px; font-size: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; color: #64748b; transition: all 0.15s ease; }
      .format-btn.active { background: #2563eb; color: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
      .btn { display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; font-size: 13px; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s ease-in-out; outline: none; }
      .btn-primary { background-color: #2563eb; color: white; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); }
      .btn-primary:hover { background-color: #1d4ed8; }
      .btn-primary:active { transform: scale(0.97); }
      .btn-secondary { background-color: #ffffff; color: #475569; border: 1px solid #cbd5e1; }
      .btn-secondary:hover { background-color: #f8fafc; color: #0f172a; }
      .btn-secondary:active { transform: scale(0.97); }
      .page-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; width: 100%; max-width: 95%; padding: 0 20px; }
      @media (min-width: 640px) { .page-container { grid-template-columns: repeat(4, 1fr); } }
      @media (min-width: 1024px) { .page-container { grid-template-columns: repeat(8, 1fr); } }
      .page { background: white; border-radius: 8px; box-shadow: 0 2px 6px -1px rgba(0,0,0,0.08), 0 1px 3px -1px rgba(0,0,0,0.04); border: 1px solid #e2e8f0; width: 100%; aspect-ratio: 38/25; display: flex; align-items: center; justify-content: center; position: relative; padding: 8px 6px; }
      .page--compact { aspect-ratio: 40/20; }
      .page-number { position: absolute; bottom: 4px; right: 6px; font-size: 8px; font-weight: 600; color: #94a3b8; }
      .label { width: 100%; height: 100%; border: 1px dashed #000000; padding: 5px 4px; gap: 2px; }
      .product-name { font-size: 8.5px; }
      .serial-text { font-size: 9.5px; }
      .serial-text--md { font-size: 8.2px; }
      .serial-text--xs { font-size: 7.2px; }
      .label--compact { padding: 4px 5px; gap: 2px; }
      .label--compact .product-name { font-size: 8px; line-height: 1.1; }
      .label--compact .label-unit { font-size: 7px; }
      .label--compact .label-foot { padding-top: 1px; border-top: 1px solid #cbd5e1; }
      .label--compact .serial-text { font-size: 8.5px; }
    }
    
    @media print {
      .no-print { display: none !important; }
      body { background: white; margin: 0; padding: 0; overflow: hidden; }
      .page { width: ${size.widthMm}mm; height: ${size.heightMm}mm; display: flex; align-items: center; justify-content: center; page-break-after: always; break-after: page; overflow: hidden; }
      @page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0; }
      .label { width: ${size.widthMm}mm; height: ${size.heightMm}mm; border: none; padding: 0.8mm 1mm; gap: 0.3mm; overflow: hidden; }
      .product-name { font-size: 7px; max-height: 2.3em; line-height: 1.1; }
      
      /* Barcode sizing for print */
      .label--format-1d .barcode-img--1d { width: 96%; height: 11.5mm; max-height: 12mm; object-fit: fill; image-rendering: pixelated; margin: 0.2mm 0; }
      .label--format-1d .barcode-img--qr { display: none !important; }
      
      .label--format-qr .barcode-img--qr { height: 13.5mm; width: 13.5mm; object-fit: contain; }
      .label--format-qr .barcode-img--1d { display: none !important; }

      .serial-text { font-size: 8px; line-height: 1; font-weight: 700; }
      .serial-text--md { font-size: 6.4pt; }
      .serial-text--xs { font-size: 5.6pt; }
      
      .label--compact { padding: 0.8mm 1mm; gap: 0.4mm; }
      .label--compact .label-main { gap: 1.2mm; }
      .label--compact.label--format-1d .barcode-container { width: 50%; }
      .label--compact.label--format-1d .barcode-img--1d { width: 100%; height: 9.5mm; max-height: 10mm; object-fit: fill; }
      .label--compact.label--format-qr .barcode-container { width: auto; }
      .label--compact.label--format-qr .barcode-img--qr { height: 12.5mm; width: 12.5mm; max-width: none; }
      .label--compact .product-name { font-size: 6pt; max-height: 2.2em; line-height: 1.1; }
      .label--compact .label-unit { font-size: 5.5pt; }
      .label--compact .label-foot { border-top: 0.2mm solid #cbd5e1; padding-top: 0.2mm; }
      .label--compact .serial-text { font-size: 7pt; }
      .label--compact .serial-text.serial-text--md { font-size: 6.4pt; }
      .label--compact .serial-text.serial-text--xs { font-size: 5.6pt; }
    }
  </style>
</head>
<body>
  <div class="no-print header-bar">
    <span class="header-title">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#64748b;"><path d="M3 5v14"></path><path d="M8 5v14"></path><path d="M12 5v14"></path><path d="M17 5v14"></path><path d="M21 5v14"></path></svg>
      ${escapeHtml(title)}
      <span class="header-badge">${size.label}</span>
    </span>
    <div class="header-actions">
      <div class="format-toggle" title="Pilih format barcode untuk dicetak">
        <button type="button" id="btn-fmt-1d" class="format-btn active" onclick="setLabelFormat('1d')">Barcode Garis (1D)</button>
        <button type="button" id="btn-fmt-qr" class="format-btn" onclick="setLabelFormat('qr')">QR Code (2D)</button>
      </div>
      <button onclick="window.print()" class="btn btn-primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"></path><rect x="6" y="14" width="12" height="8" rx="1"></rect></svg>
        Print
      </button>
      <button onclick="window.close()" class="btn btn-secondary">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        Close
      </button>
    </div>
  </div>
  <div class="page-container">
    ${labelsHtml}
  </div>

  <script>
    function setLabelFormat(fmt) {
      const is1D = fmt === '1d';
      document.querySelectorAll('.barcode-img--1d').forEach(function(el) {
        el.style.display = is1D ? 'block' : 'none';
      });
      document.querySelectorAll('.barcode-img--qr').forEach(function(el) {
        el.style.display = is1D ? 'none' : 'block';
      });
      document.querySelectorAll('.label').forEach(function(el) {
        if (is1D) {
          el.classList.add('label--format-1d');
          el.classList.remove('label--format-qr');
        } else {
          el.classList.add('label--format-qr');
          el.classList.remove('label--format-1d');
        }
      });
      const b1 = document.getElementById('btn-fmt-1d');
      const b2 = document.getElementById('btn-fmt-qr');
      if (b1) b1.className = is1D ? 'format-btn active' : 'format-btn';
      if (b2) b2.className = is1D ? 'format-btn' : 'format-btn active';
    }
  </script>
</body>
</html>`;
}

/**
 * items: [{ serial, productName, unitText }]
 * Menghasilkan Barcode 1D (Code 128) & QR Code lalu membuka jendela print.
 * Default ke Barcode Garis (Code 128) yang kompatibel 100% dengan scanner laser gudang.
 * @param {Window|null} existingWindow jendela yang sudah dibuka pemanggil (menghindari popup blocker)
 * @returns {Promise<boolean>} true bila jendela print siap dicetak.
 */
export async function openLabelPrintWindow({
  items = [],
  title,
  sizeKey = DEFAULT_LABEL_SIZE,
  existingWindow = null,
}) {
  const labelData = [];

  for (const item of items) {
    const str = String(item.serial || '').trim();
    if (!str) continue;

    try {
      // 1. Generate Barcode Garis 1D (Code 128) via JsBarcode (kompatibel scanner gun biasa)
      let barcode1dUrl = null;
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, str, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: false,
          margin: 2,
          background: '#ffffff',
          lineColor: '#000000',
        });
        barcode1dUrl = canvas.toDataURL('image/png');
      } catch (err1d) {
        console.warn('Gagal membuat Barcode 1D untuk serial:', str, err1d);
      }

      // 2. Generate QR Code (2D) via QRCode
      let qrUrl = null;
      try {
        qrUrl = await QRCode.toDataURL(str, {
          margin: 0,
          width: 220,
          errorCorrectionLevel: 'M',
        });
      } catch (errQr) {
        console.warn('Gagal membuat QR code untuk serial:', str, errQr);
      }

      labelData.push({
        serial: str,
        barcode1dUrl: barcode1dUrl || qrUrl,
        qrUrl: qrUrl || barcode1dUrl,
        barcodeUrl: barcode1dUrl || qrUrl,
        productName: item.productName || '',
        unitText: item.unitText || '',
      });
    } catch (err) {
      console.error('Failed to generate label images for serial:', str, err);
    }
  }

  if (labelData.length === 0) {
    try {
      existingWindow?.close();
    } catch {
      // abaikan
    }
    return false;
  }

  const win = existingWindow ?? window.open('', '_blank');
  if (!win) return false;

  win.document.open();
  win.document.write(buildLabelHtml(labelData, title, sizeKey));
  win.document.close();
  return true;
}
