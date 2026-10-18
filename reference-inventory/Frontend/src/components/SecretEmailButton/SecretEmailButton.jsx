import React, { useState, useEffect } from 'react';
import { Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../../utils/api.js';

/**
 * SecretEmailButton — Tombol rahasia untuk memicu kirim ulang email secara manual.
 * Hanya muncul ketika pengguna menekan kombinasi tombol CTRL + SHIFT + K (atau CMD + SHIFT + K di Mac).
 *
 * @param {Object} props
 * @param {string} props.documentId - ID dokumen (UUID)
 * @param {'goods_out'|'goods_in'|'document'} [props.documentType] - Tipe dokumen
 * @param {string} [props.buttonTitle] - Teks tombol (default: "Push Email")
 */
export default function SecretEmailButton({
  documentId,
  documentType = 'goods_out',
  buttonTitle = 'Push Email',
  className = '',
  style = {},
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message: string }

  // Listener untuk shortcut keyboard CTRL + SHIFT + K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        e.preventDefault();
        setIsVisible((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isVisible || !documentId) return null;

  const handleResend = async (e) => {
    e?.stopPropagation?.();
    if (isSending) return;

    setIsSending(true);
    setFeedback(null);

    try {
      const res = await api.post(`/api/workspace/documents/${documentId}/send-email`);
      const json = await res.json().catch(() => ({}));

      if (res.ok && (json.success || json.data?.status === 'sent')) {
        const recipient = json.data?.recipient_email || json.data?.recipient || '';
        const msg = recipient
          ? `Email terkirim ke ${recipient}`
          : 'Email berhasil di-push!';
        setFeedback({ type: 'success', message: msg });
      } else {
        const errMsg = json?.error || json?.message || 'Gagal mengirim email.';
        setFeedback({ type: 'error', message: errMsg });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Terjadi kesalahan jaringan.' });
    } finally {
      setIsSending(false);
      // Hilangkan notifikasi feedback otomatis setelah 6 detik
      setTimeout(() => {
        setFeedback(null);
      }, 6000);
    }
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        animation: 'fadeIn 0.2s ease-in-out',
        ...style,
      }}
      className={className}
    >
      <button
        type="button"
        className="btn btn-secondary btn-sm interactive"
        disabled={isSending}
        onClick={handleResend}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: 'rgba(99, 102, 241, 0.1)',
          borderColor: '#6366F1',
          color: '#4F46E5',
          fontWeight: 600,
          cursor: isSending ? 'not-allowed' : 'pointer',
        }}
        title="Admin Secret Shortcut: Kirim Ulang Email Dokumen Ini (Ctrl+Shift+K)"
      >
        {isSending ? (
          <>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Mengirim...</span>
          </>
        ) : (
          <>
            <Mail size={13} />
            <span>{buttonTitle}</span>
          </>
        )}
      </button>

      {feedback && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '4px',
            background: feedback.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            color: feedback.type === 'success' ? '#059669' : '#DC2626',
            border: `1px solid ${feedback.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          <span>{feedback.message}</span>
        </span>
      )}
    </div>
  );
}
