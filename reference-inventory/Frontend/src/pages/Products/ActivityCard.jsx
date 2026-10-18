import React from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Package } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import './ActivityCard.css';

const ACTION_CONFIG = {
  created:  { icon: Package,          labelKey: 'activity.created',  color: 'var(--color-success)' },
  updated:  { icon: Package,          labelKey: 'activity.updated',  color: 'var(--color-info)' },
  deleted:  { icon: Package,          labelKey: 'activity.deleted',  color: 'var(--color-danger)' },
  goods_in: { icon: ArrowDownToLine,  labelKey: 'activity.goodsIn', color: 'var(--color-info)' },
  goods_out:{ icon: ArrowUpFromLine,  labelKey: 'activity.goodsOut',color: 'var(--color-warning)' },
};

export default function ActivityCard({ activity }) {
  const { t, userLanguage } = useApp();
  const cfg = ACTION_CONFIG[activity.action] ?? ACTION_CONFIG.updated;
  const Icon = cfg.icon;

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const locale = userLanguage === 'id' ? 'id-ID' : 'en-US';
      return new Date(dateStr).toLocaleDateString(locale, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="activity-card">
      <div className="activity-card__icon-wrap" style={{ color: cfg.color }}>
        <Icon size={14} />
      </div>
      <div className="activity-card__content">
        <span className="activity-card__name">{activity.entity_name || '—'}</span>
        <span className="activity-card__action">{t('activity.by', { action: t(cfg.labelKey), actor: activity.actor_name || t('activity.system') })}</span>
      </div>
      <span className="activity-card__date">{formatDate(activity.created_at)}</span>
    </div>
  );
}
