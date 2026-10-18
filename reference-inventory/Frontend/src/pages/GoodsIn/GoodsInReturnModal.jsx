import React, { useState, useMemo } from 'react';
import { X, RotateCcw, AlertCircle, Layers } from 'lucide-react';
import { api } from '../../utils/api.js';
import './GoodsInReturnModal.css';

const RETURN_REASONS = [
  { key: 'cacat_supplier', label: 'Cacat / Rusak Supplier', desc: 'Barang diterima dalam kondisi cacat atau rusak' },
  { key: 'salah_kirim', label: 'Salah Kirim Supplier', desc: 'Produk / varian tidak sesuai pesanan ke supplier' },
  { key: 'batal_masuk', label: 'Batal Masuk Gudang', desc: 'Penerimaan barang dibatalkan' },
  { key: 'lainnya', label: 'Lainnya', desc: 'Alasan lain (wajib isi catatan)' },
];

export default function GoodsInReturnModal({ doc, targetItem, targetItems, onClose, onSuccess }) {
  const [reason, setReason] = useState('cacat_supplier');
  const [notes, setNotes] = useState('');
  const [returnQty, setReturnQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Normalize to items list
  const itemsList = useMemo(() => {
    if (Array.isArray(targetItems) && targetItems.length > 0) {
      return targetItems;
    }
    if (targetItem) {
      return [targetItem];
    }
    return [];
  }, [targetItem, targetItems]);

  if (!doc || itemsList.length === 0) return null;

  const isBulk = itemsList.length > 1;
  const singleItem = itemsList[0];
  const isSingleSerial = !isBulk && singleItem.isSerial === true;
  const singleMaxQty = singleItem?.maxQty || 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) {
      setError('Pilih alasan retur terlebih dahulu');
      return;
    }
    if (reason === 'lainnya' && notes.trim().length < 3) {
      setError('Catatan wajib diisi minimal 3 karakter saat memilih alasan Lainnya');
      return;
    }

    if (!isBulk && !isSingleSerial && (returnQty < 1 || returnQty > singleMaxQty)) {
      setError(`Jumlah retur harus antara 1 dan ${singleMaxQty} ${singleItem.qtyUnit}`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const itemsPayload = itemsList.map((it) => ({
        productId: it.productId || null,
        itemId: it.itemId || null,
        isSerial: it.isSerial === true,
        serialNumber: it.isSerial ? String(it.serialNumber).trim() : null,
        returnedQty: isBulk ? (it.isSerial ? 1 : Number(it.qty || 1)) : (it.isSerial ? 1 : Number(returnQty)),
        qtyUnit: it.qtyUnit || 'pcs',
      }));

      const payload = {
        reason,
        notes: notes.trim() || null,
        items: itemsPayload,
      };

      const res = await api.post(`/api/workspace/documents/${doc.id}/return`, payload);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || errJson?.message || (typeof errJson?.error === 'string' ? errJson.error : null) || 'Gagal memproses retur barang';
        throw new Error(errMsg);
      }

      const json = await res.json();
      onSuccess?.(json.data);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal memproses retur barang');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="gi-return-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gi-return-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="gi-return-modal">
        {/* Header */}
        <div className="gi-return-modal__header">
          <div className="gi-return-modal__title-group">
            <div className="gi-return-modal__icon-wrap">
              {isBulk ? <Layers size={18} /> : <RotateCcw size={18} />}
            </div>
            <div>
              <h3 id="gi-return-title" className="gi-return-modal__title">
                {isBulk
                  ? `Hapus / Return (${itemsList.length}) Barang Terpilih`
                  : isSingleSerial
                  ? 'Hapus / Return Serial Number'
                  : 'Hapus / Return Barang Masuk'}
              </h3>
              <span className="gi-return-modal__subtitle">
                Dokumen: {doc.document_number}
              </span>
            </div>
          </div>
          <button type="button" className="gi-return-modal__close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="gi-return-modal__body">
          {/* Target Item Card / Bulk Summary */}
          {isBulk ? (
            <div className="gi-return-modal__item-card">
              <div className="gi-return-modal__item-header">
                <span className="gi-return-modal__item-name">
                  {itemsList.length} Barang & Serial Number Terpilih
                </span>
              </div>
              <div className="gi-return-modal__bulk-list" style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {itemsList.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                    <span style={{ fontWeight: 500 }}>{it.productName}</span>
                    {it.isSerial ? (
                      <span className="gi-return-modal__serial-badge" style={{ fontSize: '11px' }}>{it.serialNumber}</span>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{it.qty || 1} {it.qtyUnit}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="gi-return-modal__item-card">
              <div className="gi-return-modal__item-header">
                <span className="gi-return-modal__item-name">{singleItem.productName}</span>
                <span className="gi-return-modal__item-sku">{singleItem.sku || '—'}</span>
              </div>
              <div className="gi-return-modal__item-grid">
                {isSingleSerial ? (
                  <div className="gi-return-modal__item-field">
                    <span className="gi-return-modal__field-label">Nomor Serial</span>
                    <div className="gi-return-modal__serial-badge">{singleItem.serialNumber}</div>
                  </div>
                ) : (
                  <div className="gi-return-modal__item-field">
                    <span className="gi-return-modal__field-label">Tersedia untuk Dihapus/Retur</span>
                    <span className="gi-return-modal__field-value">
                      <strong>{singleMaxQty}</strong> {singleItem.qtyUnit}
                    </span>
                  </div>
                )}
                <div className="gi-return-modal__item-field">
                  <span className="gi-return-modal__field-label">Satuan</span>
                  <span className="gi-return-modal__field-value">{singleItem.qtyUnit}</span>
                </div>
              </div>
            </div>
          )}

          {/* Stock Impact Confirmation Notice */}
          <div className="gi-return-modal__notice" style={{
            background: 'var(--color-warning-surface, #fffbeb)',
            border: '1px solid rgba(217, 119, 6, 0.3)',
            borderRadius: '6px',
            padding: '10px 12px',
            fontSize: '12px',
            color: 'var(--color-text-primary, #1e293b)',
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <AlertCircle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: '#92400e', display: 'block', marginBottom: '2px' }}>
                Konfirmasi Dampak Stok Gudang
              </strong>
              <span>
                {isBulk
                  ? `Melakukan return akan mengurangi stok gudang untuk ${itemsList.length} barang/serial terpilih dan mencatatnya dalam riwayat retur tanpa menghapus dokumen penerimaan ini.`
                  : isSingleSerial
                  ? `Melakukan return akan membatalkan nomor seri ${singleItem.serialNumber} dari penerimaan ini dan mengurangi stok produk terkait di gudang.`
                  : `Melakukan return sebanyak ${returnQty} ${singleItem.qtyUnit} akan langsung mengurangi stok produk terkait di gudang.`
                }
              </span>
            </div>
          </div>

          {/* Qty to Return (only for non-serial single mode) */}
          {!isBulk && !isSingleSerial && (
            <div className="gi-return-modal__field">
              <label className="gi-return-modal__label">
                Jumlah Dihapus / Diretur ({singleItem.qtyUnit}) <span className="gi-return-modal__required">*</span>
              </label>
              <div className="gi-return-modal__qty-input-wrap">
                <input
                  type="number"
                  min="1"
                  max={singleMaxQty}
                  className="input gi-return-modal__qty-input"
                  value={returnQty}
                  onChange={(e) => setReturnQty(Math.max(1, Math.min(singleMaxQty, Number(e.target.value) || 1)))}
                />
                <span className="gi-return-modal__qty-unit">{singleItem.qtyUnit}</span>
              </div>
            </div>
          )}

          {/* Reason Selection */}
          <div className="gi-return-modal__field">
            <label className="gi-return-modal__label">
              Alasan Penghapusan / Retur <span className="gi-return-modal__required">*</span>
            </label>
            <div className="gi-return-modal__reasons-list">
              {RETURN_REASONS.map((r) => (
                <label
                  key={r.key}
                  className={`gi-return-modal__reason-option ${reason === r.key ? 'gi-return-modal__reason-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="return_reason"
                    value={r.key}
                    checked={reason === r.key}
                    onChange={() => setReason(r.key)}
                  />
                  <div>
                    <div className="gi-return-modal__reason-title">{r.label}</div>
                    <div className="gi-return-modal__reason-desc">{r.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="gi-return-modal__field">
            <label className="gi-return-modal__label">
              Catatan {reason === 'lainnya' && <span className="gi-return-modal__required">*</span>}
            </label>
            <textarea
              className="input gi-return-modal__textarea"
              placeholder={reason === 'lainnya' ? 'Tuliskan alasan retur/penghapusan secara rinci...' : 'Catatan tambahan (opsional)...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="gi-return-modal__error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Footer actions */}
          <div className="gi-return-modal__footer">
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={onClose}
              disabled={submitting}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-danger btn-md"
              disabled={submitting}
            >
              {submitting
                ? 'Memproses...'
                : isBulk
                ? `Hapus (${itemsList.length}) Barang & Kurangi Stok`
                : isSingleSerial
                ? 'Hapus Serial & Kurangi Stok'
                : 'Hapus Barang & Kurangi Stok'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
