import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import './HistoryModal.css';

/**
 * Props:
 *   isOpen    - boolean
 *   onClose   - function
 *   type      - 'goods_in' | 'goods_out'
 *   product   - product object
 *   documents - array of documents from react-query
 *   serials   - array of serials from react-query
 */
export default function HistoryModal({ isOpen, onClose, type, product, documents, serials }) {
  const { t, userLanguage } = useApp();

  const title = type === 'goods_in' 
    ? t('productDetail.goodsInHistory')
    : t('productDetail.goodsOutHistory');

  // Map and filter matching document items
  const historyList = useMemo(() => {
    if (!product || !documents) return [];

    const list = [];
    documents.forEach((doc) => {
      // Check document type matching ('goods_in' or 'goods_out')
      if (doc.document_type !== type) return;

      // Find items in this document matching this product
      const matchingItems = (doc.items ?? []).filter(
        (item) =>
          item.product_id === product.id ||
          item.productId === product.id ||
          item.sku?.toLowerCase() === product.sku?.toLowerCase()
      );

      if (matchingItems.length === 0) return;

      matchingItems.forEach((item) => {
        // Find serials associated with this document & product
        const associatedSerials = (serials ?? []).filter((s) => {
          const docId = type === 'goods_in' 
            ? s.goods_in_document_id ?? s.goodsInDocumentId 
            : s.goods_out_document_id ?? s.goodsOutDocumentId;
          return docId === doc.id && (s.product_id ?? s.productId) === product.id;
        }).map((s) => s.serial_number ?? s.serialNumber);

        // Find serials from item.metadata
        const metadataSerials = [];
        if (item.metadata) {
          const singleSn = item.metadata.serialNumber || item.metadata.serial_number;
          if (singleSn) {
            metadataSerials.push(singleSn);
          }
          const multipleSn = item.metadata.serialNumbers || item.metadata.serial_numbers;
          if (Array.isArray(multipleSn)) {
            metadataSerials.push(...multipleSn);
          } else if (typeof multipleSn === 'string' && multipleSn) {
            metadataSerials.push(...multipleSn.split(/[\s,]+/).filter(Boolean));
          }
        }

        // Combine and deduplicate
        const allSerials = Array.from(new Set([...associatedSerials, ...metadataSerials]));
        const isSerial = allSerials.length > 0 || item.metadata?.isSerial || item.metadata?.is_serial;

        const rawQtyInput = item.metadata?.qtyInput ?? item.quantity ?? 1;
        const rawQtyUnit = item.metadata?.qtyUnit || item.qtyUnit || item.unit || 'pcs';
        const qtyDisplay = `${rawQtyInput} ${rawQtyUnit}`;

        list.push({
          id: `${doc.id}-${item.id || item.sortOrder || Math.random()}`,
          documentNumber: (doc.document_number || '').replace(/undefined/g, '/'),
          issueDate: doc.issue_date || doc.created_at,
          contactName: doc.contact_name || doc.contactName || '—',
          tracking: isSerial ? t('productDetail.history.trackingSerial') : t('productDetail.history.trackingNormal'),
          isSerial,
          serialNumbers: allSerials,
          quantity: qtyDisplay,
          status: doc.status || 'draft',
        });
      });
    });

    // Sort by date descending
    return list.sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));
  }, [product, documents, serials, type]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const locale = userLanguage === 'id' ? 'id-ID' : 'en-US';
      return new Date(dateStr).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  const statusLabels = {
    draft: t('productDetail.history.statusDraft'),
    completed: t('productDetail.history.statusCompleted'),
    pending: t('productDetail.history.statusPending'),
  };

  return (
    <div className="history-modal-overlay" onClick={onClose}>
      <div className="history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal__header">
          <h3 className="history-modal__title">{title} - {product.name}</h3>
          <button type="button" className="history-modal__close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="history-modal__body">
          {historyList.length === 0 ? (
            <div className="history-modal__empty">
              {t('productDetail.history.noHistory')}
            </div>
          ) : (
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>{t('productDetail.history.no')}</th>
                    <th>{t(type === 'goods_in' ? 'productDetail.history.refIn' : 'productDetail.history.refOut')}</th>
                    <th>{t('productDetail.history.date')}</th>
                    <th>{t(type === 'goods_in' ? 'productDetail.history.sourceIn' : 'productDetail.history.sourceOut')}</th>
                    <th>{t('productDetail.history.tracking')}</th>
                    <th>{t('productDetail.history.serialNumbers')}</th>
                    <th className="history-table__th--right" style={{ width: '80px' }}>{t('productDetail.history.qty')}</th>
                    <th style={{ width: '110px' }}>{t('productDetail.history.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map((row, index) => {
                    const trackingClass = row.isSerial ? 'badge-tracking--serial' : '';
                    const statusClass = `badge-status--${row.status.toLowerCase()}`;
                    const displayNo = String(index + 1).padStart(2, '0');

                    return (
                      <tr key={row.id}>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }} data-label={t('productDetail.history.no')}>
                          {displayNo}
                        </td>
                        <td className="history-table__ref" data-label={t('productDetail.history.refShort')}>
                          {row.documentNumber}
                        </td>
                        <td data-label={t('productDetail.history.date')}>
                          {formatDate(row.issueDate)}
                        </td>
                        <td data-label={t('productDetail.history.source')}>
                          {row.contactName}
                        </td>
                        <td data-label={t('productDetail.history.tracking')}>
                          <span className={`badge-tracking ${trackingClass}`}>
                            {row.tracking}
                          </span>
                        </td>
                        <td data-label={t('productDetail.history.serialNumbers')}>
                          {row.serialNumbers.length > 0 ? (
                            <div className="history-table__sn-list">
                              {row.serialNumbers.map((sn) => (
                                <span key={sn} className="serial-panel__sn-badge">
                                  {sn}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>-</span>
                          )}
                        </td>
                        <td className="history-table__qty" data-label={t('productDetail.history.qty')}>
                          {row.quantity}
                        </td>
                        <td data-label={t('productDetail.history.status')}>
                          <span className={`badge-status ${statusClass}`}>
                            {statusLabels[row.status.toLowerCase()] || row.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
