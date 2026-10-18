import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Camera, Check, AlertCircle, AlertTriangle, Barcode, RotateCcw, CheckSquare, Square } from 'lucide-react';
import { useCameraScanner } from '../../hooks/useCameraScanner.js';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './GoodsOutReturnModal.css';
import './GoodsOutCreateModal.css'; // reuse scanner overlay styles

// Audio feedback (reuse pattern from GoodsOutCreateModal)
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
  } catch (_) {}
}

const RETURN_REASONS = [
  { key: 'salah_produk', label: 'Salah Produk', desc: 'Produk yang dikirim tidak sesuai pesanan' },
  { key: 'cacat_produk', label: 'Cacat / Rusak', desc: 'Produk dalam kondisi cacat atau rusak' },
  { key: 'batal_beli', label: 'Batal / Gak Jadi', desc: 'Pembeli membatalkan pembelian' },
  { key: 'lainnya', label: 'Lainnya', desc: 'Alasan lain (wajib isi catatan)' },
];

export default function GoodsOutReturnModal({ doc, onClose, onSuccess }) {
  const { t } = useApp();
  const queryClient = useQueryClient();

  // State
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [returnToAvailable, setReturnToAvailable] = useState(true);
  const [returnItems, setReturnItems] = useState({}); // { [key]: { ...item, returnedQty } }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [scanFeedback, setScanFeedback] = useState(null);
  const scanCallbackRef = useRef(null);
  const cooldownMapRef = useRef(new Map());

  if (!doc) return null;

  const items = (doc?.items && doc.items.length > 0) ? doc.items : (doc?.metadata?.items ?? []);
  const existingReturns = doc.metadata?.returns ?? [];

  // Build a lookup of returnable items from the document
  const docItemsMap = useMemo(() => {
    const map = {};
    items.forEach((item, idx) => {
      const itemId = item.id;
      const productId = item.product_id ?? item.productId;
      const isSerial = item.metadata?.isSerial === true;
      const serialNumber = item.metadata?.serialNumber || '';
      let qtyUnit = item.metadata?.qtyUnit || item.unit || 'pcs';
      const snLower = String(serialNumber).toLowerCase();

      if (isSerial) {
        if (snLower.includes('10bl') || snLower.includes('bal10')) qtyUnit = 'bal10';
        else if (snLower.includes('15bl') || snLower.includes('bal15')) qtyUnit = 'bal15';
        else if (snLower.includes('20bl') || snLower.includes('bal20')) qtyUnit = 'bal20';
        else if (snLower.includes('25bl') || snLower.includes('bal25')) qtyUnit = 'bal25';
        else if (snLower.includes('bal') || snLower.includes('bl')) qtyUnit = 'bal';
        else if (snLower.includes('pack')) qtyUnit = 'pack';
        else if (snLower.includes('lusin') || snLower.includes('lsn')) qtyUnit = 'lusin';
      }

      const qtyInput = isSerial ? 1 : Number(item.metadata?.qtyInput ?? item.quantity ?? 1);

      // Calculate previously returned qty for this item
      const previouslyReturned = existingReturns.reduce((sum, r) => {
        return sum + (r.items ?? [])
          .filter((ri) => {
            if (isSerial) {
              if (ri.isSerial) return String(ri.serialNumber || '').trim().toLowerCase() === serialNumber.trim().toLowerCase();
              return false;
            }
            if (ri.isSerial) return false;
            if (itemId && ri.itemId) return ri.itemId === itemId;
            if (!itemId && !ri.itemId && productId && ri.productId) return ri.productId === productId;
            return false;
          })
          .reduce((s, ri) => s + (ri.returnedQty || 0), 0);
      }, 0);

      const key = isSerial
        ? `serial_${serialNumber || idx}`
        : `item_${itemId || productId || idx}`;

      map[key] = {
        key,
        itemId,
        productId,
        productName: item.item_name || item.itemName || 'Produk Tanpa Nama',
        sku: item.sku || '—',
        isSerial,
        serialNumber,
        qtyUnit,
        originalQty: qtyInput,
        previouslyReturned,
        remainingQty: Math.max(0, qtyInput - previouslyReturned),
      };
    });
    return map;
  }, [items, existingReturns]);

  const returnableItems = useMemo(() => {
    return Object.entries(docItemsMap)
      .filter(([, v]) => v.remainingQty > 0)
      .map(([key, v]) => ({ key, ...v }));
  }, [docItemsMap]);

  // Handle selection toggles
  const isAllSelected = returnableItems.length > 0 && returnableItems.every((it) => !!returnItems[it.key]);
  const isSomeSelected = returnableItems.some((it) => !!returnItems[it.key]) && !isAllSelected;

  const handleToggleItem = (key) => {
    const item = docItemsMap[key];
    if (!item) return;

    setReturnItems((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        if (item.serialNumber) {
          cooldownMapRef.current.delete(String(item.serialNumber).trim().toLowerCase());
        }
      } else {
        next[key] = {
          ...item,
          returnedQty: item.isSerial ? 1 : item.remainingQty,
        };
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (isAllSelected) {
      setReturnItems({});
      cooldownMapRef.current.clear();
    } else {
      const next = {};
      returnableItems.forEach((it) => {
        next[it.key] = {
          ...it,
          returnedQty: it.isSerial ? 1 : it.remainingQty,
        };
      });
      setReturnItems(next);
    }
  };

  const handleSelectAll = () => {
    const next = {};
    returnableItems.forEach((it) => {
      next[it.key] = {
        ...it,
        returnedQty: it.isSerial ? 1 : it.remainingQty,
      };
    });
    setReturnItems(next);
  };

  const handleClearAll = () => {
    setReturnItems({});
    cooldownMapRef.current.clear();
  };

  const handleRemoveItem = (key) => {
    setReturnItems((prev) => {
      const removed = prev[key];
      if (removed?.serialNumber) {
        cooldownMapRef.current.delete(String(removed.serialNumber).trim().toLowerCase());
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleQtyChange = (key, newQty) => {
    const item = docItemsMap[key];
    if (!item) return;
    const clampedQty = Math.max(0, Math.min(newQty, item.remainingQty));
    if (clampedQty === 0) {
      handleRemoveItem(key);
    } else {
      setReturnItems((prev) => ({
        ...prev,
        [key]: { ...item, returnedQty: clampedQty },
      }));
    }
  };

  // Handle QR scan result
  const handleScanResult = useCallback((code) => {
    if (!code) return;
    const cleanCode = code.trim();
    if (!cleanCode) return;
    const cleanCodeLower = cleanCode.toLowerCase();

    // Cooldown: suppress duplicate triggers of the same barcode within 2.5 seconds
    const now = Date.now();
    const lastScan = cooldownMapRef.current.get(cleanCodeLower);
    if (lastScan && now - lastScan < 2500) {
      return;
    }
    cooldownMapRef.current.set(cleanCodeLower, now);

    // Try to match against document items
    const matchedEntry = returnableItems.find((item) => {
      if (item.isSerial) {
        return String(item.serialNumber).trim().toLowerCase() === cleanCodeLower;
      }
      // For non-serial, match by SKU
      return String(item.sku || '').trim().toLowerCase() === cleanCodeLower;
    });

    if (!matchedEntry) {
      playBeep('error');
      setScanFeedback({
        type: 'error',
        message: `QR Code / SKU "${cleanCode}" tidak ditemukan dalam Surat Jalan ini`,
      });
      return;
    }

    const key = matchedEntry.key;
    const existing = returnItems[key];

    // For serial items, check if already added
    if (matchedEntry.isSerial) {
      if (existing) {
        playBeep('warning');
        setScanFeedback({
          type: 'warning',
          message: `⚠️ Nomor seri "${cleanCode}" SUDAH dipilih untuk return!`,
        });
        return;
      }
      setReturnItems((prev) => ({
        ...prev,
        [key]: { ...matchedEntry, returnedQty: 1 },
      }));
      playBeep('success');
      setScanFeedback({
        type: 'success',
        message: `✓ Serial ${matchedEntry.serialNumber} (${matchedEntry.productName}) dipilih`,
      });
      return;
    }

    // For non-serial items
    const currentQty = existing?.returnedQty || 0;
    if (currentQty >= matchedEntry.remainingQty) {
      playBeep('error');
      setScanFeedback({
        type: 'error',
        message: `Qty return untuk "${matchedEntry.productName}" sudah maksimal (${matchedEntry.remainingQty} ${matchedEntry.qtyUnit})`,
      });
      return;
    }

    const nextQty = currentQty + 1;
    setReturnItems((prev) => ({
      ...prev,
      [key]: { ...matchedEntry, returnedQty: nextQty },
    }));
    playBeep('success');
    setScanFeedback({
      type: 'success',
      message: `${matchedEntry.productName} — return: ${nextQty} ${matchedEntry.qtyUnit}`,
    });
  }, [returnableItems, returnItems]);

  // Keep ref in sync
  useEffect(() => {
    scanCallbackRef.current = handleScanResult;
  }, [handleScanResult]);

  useEffect(() => {
    if (scannerOpen) setScanFeedback(null);
  }, [scannerOpen]);

  const handleScannerError = useCallback(
    (message) => setScanFeedback({ type: 'error', message }),
    []
  );

  const { cameraActive, frameHit } = useCameraScanner({
    elementId: 'go-return-scanner-reader',
    active: scannerOpen,
    fps: 12,
    onDecode: (text) => scanCallbackRef.current?.(text),
    onError: handleScannerError,
  });

  const handleOpenScanner = () => {
    cooldownMapRef.current.clear();
    setScannerOpen(true);
  };

  const handleManualAdd = (e) => {
    if (e) e.preventDefault();
    if (!manualInput.trim()) return;
    handleScanResult(manualInput.trim());
    setManualInput('');
  };

  const selectedItems = Object.entries(returnItems);
  const serialCount = selectedItems.filter(([, it]) => it.isSerial).length;
  const nonSerialCount = selectedItems.filter(([, it]) => !it.isSerial).length;
  const canSubmit = reason && selectedItems.length > 0 && (reason !== 'lainnya' || notes.trim().length >= 3);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const targetStatus = returnToAvailable ? 'available' : 'damaged';
      const payload = {
        reason,
        notes: notes.trim() || null,
        targetStatus,
        markAsDamaged: !returnToAvailable,
        items: selectedItems.map(([, item]) => ({
          productId: item.productId || null,
          itemId: item.itemId || null,
          isSerial: item.isSerial,
          serialNumber: item.serialNumber || null,
          returnedQty: item.returnedQty,
          qtyUnit: item.qtyUnit,
          targetStatus,
        })),
      };

      const res = await api.post(`/api/workspace/documents/${doc.id}/return`, payload);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || errJson?.message || 'Gagal memproses return');
      }

      const json = await res.json();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['goods-out'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['product-serials'] }),
        queryClient.invalidateQueries({ queryKey: ['product-serial-index'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-documents'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      onSuccess?.(json.data);
    } catch (err) {
      setError(err.message || 'Gagal memproses return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="go-return-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="go-return-title"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="go-return-modal">
        {/* Header */}
        <div className="go-return__header">
          <div className="go-return__header-icon">
            <RotateCcw size={18} />
          </div>
          <div className="go-return__header-text">
            <h2 id="go-return-title" className="go-return__title">
              Return Barang Keluar
            </h2>
            <p className="go-return__ref">{doc.document_number}</p>
          </div>
          <button
            type="button"
            className="go-return__close-btn"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="go-return__body">
          {/* Step 1: Reason */}
          <fieldset className="go-return__reasons">
            <legend className="go-return__reasons-label">
              1. Pilih Alasan Return
            </legend>
            <div className="go-return__reason-options">
              {RETURN_REASONS.map((r) => (
                <label
                  key={r.key}
                  className={`go-return__reason-option${reason === r.key ? ' go-return__reason-option--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="return-reason"
                    value={r.key}
                    checked={reason === r.key}
                    onChange={() => setReason(r.key)}
                    className="go-return__reason-radio"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>

            {reason === 'lainnya' && (
              <div className="go-return__note-wrap">
                <label className="go-return__note-label">Jelaskan alasan return</label>
                <textarea
                  className="input go-return__note"
                  placeholder="Contoh: customer ingin tukar dengan produk lain..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  autoFocus
                />
              </div>
            )}

            {/* Target Status Option */}
            <div style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--color-bg-subtle, #f8fafc)', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #1e293b)' }}>
                  Kembalikan Stok & Nomor Seri ke Sistem
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #64748b)' }}>
                  {returnToAvailable 
                    ? 'Stok dan nomor seri akan kembali aktif (Available) di sistem sehingga langsung dapat discan dan dikeluarkan lagi.'
                    : 'Nomor seri akan ditandai rusak (Damaged) dan kuantitas tidak dimasukkan ke stok aktif.'}
                </div>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '6px', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={returnToAvailable}
                  onChange={(e) => setReturnToAvailable(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', fontWeight: 600, color: returnToAvailable ? 'var(--color-success, #16a34a)' : 'var(--color-danger, #dc2626)' }}>
                  {returnToAvailable ? 'Tersedia' : 'Rusak'}
                </span>
              </label>
            </div>
          </fieldset>

          {/* Step 2: Scan / Pick Items */}
          <div className="go-return__scan-section">
            <div className="go-return__scan-header">
              <h4 className="go-return__scan-title">
                2. Pilih Item / Scan QR yang Di-Return
                {selectedItems.length > 0 && (
                  <span className="go-return__scan-badge">
                    {selectedItems.length} item dipilih
                  </span>
                )}
              </h4>
              <button
                type="button"
                className="go-return__scan-btn"
                onClick={handleOpenScanner}
              >
                <Camera size={14} />
                <span>Scan QR</span>
              </button>
            </div>

            {/* Manual Input */}
            <form onSubmit={handleManualAdd} className="go-return__manual-form">
              <input
                type="text"
                className="input go-return__manual-input"
                placeholder="Ketik serial number / SKU manual..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary go-return__manual-btn">
                Tambah
              </button>
            </form>

            {/* Selection Toolbar (Select All / Clear All) */}
            {returnableItems.length > 0 && (
              <div className="go-return__selection-toolbar">
                <div className="go-return__toolbar-info">
                  Total sisa kirim: <strong>{returnableItems.length} baris</strong>
                  {selectedItems.length > 0 && (
                    <span> • Terpilih: <strong>{selectedItems.length} item</strong> ({serialCount > 0 ? `${serialCount} serial` : ''}{serialCount > 0 && nonSerialCount > 0 ? ', ' : ''}{nonSerialCount > 0 ? `${nonSerialCount} non-seri` : ''})</span>
                  )}
                </div>
                <div className="go-return__toolbar-actions">
                  <button
                    type="button"
                    className="go-return__toolbar-btn"
                    onClick={handleSelectAll}
                    disabled={isAllSelected}
                  >
                    Pilih Semua ({returnableItems.length})
                  </button>
                  <button
                    type="button"
                    className="go-return__toolbar-btn"
                    onClick={handleClearAll}
                    disabled={selectedItems.length === 0}
                  >
                    Kosongkan
                  </button>
                </div>
              </div>
            )}

            {/* Returnable Items Table (Desktop) */}
            {returnableItems.length > 0 ? (
              <>
                <div className="go-return__items-desktop">
                  <table className="go-return__items-table">
                    <thead>
                      <tr>
                        <th style={{ width: '44px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            className="go-return__check"
                            checked={isAllSelected}
                            ref={(el) => { if (el) el.indeterminate = isSomeSelected; }}
                            onChange={handleToggleAll}
                            title="Pilih Semua / Batal Semua"
                          />
                        </th>
                        <th style={{ width: '28%' }}>Produk</th>
                        <th style={{ width: '14%' }}>SKU</th>
                        <th style={{ width: '12%' }}>Jenis</th>
                        <th style={{ width: '18%' }}>Serial / QR</th>
                        <th style={{ width: '10%', textAlign: 'right' }}>Sisa Kirim</th>
                        <th style={{ width: '18%', textAlign: 'right' }}>Qty Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnableItems.map((item) => {
                        const isSelected = !!returnItems[item.key];
                        const currentQty = returnItems[item.key]?.returnedQty || 0;
                        return (
                          <tr
                            key={item.key}
                            className={isSelected ? 'go-return__item--selected' : ''}
                            onClick={(e) => {
                              if (e.target.tagName === 'INPUT') return;
                              handleToggleItem(item.key);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="go-return__td-check" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="go-return__check"
                                checked={isSelected}
                                onChange={() => handleToggleItem(item.key)}
                              />
                            </td>
                            <td className="go-return__td-product">
                              <span style={{ fontWeight: 600 }}>{item.productName}</span>
                            </td>
                            <td>{item.sku || '—'}</td>
                            <td>
                              <span className={`chip chip-sm ${item.isSerial ? 'chip-success' : ''}`}>
                                {item.isSerial ? 'Serial' : 'Normal'}
                              </span>
                            </td>
                            <td className="go-return__td-serial">
                              {item.isSerial ? (
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                  {item.serialNumber}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                              )}
                            </td>
                            <td className="go-return__td-qty">
                              {item.remainingQty} {item.qtyUnit}
                            </td>
                            <td className="go-return__td-return-qty" onClick={(e) => e.stopPropagation()}>
                              {item.isSerial ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                  {isSelected ? (
                                    <span className="chip chip-sm chip-success" style={{ fontWeight: 700 }}>
                                      1 {item.qtyUnit}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                      (Belum dipilih)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                  <input
                                    type="number"
                                    className="go-return__qty-input"
                                    min={0}
                                    max={item.remainingQty}
                                    value={currentQty}
                                    placeholder="0"
                                    onChange={(e) => handleQtyChange(item.key, parseInt(e.target.value) || 0)}
                                  />
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                    {item.qtyUnit}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="go-return__items-mobile">
                  {returnableItems.map((item) => {
                    const isSelected = !!returnItems[item.key];
                    const currentQty = returnItems[item.key]?.returnedQty || 0;
                    return (
                      <div
                        key={item.key}
                        className={`go-return__item-card${isSelected ? ' go-return__item-card--selected' : ''}`}
                        onClick={() => handleToggleItem(item.key)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="go-return__item-card-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="checkbox"
                              className="go-return__check"
                              checked={isSelected}
                              onChange={() => handleToggleItem(item.key)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="go-return__item-card-name">{item.productName}</span>
                          </div>
                          <span className={`chip chip-sm ${item.isSerial ? 'chip-success' : ''}`}>
                            {item.isSerial ? 'Serial' : 'Normal'}
                          </span>
                        </div>
                        <div className="go-return__item-card-grid">
                          <div>
                            <div className="go-return__item-card-label">SKU</div>
                            <div>{item.sku || '—'}</div>
                          </div>
                          <div>
                            <div className="go-return__item-card-label">Sisa Qty</div>
                            <div><strong>{item.remainingQty}</strong> {item.qtyUnit}</div>
                          </div>
                          {item.isSerial && (
                            <div>
                              <div className="go-return__item-card-label">Serial</div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>{item.serialNumber}</div>
                            </div>
                          )}
                          <div onClick={(e) => e.stopPropagation()}>
                            <div className="go-return__item-card-label">Qty Return</div>
                            {item.isSerial ? (
                              <div style={{ fontWeight: 600, color: isSelected ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                                {isSelected ? `1 ${item.qtyUnit}` : 'Belum dipilih'}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  type="number"
                                  className="go-return__qty-input"
                                  min={0}
                                  max={item.remainingQty}
                                  value={currentQty}
                                  onChange={(e) => handleQtyChange(item.key, parseInt(e.target.value) || 0)}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                  {item.qtyUnit}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="go-return__empty">
                <Barcode size={32} className="go-return__empty-icon" />
                <p>Semua item sudah di-return sebelumnya.</p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="go-return__error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="go-return__footer">
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            {selectedItems.length > 0 ? (
              <span>
                Dipilih: <strong>{serialCount > 0 ? `${serialCount} serial` : ''}{serialCount > 0 && nonSerialCount > 0 ? ', ' : ''}{nonSerialCount > 0 ? `${nonSerialCount} non-seri` : ''}</strong> ({selectedItems.length} item)
              </span>
            ) : (
              <span>Pilih minimal 1 item untuk return</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={onClose}
            disabled={submitting}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              'Memproses...'
            ) : (
              <>
                <RotateCcw size={14} />
                <span>Simpan Return ({selectedItems.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Scanner Overlay */}
      {scannerOpen && (
        <div className="go-scanner-overlay" onClick={() => setScannerOpen(false)}>
          <div className="go-scanner-container" onClick={(e) => e.stopPropagation()}>
            <div className="go-scanner-header">
              <div>
                <h3 className="go-scanner-title">Scan QR Return</h3>
                <p className="go-scanner-subtitle">Arahkan kamera ke QR Code / Barcode barang yang dikembalikan</p>
              </div>
              <button
                type="button"
                className="go-scanner-close"
                onClick={() => setScannerOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="go-scanner-body">
              <div className="go-scanner-col">
                <div className={`go-scanner-camera-wrapper${frameHit ? ' is-hit' : ''}`}>
                  <div id="go-return-scanner-reader" className="go-scanner-reader"></div>
                  <div className="go-scanner-frame" key={frameHit} aria-hidden="true"></div>
                  {!cameraActive && (!scanFeedback || scanFeedback.type !== 'error') && (
                    <div className="go-scanner-camera-placeholder">
                      <span className="go-scanner-spinner"></span>
                      <p className="go-scanner-placeholder-text">Mengaktifkan kamera...</p>
                    </div>
                  )}
                </div>

                {scanFeedback && (
                  <div className={`go-scanner-feedback go-scanner-feedback--${scanFeedback.type}`}>
                    {scanFeedback.type === 'success' ? (
                      <Check size={14} className="go-scanner-feedback-icon" />
                    ) : scanFeedback.type === 'warning' ? (
                      <AlertTriangle size={14} className="go-scanner-feedback-icon" />
                    ) : (
                      <AlertCircle size={14} className="go-scanner-feedback-icon" />
                    )}
                    <span>{scanFeedback.message}</span>
                  </div>
                )}

                {/* Manual Input in Scanner */}
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!manualInput.trim()) return;
                  handleScanResult(manualInput.trim());
                  setManualInput('');
                }} className="go-scanner-manual-input-form">
                  <input
                    type="text"
                    className="input go-scanner-manual-input"
                    placeholder="Ketik serial / SKU manual..."
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                  />
                  <button type="submit" className="btn btn-secondary go-scanner-manual-btn">
                    Tambah
                  </button>
                </form>
              </div>

              <div className="go-scanner-col go-scanner-col--results">
                <div className="go-scanner-list-section">
                  <h5 className="go-scanner-list-title">
                    <span>Daftar Return</span>
                    <span className="go-scanner-list-badge">{selectedItems.length} item</span>
                  </h5>

                  {selectedItems.length === 0 ? (
                    <div className="go-scanner-empty">
                      <Barcode size={32} className="go-scanner-empty-icon" />
                      <p>Belum ada item yang dipindai.</p>
                    </div>
                  ) : (
                    <div className="go-scanner-scanned-items">
                      {selectedItems.map(([key, item]) => (
                        <div key={key} className="go-scanner-scanned-item">
                          <div className="go-scanner-scanned-info">
                            <span className="go-scanner-scanned-sn">
                              {item.isSerial ? item.serialNumber : `${item.productName} × ${item.returnedQty}`}
                            </span>
                            <span className="go-scanner-scanned-product">
                              {item.productName} <small>({item.sku})</small>
                            </span>
                          </div>
                          <button
                            type="button"
                            className="go-scanner-scanned-remove"
                            onClick={() => handleRemoveItem(key)}
                            title="Hapus"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="go-scanner-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setScannerOpen(false)}
              >
                Tutup Scanner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
