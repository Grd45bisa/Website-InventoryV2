import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  X, 
  Printer, 
  Trash2, 
  Camera, 
  Barcode, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Sparkles,
  Info
} from 'lucide-react';
import { api } from '../../utils/api.js';
import { useCameraScanner } from '../../hooks/useCameraScanner.js';
import { useApp } from '../../context/AppContext.jsx';
import LabelSizePicker from '../LabelSizePicker.jsx';
import { openLabelPrintWindow, DEFAULT_LABEL_SIZE } from '../../utils/labelPrint.js';
import { describeUnitQty } from '../../utils/reportUnits.js';
import { useUnits } from '../../hooks/useUnits.js';
import './QuickReprintModal.css';

// Audio feedback helper
function playBeep(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
      
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime); // Low buzz
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
      
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }
  } catch (err) {
    console.warn('AudioContext failed:', err);
  }
}

// Unit detection matching AGENTS.md rules
function detectSerialUnit(serial, product) {
  const metaUnit = serial.serialUnit || serial.metadata?.serialUnit || serial.metadata?.unit || serial.unit;
  if (metaUnit && metaUnit !== 'piece') return metaUnit;

  const sn = String(serial.serialNumber ?? serial.serial_number ?? '').toLowerCase();
  if (sn.includes('10bl') || sn.includes('bal10')) return 'bal10';
  if (sn.includes('15bl') || sn.includes('bal15')) return 'bal15';
  if (sn.includes('20bl') || sn.includes('bal20')) return 'bal20';
  if (sn.includes('25bl') || sn.includes('bal25')) return 'bal25';
  if (sn.includes('bal') || sn.includes('bl')) return 'bal';
  if (sn.includes('pack') || sn.includes('pk')) return 'pack';
  if (sn.includes('lusin') || sn.includes('dozen') || sn.includes('doz')) return 'lusin';

  return product?.metadata?.unit || product?.unit || 'pcs';
}

