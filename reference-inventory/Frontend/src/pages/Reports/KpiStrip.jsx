import React from 'react';
import { Package, Layers, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';

export default function KpiStrip({ totalProducts, totalStock, lowStockCount, outOfStockCount }) {
  const { t } = useApp();

  return (
    <div className="reports-kpi-grid">
      {/* Total SKU */}
      <div className="reports-kpi-card">
        <div className="reports-kpi-header">
          <span className="reports-kpi-label">{t('reports.kpi.skus')}</span>
          <div className="reports-kpi-icon-wrap bg-blue-light">
            <Package className="reports-kpi-icon text-blue" size={18} />
          </div>
        </div>
        <div className="reports-kpi-value-row">
          <span className="reports-kpi-value">{totalProducts.toLocaleString('id-ID')}</span>
          <span className="reports-kpi-suffix">{t('reports.kpi.skuSuffix')}</span>
        </div>
      </div>

      {/* Total Stock */}
      <div className="reports-kpi-card">
        <div className="reports-kpi-header">
          <span className="reports-kpi-label">{t('reports.kpi.totalStock')}</span>
          <div className="reports-kpi-icon-wrap bg-green-light">
            <Layers className="reports-kpi-icon text-green" size={18} />
          </div>
        </div>
        <div className="reports-kpi-value-row">
          <span className="reports-kpi-value">{totalStock.toLocaleString('id-ID')}</span>
          <span className="reports-kpi-suffix">{t('reports.kpi.unitSuffix')}</span>
        </div>
      </div>

      {/* Low Stock */}
      <div className="reports-kpi-card">
        <div className="reports-kpi-header">
          <span className="reports-kpi-label">{t('reports.kpi.lowStock')}</span>
          <div className="reports-kpi-icon-wrap bg-warning-light">
            <AlertTriangle className="reports-kpi-icon text-warning" size={18} />
          </div>
        </div>
        <div className="reports-kpi-value-row">
          <span className="reports-kpi-value">{lowStockCount.toLocaleString('id-ID')}</span>
          <span className="reports-kpi-suffix">{t('reports.kpi.skuSuffix')}</span>
        </div>
      </div>

      {/* Out of Stock */}
      <div className="reports-kpi-card">
        <div className="reports-kpi-header">
          <span className="reports-kpi-label">{t('reports.kpi.outOfStock')}</span>
          <div className="reports-kpi-icon-wrap bg-danger-light">
            <ShieldAlert className="reports-kpi-icon text-danger" size={18} />
          </div>
        </div>
        <div className="reports-kpi-value-row">
          <span className="reports-kpi-value">{outOfStockCount.toLocaleString('id-ID')}</span>
          <span className="reports-kpi-suffix">{t('reports.kpi.skuSuffix')}</span>
        </div>
      </div>
    </div>
  );
}
