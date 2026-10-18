import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  AlertTriangle,
  AlertCircle,
  Pencil,
  Package,
  Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './GoodsInCreateModal.css';

export default function GoodsInReviewModal({ doc, onClose, onComplete, onCancel, onEdit }) {
  const { t } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSearch, setConfirmSearch] = useState('');

  if (!doc) return null;

  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post(`/api/workspace/documents/${doc.id}/complete`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || t('goodsIn.review.completeFailed'));
      }
      const json = await res.json();
      onComplete?.(json.data ?? { ...doc, status: 'completed' });
    } catch (err) {
      setError(err.message || t('goodsIn.review.completeFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const items = doc.items ?? [];

  const multipliers = {
    pcs: 1,
    piece: 1,
    lusin: 12,
    dozen: 12,
    pack: 60,
    bal10: 120, // 10 Lusin
    bal15: 180, // 15 Lusin
    bal20: 240, // 20 Lusin
    bal25: 300, // 25 Lusin
    bal: 300,   // Fallback & Legacy compatibility
  };

  const totalPcs = useMemo(() => {
    return items.reduce((sum, item) => {
      const unit = (item.metadata?.qtyUnit || 'pcs').toLowerCase();
      const qty = Number(item.metadata?.qtyInput ?? item.quantity ?? 0);
      const mult = multipliers[unit] ?? 1;
      return sum + (qty * mult);
    }, 0);
  }, [items]);

  const filteredConfirmItems = useMemo(() => {
    if (!confirmSearch.trim()) return items;
    const q = confirmSearch.toLowerCase();
    return items.filter(
      (item) =>
        (item.item_name && item.item_name.toLowerCase().includes(q)) ||
        (item.sku && item.sku.toLowerCase().includes(q))
    );
  }, [items, confirmSearch]);

  return (
    <div className="gi-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gi-modal-title">
      <section className="gi-modal">
        {/* Header */}
        <div className="gi-modal__header">
          <div>
            <h2 id="gi-modal-title" className="gi-modal__title">
              {t('goodsIn.review.title')}
            </h2>
            <p className="gi-modal__subtitle">
              {t('goodsIn.review.subtitle')}
            </p>
          </div>
          <button type="button" className="gi-modal__close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="gi-modal__body">
          {/* Transaction details (Read-only) */}
          <div className="gi-modal__info-card">
            <h4 className="gi-modal__info-title">{t('goodsIn.modal.transactionDetails')}</h4>
            <div className="gi-modal__info-grid">
              <div className="gi-modal__field">
                <label className="gi-modal__field-label">{t('goodsIn.modal.reference')}</label>
                <input type="text" className="input" value={doc.document_number} disabled readOnly />
              </div>
              <div className="gi-modal__field">
                <label className="gi-modal__field-label">{t('goodsIn.modal.source')}</label>
                <input type="text" className="input" value={doc.contact_name || '—'} disabled readOnly />
              </div>
              <div className="gi-modal__field">
                <label className="gi-modal__field-label">{t('goodsIn.modal.date')}</label>
                <input
                  type="date"
                  className="input"
                  value={doc.issue_date ? doc.issue_date.slice(0, 10) : ''}
                  disabled
                  readOnly
                />
              </div>
            </div>
            <div className="gi-modal__field gi-modal__field--full" style={{ marginTop: 'var(--space-4)' }}>
              <label className="gi-modal__field-label">{t('goodsIn.modal.notes')}</label>
              <textarea className="input gi-modal__notes" value={doc.notes || '—'} disabled readOnly />
            </div>
          </div>

          {/* Worksheet (Read-only table/cards list) */}
          <div className="gi-modal__worksheet">
            <div className="gi-modal__items-header">
              <h4 className="gi-modal__items-title">{t('goodsIn.modal.items')}</h4>
            </div>

            {/* Desktop table */}
            <div className="gi-modal__table-desktop">
              <div className="gi-modal__table-wrapper">
                <table className="gi-modal__table">
                  <colgroup>
                    <col style={{ width: '55%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t('goodsIn.modal.productNameCol')}</th>
                      <th>{t('goodsIn.modal.skuCol')}</th>
                      <th>{t('goodsIn.modal.qtyCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const unit = item.metadata?.qtyUnit || 'pcs';
                      const qty = item.metadata?.qtyInput ?? item.quantity ?? 1;
                      return (
                        <tr key={item.id ?? idx}>
                          <td className="gi-modal__table td">{item.item_name}</td>
                          <td className="gi-modal__table td">
                            <span
                              className="gi-line-item__sku-disabled"
                              style={{
                                display: 'inline-block',
                                padding: 'var(--space-1) var(--space-2)',
                                borderRadius: 'var(--radius-md)',
                              }}
                            >
                              {item.sku || '—'}
                            </span>
                          </td>
                          <td className="gi-modal__table td">
                            <strong>{qty}</strong> {unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="gi-modal__cards-mobile">
              {items.map((item, idx) => {
                const unit = item.metadata?.qtyUnit || 'pcs';
                const qty = item.metadata?.qtyInput ?? item.quantity ?? 1;
                return (
                  <div key={item.id ?? idx} className="gi-line-item-card">
                    <div className="gi-line-item-card__field">
                      <label className="gi-line-item-card__label">{t('goodsIn.line.product')}</label>
                      <div style={{ fontWeight: '500' }}>{item.item_name}</div>
                    </div>
                    <div className="gi-line-item-card__field">
                      <label className="gi-line-item-card__label">{t('goodsIn.line.sku')}</label>
                      <div
                        className="gi-line-item__sku-disabled"
                        style={{
                          padding: 'var(--space-1) var(--space-2)',
                          borderRadius: 'var(--radius-md)',
                          display: 'inline-block',
                          width: 'fit-content',
                        }}
                      >
                        {item.sku || '—'}
                      </div>
                    </div>
                    <div className="gi-line-item-card__field">
                      <label className="gi-line-item-card__label">{t('goodsIn.modal.qtyCol')}</label>
                      <div>
                        <strong>{qty}</strong> {unit}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="gi-modal__error" style={{ marginTop: 'var(--space-4)' }}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer actions: Cancel, Back/Close, Complete */}
        <div className="gi-modal__footer">
          <button
            type="button"
            className="btn btn-danger btn-md interactive"
            onClick={() => onCancel(doc)}
            style={{ marginRight: 'auto' }}
          >
            <AlertTriangle size={15} style={{ marginRight: '4px' }} />
            {t('goodsIn.action.cancel')}
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-md interactive"
            onClick={() => onEdit?.(doc)}
          >
            <Pencil size={14} style={{ marginRight: '4px' }} />
            {t('goodsIn.action.edit')}
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-md interactive"
            onClick={onClose}
          >
            {t('goodsIn.detail.close')}
          </button>

          <button
            type="button"
            className="btn btn-primary btn-md interactive"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
          >
            {submitting ? '...' : (
              <>
                <Check size={16} />
                <span>{t('goodsIn.action.complete')}</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Confirm Complete — per-product confirmation popup */}
      {confirmOpen && (
        <div className="gi-modal-overlay gi-review-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="gi-review-confirm-title">
          <section className="gi-modal gi-review-confirm-modal">
            <div className="gi-modal__header">
              <div>
                <h2 id="gi-review-confirm-title" className="gi-modal__title">
                  {t('goodsIn.review.confirmTitle')}
                </h2>
                <p className="gi-modal__subtitle">
                  {t('goodsIn.review.confirmSubtitle')}
                </p>
              </div>
              <button
                type="button"
                className="gi-modal__close-btn"
                onClick={() => !submitting && setConfirmOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="gi-modal__body gi-review-confirm__body">
              {/* Quick Search Toolbar & Stats */}
              <div className="gi-review-confirm__toolbar">
                <div className="gi-review-confirm__search-wrap">
                  <Search size={15} className="gi-review-confirm__search-icon" />
                  <input
                    type="text"
                    className="input gi-review-confirm__search-input"
                    placeholder={t('goodsIn.review.searchPlaceholder')}
                    value={confirmSearch}
                    onChange={(e) => setConfirmSearch(e.target.value)}
                  />
                  {confirmSearch && (
                    <button
                      type="button"
                      className="gi-review-confirm__search-clear"
                      onClick={() => setConfirmSearch('')}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="gi-review-confirm__counter">
                  {filteredConfirmItems.length} {t('goodsIn.review.totalItemsUnit')}
                  {confirmSearch && ` (difilter dari ${items.length})`}
                </div>
              </div>

              {/* Table Container */}
              <div className="gi-review-confirm__table-wrapper">
                <table className="gi-review-confirm__table">
                  <colgroup>
                    <col style={{ width: '56px' }} />
                    <col style={{ width: 'auto' }} />
                    <col style={{ width: '190px' }} />
                    <col style={{ width: '130px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="gi-th--center">{t('goodsIn.review.colNo')}</th>
                      <th>{t('goodsIn.review.colProduct')}</th>
                      <th>{t('goodsIn.review.colSku')}</th>
                      <th className="gi-th--right">{t('goodsIn.review.colQty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConfirmItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="gi-review-confirm__empty">
                          {t('goodsIn.review.noMatch')}
                        </td>
                      </tr>
                    ) : (
                      filteredConfirmItems.map((item, idx) => {
                        const unit = item.metadata?.qtyUnit || 'pcs';
                        const qty = item.metadata?.qtyInput ?? item.quantity ?? 1;
                        return (
                          <tr key={item.id ?? idx}>
                            <td className="gi-review-confirm__td-no">
                              <span className="gi-review-confirm__no-badge">
                                {idx + 1}
                              </span>
                            </td>
                            <td className="gi-review-confirm__td-name">
                              <div className="gi-review-confirm__product-info">
                                <Package size={15} className="gi-review-confirm__icon" />
                                <span className="gi-review-confirm__item-title">{item.item_name}</span>
                              </div>
                            </td>
                            <td className="gi-review-confirm__td-sku">
                              <span className="gi-review-confirm__sku-badge">
                                {item.sku || '—'}
                              </span>
                            </td>
                            <td className="gi-review-confirm__td-qty">
                              <span className="gi-review-confirm__qty-badge">
                                <strong>{qty}</strong> {unit}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary Footer Cards */}
              <div className="gi-review-confirm__summary-card">
                <div className="gi-review-confirm__summary-stat">
                  <span className="gi-review-confirm__stat-label">{t('goodsIn.review.totalItems')}:</span>
                  <strong className="gi-review-confirm__stat-val">
                    {items.length} <span className="gi-review-confirm__stat-sub">{t('goodsIn.review.totalItemsUnit')}</span>
                  </strong>
                </div>
                <div className="gi-review-confirm__summary-divider" />
                <div className="gi-review-confirm__summary-stat">
                  <span className="gi-review-confirm__stat-label">{t('goodsIn.review.totalQty')}:</span>
                  <strong className="gi-review-confirm__stat-val gi-review-confirm__stat-val--primary">
                    {totalPcs} <span className="gi-review-confirm__stat-sub">pcs</span>
                  </strong>
                </div>
              </div>

              {error && (
                <div className="gi-modal__error" style={{ marginTop: 'var(--space-4)' }}>
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="gi-modal__footer">
              <button
                type="button"
                className="btn btn-secondary btn-md interactive"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                {t('goodsIn.action.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-md interactive"
                onClick={handleComplete}
                disabled={submitting}
              >
                {submitting ? '...' : (
                  <>
                    <Check size={16} />
                    <span>{t('goodsIn.review.confirmComplete')}</span>
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
