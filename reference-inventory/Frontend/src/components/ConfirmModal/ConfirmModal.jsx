import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import './ConfirmModal.css';

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  isLoading: externalLoading = false,
}) {
  const dialogRef = useRef(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const isBusy = externalLoading || internalLoading;

  useEffect(() => {
    if (!open) {
      setInternalLoading(false);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && !isBusy) onCancel?.();
    },
    [onCancel, isBusy]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  useClickOutside(dialogRef, isBusy ? () => {} : onCancel);

  const handleConfirmClick = async (e) => {
    if (isBusy) return;
    try {
      setInternalLoading(true);
      await onConfirm?.(e);
    } catch (err) {
      setInternalLoading(false);
    }
  };

  if (!open) return null;

  const busyText = confirmLabel?.toLowerCase().includes('hapus') ? 'Menghapus...' : 'Memproses...';

  return (
    <div className="confirm-overlay">
      <div className="confirm-dialog" ref={dialogRef}>
        {title && <h3 className="confirm-title">{title}</h3>}
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={isBusy}>
            {cancelLabel || 'Batal'}
          </button>
          <button
            className="btn btn-danger"
            onClick={handleConfirmClick}
            disabled={isBusy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minWidth: '100px',
              opacity: isBusy ? 0.75 : 1,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              pointerEvents: isBusy ? 'none' : 'auto',
            }}
          >
            {isBusy ? (
              <>
                <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} />
                <span>{busyText}</span>
              </>
            ) : (
              confirmLabel || 'Hapus'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

