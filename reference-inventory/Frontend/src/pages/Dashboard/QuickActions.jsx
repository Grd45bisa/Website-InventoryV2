import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, ClipboardList, Package, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import './QuickActions.css';

export default function QuickActions() {
  const { t } = useApp();
  const navigate = useNavigate();

  const actions = [
    {
      label: t('dashboard.quickActions.goodsIn'),
      desc: t('dashboard.quickActions.goodsIn.desc'),
      icon: ArrowDownToLine,
      path: '/inventory/goods-in',
      colorClass: 'inbound',
    },
    {
      label: t('dashboard.quickActions.goodsOut'),
      desc: t('dashboard.quickActions.goodsOut.desc'),
      icon: ArrowUpFromLine,
      path: '/inventory/goods-out',
      colorClass: 'outbound',
    },
    {
      label: t('dashboard.quickActions.po') || 'Purchase Order',
      desc: t('dashboard.quickActions.po.desc') || 'Buat & pantau pesanan pembelian',
      icon: ClipboardList,
      path: '/purchase-orders',
      colorClass: 'po',
    },
    {
      label: t('dashboard.quickActions.products'),
      desc: t('dashboard.quickActions.products.desc'),
      icon: Package,
      path: '/inventory/products',
      colorClass: 'products',
    },
  ];

  return (
    <div className="dashboard-quick-actions">
      <h2 className="dashboard-quick-actions__title">{t('dashboard.quickActions.title')}</h2>
      <div className="dashboard-quick-actions__grid">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <div
              key={action.path}
              className={`dashboard-quick-actions__card dashboard-quick-actions__card--${action.colorClass}`}
              onClick={() => navigate(action.path)}
            >
              <div className="dashboard-quick-actions__icon-wrap">
                <Icon size={20} className="dashboard-quick-actions__icon" />
              </div>
              <div className="dashboard-quick-actions__card-content">
                <h3 className="dashboard-quick-actions__label">{action.label}</h3>
                <p className="dashboard-quick-actions__desc">{action.desc}</p>
              </div>
              <ChevronRight size={16} className="dashboard-quick-actions__arrow" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
