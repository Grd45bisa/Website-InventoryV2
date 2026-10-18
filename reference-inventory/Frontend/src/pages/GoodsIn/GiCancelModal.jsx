import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import './GiCancelModal.css';

const CANCEL_REASONS = [
  { key: 'wrong_input',   labelKey: 'goodsIn.cancel.reasons.wrongInput' },
  { key: 'duplicate',     labelKey: 'goodsIn.cancel.reasons.duplicate' },
  { key: 'supplier_error',labelKey: 'goodsIn.cancel.reasons.supplierError' },
  { key: 'other',         labelKey: 'goodsIn.cancel.reasons.other' },
];

export default function GiCancelModal({ doc, onClose, onConfirm }) {
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
      const reason = isOther ? customNote.trim() : t(CANCEL_REASONS.find(r => r.key === selectedReason)?.labelKey ?? '');
      await onConfirm(doc, reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gi-cancel-overlay" role="dialog" aria-modal="true" aria-labelledby="gi-cancel-title">
      <div className="gi-cancel-modal">
        {/* Header */}
        <div className="gi-cancel__header">
          <div className="gi-cancel__header-icon">
            <AlertTriangle size={18} />
          </div>
          <div className="gi-cancel__header-text">
            <h2 id="gi-cancel-title" className="gi-cancel__title">
              {t('goodsIn.cancel.title')}
            </h2>
            <p className="gi-cancel__ref">{doc.document_number}</p>
          </div>
          <button type="button" className="gi-cancel__close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="gi-cancel__body">
          <p className="gi-cancel__desc">{t('goodsIn.cancel.desc')}</p>

          <fieldset className="gi-cancel__reasons">
            <legend className="gi-cancel__reasons-label">{t('goodsIn.cancel.reasonLabel')}</legend>
            {CANCEL_REASONS.map((r) => (
              <label key={r.key} className={`gi-cancel__reason-option${selectedReason === r.key ? ' gi-cancel__reason-option--selected' : ''}`}>
                <input
                  type="radio"
                  name="cancel-reason"
                  value={r.key}
                  checked={selectedReason === r.key}
                  onChange={() => setSelectedReason(r.key)}
                  className="gi-cancel__reason-radio"
                />
                <span>{t(r.labelKey)}</span>
              </label>
            ))}
          </fieldset>

          {isOther && (
            <div className="gi-cancel__note-wrap">
              <label className="gi-cancel__note-label">{t('goodsIn.cancel.noteLabel')}</label>
              <textarea
                className="input gi-cancel__note"
                placeholder={t('goodsIn.cancel.notePlaceholder')}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={3}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="gi-cancel__footer">
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={onClose}
            disabled={submitting}
          >
            {t('goodsIn.cancel.back')}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-md"
            onClick={handleConfirm}
            disabled={!canSubmit || submitting}
          >
            {submitting ? '...' : t('goodsIn.cancel.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
