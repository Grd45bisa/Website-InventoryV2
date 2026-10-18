import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './DocumentCancelModal.css';

const CANCEL_REASONS = [
  { key: 'wrong_input', labelKey: 'documents.cancel.reasons.wrongInput' },
  { key: 'duplicate',   labelKey: 'documents.cancel.reasons.duplicate' },
  { key: 'other',       labelKey: 'documents.cancel.reasons.other' },
];

export default function DocumentCancelModal({ doc, onClose, onConfirm }) {
  const { t } = useApp();
  const [selectedReason, setSelectedReason] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isOther = selectedReason === 'other';
  const canSubmit = selectedReason && (!isOther || customNote.trim().length >= 3);

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const reason = isOther
        ? customNote.trim()
        : t(CANCEL_REASONS.find((r) => r.key === selectedReason)?.labelKey ?? '');
      const res = await api.patch(`/api/workspace/documents/${doc.id}`, {
        documentType: doc.document_type || 'invoice',
        documentNumber: doc.document_number,
        contactId: doc.contact_id,
        contactName: doc.contact_name,
        status: 'cancelled',
        issueDate: doc.issue_date,
        notes: [doc.notes, `[Cancelled] ${reason}`].filter(Boolean).join('\n'),
        subtotal: doc.subtotal || 0,
        discount: doc.discount || 0,
        tax: doc.tax || 0,
        total: doc.total || 0,
        metadata: doc.metadata || {},
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || t('documents.detail.cancelFailed'));
      }
      await onConfirm(doc);
    } catch {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="doc-cancel-overlay" role="dialog" aria-modal="true" aria-labelledby="doc-cancel-title">
      <div className="doc-cancel-modal">
        <div className="doc-cancel__header">
          <div className="doc-cancel__header-icon">
            <AlertTriangle size={18} />
          </div>
          <div className="doc-cancel__header-text">
            <h2 id="doc-cancel-title" className="doc-cancel__title">{t('documents.cancel.title')}</h2>
            <p className="doc-cancel__ref">{doc.document_number}</p>
          </div>
          <button type="button" className="doc-cancel__close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="doc-cancel__body">
          <p className="doc-cancel__desc">{t('documents.cancel.desc')}</p>

          <fieldset className="doc-cancel__reasons">
            <legend className="doc-cancel__reasons-label">{t('documents.cancel.reasonLabel')}</legend>
            {CANCEL_REASONS.map((r) => (
              <label key={r.key} className={`doc-cancel__reason-option${selectedReason === r.key ? ' doc-cancel__reason-option--selected' : ''}`}>
                <input
                  type="radio"
                  name="cancel-reason"
                  value={r.key}
                  checked={selectedReason === r.key}
                  onChange={() => setSelectedReason(r.key)}
                  className="doc-cancel__reason-radio"
                />
                <span>{t(r.labelKey)}</span>
              </label>
            ))}
          </fieldset>

          {isOther && (
            <div className="doc-cancel__note-wrap">
              <label className="doc-cancel__note-label">{t('documents.cancel.noteLabel')}</label>
              <textarea
                className="input doc-cancel__note"
                placeholder={t('documents.cancel.notePlaceholder')}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={3}
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="doc-cancel__footer">
          <button type="button" className="btn btn-secondary btn-md" onClick={onClose} disabled={submitting}>
            {t('documents.cancel.back')}
          </button>
          <button type="button" className="btn btn-danger btn-md" onClick={handleConfirm} disabled={!canSubmit || submitting}>
            {submitting ? '...' : t('documents.cancel.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
