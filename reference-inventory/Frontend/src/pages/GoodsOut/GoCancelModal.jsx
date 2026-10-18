import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import './GoCancelModal.css';

const CANCEL_REASONS = [
  { key: 'wrong_input',     labelKey: 'goodsOut.cancel.reasons.wrongInput' },
  { key: 'duplicate',       labelKey: 'goodsOut.cancel.reasons.duplicate' },
  { key: 'recipient_error', labelKey: 'goodsOut.cancel.reasons.recipientError' },
  { key: 'other',           labelKey: 'goodsOut.cancel.reasons.other' },
];

export default function GoCancelModal({ doc, onClose, onConfirm }) {
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
    <div className="go-cancel-overlay" role="dialog" aria-modal="true" aria-labelledby="go-cancel-title">
      <div className="go-cancel-modal">
        {/* Header */}
        <div className="go-cancel__header">
          <div className="go-cancel__header-icon">
            <AlertTriangle size={18} />
          </div>
          <div className="go-cancel__header-text">
            <h2 id="go-cancel-title" className="go-cancel__title">
              {t('goodsOut.cancel.title')}
            </h2>
            <p className="go-cancel__ref">{doc.document_number}</p>
          </div>
          <button type="button" className="go-cancel__close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="go-cancel__body">
          <p className="go-cancel__desc">{t('goodsOut.cancel.desc')}</p>

          <fieldset className="go-cancel__reasons">
            <legend className="go-cancel__reasons-label">{t('goodsOut.cancel.reasonLabel')}</legend>
            {CANCEL_REASONS.map((r) => (
              <label key={r.key} className={`go-cancel__reason-option${selectedReason === r.key ? ' go-cancel__reason-option--selected' : ''}`}>
                <input
                  type="radio"
                  name="cancel-reason"
                  value={r.key}
                  checked={selectedReason === r.key}
                  onChange={() => setSelectedReason(r.key)}
                  className="go-cancel__reason-radio"
                />
                <span>{t(r.labelKey)}</span>
              </label>
            ))}
          </fieldset>

          {isOther && (
            <div className="go-cancel__note-wrap">
              <label className="go-cancel__note-label">{t('goodsOut.cancel.noteLabel')}</label>
              <textarea
                className="input go-cancel__note"
                placeholder={t('goodsOut.cancel.notePlaceholder')}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={3}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="go-cancel__footer">
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={onClose}
            disabled={submitting}
          >
            {t('goodsOut.cancel.back')}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-md"
            onClick={handleConfirm}
            disabled={!canSubmit || submitting}
          >
            {submitting ? t('goodsOut.modal.submitting') : t('goodsOut.cancel.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