export default function QuickReprintModal({ isOpen, onClose }) {
  const { t, user } = useApp();
  const { multipliers, customUnits } = useUnits();
  const userRole = user?.role?.toLowerCase();
  const isSales = userRole === 'sales_person' || userRole === 'sales';

  const inputRef = useRef(null);
  const [scanInput, setScanInput] = useState('');
  const [scannedItems, setScannedItems] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [labelSize, setLabelSize] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LABEL_SIZE;
    return window.localStorage.getItem('docuflow_label_size') || DEFAULT_LABEL_SIZE;
  });

  const handleLabelSizeChange = (nextSize) => {
    setLabelSize(nextSize);
    try {
      window.localStorage.setItem('docuflow_label_size', nextSize);
    } catch {
      // storage tidak tersedia, abaikan
    }
  };

  const scanCallbackRef = useRef(null);

  // Fetch all serial numbers (read-only, limit max 1000 according to backend paging schema)
  const { data: allSerials = [], isLoading: loadingSerials } = useQuery({
    queryKey: ['product-serials'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/product-serials?limit=10000');
      if (!res.ok) throw new Error('Failed to fetch serial numbers');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: isOpen && !isSales,
    staleTime: 30000,
  });

  // Fetch all products (read-only, limit max 1000 according to backend paging schema)
  const { data: allProducts = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/products?limit=1000');
      if (!res.ok) throw new Error('Failed to fetch products');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: isOpen && !isSales,
    staleTime: 5 * 60 * 1000,
  });

  // Auto focus input on modal open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 100);
    } else {
      setFeedback(null);
      setScanInput('');
    }
  }, [isOpen]);

  // Handle scanned/typed code with live server lookup fallback
  const handleProcessCode = useCallback(async (code) => {
    if (!code) return;
    const cleanCode = code.trim();
    if (!cleanCode) return;

    // Check if already in queue
    const isAlreadyScanned = scannedItems.some(
      (item) => String(item.serialNumber || '').trim().toLowerCase() === cleanCode.toLowerCase()
    );

    if (isAlreadyScanned) {
      playBeep('error');
      setFeedback({
        type: 'warning',
        message: `Serial number sudah ada di antrean: ${cleanCode}`,
      });
      return;
    }

    // 1. Try to find serial in local cache
    let matchedSerial = allSerials.find(
      (s) => String(s.serial_number ?? s.serialNumber ?? '').trim().toLowerCase() === cleanCode.toLowerCase()
    );

    // 2. If not found in local cache, do a live API search
    if (!matchedSerial) {
      try {
        const searchRes = await api.get(`/api/workspace/product-serials?search=${encodeURIComponent(cleanCode)}&limit=50`);
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const foundList = searchJson.data ?? [];
          matchedSerial = foundList.find(
            (s) => String(s.serial_number ?? s.serialNumber ?? '').trim().toLowerCase() === cleanCode.toLowerCase()
          );
        }
      } catch (err) {
        console.warn('Live serial search failed:', err);
      }
    }

    // 3. Process matched serial number
    if (matchedSerial) {
      const productId = matchedSerial.product_id ?? matchedSerial.productId;
      let matchedProduct = allProducts.find((p) => p.id === productId);

      // If product not in cache, fetch it directly
      if (!matchedProduct && productId) {
        try {
          const prodRes = await api.get(`/api/workspace/products/${productId}`);
          if (prodRes.ok) {
            const prodJson = await prodRes.json();
            matchedProduct = prodJson.data;
          }
        } catch (err) {
          console.warn('Failed to fetch linked product:', err);
        }
      }

      const unit = detectSerialUnit(matchedSerial, matchedProduct);
      const productName = matchedProduct?.name || matchedProduct?.item_name || 'â€”';
      const sku = matchedProduct?.sku || 'â€”';
      const status = matchedSerial.status || 'available';

      const newItem = {
        id: crypto.randomUUID(),
        serialNumber: matchedSerial.serial_number ?? matchedSerial.serialNumber,
        productId,
        productName,
        sku,
        unit,
        status,
        timestamp: new Date().toLocaleTimeString(),
      };

      playBeep('success');
      setScannedItems((prev) => [newItem, ...prev]);
      setFeedback({
        type: 'success',
        message: `Berhasil menambahkan: ${newItem.serialNumber} (${productName})`,
      });
      return;
    }

    // 4. If not a serial number, check if it's a Product SKU
    let matchedProduct = allProducts.find(
      (p) => String(p.sku || '').trim().toLowerCase() === cleanCode.toLowerCase()
    );

    if (!matchedProduct) {
      try {
        const prodSearchRes = await api.get(`/api/workspace/products?search=${encodeURIComponent(cleanCode)}&limit=10`);
        if (prodSearchRes.ok) {
          const prodSearchJson = await prodSearchRes.json();
          const list = prodSearchJson.data ?? [];
          matchedProduct = list.find(
            (p) => String(p.sku || '').trim().toLowerCase() === cleanCode.toLowerCase()
          );
        }
      } catch (err) {
        console.warn('Live product SKU search failed:', err);
      }
    }

    if (matchedProduct) {
      const productName = matchedProduct.name || matchedProduct.item_name || 'â€”';
      const unit = matchedProduct.metadata?.unit || matchedProduct.unit || 'pcs';

      const newItem = {
        id: crypto.randomUUID(),
        serialNumber: matchedProduct.sku,
        productId: matchedProduct.id,
        productName,
        sku: matchedProduct.sku,
        unit,
        status: 'product',
        timestamp: new Date().toLocaleTimeString(),
      };

      playBeep('success');
      setScannedItems((prev) => [newItem, ...prev]);
      setFeedback({
        type: 'success',
        message: `Produk SKU ditemukan: ${matchedProduct.sku} (${productName})`,
      });
      return;
    }

    // 5. If not found anywhere
    playBeep('error');
    setFeedback({
      type: 'error',
      message: `Serial number / SKU tidak ditemukan di database: ${cleanCode}`,
    });
  }, [scannedItems, allSerials, allProducts]);

  useEffect(() => {
    scanCallbackRef.current = handleProcessCode;
  }, [handleProcessCode]);

  // Handle Enter on Input
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = scanInput;
      setScanInput('');
      handleProcessCode(code);
    }
  };

  // Camera Scanner Setup
  const toggleCamera = () => {
    setCameraActive((prev) => !prev);
  };

  // Closing the modal must release the camera, and the next open should start
  // from a clean slate instead of re-attaching to a dead reader element.
  useEffect(() => {
    if (!isOpen) setCameraActive(false);
  }, [isOpen]);

  const handleScannerError = useCallback(
    (message) => {
      setFeedback({ type: 'error', message });
      setCameraActive(false);
    },
    []
  );

  const { frameHit } = useCameraScanner({
    elementId: 'quick-reprint-camera-reader',
    active: cameraActive && isOpen,
    fps: 12,
    onDecode: (text) => scanCallbackRef.current?.(text),
    onError: handleScannerError,
  });

  // Remove single item
  const handleRemoveItem = (id) => {
    setScannedItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Clear all items
  const handleClearAll = () => {
    setScannedItems([]);
    setFeedback(null);
    if (inputRef.current) inputRef.current.focus();
  };

  // Print single or batch
  const handlePrintLabels = async (itemsToPrint) => {
    if (!itemsToPrint || itemsToPrint.length === 0) return;
    setPrinting(true);

    try {
      const items = itemsToPrint.map((item) => ({
        serial: item.serialNumber,
        productName: item.productName || item.sku || '',
        unitText: describeUnitQty(detectSerialUnit(item, item.product), {
          multipliers,
          customUnits,
        }).text,
      }));

      const opened = await openLabelPrintWindow({
        items,
        title: 'Reprint Labels - DocuFlow',
        sizeKey: labelSize,
      });

      if (!opened) {
        alert('Popup window diblokir oleh browser. Harap izinkan popup untuk mencetak label.');
      }
    } catch (err) {
      console.error('Print generation failed:', err);
      setFeedback({
        type: 'error',
        message: 'Gagal membuat format cetak label: ' + err.message,
      });
    } finally {
      setPrinting(false);
    }
  };

  if (!isOpen || isSales) return null;

  return (
    <div className="reprint-modal-overlay" onClick={onClose}>
      <div 
        className="reprint-modal-card" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="reprint-modal-header">
          <div className="reprint-header-brand">
            <div className="reprint-icon-badge">
              <Sparkles size={20} className="reprint-sparkle-icon" />
              <Barcode size={22} className="reprint-barcode-icon" />
            </div>
            <div>
              <div className="reprint-title-row">
                <h2 className="reprint-modal-title">Quick Label Reprint</h2>
                <span className="reprint-secret-badge">READ-ONLY UTILITY</span>
              </div>
              <p className="reprint-modal-subtitle">
                Pindai nomor seri untuk melihat data barang dan cetak ulang stiker label barcode secara instan.
              </p>
            </div>
          </div>

          <button 
            type="button" 
            className="reprint-close-btn" 
            onClick={onClose} 
            title="Tutup (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scanner Control Bar */}
        <div className="reprint-scanner-bar">
          <div className="reprint-input-wrapper">
            <Barcode size={22} className="reprint-input-icon" />
            <input
              ref={inputRef}
              type="text"
              className="reprint-input"
              placeholder="Scan barcode / ketik nomor seri lalu tekan Enter..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loadingSerials}
              autoFocus
            />
            {scanInput && (
              <button 
                type="button" 
                className="reprint-clear-input-btn"
                onClick={() => { setScanInput(''); inputRef.current?.focus(); }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`reprint-camera-toggle-btn ${cameraActive ? 'active' : ''}`}
            onClick={toggleCamera}
            title="Buka Kamera Scanner"
          >
            <Camera size={18} />
            <span>{cameraActive ? 'Tutup Kamera' : 'Scan Kamera'}</span>
          </button>
        </div>

        {/* Camera Container */}
        {cameraActive && (
          <div className="reprint-camera-container">
            <div className={`reprint-camera-viewport${frameHit ? ' is-hit' : ''}`}>
              <div id="quick-reprint-camera-reader" className="reprint-camera-reader" />
              <div className="reprint-camera-frame" key={frameHit} aria-hidden="true" />
            </div>
            <span className="reprint-camera-hint">Arahkan kamera ke QR Code atau Barcode produk</span>
          </div>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <div className={`reprint-feedback-banner ${feedback.type}`}>
            {feedback.type === 'success' && <CheckCircle2 size={18} />}
            {feedback.type === 'warning' && <AlertCircle size={18} />}
            {feedback.type === 'error' && <AlertCircle size={18} />}
            <span>{feedback.message}</span>
            <button 
              type="button" 
              className="reprint-feedback-close"
              onClick={() => setFeedback(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Content Table / Empty State */}
        <div className="reprint-table-container">
          {scannedItems.length === 0 ? (
            <div className="reprint-empty-state">
              <div className="reprint-empty-icon">
                <Barcode size={48} />
              </div>
              <h3>Belum ada serial number yang di-scan</h3>
              <p>
                Gunakan scanner barcode USB gun, kamera, atau ketik nomor seri di atas. Data barang akan muncul otomatis di sini tanpa mengubah status stok.
              </p>
              <div className="reprint-shortcut-tips">
                <span><kbd>Alt</kbd> + <kbd>L</kbd> : Buka/Tutup Tool</span>
                <span><kbd>Enter</kbd> : Masukkan SN</span>
              </div>
            </div>
          ) : (
            <table className="reprint-table">
              <thead>
                <tr>
                  <th style={{ width: '45px' }}>#</th>
                  <th>Serial Number</th>
                  <th>Nama Produk</th>
                  <th>SKU</th>
                  <th>Satuan</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {scannedItems.map((item, idx) => (
                  <tr key={item.id} className="reprint-table-row">
                    <td className="reprint-col-idx">{idx + 1}</td>
                    <td className="reprint-col-sn">
                      <span className="reprint-sn-badge">{item.serialNumber}</span>
                    </td>
                    <td className="reprint-col-name">{item.productName}</td>
                    <td className="reprint-col-sku">{item.sku}</td>
                    <td>
                      <span className="reprint-unit-tag">{item.unit}</span>
                    </td>
                    <td>
                      <span className={`reprint-status-pill ${item.status}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="reprint-col-actions">
                      <button
                        type="button"
                        className="reprint-action-btn print"
                        onClick={() => handlePrintLabels([item])}
                        title="Print label untuk barang ini"
                      >
                        <Printer size={15} />
                      </button>
                      <button
                        type="button"
                        className="reprint-action-btn delete"
                        onClick={() => handleRemoveItem(item.id)}
                        title="Hapus dari antrean"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Actions */}
        <div className="reprint-modal-footer">
          <div className="reprint-footer-info">
            <Info size={16} />
            <span>
              Total: <strong>{scannedItems.length}</strong> serial number siap dicetak ulang
            </span>
          </div>

          <div className="reprint-footer-buttons">
            {scannedItems.length > 0 && (
              <button
                type="button"
                className="reprint-btn-secondary"
                onClick={handleClearAll}
              >
                <Trash2 size={16} />
                <span>Bersihkan Antrean</span>
              </button>
            )}

            <LabelSizePicker
              value={labelSize}
              onChange={handleLabelSizeChange}
              disabled={scannedItems.length === 0}
              ariaLabel="Ukuran label"
              className="reprint-label-size"
            />

            <button
              type="button"
              className="reprint-btn-primary"
              disabled={scannedItems.length === 0 || printing}
              onClick={() => handlePrintLabels(scannedItems)}
            >
              {printing ? (
                <>
                  <RefreshCw size={16} className="reprint-spin" />
                  <span>Menyiapkan Cetak...</span>
                </>
              ) : (
                <>
                  <Printer size={16} />
                  <span>Print Semua Label ({scannedItems.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
