import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import KpiCards from './KpiCards.jsx';
import QuickActions from './QuickActions.jsx';
import RecentActivity from './RecentActivity.jsx';
import RecentPurchaseOrders from './RecentPurchaseOrders.jsx';
import InventoryFlowChart from './InventoryFlowChart.jsx';
import OverdueInvoices from './OverdueInvoices.jsx';
import OverdueBubble from './OverdueBubble.jsx';
import DocumentDetailModal from '../Documents/DocumentDetailModal.jsx';
import SalesDashboard from './SalesDashboard.jsx';
import './DashboardPage.css';

export default function DashboardPage() {
  const { t, user, lang } = useApp();
  const queryClient = useQueryClient();
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Get current hour for dynamic greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.welcome.morning');
    if (hour < 17) return t('dashboard.welcome.afternoon');
    return t('dashboard.welcome.evening');
  }, [t]);

  // Format today's date nicely
  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, [lang]);

  const userName = user?.fullName || user?.full_name || 'User';

  const systemText = useMemo(() => ({
    title: lang === 'id' ? 'Status Sistem' : 'System Status',
    version: lang === 'id' ? 'Versi' : 'Version',
    status: lang === 'id' ? 'Koneksi' : 'Connection',
    statusVal: lang === 'id' ? 'Terhubung' : 'Connected',
  }), [lang]);

  const isSalesPerson = user?.role?.toLowerCase() === 'sales_person';

  if (isSalesPerson) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-page__header">
          <div className="dashboard-page__welcome">
            <h1 className="dashboard-page__greeting">
              {greeting}, <span className="dashboard-page__username">{userName}</span>! 👋
            </h1>
            <p className="dashboard-page__subtitle">
              {lang === 'id' ? 'Ikhtisar performa penjualan dan aktivitas Anda' : 'Your sales performance and activity overview'}
            </p>
          </div>
          <div className="dashboard-page__date-badge">
            <span className="dashboard-page__date">{formattedDate}</span>
          </div>
        </div>

        <SalesDashboard />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-page__header">
        <div className="dashboard-page__welcome">
          <h1 className="dashboard-page__greeting">
            {greeting}, <span className="dashboard-page__username">{userName}</span>! 👋
          </h1>
          <p className="dashboard-page__subtitle">{t('dashboard.subtitle')}</p>
        </div>
        <div className="dashboard-page__date-badge">
          <span className="dashboard-page__date">{formattedDate}</span>
        </div>
      </div>

      <OverdueBubble />

      <KpiCards />

      <div className="dashboard-page__layout">
        <div className="dashboard-page__main-content">
          <RecentPurchaseOrders />
          <InventoryFlowChart />
          <RecentActivity onSelect={setSelectedDoc} />
        </div>
        <div className="dashboard-page__sidebar">
          <QuickActions />
          <OverdueInvoices />
          
          <div className="dashboard-system-card">
            <h3 className="dashboard-system-card__title">{systemText.title}</h3>
            <div className="dashboard-system-card__divider" />
            <div className="dashboard-system-card__body">
              <div className="dashboard-system-card__row">
                <span className="dashboard-system-card__key">{systemText.version}</span>
                <span className="dashboard-system-card__value">v1.2.0 (Nemo)</span>
              </div>
              <div className="dashboard-system-card__row">
                <span className="dashboard-system-card__key">{systemText.status}</span>
                <span className="dashboard-system-card__value dashboard-system-card__value--status">
                  <span className="dashboard-system-card__status-dot" />
                  {systemText.statusVal}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedDoc && (
        <DocumentDetailModal
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onUpdate={(updated) => {
            setSelectedDoc(updated);
            queryClient.setQueryData(['documents'], (prev) =>
              (prev ?? []).map((d) => d.id === updated.id ? { ...d, ...updated } : d)
            );
          }}
        />
      )}
    </div>
  );
}
