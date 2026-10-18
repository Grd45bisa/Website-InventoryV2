import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, BarChart2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './InventoryFlowChart.css';

export default function InventoryFlowChart() {
  const { t, lang } = useApp();
  const [metric, setMetric] = useState('volume'); // 'volume' or 'value'
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const {
    data: rawDocs,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/documents?limit=150');
      if (!res.ok) throw new Error('Failed to load documents');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  // Generate last 7 days chart dataset
  const chartData = useMemo(() => {
    const docs = rawDocs ?? [];
    const completedDocs = docs.filter(d => d.status === 'completed');

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }

    return days.map((day) => {
      const formattedDate = day.toISOString().slice(0, 10);
      
      const dayDocs = completedDocs.filter(d => {
        const docDate = d.issue_date ? d.issue_date.slice(0, 10) : '';
        return docDate === formattedDate;
      });

      const goodsInDocs = dayDocs.filter(d => d.document_type === 'goods_in');
      const goodsOutDocs = dayDocs.filter(d => d.document_type === 'goods_out');

      const goodsInVolume = goodsInDocs.reduce((sum, d) => {
        const itemQty = d.items?.reduce((s, item) => s + Number(item.quantity || 0), 0) || 0;
        return sum + itemQty;
      }, 0);

      const goodsOutVolume = goodsOutDocs.reduce((sum, d) => {
        const itemQty = d.items?.reduce((s, item) => s + Number(item.quantity || 0), 0) || 0;
        return sum + itemQty;
      }, 0);

      const goodsInValue = goodsInDocs.reduce((sum, d) => sum + Number(d.total || 0), 0);
      const goodsOutValue = goodsOutDocs.reduce((sum, d) => sum + Number(d.total || 0), 0);

      const dayLabel = day.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
        day: 'numeric',
        month: 'short'
      });

      return {
        dateStr: formattedDate,
        label: dayLabel,
        goodsIn: metric === 'volume' ? goodsInVolume : goodsInValue,
        goodsOut: metric === 'volume' ? goodsOutVolume : goodsOutValue,
        rawInVolume: goodsInVolume,
        rawOutVolume: goodsOutVolume,
        rawInValue: goodsInValue,
        rawOutValue: goodsOutValue
      };
    });
  }, [rawDocs, metric, lang]);

  const maxVal = useMemo(() => {
    let max = 0;
    chartData.forEach(d => {
      if (d.goodsIn > max) max = d.goodsIn;
      if (d.goodsOut > max) max = d.goodsOut;
    });
    return max === 0 ? (metric === 'volume' ? 10 : 100000) : max * 1.15;
  }, [chartData, metric]);

  if (isLoading) {
    return (
      <div className="dashboard-chart-card">
        <div className="dashboard-chart-card__skeleton">
          <div className="skeleton-block" style={{ width: 140, height: 16 }} />
          <div className="skeleton-block" style={{ width: '100%', height: 180, marginTop: 24 }} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="dashboard-chart-card dashboard-chart-card--error">
        <div className="dashboard-chart-error">
          <RefreshCw size={36} className="dashboard-chart-error__icon animate-spin" />
          <p>{t('page.loading')}</p>
          <button type="button" className="btn btn-secondary interactive" onClick={refetch}>
            {t('general.retry')}
          </button>
        </div>
      </div>
    );
  }

  const width = 520;
  const height = 220;
  const paddingLeft = 60;
  const paddingRight = 35;
  const paddingTop = 20;
  const paddingBottom = 30;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const points = chartData.map((d, i) => {
    const x = paddingLeft + (i / 6) * plotWidth;
    const yIn = height - paddingBottom - (d.goodsIn / maxVal) * plotHeight;
    const yOut = height - paddingBottom - (d.goodsOut / maxVal) * plotHeight;
    return { x, yIn, yOut };
  });

  const getLinePath = (pointKey) => {
    if (points.length === 0) return '';
    return points.reduce((path, p, i) => {
      const y = pointKey === 'goodsIn' ? p.yIn : p.yOut;
      return path + (i === 0 ? `M ${p.x} ${y}` : ` L ${p.x} ${y}`);
    }, '');
  };

  const getAreaPath = (pointKey) => {
    if (points.length === 0) return '';
    const linePath = getLinePath(pointKey);
    const bottomY = height - paddingBottom;
    return `${linePath} L ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} Z`;
  };

  const inLinePath = getLinePath('goodsIn');
  const inAreaPath = getAreaPath('goodsIn');
  const outLinePath = getLinePath('goodsOut');
  const outAreaPath = getAreaPath('goodsOut');

  const formatYAxis = (val) => {
    if (metric === 'volume') {
      return Math.round(val).toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB');
    }
    if (val >= 1000000) {
      return (val / 1000000).toFixed(1) + 'M';
    }
    if (val >= 1000) {
      return (val / 1000).toFixed(0) + 'k';
    }
    return val.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB');
  };

  const formatTooltipValue = (val, isValueMetric) => {
    if (!isValueMetric) {
      return `${val.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB')} ${lang === 'id' ? 'Unit' : 'Units'}`;
    }
    return val.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    });
  };

  const gridTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="dashboard-chart-card">
      <div className="dashboard-chart-card__header">
        <div className="dashboard-chart-card__info">
          <div className="dashboard-chart-card__title-wrap">
            <BarChart2 className="dashboard-chart-card__title-icon" size={18} />
            <h3 className="dashboard-chart-card__title">{t('dashboard.chart.title')}</h3>
          </div>
          <p className="dashboard-chart-card__subtitle">{t('dashboard.chart.subtitle')}</p>
        </div>
        <div className="dashboard-chart-card__toggles">
          <button
            type="button"
            className={`dashboard-chart-card__toggle ${metric === 'volume' ? 'dashboard-chart-card__toggle--active' : ''}`}
            onClick={() => setMetric('volume')}
          >
            {t('dashboard.chart.toggle.volume')}
          </button>
          <button
            type="button"
            className={`dashboard-chart-card__toggle ${metric === 'value' ? 'dashboard-chart-card__toggle--active' : ''}`}
            onClick={() => setMetric('value')}
          >
            {t('dashboard.chart.toggle.value')}
          </button>
        </div>
      </div>

      <div className="dashboard-chart-card__chart-outer">
        <div className="dashboard-chart-card__legend">
          <div className="dashboard-chart-card__legend-item">
            <span className="dashboard-chart-card__legend-color dashboard-chart-card__legend-color--in" />
            <span className="dashboard-chart-card__legend-label">{t('dashboard.chart.goodsIn')}</span>
          </div>
          <div className="dashboard-chart-card__legend-item">
            <span className="dashboard-chart-card__legend-color dashboard-chart-card__legend-color--out" />
            <span className="dashboard-chart-card__legend-label">{t('dashboard.chart.goodsOut')}</span>
          </div>
        </div>

        <div className="dashboard-chart-card__svg-wrap">
          <svg className="dashboard-chart-svg" viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
            <defs>
              <linearGradient id="gradientIn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0.00" />
              </linearGradient>
              <linearGradient id="gradientOut" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-warning)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--color-warning)" stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {/* Grid Lines */}
            {gridTicks.map((tick, idx) => {
              const y = height - paddingBottom - tick * plotHeight;
              const lineVal = tick * maxVal;
              return (
                <g key={idx} className="chart-grid-group">
                  <line
                    className="chart-gridline"
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                  />
                  <text
                    className="chart-axis-text chart-axis-text--y"
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                  >
                    {formatYAxis(lineVal)}
                  </text>
                </g>
              );
            })}

            {/* Areas */}
            <path className="chart-area chart-area--in" d={inAreaPath} fill="url(#gradientIn)" />
            <path className="chart-area chart-area--out" d={outAreaPath} fill="url(#gradientOut)" />

            {/* Trend Lines */}
            <path className="chart-line chart-line--in" d={inLinePath} />
            <path className="chart-line chart-line--out" d={outLinePath} />

            {/* X-axis labels */}
            {chartData.map((d, i) => {
              const x = paddingLeft + (i / 6) * plotWidth;
              return (
                <text
                  key={i}
                  className="chart-axis-text chart-axis-text--x"
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                >
                  {d.label}
                </text>
              );
            })}

            {/* Active Vertical Guideline */}
            {hoveredIndex !== null && (
              <line
                className="chart-guideline"
                x1={points[hoveredIndex].x}
                y1={paddingTop}
                x2={points[hoveredIndex].x}
                y2={height - paddingBottom}
              />
            )}

            {/* Interactive circles/nodes */}
            {points.map((p, i) => (
              <g key={i}>
                <circle
                  className={`chart-node chart-node--in ${hoveredIndex === i ? 'chart-node--active' : ''}`}
                  cx={p.x}
                  cy={p.yIn}
                  r={hoveredIndex === i ? 6 : 4}
                />
                <circle
                  className={`chart-node chart-node--out ${hoveredIndex === i ? 'chart-node--active' : ''}`}
                  cx={p.x}
                  cy={p.yOut}
                  r={hoveredIndex === i ? 6 : 4}
                />
                <rect
                  className="chart-hover-trigger"
                  x={p.x - plotWidth / 14}
                  y={paddingTop}
                  width={plotWidth / 7}
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            ))}
          </svg>

          {/* Interactive Tooltip Card */}
          {hoveredIndex !== null && chartData[hoveredIndex] && (
            <div
              className="chart-tooltip"
              style={{
                left: `${(points[hoveredIndex].x / width) * 100}%`,
                transform: `translateX(${hoveredIndex > 3 ? '-105%' : '5%'})`
              }}
            >
              <div className="chart-tooltip__date">{chartData[hoveredIndex].label}</div>
              
              <div className="chart-tooltip__metrics">
                <div className="chart-tooltip__row">
                  <div className="chart-tooltip__key">
                    <span className="chart-tooltip__indicator chart-tooltip__indicator--in" />
                    <span>{t('dashboard.chart.goodsIn')}</span>
                  </div>
                  <div className="chart-tooltip__val">
                    {formatTooltipValue(metric === 'volume' ? chartData[hoveredIndex].rawInVolume : chartData[hoveredIndex].rawInValue, metric === 'value')}
                  </div>
                </div>

                <div className="chart-tooltip__row">
                  <div className="chart-tooltip__key">
                    <span className="chart-tooltip__indicator chart-tooltip__indicator--out" />
                    <span>{t('dashboard.chart.goodsOut')}</span>
                  </div>
                  <div className="chart-tooltip__val">
                    {formatTooltipValue(metric === 'volume' ? chartData[hoveredIndex].rawOutVolume : chartData[hoveredIndex].rawOutValue, metric === 'value')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
