import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, Check, AlertTriangle, AlertCircle, FileText, PackagePlus, PackageMinus, Truck, Receipt, ExternalLink, PenLine } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import DocumentCancelModal from './DocumentCancelModal.jsx';
import DocumentEditModal from './DocumentEditModal.jsx';
import SecretEmailButton from '../../components/SecretEmailButton/SecretEmailButton.jsx';
import './DocumentDetailModal.css';

const TYPE_META = {
  invoice:       { label: 'documents.type.invoice',       icon: FileText,     chip: 'doc-chip--invoice' },
  goods_in:      { label: 'documents.type.goodsIn',       icon: PackagePlus,  chip: 'doc-chip--goods-in' },
  goods_out:     { label: 'documents.type.goodsOut',      icon: PackageMinus, chip: 'doc-chip--goods-out' },
  delivery_note: { label: 'documents.type.deliveryNote',  icon: Truck,        chip: 'doc-chip--delivery' },
  receipt:       { label: 'documents.type.receipt',       icon: Receipt,      chip: 'doc-chip--receipt' },
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

export default function DocumentDetailModal({ doc, onClose, onUpdate }) {
  const { t } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: fullDoc } = useQuery({
    queryKey: ['document', doc.id],
    queryFn: async () => {
      const res = await api.get(`/api/workspace/documents/${doc.id}`);
      if (!res.ok) throw new Error('Failed to load document details');
      const json = await res.json();
      return json.data;
    },
    initialData: doc,
    staleTime: 10000,
  });
  
  const { data: rawContacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/contacts?limit=1000');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  const contacts = rawContacts ?? [];

  const getDisplayCustomerName = () => {
    let name = fullDoc.contact_name || '';
    
    // Prioritize linked contact info
    if (fullDoc.contact_id && contacts.length > 0) {
      const c = contacts.find((x) => String(x.id) === String(fullDoc.contact_id));
      if (c) {
        const store = (c.name || '').trim();
        const owner = (c.metadata?.storeName || '').trim();
        if (store && store !== '-') {
          return owner && owner !== '-' ? `${store} (${owner})` : store;
        }
        return owner || store || '-';
      }
    }
    
    // Parse "Store (Owner)" format if present
    if (name.includes('(')) {
      const match = name.match(/^(.*?)\s*\((.*?)\)$/);
      if (match) {
        const store = match[1].trim();
        const owner = match[2].trim();
        if (owner === '-') return store;
        return `${store} (${owner})`;
      }
    }

    if (name === '-') return '-';
    return name || '\u2014';
  };

  const [submitting, setSubmitting] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [error, setError] = useState(null);
  const [localPaymentStatus, setLocalPaymentStatus] = useState(() => {
    const terms = fullDoc.payment_terms || 'unpaid:0';
    const [payStatus] = terms.split(':');
    return payStatus || 'unpaid';
  });

  useEffect(() => {
    const terms = fullDoc.payment_terms || 'unpaid:0';
    const [payStatus] = terms.split(':');
    setLocalPaymentStatus(payStatus || 'unpaid');
  }, [fullDoc.payment_terms]);



  const printCount = useMemo(() => {
    const terms = fullDoc.payment_terms || 'unpaid:0';
    const [, countStr] = terms.split(':');
    return parseInt(countStr, 10) || 0;
  }, [fullDoc.payment_terms]);

  const isOverdue = useMemo(() => {
    if (localPaymentStatus !== 'unpaid') return false;
    if (!fullDoc.due_date) return false;
    const due = new Date(fullDoc.due_date);
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return due <= tomorrow;
  }, [localPaymentStatus, fullDoc.due_date]);

  const overdueDays = useMemo(() => {
    if (!fullDoc.due_date) return 0;
    const due = new Date(fullDoc.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - due) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [fullDoc.due_date]);

  const isPending = fullDoc.status === 'draft' || fullDoc.status === 'processing';
  const typeMeta = TYPE_META[fullDoc.document_type] ?? TYPE_META.invoice;
  const TypeIcon = typeMeta.icon;

  const items = fullDoc.items ?? [];

  const discountBreakdown = useMemo(() => {
    // 1. Calculate item-level discount sum
    let itemDiscountsTotal = 0;
    items.forEach((item) => {
      const qty = Number(item.quantity ?? 0);
      const price = Number(item.unitPrice ?? item.unit_price ?? 0);
      const lineTotal = qty * price;
      const discType = item.discountType ?? item.discount_type ?? 'none';
      const discVal = Number(item.discountValue ?? item.discount_value ?? 0);
      if (discType === 'percentage') {
        itemDiscountsTotal += Math.round((lineTotal * discVal) / 100);
      } else if (discType === 'fixed') {
        itemDiscountsTotal += discVal;
      }
    });

    // 2. Read overall discounts from metadata
    const overallDiscounts = fullDoc?.metadata?.overallDiscounts || [];
    const overallDiscountsTotal = overallDiscounts
      .filter((d) => !d.isPointEarned)
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    // 3. Compute remaining/legacy discount
    const totalDiscountInDb = Number(fullDoc?.discount ?? 0);
    const legacyDiscount = Math.max(totalDiscountInDb - itemDiscountsTotal - overallDiscountsTotal, 0);

    return {
      itemDiscountsTotal,
      overallDiscounts,
      legacyDiscount,
      totalDiscountInDb,
    };
  }, [items, fullDoc]);

  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.patch(`/api/workspace/documents/${fullDoc.id}`, {
        documentType: fullDoc.document_type || 'invoice',
        documentNumber: fullDoc.document_number,
        contactId: fullDoc.contact_id,
        contactName: fullDoc.contact_name,
        status: 'completed',
        issueDate: fullDoc.issue_date,
        notes: fullDoc.notes,
        subtotal: fullDoc.subtotal || 0,
        discount: fullDoc.discount || 0,
        tax: fullDoc.tax || 0,
        total: fullDoc.total || 0,
        metadata: fullDoc.metadata || {},
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || t('documents.detail.completeFailed'));
      }
      const json = await res.json();
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      onUpdate?.(json.data ?? { ...fullDoc, status: 'completed' });
      onClose();
    } catch (err) {
      setError(err.message || t('documents.detail.completeFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePaymentStatus = async (checked) => {
    const newStatus = checked ? 'paid' : 'unpaid';
    setLocalPaymentStatus(newStatus);
    
    // Parse current count to keep it intact!
    const terms = fullDoc.payment_terms || 'unpaid:0';
    const [, printCountStr] = terms.split(':');
    const currentCount = parseInt(printCountStr, 10) || 0;
    const nextTerms = `${newStatus}:${currentCount}`;

    // Optimistically update parent list state immediately
    const optimisticDoc = { ...fullDoc, payment_terms: nextTerms };
    onUpdate?.(optimisticDoc);

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.patch(`/api/workspace/documents/${fullDoc.id}`, {
        documentType: fullDoc.document_type || 'invoice',
        documentNumber: fullDoc.document_number,
        contactId: fullDoc.contact_id,
        contactName: fullDoc.contact_name,
        status: fullDoc.status,
        issueDate: fullDoc.issue_date,
        notes: fullDoc.notes,
        subtotal: fullDoc.subtotal || 0,
        discount: fullDoc.discount || 0,
        tax: fullDoc.tax || 0,
        total: fullDoc.total || 0,
        paymentTerms: nextTerms,
        metadata: fullDoc.metadata || {},
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || 'Failed to update payment status');
      }
      const json = await res.json();
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      onUpdate?.(json.data ?? { ...fullDoc, payment_terms: nextTerms });
    } catch (err) {
      // Revert if API call fails
      const terms = fullDoc.payment_terms || 'unpaid:0';
      const [payStatus] = terms.split(':');
      setLocalPaymentStatus(payStatus || 'unpaid');
      onUpdate?.(fullDoc);
      setError(err.message || 'Failed to update payment status');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSuccess = async () => {
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    setShowCancel(false);
    onClose();
  };

  const isInventoryDoc = fullDoc.document_type === 'goods_in' || fullDoc.document_type === 'goods_out' || fullDoc.document_type === 'sample' || fullDoc.document_type === 'delivery_note';
  const hasPrices = !isInventoryDoc;

  return (
    <>
      <div className="doc-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="doc-detail-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="doc-detail-modal">
          {/* Header */}
          <div className="doc-detail__header">
            <div className="doc-detail__header-left">
              <h2 id="doc-detail-title" className="doc-detail__title">{t('documents.detail.title')}</h2>
              <div className="doc-detail__ref-row">
                <span className={`doc-chip ${typeMeta.chip}`}>
                  <TypeIcon size={11} style={{ marginRight: 4 }} />
                  {t(typeMeta.label)}
                </span>
                <span className="doc-detail__ref-text">{fullDoc.document_number}</span>
              </div>
            </div>
            <div className="doc-detail__header-right">
              {fullDoc.status === 'completed' && <span className="chip chip-success">{t('documents.status.completed')}</span>}
              {fullDoc.status === 'cancelled' && <span className="chip chip-danger">{t('documents.status.cancelled')}</span>}
              {fullDoc.status === 'draft' && <span className="chip">{t('documents.status.draft')}</span>}
              {fullDoc.status === 'processing' && <span className="chip chip-warning">{t('documents.status.processing')}</span>}
              <SecretEmailButton documentId={fullDoc.id} documentType={fullDoc.document_type} buttonTitle="Push Email" />
              <button type="button" className="doc-detail__close-btn" onClick={onClose}><X size={20} /></button>
            </div>
          </div>

          {/* Body */}
          <div className="doc-detail__body">
            {/* Info card */}
            <div className="doc-detail__info-card">
              <div className="doc-detail__info-grid">
                <div className="doc-detail__info-row">
                  <div className="doc-detail__field">
                    <span className="doc-detail__field-label">{t('documents.detail.customer')}</span>
                    <span className="doc-detail__field-value">{getDisplayCustomerName()}</span>
                  </div>
                  {hasPrices && fullDoc.document_type === 'invoice' && (
                    <div className="doc-detail__field">
                      <span className="doc-detail__field-label">{t('documents.detail.printCount')}</span>
                      <span className="doc-detail__field-value">
                        {printCount > 0 ? `${printCount}x` : '\u2014'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="doc-detail__info-row">
                  <div className="doc-detail__field">
                    <span className="doc-detail__field-label">{t('documents.detail.date')}</span>
                    <span className="doc-detail__field-value">{formatDate(fullDoc.issue_date)}</span>
                  </div>
                  {hasPrices && fullDoc.document_type === 'invoice' && (
                    <div className="doc-detail__field">
                      <span className="doc-detail__field-label">{t('documents.detail.paymentStatus')}</span>
                      <span className="doc-detail__field-value">
                        <span className={`doc-chip ${localPaymentStatus === 'paid' ? 'doc-chip--paid' : isOverdue ? 'doc-chip--overdue' : 'doc-chip--unpaid'}`}>
                          {localPaymentStatus === 'paid' ? t('documents.paymentStatus.paid') : t('documents.paymentStatus.unpaid')}
                          {overdueDays > 0 && ` \u00b7 ${t('documents.detail.overdue', { days: overdueDays })}`}
                        </span>
                      </span>
                    </div>
                  )}
                  {hasPrices && fullDoc.due_date && (
                    <div className="doc-detail__field">
                      <span className="doc-detail__field-label">{t('documents.detail.dueDate')}</span>
                      <span className="doc-detail__field-value">{formatDate(fullDoc.due_date)}</span>
                    </div>
                  )}
                </div>
                <div className="doc-detail__info-row">
                  <div className="doc-detail__field">
                    <span className="doc-detail__field-label">{t('documents.detail.notes')}</span>
                    <span className="doc-detail__field-value">{fullDoc.notes || t('documents.detail.noNotes')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="doc-detail__items-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <h4 className="doc-detail__items-title" style={{ margin: 0 }}>
                  {t('documents.detail.items')}
                  <span className="doc-detail__items-count">{t('documents.detail.itemsCount', { count: items.length })}</span>
                </h4>
                {fullDoc.status === 'draft' && hasPrices && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm interactive"
                    onClick={() => setShowEditModal(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '11px', fontWeight: 600 }}
                  >
                    <PenLine size={12} />
                    <span>{t('documents.detail.editItemPrice')}</span>
                  </button>
                )}
              </div>

              {/* Desktop table */}
              <div className="doc-detail__table-desktop">
                <div className="doc-detail__table-wrapper">
                  <table className="doc-detail__table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>{t('documents.detail.colNumber')}</th>
                        <th>{t('documents.detail.colProduct')}</th>
                        <th>{t('documents.detail.colSku')}</th>
                        <th style={{ textAlign: 'right' }}>{t('documents.detail.colQty')}</th>
                        {hasPrices && (
                          <>
                            <th style={{ textAlign: 'right' }}>{t('documents.detail.colPrice')}</th>
                            <th style={{ textAlign: 'right' }}>{t('documents.detail.colDiscount')}</th>
                            <th style={{ textAlign: 'right' }}>{t('documents.detail.colAmount')}</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const qty = Number(item.quantity ?? 0);
                        const price = Number(item.unitPrice ?? item.unit_price ?? 0);
                        const discType = item.discountType ?? item.discount_type ?? 'none';
                        const discVal = Number(item.discountValue ?? item.discount_value ?? 0);
                        const amount = qty * price;
                        const discAmount = discType === 'percentage'
                          ? Math.round((amount * discVal) / 100)
                          : discType === 'fixed' ? discVal : 0;
                        const itemNote = item.metadata?.note ?? '';
                        const displayUnit = item.metadata?.unit ?? 'pcs';
                        const itemSerials = [
                          ...(Array.isArray(item.serials) ? item.serials : []),
                          ...(Array.isArray(item.metadata?.serials) ? item.metadata.serials : []),
                          ...(item.metadata?.serialNumber ? [item.metadata.serialNumber] : []),
                          ...(item.serialNumber ? [item.serialNumber] : []),
                        ].filter(Boolean);

                        return (
                          <tr key={item.id ?? idx}>
                            <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{idx + 1}</td>
                            <td style={{ fontWeight: 500 }}>
                              <div>{item.itemName ?? item.item_name ?? ''}</div>
                              {itemSerials.length > 0 && (
                                <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '3px', wordBreak: 'break-all' }}>
                                  No. Seri ({itemSerials.length}): {itemSerials.join(', ')}
                                </div>
                              )}
                              {itemNote && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400, marginTop: '2px' }}>{itemNote}</div>}
                            </td>
                            <td><span className="doc-detail__sku-cell">{item.sku || '\u2014'}</span></td>
                            <td style={{ textAlign: 'right' }}>{qty} {displayUnit}</td>
                            {hasPrices && (
                              <>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(price)}</td>
                                <td style={{ textAlign: 'right', color: discAmount > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                                  {discAmount > 0 ? `-${formatCurrency(discAmount)}` : '\u2014'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                  {formatCurrency(amount - discAmount)}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="doc-detail__cards-mobile">
                {items.map((item, idx) => {
                  const qty = Number(item.quantity ?? 0);
                  const price = Number(item.unitPrice ?? item.unit_price ?? 0);
                  const itemNote = item.metadata?.note ?? '';
                  const displayUnit = item.metadata?.unit ?? 'pcs';
                  const itemSerials = [
                    ...(Array.isArray(item.serials) ? item.serials : []),
                    ...(Array.isArray(item.metadata?.serials) ? item.metadata.serials : []),
                    ...(item.metadata?.serialNumber ? [item.metadata.serialNumber] : []),
                    ...(item.serialNumber ? [item.serialNumber] : []),
                  ].filter(Boolean);

                  return (
                    <div key={item.id ?? idx} className="doc-detail__item-card">
                      <div className="doc-detail__item-card-header">
                        <span className="doc-detail__item-card-number">#{idx + 1}</span>
                        <span className="doc-detail__item-card-name">{item.itemName ?? item.item_name ?? ''}</span>
                      </div>
                      {itemSerials.length > 0 && (
                        <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', padding: '0 var(--space-3)', marginTop: '-var(--space-1)', marginBottom: 'var(--space-2)', wordBreak: 'break-all' }}>
                          No. Seri: {itemSerials.join(', ')}
                        </div>
                      )}
                      <div className="doc-detail__item-card-grid">
                        <div><span className="doc-detail__item-card-label">{t('documents.detail.colSku')}</span><span>{item.sku || '\u2014'}</span></div>
                        <div><span className="doc-detail__item-card-label">{t('documents.detail.colQty')}</span><span>{qty} {displayUnit}</span></div>
                        {hasPrices && (
                          <>
                            <div><span className="doc-detail__item-card-label">{t('documents.detail.colPrice')}</span><span>{formatCurrency(price)}</span></div>
                            <div><span className="doc-detail__item-card-label">{t('documents.detail.colAmount')}</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatCurrency(qty * price)}</span></div>
                          </>
                        )}
                      </div>
                      {itemNote && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', padding: 'var(--space-2) 0 0', marginTop: 'var(--space-2)' }}>{itemNote}</div>}
                    </div>
                  );
                })}
              </div>

              {/* Totals */}
              {hasPrices && (
                <div className="doc-detail__totals">
                  <div className="doc-detail__total-row">
                    <span>{t('documents.detail.subtotal')}</span>
                    <span>{formatCurrency(fullDoc.subtotal ?? 0)}</span>
                  </div>
                  {discountBreakdown.itemDiscountsTotal > 0 && (
                    <div className="doc-detail__total-row">
                      <span>{t('documents.modal.discountProduct')}</span>
                      <span style={{ color: 'var(--color-danger)' }}>-{formatCurrency(discountBreakdown.itemDiscountsTotal)}</span>
                    </div>
                  )}
                  {discountBreakdown.overallDiscounts.map((d, index) => {
                    if (Number(d.amount || 0) === 0) return null;
                    const suffix = d.type === 'percentage' ? ` (${d.value}%)` : '';
                    if (d.isPointEarned) {
                      return (
                        <div className="doc-detail__total-row" key={index} style={{ color: 'var(--color-success, #10B981)', fontWeight: 500 }}>
                          <span>{d.name || 'Diskon Cashback'}{suffix}</span>
                          <span style={{ fontWeight: 700 }}>+{formatCurrency(d.amount)}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="doc-detail__total-row" key={index}>
                        <span>{d.name || t('documents.modal.discountStore')}{suffix}</span>
                        <span style={{ color: 'var(--color-danger)' }}>-{formatCurrency(d.amount)}</span>
                      </div>
                    );
                  })}
                  {discountBreakdown.legacyDiscount > 0 && (
                    <div className="doc-detail__total-row">
                      <span>{t('documents.modal.discount')}</span>
                      <span style={{ color: 'var(--color-danger)' }}>-{formatCurrency(discountBreakdown.legacyDiscount)}</span>
                    </div>
                  )}
                  {Number(fullDoc.tax ?? 0) > 0 && (
                    <div className="doc-detail__total-row">
                      <span>{t('documents.detail.tax')}</span>
                      <span>{formatCurrency(fullDoc.tax ?? 0)}</span>
                    </div>
                  )}
                  <div className="doc-detail__total-row doc-detail__total-row--grand">
                    <span>{t('documents.detail.total')}</span>
                    <span>{formatCurrency(fullDoc.total ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="doc-detail__error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="doc-detail__footer">
            {fullDoc.document_type === 'invoice' && fullDoc.status !== 'cancelled' && (
              <div className="doc-detail__payment-switch-wrap" style={{ marginRight: 'auto' }}>
                <span className="doc-detail__payment-switch-label">
                  {localPaymentStatus === 'paid' ? t('documents.paymentStatus.paid') : t('documents.paymentStatus.unpaid')}
                </span>
                <label className="payment-switch" title={t('documents.modal.paymentStatusLabel')}>
                  <input
                    type="checkbox"
                    checked={localPaymentStatus === 'paid'}
                    onChange={(e) => handleTogglePaymentStatus(e.target.checked)}
                    disabled={submitting}
                  />
                  <span className="payment-slider"></span>
                </label>
              </div>
            )}
            {!showCompleteConfirm && (
              <>
                {!isPending && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-md interactive"
                    onClick={() => { onClose(); navigate('/document/' + fullDoc.id); }}
                    style={{ marginRight: 8 }}
                  >
                    <ExternalLink size={15} style={{ marginRight: 4 }} />
                    {t('documents.detail.openDocument')}
                  </button>
                )}

                {isPending && (
                  <button
                    type="button"
                    className="btn btn-danger btn-md interactive"
                    onClick={() => setShowCancel(true)}
                    style={{ marginRight: 8 }}
                  >
                    <AlertTriangle size={15} style={{ marginRight: 4 }} />
                    {t('documents.detail.cancel')}
                  </button>
                )}

                {isPending && (
                  <button
                    type="button"
                    className="btn btn-primary btn-md interactive"
                    onClick={() => setShowCompleteConfirm(true)}
                    style={{ marginRight: 8 }}
                  >
                    <Check size={16} style={{ marginRight: 4 }} />
                    {t('documents.detail.complete')}
                  </button>
                )}

                <button type="button" className="btn btn-secondary btn-md interactive" onClick={onClose}>
                  {t('documents.detail.close')}
                </button>
              </>
            )}

            {showCompleteConfirm && (
              <div className="doc-detail__confirm-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="doc-detail__confirm-text" style={{ marginRight: 'auto', fontSize: 'var(--text-small)', fontWeight: 600 }}>
                  {t('documents.detail.completeSuccess')}?
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowCompleteConfirm(false)}
                  disabled={submitting}
                >
                  {t('documents.modal.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleComplete}
                  disabled={submitting}
                >
                  {submitting ? '...' : <><Check size={14} /><span>{t('documents.detail.complete')}</span></>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCancel && (
        <DocumentCancelModal
          doc={fullDoc}
          onClose={() => setShowCancel(false)}
          onConfirm={handleCancelSuccess}
        />
      )}

      {showEditModal && (
        <DocumentEditModal
          doc={fullDoc}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}
