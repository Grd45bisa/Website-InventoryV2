import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Package, Layers, AlertTriangle, ShieldAlert, AlertCircle, Wallet, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './KpiCards.css';

function formatCurrency(amount) {
  return 'Rp ' + Number(amount ?? 0).toLocaleString('id-ID');
}

export default function KpiCards() {
  const { t, lang } = useApp();
  const navigate = useNavigate();

  const {
    data: stats,
    isLoading,
    isError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/dashboard/stats');
      if (!res.ok) throw new Error('Failed to load stats');
      const json = await res.json();
      return json.data;
    },
    staleTime: 30000,
  });

  const kpis = useMemo(() => {
    return {
      totalProducts: stats?.totalProducts ?? 0,
      totalStock: stats?.totalStock ?? 0,
      lowStockCount: stats?.lowStockCount ?? 0,
      outOfStockCount: stats?.outOfStockCount ?? 0,
    };
  }, [stats]);

  if (isLoading) {
    return (
      <div className="dashboard-kpi-container">
        <div className="dashboard-kpi-income-grid">
          {[1, 2].map((i) => (
            <div key={i} className="dashboard-kpi-card dashboard-kpi-card--skeleton">
              <div className="skeleton-block" style={{ width: 120, height: 12 }} />
              <div className="skeleton-block" style={{ width: 160, height: 26, marginTop: 8 }} />
            </div>
          ))}
        </div>
        <div className="dashboard-kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="dashboard-kpi-card dashboard-kpi-card--skeleton">
              <div className="skeleton-block" style={{ width: 80, height: 11 }} />
              <div className="skeleton-block" style={{ width: 50, height: 24, marginTop: 6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="dashboard-kpi-grid dashboard-kpi-grid--error">
        <div className="dashboard-kpi-error">
          <AlertCircle size={40} className="dashboard-kpi-error__icon" />
          <p className="dashboard-kpi-error__text">{t('page.loading')}</p>
          <button type="button" className="btn btn-secondary interactive" onClick={() => { refetchStats(); }}>
            {t('general.retry')}
          </button>
        </div>
      </div>
    );
  }

  const paidAmount = stats?.paidAmount ?? 0;
  const paidCount = stats?.paidCount ?? 0;
  const unpaidAmount = stats?.unpaidAmount ?? 0;
  const unpaidCount = stats?.unpaidCount ?? 0;

  const incomeCards = [
    {
      key: 'paidIncome',
      label: t('dashboard.kpi.paidIncome') || 'Pendapatan Lunas (Paid)',
      desc: lang === 'id' ? `${paidCount} faktur telah dilunasi` : `${paidCount} settled invoices`,
      value: formatCurrency(paidAmount),
      icon: Wallet,
      bgClass: 'bg-emerald-light',
      iconColor: 'text-emerald',
      filterParam: 'paid',
    },
    {
      key: 'unpaidIncome',
      label: t('dashboard.kpi.unpaidIncome') || 'Tagihan Belum Lunas (Unpaid)',
      desc: lang === 'id' ? `${unpaidCount} faktur belum lunas` : `${unpaidCount} pending invoices`,
      value: formatCurrency(unpaidAmount),
      icon: Clock,
      bgClass: 'bg-amber-light',
      iconColor: 'text-amber',
      filterParam: 'unpaid',
    },
  ];

  const cards = [
    {
      key: 'totalProducts',
      label: t('dashboard.kpi.totalProducts'),
      desc: t('dashboard.kpi.totalProducts.desc'),
      value: kpis.totalProducts.toLocaleString('id-ID'),
      icon: Package,
      bgClass: 'bg-blue-light',
      iconColor: 'text-blue',
    },
    {
      key: 'totalStock',
      label: t('dashboard.kpi.totalStock'),
      desc: t('dashboard.kpi.totalStock.desc'),
      value: kpis.totalStock.toLocaleString('id-ID'),
      icon: Layers,
      bgClass: 'bg-green-light',
      iconColor: 'text-green',
    },
    {
      key: 'lowStock',
      label: t('dashboard.kpi.lowStock'),
      desc: t('dashboard.kpi.lowStock.desc'),
      value: kpis.lowStockCount.toLocaleString('id-ID'),
      icon: AlertTriangle,
      bgClass: 'bg-warning-light',
      iconColor: 'text-warning',
    },
    {
      key: 'outOfStock',
      label: t('dashboard.kpi.outOfStock'),
      desc: t('dashboard.kpi.outOfStock.desc'),
      value: kpis.outOfStockCount.toLocaleString('id-ID'),
      icon: ShieldAlert,
      bgClass: 'bg-danger-light',
      iconColor: 'text-danger',
    },
  ];

  return (
    <div className="dashboard-kpi-container">
      {/* 1. Financial Income KPI Cards (Paid vs Unpaid) */}
      <div className="dashboard-kpi-income-grid">
        {incomeCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className={`dashboard-kpi-card dashboard-kpi-card--clickable dashboard-kpi-card--${card.key}`}
              onClick={() => navigate(`/documents?payment=${card.filterParam}`)}
            >
              <div className="dashboard-kpi-card__header">
                <span className="dashboard-kpi-card__label">{card.label}</span>
                <div className={`dashboard-kpi-card__icon-wrap ${card.bgClass}`}>
                  <Icon className={`dashboard-kpi-card__icon ${card.iconColor}`} size={18} />
                </div>
              </div>
              <div className="dashboard-kpi-card__body">
                <span className="dashboard-kpi-card__value">{card.value}</span>
                <span className="dashboard-kpi-card__desc">{card.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Warehouse & Inventory KPI Cards */}
      <div className="dashboard-kpi-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.key} className={`dashboard-kpi-card dashboard-kpi-card--${card.key}`}>
              <div className="dashboard-kpi-card__header">
                <span className="dashboard-kpi-card__label">{card.label}</span>
                <div className={`dashboard-kpi-card__icon-wrap ${card.bgClass}`}>
                  <Icon className={`dashboard-kpi-card__icon ${card.iconColor}`} size={18} />
                </div>
              </div>
              <div className="dashboard-kpi-card__body">
                <span className="dashboard-kpi-card__value">{card.value}</span>
                <span className="dashboard-kpi-card__desc">{card.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
