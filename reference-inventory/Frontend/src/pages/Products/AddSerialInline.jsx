import React, { useState, useRef, useEffect } from 'react';
import { Check, X, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './AddSerialInline.css';

/**
 * Inline form that appears below the serial table.
 * Props:
 *   productId     — uuid of the product
 *   existingSerials — array of existing serial objects to check for duplicates
 *   onSuccess     — called after successful add (triggers list refresh)
 *   onCancel      — called when user clicks cancel
 */
export default function AddSerialInline({ productId, existingSerials, onSuccess, onCancel }) {
  const { t } = useApp();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Auto-focus when mounted
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const validate = (val) => {
    const trimmed = val.trim();
    if (!trimmed) return t('productDetail.serialRequired');
    const duplicate = existingSerials.some(
      (s) => (s.serialNumber || s.serial_number)?.toLowerCase() === trimmed.toLowerCase()
    );

    if (duplicate) return t('productDetail.serialDuplicate');
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.post('/api/workspace/product-serials', {
        productId,
        serialNumber: value.trim(),
        status: 'available',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || t('productDetail.serialAddError'));
      }
      setValue('');
      onSuccess();
    } catch (err) {
      setError(err.message || t('productDetail.serialAddError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="add-serial-inline">
      <form className="add-serial-inline__form" onSubmit={handleSubmit} noValidate>
        <input
          ref={inputRef}
          type="text"
          className={`input add-serial-inline__input ${error ? 'add-serial-inline__input--error' : ''}`}
          placeholder={t('productDetail.serialPlaceholder')}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm interactive"
          disabled={submitting || !value.trim()}
        >
          <Check size={14} />
          <span>{submitting ? t('productDetail.serialAdding') : t('productDetail.serialSubmit')}</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm interactive"
          onClick={onCancel}
          disabled={submitting}
        >
          <X size={14} />
        </button>
      </form>
      {error && (
        <div className="add-serial-inline__error">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
