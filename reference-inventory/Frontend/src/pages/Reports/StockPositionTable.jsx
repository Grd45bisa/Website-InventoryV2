import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Search, FileSpreadsheet, Braces, Barcode, X, Tag } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings, canExportProducts } from '../../utils/api.js';
import { useUnits } from '../../hooks/useUnits.js';
import {
  LUSIN_IN_PCS,
  formatPcsAsLusinAndPcs,
  formatUnitNumber,
  resolveMultiplier,
} from '../../utils/reportUnits.js';

function buildStockRow(product, serialIndex, { multipliers, customUnits }) {
  const bucket = serialIndex?.get(product.id);
  const serialLines = bucket?.lines ?? [];
  const serialPcs = bucket?.totalPcs ?? 0;
  const totalPcs = Math.max(0, Number(product.stock) || 0);
  const nonSerialPcs = Math.max(0, totalPcs - serialPcs);
  const unitKey = product.unitKey || 'pcs';
  const multiplier = resolveMultiplier(unitKey, multipliers, customUnits) || 1;
  const nonSerialQty = nonSerialPcs / multiplier;

  let statusText = 'reports.stock.status.inStock';
  if (totalPcs === 0) statusText = 'reports.stock.status.outOfStock';
  else if (totalPcs <= product.minStock) statusText = 'reports.stock.status.lowStock';

  return {
    ...product,
    unitKey,
    totalPcs,
    serialPcs,
    nonSerialPcs,
    nonSerialQty,
    serialLines,
    statusKey: statusText,
  };
}

