import React from 'react';
import { Warehouse, Loader2, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import './WarehouseSwitchOverlay.css';

export default function WarehouseSwitchOverlay() {
  const { isSwitchingWarehouse, switchingTargetWarehouseName, lang } = useApp();

  if (!isSwitchingWarehouse) return null;

  return (
    <div className="wh-switch-overlay" role="dialog" aria-modal="true">
      <div className="wh-switch-card">
        <div className="wh-switch-icon-wrapper">
          <div className="wh-switch-icon-pulse" />
          <div className="wh-switch-icon-main">
            <Warehouse size={28} />
          </div>
          <div className="wh-switch-spinner">
            <Loader2 size={48} className="wh-switch-spin" />
          </div>
        </div>

        <div className="wh-switch-content">
          <div className="wh-switch-badge">
            <Sparkles size={12} />
            <span>{lang === 'id' ? 'Beralih Gudang' : 'Switching Storage'}</span>
          </div>
          <h3 className="wh-switch-title">
            {lang === 'id'
              ? `Memuat ${switchingTargetWarehouseName || 'Gudang'}...`
              : `Loading ${switchingTargetWarehouseName || 'Storage'}...`}
          </h3>
          <p className="wh-switch-desc">
            {lang === 'id'
              ? 'Menyiapkan stok produk, nomor seri, dan riwayat dokumen...'
              : 'Preparing inventory stock, serial numbers, and transaction history...'}
          </p>
        </div>

        <div className="wh-switch-progress-bar">
          <div className="wh-switch-progress-fill" />
        </div>
      </div>
    </div>
  );
}
