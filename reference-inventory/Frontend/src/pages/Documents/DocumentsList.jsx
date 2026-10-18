import React from 'react';
import { ChevronRight, FileText, PackagePlus, PackageMinus, Truck, Receipt } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import './DocumentsList.css';

const TYPE_CONFIG = {
  invoice:       { label: 'documents.type.invoice',       icon: FileText,      chip: 'doc-chip--invoice' },
  goods_in:      { label: 'documents.type.goodsIn',       icon: PackagePlus,   chip: 'doc-chip--goods-in' },
  goods_out:     { label: 'documents.type.goodsOut',      icon: PackageMinus,  chip: 'doc-chip--goods-out' },
  delivery_note: { label: 'documents.type.deliveryNote',  icon: Truck,         chip: 'doc-chip--delivery' },
  receipt:       { label: 'documents.type.receipt',       icon: Receipt,       chip: 'doc-chip--receipt' },
};

function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount) {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
}

function cleanContactName(name) {
  if (!name) return '';
  let str = String(name).trim();
  if (str.endsWith(' (-)')) {
    str = str.slice(0, -4).trim();
  }
  if (str.endsWith('(–)')) {
    str = str.replace(/\s*\(–\)$/, '').trim();
  }
  if (str.includes('(')) {
    const match = str.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      const store = match[1].trim();
      const owner = match[2].trim();
      if (!owner || owner === '-' || owner.toLowerCase() === store.toLowerCase()) {
        return store;
      }
      return `${store} (${owner})`;
    }
  }
  return str;
}

export default function DocumentsList({ docs, onSelect, canEditDocs = true }) {
  const { t, user } = useApp();
  const isUserAdmin = user?.role?.toLowerCase() === 'staff';
  const showPaymentStatus = !isUserAdmin || canEditDocs;
  const showTotal = !isUserAdmin;

  if (docs.length === 0) return null;

  return (
    <div className="product-table-wrapper doc-list-wrapper">
      <table className="table product-table doc-list-table">
        <thead>
          <tr>
            <th className="doc-list__th--ref">{t('documents.col.reference')}</th>
            <th className="doc-list__th--type">{t('documents.col.type')}</th>
            <th className="doc-list__th--customer">{t('documents.col.customer')}</th>
            <th className="doc-list__th--date">{t('documents.col.date')}</th>
            {showPaymentStatus && <th className="doc-list__th--payment-status">{t('documents.col.paymentStatus')}</th>}
            <th className="doc-list__th--print-count">{t('documents.col.printCount')}</th>
            {showTotal && <th className="doc-list__th--total" style={{ textAlign: 'right' }}>{t('documents.col.total')}</th>}
            <th style={{ width: '40px' }}></th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => {
            const typeCfg = TYPE_CONFIG[doc.document_type] ?? TYPE_CONFIG.invoice;
            const TypeIcon = typeCfg.icon;

            const terms = doc.payment_terms || 'unpaid:0';
            const [payStatus, printCountStr] = terms.split(':');
            const isPaid = payStatus === 'paid';
            const printCount = parseInt(printCountStr, 10) || 0;

            const isOverdue = (() => {
              if (isPaid || doc.document_type !== 'invoice' || !doc.due_date) return false;
              const due = new Date(doc.due_date);
              due.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);
              return due <= tomorrow;
            })();

            return (
              <tr
                key={doc.id}
                className="product-table__row doc-list__row interactive"
                onClick={() => onSelect(doc)}
              >
                <td className="doc-list__cell--ref" data-label={t('documents.col.reference')}>
                  <div className="doc-list__ref-wrap">
                    <TypeIcon size={13} className={`doc-list__type-icon ${typeCfg.chip}`} />
                    <span className="doc-list__ref-text">{doc.document_number}</span>
                    {doc.status !== 'completed' && (
                      <span className={`doc-status-badge-mini doc-status-badge-mini--${doc.status}`}>
                        {t(`documents.status.${doc.status}`)}
                      </span>
                    )}
                  </div>
                </td>

                <td className="doc-list__cell--type" data-label={t('documents.col.type')}>
                  <span className={`doc-chip ${typeCfg.chip}`}>{t(typeCfg.label)}</span>
                </td>

                <td className="doc-list__cell--customer" data-label={t('documents.col.customer')}>
                  <span className="doc-list__customer-name">{cleanContactName(doc.contact_name) || <span className="doc-list__cell--muted">{'\u2014'}</span>}</span>
                  <span className="doc-list__sub-dot">·</span>
                  <span className="doc-list__sub-date">{formatDate(doc.issue_date)}</span>
                </td>

                <td className="doc-list__cell--date" data-label={t('documents.col.date')}>
                  {formatDate(doc.issue_date)}
                </td>

                {showPaymentStatus && (
                  <td className="doc-list__cell--payment-status" data-label={t('documents.col.paymentStatus')}>
                    {doc.document_type === 'invoice' ? (
                      <span className={`doc-chip ${isPaid ? 'doc-chip--paid' : isOverdue ? 'doc-chip--overdue' : 'doc-chip--unpaid'}`}>
                        {isPaid ? t('documents.paymentStatus.paid') : t('documents.paymentStatus.unpaid')}
                      </span>
                    ) : (
                      <span className="doc-list__cell--muted">{'\u2014'}</span>
                    )}
                  </td>
                )}

                <td className="doc-list__cell--print-count" data-label={t('documents.col.printCount')}>
                  {printCount > 0 ? `${printCount}x` : <span className="doc-list__cell--muted">{'\u2014'}</span>}
                </td>

                {showTotal && (
                  <td className="doc-list__cell--total" style={{ textAlign: 'right', fontWeight: 600 }} data-label={t('documents.col.total')}>
                    {formatCurrency(doc.total)}
                  </td>
                )}

                <td className="doc-list__cell--chevron">
                  <ChevronRight size={15} className="doc-list__chevron" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