// Memoized Row Component to prevent unnecessary re-renders
const StockRow = React.memo(({ row, isExpanded, onToggle, onViewSerials }) => {
  const { t } = useApp();
  const { serialLines } = row;

  let statusClass = 'reports-status--in-stock';
  if (row.totalPcs === 0) {
    statusClass = 'reports-status--out-of-stock';
  } else if (row.totalPcs <= row.minStock) {
    statusClass = 'reports-status--low-stock';
  }

  return (
    <>
      <tr className="reports-table-row interactive" onClick={onToggle}>
        <td data-label={t('reports.stock.colProduct')}>
          <div className="reports-product-cell">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>{row.name}</span>
          </div>
        </td>
        <td data-label={t('reports.stock.colSku')}>{row.sku || '—'}</td>
        <td data-label={t('reports.stock.colTotal')} className="text-right text-bold">
          <span className="reports-qty-primary">{formatPcsAsLusinAndPcs(row.totalPcs)}</span>
          <span className="reports-qty-secondary">
            {formatUnitNumber(row.totalPcs)} {t('reports.stock.unitPcs')}
          </span>
        </td>
        <td data-label={t('reports.stock.colSerial')} className="text-right">
          {row.serialLines.length > 0 ? (
            <button
              type="button"
              className="reports-serial-badge-btn"
              onClick={(e) => {
                e.stopPropagation();
                onViewSerials(row);
              }}
            >
              {row.serialLines.length}
            </button>
          ) : (
            '0'
          )}
          <span className="reports-qty-secondary">
            {formatPcsAsLusinAndPcs(row.serialPcs)}
          </span>
        </td>
        <td data-label={t('reports.stock.colNonSerial')} className="text-right">
          <span className="reports-qty-primary">
            {formatUnitNumber(row.nonSerialQty)} {row.unitKey}
          </span>
          <span className="reports-qty-secondary">
            {formatUnitNumber(row.nonSerialPcs)} {t('reports.stock.unitPcs')}
          </span>
        </td>
        <td data-label={t('reports.stock.colStatus')}>
          <span className={`reports-status-badge ${statusClass}`}>{t(row.statusKey)}</span>
        </td>
      </tr>

      {isExpanded && (
        <tr className="reports-expand-row">
          <td colSpan={6} className="reports-expand-cell">
            <div className="reports-expand-container">
              {serialLines.length > 0 ? (
                <div>
                  <h5 className="reports-expand-title">{t('reports.stock.expand.serialTitle')}</h5>
                  <div className="reports-expand-serials-list">
                    {serialLines.map((line) => (
                      <span key={line.id} className="reports-serial-tag">
                        {line.serialNumber}
                        <span className="reports-serial-tag-unit">{line.qtyText}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="reports-expand-muted">{t('reports.stock.expand.noSerials')}</p>
              )}
              <p className="reports-expand-note">
                * {t('reports.stock.expand.nonSerialQty')} ({formatUnitNumber(row.nonSerialQty)} {row.unitKey} /{' '}
                {formatUnitNumber(row.nonSerialPcs)} {t('reports.stock.unitPcs')})
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

export default function StockPositionTable({ products = [], serialIndex }) {
  const { t, user } = useApp();
  const { multipliers, customUnits } = useUnits();

  const { data: wsSettings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  const canExport = useMemo(() => {
    return canExportProducts(wsSettings, user);
  }, [wsSettings, user]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState('');
  const [viewingSerialsProduct, setViewingSerialsProduct] = useState(null);
  const itemsPerPage = 50;

  // Debounce search query input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return products;
    const q = debouncedSearch.toLowerCase();
    return products.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q)
    );
  }, [products, debouncedSearch]);

  const rows = useMemo(
    () => filteredProducts.map((p) => buildStockRow(p, serialIndex, { multipliers, customUnits })),
    [filteredProducts, serialIndex, multipliers, customUnits]
  );

  // Paginated products
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return rows.slice(start, start + itemsPerPage);
  }, [rows, currentPage]);

  const totalPages = Math.max(1, Math.ceil(rows.length / itemsPerPage));

  const toggleRow = (productId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleExport = async (format) => {
    if (!canExport) {
      alert('Izin ekspor dibatasi pada versi produksi.');
      return;
    }
    setExporting(format);
    try {
      const totals = rows.reduce(
        (acc, row) => {
          acc.totalPcs += row.totalPcs;
          acc.serialPcs += row.serialPcs;
          acc.nonSerialPcs += row.nonSerialPcs;
          acc.serialCount += row.serialLines.length;
          return acc;
        },
        { totalPcs: 0, serialPcs: 0, nonSerialPcs: 0, serialCount: 0 }
      );

      const exportProducts = rows.map((row) => ({
        name: row.name,
        sku: row.sku || '—',
        status: t(row.statusKey),
        unitKey: row.unitKey,
        totalPcs: row.totalPcs,
        totalLusin: row.totalPcs / LUSIN_IN_PCS,
        totalText: formatPcsAsLusinAndPcs(row.totalPcs),
        serialCount: row.serialLines.length,
        serialPcs: row.serialPcs,
        nonSerialPcs: row.nonSerialPcs,
        nonSerialQty: row.nonSerialQty,
        nonSerialText: `${formatUnitNumber(row.nonSerialQty)} ${row.unitKey} / ${formatUnitNumber(row.nonSerialPcs)} ${t('reports.stock.unitPcs')}`,
        serials: row.serialLines.map((line) => ({
          serialNumber: line.serialNumber,
          status: line.status,
          unitKey: line.unitKey,
          displayUnit: line.displayUnit,
          qtyPcs: line.qtyPcs,
          qtyLusin: line.qtyPcs / LUSIN_IN_PCS,
          qtyText: line.qtyText,
        })),
      }));

      const response = await api.post('/api/workspace/inventory/export', {
        format,
        filename: 'inventory_stock_position',
        generatedAt: new Date().toISOString(),
        totals: {
          ...totals,
          totalLusin: totals.totalPcs / LUSIN_IN_PCS,
          serialLusin: totals.serialPcs / LUSIN_IN_PCS,
          nonSerialLusin: totals.nonSerialPcs / LUSIN_IN_PCS,
        },
        products: exportProducts,
      });
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory_stock_position.${format}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(t('reports.stock.exportError'));
    } finally {
      setExporting('');
    }
  };

  const viewingSerials = useMemo(() => {
    if (!viewingSerialsProduct) return [];
    const bucket = serialIndex?.get(viewingSerialsProduct.id);
    return bucket?.lines ?? [];
  }, [viewingSerialsProduct, serialIndex]);

  return (
    <div className="reports-section">
      {/* Search and export bar */}
      <div className="reports-filters-bar">
        <div className="reports-search-wrap">
          <Search size={16} className="reports-search-icon" />
          <input
            type="text"
            className="input reports-search-input"
            placeholder={t('reports.stock.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="reports-export-group">
          {canExport && (
            <>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                disabled={Boolean(exporting) || rows.length === 0}
                className="btn btn-secondary btn-md reports-export-btn"
              >
                <FileSpreadsheet size={16} />
                <span>{exporting === 'csv' ? t('reports.stock.exporting') : t('reports.stock.exportCsv')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport('json')}
                disabled={Boolean(exporting) || rows.length === 0}
                className="btn btn-secondary btn-md reports-export-btn"
              >
                <Braces size={16} />
                <span>{exporting === 'json' ? t('reports.stock.exporting') : t('reports.stock.exportJson')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Responsive data table */}
      <div className="reports-table-wrapper">
        <table className="reports-table">
          <thead>
            <tr>
              <th>{t('reports.stock.colProduct')}</th>
              <th>{t('reports.stock.colSku')}</th>
              <th className="text-right">{t('reports.stock.colTotal')}</th>
              <th className="text-right">{t('reports.stock.colSerial')}</th>
              <th className="text-right">{t('reports.stock.colNonSerial')}</th>
              <th>{t('reports.stock.colStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length > 0 ? (
              paginatedRows.map((row) => (
                <StockRow
                  key={row.id}
                  row={row}
                  isExpanded={expandedIds.has(row.id)}
                  onToggle={() => toggleRow(row.id)}
                  onViewSerials={setViewingSerialsProduct}
                />
              ))
            ) : (
              <tr>
                <td colSpan={6} className="reports-empty-cell">
                  {t('reports.stock.noData')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="reports-pagination">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
          >
            {t('reports.stock.pagination.prev')}
          </button>
          <span className="reports-page-indicator">
            {t('reports.stock.pagination.page', { current: currentPage, total: totalPages })}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            {t('reports.stock.pagination.next')}
          </button>
        </div>
      )}

      {/* Drawer: View All Serials (Right Sidebar) */}
      {viewingSerialsProduct && (
        <div className="reports-drawer-overlay" onClick={() => setViewingSerialsProduct(null)}>
          <div className="reports-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="reports-drawer__header">
              <div className="reports-drawer__header-left">
                <div className="reports-kpi-icon-wrap bg-blue-light">
                  <Barcode className="text-blue" size={20} />
                </div>
                <div>
                  <h3 className="reports-drawer__header-title">{t('reports.stock.drawer.title')}</h3>
                  <p className="reports-drawer__header-subtitle">{viewingSerialsProduct.name}</p>
                </div>
              </div>
              <button type="button" className="reports-drawer__close-btn" onClick={() => setViewingSerialsProduct(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="reports-drawer__body">
              {viewingSerials.length > 0 ? (
                <div className="reports-drawer__serial-card-list">
                  <div className="reports-drawer__serials-header">
                    {t('reports.stock.drawer.total', { count: viewingSerials.length })}
                  </div>
                  {viewingSerials.map((line) => (
                    <div key={line.id} className="reports-drawer__serial-card">
                      <div className="reports-drawer__serial-label">
                        <Tag size={14} className="text-muted" />
                        <span className="reports-drawer__serial-value">{line.serialNumber}</span>
                      </div>
                      <div className="reports-drawer__serial-meta">
                        <span className="reports-drawer__serial-unit">
                          {t('reports.stock.drawer.unit', { unit: `${line.unitKey} · ${line.qtyText}` })}
                        </span>
                        <span className={`reports-status-badge ${
                          String(line.status || '').toLowerCase() === 'available'
                            ? 'reports-status--in-stock'
                            : 'reports-status--out-of-stock'
                        }`}>
                          {line.status || t('reports.stock.drawer.statusAvailable')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="reports-drawer__empty">
                  <Barcode size={32} className="reports-drawer__empty-icon" />
                  <p className="reports-expand-muted" style={{ margin: 0 }}>
                    {t('reports.stock.expand.noSerials')}
                  </p>
                </div>
              )}
            </div>
            <div className="reports-drawer__footer">
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={() => setViewingSerialsProduct(null)}
                style={{ width: '100%' }}
              >
                {t('reports.stock.drawer.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
