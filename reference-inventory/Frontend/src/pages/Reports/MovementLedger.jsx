import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';

function thirtyDaysAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function MovementLedger() {
  const { t } = useApp();
  const [currentPage, setCurrentPage] = useState(1);
  const [fromDate, setFromDate] = useState(thirtyDaysAgoIso());
  const [toDate, setToDate] = useState(todayIso());
  const [movementType, setMovementType] = useState('all'); // all, goods_in, goods_out
  const itemsPerPage = 50;

  // 1. Fetch movements from the backend server
  const { data: serverMovements, isLoading: loadingMovements } = useQuery({
    queryKey: ['inventory-movements', currentPage, movementType, fromDate, toDate],
    queryFn: async () => {
      const res = await api.get(
        `/api/workspace/inventory/movements?page=${currentPage}&limit=${itemsPerPage}&type=${movementType === 'all' ? '' : movementType}&from=${fromDate}&to=${toDate}`
      );
      if (!res.ok) throw new Error('Failed to load movements');
      return res.json();
    },
    staleTime: 10000,
  });

  // 2. Fetch goods-in documents for fallback
  const { data: goodsInDocs = [] } = useQuery({
    queryKey: ['goods-in'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/documents?type=goods_in&limit=500');
      if (!res.ok) throw new Error('Failed to load goods-in');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  // 3. Fetch goods-out documents for fallback
  const { data: goodsOutDocs = [] } = useQuery({
    queryKey: ['goods-out'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/documents?type=goods_out&limit=500');
      if (!res.ok) throw new Error('Failed to load goods-out');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  // Derived/fallback movements if the backend is stubbed (returns 0 logs)
  const derivedMovements = useMemo(() => {
    const list = [];

    // Parse Goods In
    goodsInDocs.forEach((doc) => {
      if (doc.status === 'cancelled') return;
      const docDate = doc.issue_date || doc.created_at;
      if (fromDate && docDate < fromDate) return;
      if (toDate && docDate > toDate) return;

      (doc.items || []).forEach((item) => {
        list.push({
          id: `gi-item-${item.id}`,
          date: docDate,
          productName: item.item_name || item.productName || '—',
          sku: item.sku || '—',
          type: 'goods_in',
          reference: doc.document_number,
          qtyIn: item.quantity || 0,
          qtyOut: 0,
        });
      });
    });

    // Parse Goods Out
    goodsOutDocs.forEach((doc) => {
      if (doc.status === 'cancelled') return;
      const docDate = doc.issue_date || doc.created_at;
      if (fromDate && docDate < fromDate) return;
      if (toDate && docDate > toDate) return;

      (doc.items || []).forEach((item) => {
        list.push({
          id: `go-item-${item.id}`,
          date: docDate,
          productName: item.item_name || item.productName || '—',
          sku: item.sku || '—',
          type: 'goods_out',
          reference: doc.document_number,
          qtyIn: 0,
          qtyOut: item.quantity || 0,
        });
      });
    });

    // Sort by date descending
    list.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Filter by type dropdown
    if (movementType === 'goods_in') {
      return list.filter((m) => m.type === 'goods_in');
    }
    if (movementType === 'goods_out') {
      return list.filter((m) => m.type === 'goods_out');
    }
    return list;
  }, [goodsInDocs, goodsOutDocs, fromDate, toDate, movementType]);

  // Determine whether to use server data or client fallback
  const isServerPopulated = serverMovements?.count > 0;
  
  const displayMovements = useMemo(() => {
    if (isServerPopulated) {
      return serverMovements.data ?? [];
    }
    // Paginate client-side fallback
    const start = (currentPage - 1) * itemsPerPage;
    return derivedMovements.slice(start, start + itemsPerPage);
  }, [serverMovements, derivedMovements, isServerPopulated, currentPage]);

  const totalCount = isServerPopulated ? serverMovements.count : derivedMovements.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  const handleFilterChange = (typeVal) => {
    setMovementType(typeVal);
    setCurrentPage(1);
  };

  return (
    <div className="reports-section">
      {/* Date & Type Filters */}
      <div className="reports-filters-bar">
        <div className="reports-movement-filters">
          <div className="reports-filter-field">
            <label className="reports-filter-label">{t('reports.movements.dateFrom')}</label>
            <input
              type="date"
              className="input reports-date-input"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div className="reports-filter-field">
            <label className="reports-filter-label">{t('reports.movements.dateTo')}</label>
            <input
              type="date"
              className="input reports-date-input"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div className="reports-filter-field">
            <label className="reports-filter-label">{t('reports.stock.colStatus')}</label>
            <select
              className="input select"
              style={{ minWidth: 140 }}
              value={movementType}
              onChange={(e) => handleFilterChange(e.target.value)}
            >
              <option value="all">{t('reports.movements.filterTypeAll')}</option>
              <option value="goods_in">{t('reports.movements.filterTypeIn')}</option>
              <option value="goods_out">{t('reports.movements.filterTypeOut')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="reports-table-wrapper">
        <table className="reports-table">
          <thead>
            <tr>
              <th>{t('reports.movements.colDate')}</th>
              <th>{t('reports.movements.colProduct')}</th>
              <th>{t('reports.movements.colSku')}</th>
              <th>{t('reports.movements.colType')}</th>
              <th>{t('reports.movements.colRef')}</th>
              <th className="text-right">{t('reports.movements.colQtyIn')}</th>
              <th className="text-right">{t('reports.movements.colQtyOut')}</th>
            </tr>
          </thead>
          <tbody>
            {displayMovements.length > 0 ? (
              displayMovements.map((movement) => (
                <tr key={movement.id} className="reports-table-row">
                  <td data-label={t('reports.movements.colDate')}>{formatDate(movement.date)}</td>
                  <td data-label={t('reports.movements.colProduct')} className="text-bold">
                    {movement.productName}
                  </td>
                  <td data-label={t('reports.movements.colSku')}>{movement.sku}</td>
                  <td data-label={t('reports.movements.colType')}>
                    <span
                      className={`reports-movement-badge ${
                        movement.type === 'goods_in' ? 'badge-in' : 'badge-out'
                      }`}
                    >
                      {movement.type === 'goods_in'
                        ? t('reports.movements.filterTypeIn')
                        : t('reports.movements.filterTypeOut')}
                    </span>
                  </td>
                  <td data-label={t('reports.movements.colRef')}>{movement.reference}</td>
                  <td data-label={t('reports.movements.colQtyIn')} className="text-right text-green text-bold">
                    {movement.qtyIn > 0 ? `+${movement.qtyIn}` : '—'}
                  </td>
                  <td data-label={t('reports.movements.colQtyOut')} className="text-right text-danger text-bold">
                    {movement.qtyOut > 0 ? `-${movement.qtyOut}` : '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="reports-empty-cell">
                  {t('reports.movements.noData')}
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
            onClick={() => setCurrentPage((prev) => prev - 1)}
          >
            {t('reports.movements.pagination.prev')}
          </button>
          <span className="reports-page-indicator">
            {t('reports.movements.pagination.page', { current: currentPage, total: totalPages })}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((prev) => prev + 1)}
          >
            {t('reports.movements.pagination.next')}
          </button>
        </div>
      )}
    </div>
  );
}
