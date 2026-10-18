import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Sparkles,
  UploadCloud,
  Camera,
  Clipboard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  PackagePlus,
  Key,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../utils/api.js';
import { useUnits } from '../../hooks/useUnits.js';
import './SecretAIOcrModal.css';

export default function SecretAIOcrModal({ isOpen, onClose, onApplyToGoodsIn, onApplyToPo }) {
  const { formatUnitOption } = useUnits();
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMime, setImageMime] = useState('image/png');
  const [cameraActive, setCameraActive] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('docuflow_nvidia_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loadingStep, setLoadingStep] = useState(null); // 'ocr' | 'reasoning' | null
  const [error, setError] = useState(null);
  const [extractedResult, setExtractedResult] = useState(null);
  const [rawText, setRawText] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Reset state when opened/closed
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setError(null);
      setLoadingStep(null);
    }
  }, [isOpen]);

  // Handle save custom API key
  const handleSaveApiKey = (keyVal) => {
    setApiKey(keyVal);
    if (keyVal.trim()) {
      localStorage.setItem('docuflow_nvidia_api_key', keyVal.trim());
    } else {
      localStorage.removeItem('docuflow_nvidia_api_key');
    }
  };

  // Process file to base64 with auto-optimization
  const processFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('File harus berupa gambar (PNG, JPG, JPEG, WebP).');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1600;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setImagePreview(dataUrl);
        setImageBase64(dataUrl);
        setImageMime('image/jpeg');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Clipboard Paste Listener (Ctrl+V anywhere in modal)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e) => {
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          processFile(blob);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Camera start/stop
  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setError('Tidak dapat mengakses kamera: ' + (err.message || 'Izin kamera ditolak.'));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const captureCamera = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setImagePreview(dataUrl);
    setImageBase64(dataUrl);
    setImageMime('image/jpeg');
    stopCamera();
  };

  // Run AI Processing
  const handleAnalyzeImage = async () => {
    if (!imageBase64) {
      setError('Pilih atau ambil foto catatan terlebih dahulu.');
      return;
    }

    try {
      setError(null);
      setExtractedResult(null);
      setRawText(null);
      setLoadingStep('ocr');

      const res = await api.post('/api/workspace/ai/ocr-inventory', {
        image: imageBase64,
        mimeType: imageMime,
        apiKey: apiKey.trim() || undefined,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || errJson?.error?.message || 'Gagal memproses gambar melalui NVIDIA AI.');
      }

      const json = await res.json();
      const payload = json.data;

      setRawText(payload?.rawOcrText || '');
      setExtractedResult(payload?.data || null);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat menghubungi layanan NVIDIA AI.');
    } finally {
      setLoadingStep(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="secret-ai-overlay" onClick={onClose}>
      <div
        className="secret-ai-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="secret-ai-modal__header">
          <div className="secret-ai-modal__title-wrap">
            <div className="secret-ai-badge">
              <Sparkles size={14} className="secret-ai-sparkle" />
              <span>NVIDIA Dual-Agent NIM</span>
            </div>
            <h2 className="secret-ai-title">AI Smart Document & Receipt Scanner</h2>
            <p className="secret-ai-subtitle">
              Pindai foto catatan buku gudang / nota fisik dan ekstrak menjadi dokumen otomatis (Nemotron OCR v2 + Nemotron 3.5)
            </p>
          </div>

          <div className="secret-ai-header-actions">
            <button
              type="button"
              className="secret-ai-icon-btn"
              title="Pengaturan NVIDIA API Key"
              onClick={() => setShowKeyInput((prev) => !prev)}
            >
              <Key size={16} />
            </button>
            <button type="button" className="secret-ai-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* API Key Drawer (Optional Override) */}
        {showKeyInput && (
          <div className="secret-ai-key-drawer">
            <div className="secret-ai-key-row">
              <label className="secret-ai-key-label">NVIDIA API Key (Opsional / Override .env):</label>
              <input
                type="password"
                className="input secret-ai-key-input"
                placeholder="nvapi-..."
                value={apiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
              />
            </div>
            <p className="secret-ai-key-hint">
              Kunci API disimpan aman di browser Anda dan hanya digunakan untuk memanggil model NVIDIA NIM.
            </p>
          </div>
        )}

        {/* Modal Body */}
        <div className="secret-ai-modal__body">
          {error && (
            <div className="secret-ai-alert secret-ai-alert--error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Upload & Capture Grid */}
          <div className="secret-ai-grid">
            {/* Left: Input Area */}
            <div className="secret-ai-input-pane">
              {cameraActive ? (
                <div className="secret-ai-camera-wrap">
                  <video ref={videoRef} className="secret-ai-video" playsInline autoPlay muted />
                  <div className="secret-ai-camera-controls">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm interactive"
                      onClick={captureCamera}
                    >
                      <Camera size={16} />
                      <span>Jepret Foto</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm interactive"
                      onClick={stopCamera}
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : imagePreview ? (
                <div className="secret-ai-preview-wrap">
                  <img src={imagePreview} alt="Preview Dokumen" className="secret-ai-preview-img" />
                  <div className="secret-ai-preview-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm interactive"
                      onClick={() => {
                        setImagePreview(null);
                        setImageBase64(null);
                        setExtractedResult(null);
                        setRawText(null);
                      }}
                    >
                      <RefreshCw size={14} />
                      <span>Ganti Gambar</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm interactive"
                      onClick={handleAnalyzeImage}
                      disabled={!!loadingStep}
                    >
                      {loadingStep ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Menganalisis...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          <span>Mulai Analisis AI</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="secret-ai-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
                  }}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) processFile(e.target.files[0]);
                    }}
                  />
                  <UploadCloud size={40} className="secret-ai-dropzone-icon" />
                  <h4 className="secret-ai-dropzone-title">Upload atau Drag Foto Catatan / Nota</h4>
                  <p className="secret-ai-dropzone-sub">
                    Bisa juga langsung tekan <kbd>Ctrl + V</kbd> untuk paste gambar dari clipboard
                  </p>

                  <div className="secret-ai-dropzone-btns" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm interactive"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud size={14} />
                      <span>Pilih File</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm interactive"
                      onClick={startCamera}
                    >
                      <Camera size={14} />
                      <span>Gunakan Kamera</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Live Step Progress Indicator */}
              {loadingStep && (
                <div className="secret-ai-progress-card">
                  <div className="secret-ai-progress-step">
                    <Loader2 size={16} className="animate-spin secret-ai-step-icon" />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                        {loadingStep === 'ocr'
                          ? 'Agent 1: Memindai Teks Tulisan Tangan (Nemotron OCR v2)...'
                          : 'Agent 2: Menyelaraskan Katalog Produk & Satuan (Nemotron 3.5)...'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        NVIDIA Accelerated Inference sedang memproses...
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Results Preview */}
            <div className="secret-ai-output-pane">
              <div className="secret-ai-output-header">
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                  Hasil Analisis Terstruktur
                </h4>
                {extractedResult && (
                  <span className="doc-chip doc-chip--paid" style={{ fontSize: '11px' }}>
                    <CheckCircle2 size={12} />
                    <span>Sukses Diekstrak</span>
                  </span>
                )}
              </div>

              {!extractedResult ? (
                <div className="secret-ai-empty-output">
                  <FileSpreadsheet size={32} style={{ color: 'var(--color-text-muted)', marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    Foto catatan yang Anda upload akan diproses dan ditampilkan di sini sebagai tabel barang siap pakai.
                  </p>
                </div>
              ) : (
                <div className="secret-ai-result-content">
                  {/* Meta summary */}
                  <div className="secret-ai-meta-grid">
                    <div className="secret-ai-meta-item">
                      <span className="secret-ai-meta-label">Vendor / Pengirim:</span>
                      <span className="secret-ai-meta-value">
                        {extractedResult.vendor_name || 'Tidak tertera'}
                      </span>
                    </div>
                    <div className="secret-ai-meta-item">
                      <span className="secret-ai-meta-label">Tanggal:</span>
                      <span className="secret-ai-meta-value">
                        {extractedResult.date || 'Hari ini'}
                      </span>
                    </div>
                    {extractedResult.notes && (
                      <div className="secret-ai-meta-item secret-ai-meta-item--full">
                        <span className="secret-ai-meta-label">Catatan:</span>
                        <span className="secret-ai-meta-value">{extractedResult.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Items Table */}
                  <div className="secret-ai-table-wrap">
                    <table className="secret-ai-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Nama Barang</th>
                          <th>SKU</th>
                          <th style={{ textAlign: 'right' }}>Jumlah & Satuan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(extractedResult.items || []).map((item, idx) => (
                          <tr key={idx}>
                            <td style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{idx + 1}</td>
                            <td>
                              <div style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>
                                {item.itemName}
                              </div>
                            </td>
                            <td>
                              {item.isNonCatalog ? (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    padding: '1px 6px',
                                    borderRadius: 'var(--radius-xs)',
                                    background: 'var(--color-warning-surface)',
                                    color: 'var(--color-warning)',
                                    border: '1px solid var(--color-warning)',
                                  }}
                                >
                                  Non-Katalog
                                </span>
                              ) : (
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                                  {item.sku}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--color-interactive)' }}>
                              {item.qty} {item.qtyUnit || 'pcs'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Apply Actions */}
                  <div className="secret-ai-apply-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-md interactive"
                      onClick={() => {
                        if (onApplyToGoodsIn) onApplyToGoodsIn(extractedResult);
                        onClose();
                      }}
                    >
                      <PackagePlus size={16} />
                      <span>Terapkan ke Barang Masuk (Goods In)</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary btn-md interactive"
                      onClick={() => {
                        if (onApplyToPo) onApplyToPo(extractedResult);
                        onClose();
                      }}
                    >
                      <span>Terapkan ke Purchase Order</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
