import React from 'react';
import { ChevronRight, ArrowDownToLine } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { useUnits } from '../../hooks/useUnits.js';
import './GoodsInList.css';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

export default function GoodsInList({ docs, onSelect, serialCountByDocId = {} }) {
  const { t } = useApp();
  const { multipliers } = useUnits();

  if (docs.length === 0) return null;

  return (
    <div className="product-table-wrapper gi-list-wrapper">
      <table className="table product-table gi-list-table">
        <thead>
          <tr>
            <th className="gi-list__th--doc">{t('goodsIn.col.docNumber')}</th>
            <th className="gi-list__th--date">{t('goodsIn.col.date')}</th>
            <th className="gi-list__th--source">{t('goodsIn.col.source')}</th>
            <th className="gi-list__th--items" style={{ width: '80px', textAlign: 'center' }}>{t('goodsIn.col.items')}</th>
            <th className="gi-list__th--qty" style={{ width: '80px', textAlign: 'right' }}>{t('goodsIn.col.qty')}</th>
            <th className="gi-list__th--status" style={{ width: '130px', textAlign: 'center' }}>{t('goodsIn.col.status')}</th>
            <th style={{ width: '40px' }}></th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => {
            const items     = doc.items ?? [];
            const totalQty  = items.reduce((sum, it) => {
              const rawQty = it.metadata?.qtyInput ?? it.quantity ?? 1;
              const unit   = it.metadata?.qtyUnit || 'pcs';
              const mult   = multipliers[unit] || 1;
              return sum + rawQty * mult;
            }, 0);

            const status = doc.status || 'draft';
            let statusChipClass = 'chip-secondary';
            if (status === 'completed') statusChipClass = 'chip-success';
            else if (status === 'processing' || status === 'pending') statusChipClass = 'chip-warning';
            else if (status === 'cancelled') statusChipClass = 'chip-danger';

            const serialCount = serialCountByDocId[doc.id] || 0;

            return (
              <tr
                key={doc.id}
                className="product-table__row gi-list__row interactive"
                onClick={() => onSelect(doc)}
              >
                {/* Reference */}
                <td className="gi-list__cell--ref" data-label={t('goodsIn.col.reference')}>
                  <div className="gi-list__ref-wrap">
                    <ArrowDownToLine size={13} className="gi-list__inbound-icon" />
                    <span className="gi-list__ref-text">{doc.document_number}</span>
                  </div>
                </td>

                {/* Date */}
                <td className="gi-list__cell--date" data-label={t('goodsIn.col.date')}>
                  {formatDate(doc.issue_date)}
                </td>

                {/* Source */}
                <td className="gi-list__cell--source" data-label={t('goodsIn.col.source')}>
                  {doc.contact_name || <span className="gi-list__cell--muted">—</span>}
                </td>

                {/* Items count */}
                <td className="gi-list__cell--items" style={{ textAlign: 'center' }} data-label={t('goodsIn.col.items')}>
                  {items.length}
                </td>

                {/* Qty */}
                <td className="gi-list__cell--qty" style={{ textAlign: 'right', fontWeight: 600 }} data-label={t('goodsIn.col.qty')}>
                  {totalQty}
                </td>

                {/* Status & Serial info */}
                <td className="gi-list__cell--status" style={{ textAlign: 'center' }} data-label={t('goodsIn.col.status')}>
                  <div className="gi-list__status-wrap">
                    <span className={`chip ${statusChipClass}`}>
                      {t(`goodsIn.status.${status}`, status)}
                    </span>
                    {status === 'completed' && (
                      serialCount > 0 ? (
                        <span className="gi-chip gi-chip--has-sn" title={`${serialCount} Serial Number tercatat`}>
                          {serialCount} SN
                        </span>
                      ) : (
                        <span className="gi-chip gi-chip--no-sn" title="Belum ada Serial Number untuk dokumen ini">
                          {t('goodsIn.badge.noSerial', 'Belum ada SN')}
                        </span>
                      )
                    )}
                  </div>
                </td>

                {/* Chevron */}
                <td className="gi-list__cell--chevron">
                  <ChevronRight size={15} className="gi-list__chevron" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
