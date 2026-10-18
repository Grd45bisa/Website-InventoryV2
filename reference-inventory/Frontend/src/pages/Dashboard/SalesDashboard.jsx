import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, FileText, Plus, RefreshCw, BarChart2, TrendingUp } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './SalesDashboard.css';

export default function SalesDashboard() {
  const { lang } = useApp();
  const navigate = useNavigate();
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const {
    data: stats,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['sales-dashboard-stats'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/sales-dashboard/stats');
      if (!res.ok) throw new Error('Failed to load sales stats');
      const json = await res.json();
      return json.data;
    },
    staleTime: 30000,
  });

  const chartData = useMemo(() => {
    return stats?.weeklyTraffic ?? [];
  }, [stats]);

  const maxVal = useMemo(() => {
    const counts = chartData.map((d) => d.count);
    const max = Math.max(...counts, 0);
    return max === 0 ? 5 : Math.ceil(max * 1.2);
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="sales-dashboard__loading">
        <div className="skeleton-block" style={{ width: '100%', height: 100, borderRadius: 'var(--radius-lg)' }} />
        <div className="skeleton-block" style={{ width: '100%', height: 350, marginTop: 20, borderRadius: 'var(--radius-lg)' }} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="sales-dashboard__error">
        <RefreshCw size={36} className="animate-spin" />
        <p>{lang === 'id' ? 'Gagal memuat statistik dasbor' : 'Failed to load dashboard statistics'}</p>
        <button type="button" className="btn btn-secondary" onClick={refetch}>
          {lang === 'id' ? 'Coba Lagi' : 'Retry'}
        </button>
      </div>
    );
  }

  const newCustomersToday = stats?.newCustomersToday ?? 0;
  const totalPOs = stats?.totalPOs ?? 0;

  // Chart setup
  const width = 520;
  const height = 220;
  const paddingLeft = 40;
  const paddingRight = 35;
  const paddingTop = 20;
  const paddingBottom = 30;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const points = chartData.map((d, i) => {
    const x = paddingLeft + (i / 6) * plotWidth;
    const y = height - paddingBottom - (d.count / maxVal) * plotHeight;
    return { x, y };
  });

  const linePath = points.length > 0
    ? points.reduce((path, p, i) => path + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), '')
    : '';

  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
    : '';

  const gridTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="sales-dashboard">
      {/* KPI Cards */}
      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card dashboard-kpi-card--customers" onClick={() => navigate('/partners/customers')} style={{ cursor: 'pointer' }}>
          <div className="dashboard-kpi-card__header">
            <span className="dashboard-kpi-card__label">
              {lang === 'id' ? 'Pelanggan Baru Hari Ini' : 'New Customers Today'}
            </span>
            <div className="dashboard-kpi-card__icon-wrap bg-blue-light">
              <Users className="dashboard-kpi-card__icon text-blue" size={18} />
            </div>
          </div>
          <div className="dashboard-kpi-card__body">
            <span className="dashboard-kpi-card__value">{newCustomersToday}</span>
            <span className="dashboard-kpi-card__desc">
              {lang === 'id' ? 'Pelanggan yang Anda daftarkan hari ini' : 'Customers registered by you today'}
            </span>
          </div>
        </div>

        <div className="dashboard-kpi-card dashboard-kpi-card--pos" onClick={() => navigate('/purchase-orders')} style={{ cursor: 'pointer' }}>
          <div className="dashboard-kpi-card__header">
            <span className="dashboard-kpi-card__label">
              {lang === 'id' ? 'Total Purchase Order' : 'Total Purchase Orders'}
            </span>
            <div className="dashboard-kpi-card__icon-wrap bg-green-light">
              <FileText className="dashboard-kpi-card__icon text-green" size={18} />
            </div>
          </div>
          <div className="dashboard-kpi-card__body">
            <span className="dashboard-kpi-card__value">{totalPOs}</span>
            <span className="dashboard-kpi-card__desc">
              {lang === 'id' ? 'Jumlah PO yang Anda buat' : 'Total POs created by you'}
            </span>
          </div>
        </div>
      </div>

      <div className="dashboard-page__layout">
        {/* Main Chart content */}
        <div className="dashboard-page__main-content">
          <div className="dashboard-chart-card">
            <div className="dashboard-chart-card__header">
              <div className="dashboard-chart-card__info">
                <div className="dashboard-chart-card__title-wrap">
                  <BarChart2 className="dashboard-chart-card__title-icon" size={18} />
                  <h3 className="dashboard-chart-card__title">
                    {lang === 'id' ? 'Trafik Pembuatan Purchase Order' : 'Purchase Order Creation Traffic'}
                  </h3>
                </div>
                <p className="dashboard-chart-card__subtitle">
                  {lang === 'id'
                    ? 'Jumlah transaksi PO yang Anda ajukan (7 hari terakhir)'
                    : 'Number of PO transactions submitted by you (last 7 days)'}
                </p>
              </div>
            </div>

            <div className="dashboard-chart-card__body">
              <div className="inventory-chart-container" style={{ position: 'relative' }}>
                <svg viewBox={`0 0 ${width} ${height}`} className="inventory-chart-svg">
                  {/* Grid Lines */}
                  {gridTicks.map((tick, idx) => {
                    const y = paddingTop + (1 - tick) * plotHeight;
                    const val = tick * maxVal;
                    return (
                      <g key={idx} className="inventory-chart-grid-line">
                        <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="var(--color-border-subtle)" strokeDasharray="4 4" />
                        <text x={paddingLeft - 10} y={y + 4} textAnchor="end" fontSize="10" fill="var(--color-text-tertiary)">
                          {Math.round(val)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Area path */}
                  {areaPath && (
                    <path
                      d={areaPath}
                      fill="url(#poAreaGrad)"
                      opacity="0.15"
                    />
                  )}

                  {/* Line path */}
                  {linePath && (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="var(--color-interactive)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Data points */}
                  {points.map((p, idx) => {
                    const isHovered = hoveredIndex === idx;
                    return (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={isHovered ? 6 : 4}
                          fill="var(--color-interactive)"
                          stroke="var(--color-surface)"
                          strokeWidth={isHovered ? 2.5 : 1.5}
                          style={{ transition: 'all 0.15s ease-in-out' }}
                        />
                        {/* Hover trigger zone */}
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="15"
                          fill="transparent"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        />
                      </g>
                    );
                  })}

                  {/* X Axis Labels */}
                  {chartData.map((d, idx) => {
                    const x = paddingLeft + (idx / 6) * plotWidth;
                    const dateObj = new Date(d.date);
                    const formattedLabel = dateObj.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
                      day: 'numeric',
                      month: 'short',
                    });
                    return (
                      <text
                        key={idx}
                        x={x}
                        y={height - 10}
                        textAnchor="middle"
                        fontSize="10"
                        fill="var(--color-text-tertiary)"
                      >
                        {formattedLabel}
                      </text>
                    );
                  })}

                  <defs>
                    <linearGradient id="poAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-interactive)" />
                      <stop offset="100%" stopColor="var(--color-interactive)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Tooltip Overlay */}
                {hoveredIndex !== null && chartData[hoveredIndex] && (
                  <div
                    className="inventory-chart-tooltip"
                    style={{
                      position: 'absolute',
                      left: points[hoveredIndex].x + 10,
                      top: points[hoveredIndex].y - 45,
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                      pointerEvents: 'none',
                      zIndex: 10
                    }}
                  >
                    <div className="inventory-chart-tooltip__date" style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>
                      {new Date(chartData[hoveredIndex].date).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </div>
                    <div className="inventory-chart-tooltip__metric" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', marginTop: '2px' }}>
                      <span className="inventory-chart-tooltip__color-dot bg-blue" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-interactive)' }} />
                      <span className="inventory-chart-tooltip__label" style={{ color: 'var(--color-text-secondary)' }}>POs: </span>
                      <span className="inventory-chart-tooltip__value font-bold" style={{ fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                        {chartData[hoveredIndex].count}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Actions content */}
        <div className="dashboard-page__sidebar">
          <div className="dashboard-quick-actions">
            <h3 className="dashboard-quick-actions__title">{lang === 'id' ? 'Aksi Cepat' : 'Quick Actions'}</h3>
            <div className="dashboard-quick-actions__grid">
              <button
                type="button"
                className="dashboard-quick-actions__btn"
                onClick={() => navigate('/purchase-orders/create')}
              >
                <div className="dashboard-quick-actions__icon-wrap bg-blue-light">
                  <Plus className="dashboard-quick-actions__icon text-blue" size={20} />
                </div>
                <div className="dashboard-quick-actions__text">
                  <span className="dashboard-quick-actions__name">
                    {lang === 'id' ? 'Buat Purchase Order' : 'Create Purchase Order'}
                  </span>
                  <span className="dashboard-quick-actions__desc">
                    {lang === 'id' ? 'Ajukan pemesanan barang baru' : 'Submit a new purchase order'}
                  </span>
                </div>
              </button>

              <button
                type="button"
                className="dashboard-quick-actions__btn"
                onClick={() => navigate('/partners/customers?create=true')}
              >
                <div className="dashboard-quick-actions__icon-wrap bg-green-light">
                  <Plus className="dashboard-quick-actions__icon text-green" size={20} />
                </div>
                <div className="dashboard-quick-actions__text">
                  <span className="dashboard-quick-actions__name">
                    {lang === 'id' ? 'Tambah Pelanggan' : 'Add Customer'}
                  </span>
                  <span className="dashboard-quick-actions__desc">
                    {lang === 'id' ? 'Daftarkan mitra/pelanggan baru' : 'Register a new customer/partner'}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div className="dashboard-system-card">
            <h3 className="dashboard-system-card__title">
              {lang === 'id' ? 'Performa Sales' : 'Sales Performance'}
            </h3>
            <div className="dashboard-system-card__divider" />
            <div className="dashboard-system-card__body">
              <div className="dashboard-system-card__row">
                <span className="dashboard-system-card__key" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={14} className="text-green" />
                  {lang === 'id' ? 'Status Aktivitas' : 'Activity Status'}
                </span>
                <span className="dashboard-system-card__value dashboard-system-card__value--status">
                  <span className="dashboard-system-card__status-dot" />
                  {lang === 'id' ? 'Aktif Melayani' : 'Active Duty'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
