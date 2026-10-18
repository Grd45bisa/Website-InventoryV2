import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Package, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import { formatStockByUnit } from './useProductFilters.js';
import './ProductCard.css';

export default function ProductCard({ product, canViewPrice = true, stockUnit = 'lusin' }) {
  const { t } = useApp();
  const queryClient = useQueryClient();
  const [imageError, setImageError] = useState(false);

  const handlePrefetch = () => {
    queryClient.prefetchQuery({
      queryKey: ['products'],
      queryFn: async () => {
        const res = await api.get('/api/workspace/products?limit=1000');
        if (!res.ok) throw new Error('Failed to load products');
        return (await res.json()).data ?? [];
      },
      staleTime: 5 * 60 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: ['product-serials'],
      queryFn: async () => {
        const res = await api.get('/api/workspace/product-serials?limit=10000');
        if (!res.ok) throw new Error('Failed to load product serials');
        return (await res.json()).data ?? [];
      },
      staleTime: 30000,
    });
  };

  // Status mapping
  let statusTextKey = 'products.healthy';
  let chipClass = 'chip-success';

  if (!product.active || product.status === 'disabled' || product.status === 'draft') {
    statusTextKey = 'products.modal.statusDraft';
    chipClass = ''; // Default border-based chip
  } else if (product.stock === 0) {
    statusTextKey = 'products.outOfStock';
    chipClass = 'chip-danger';
  } else if (product.stock <= product.minStock) {
    statusTextKey = 'products.lowStock';
    chipClass = 'chip-warning';
  }

  // Stock value color code
  let stockValueClass = 'product-card__stock-val--healthy';
  if (product.stock === 0) {
    stockValueClass = 'product-card__stock-val--danger';
  } else if (product.stock <= product.minStock) {
    stockValueClass = 'product-card__stock-val--warning';
  }


  const formattedPrice = `Rp ${Number(product.price || 0).toLocaleString('id-ID')}`;
  const displayStock = formatStockByUnit(product.stock, stockUnit);
  const displayMinStock = product.minStock ? formatStockByUnit(product.minStock, stockUnit) : '';
  const stockUnitLabel = stockUnit === 'lusin' ? 'Stok (Lsn)' : 'Stok (Pcs)';

  return (
    <Link
      to={`/inventory/products/${encodeURIComponent(product.sku)}`}
      className="product-card"
      onMouseEnter={handlePrefetch}
    >
      <div className="product-card__image-area">
        {product.imageUrl && !imageError ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="product-card__image"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="product-card__image-placeholder">
            <Package size={32} />
          </div>
        )}
      </div>

      <div className="product-card__body">
        <div className="product-card__top">
          <h3
            className="product-card__title-link"
            title={product.name}
          >
            {product.name}
          </h3>
          <span className={`chip ${chipClass} product-card__chip`}>
            {t(statusTextKey)}
          </span>
        </div>
        
        <div className="product-card__meta">
          <span className="product-card__sku">{product.sku}</span>
          {product.category && (
            <>
              <span className="product-card__dot">•</span>
              <span className="product-card__category">{product.category}</span>
            </>
          )}
        </div>

        <div className="product-card__stats">
          <div
            className="product-card__stat"
            title={stockUnit === 'lusin' ? `${Number(product.stock || 0).toLocaleString('id-ID')} pcs` : `${parseFloat(((product.stock || 0) / 12).toFixed(2)).toLocaleString('id-ID')} lusin`}
          >
            <Package size={14} style={{ color: 'var(--color-text-secondary)' }} />
            <span className={`product-card__stat-value ${stockValueClass}`}>
              {displayStock}
            </span>
            <span className="product-card__stat-label">{stockUnitLabel}</span>
          </div>
          <div
            className="product-card__stat"
            title={displayMinStock ? (stockUnit === 'lusin' ? `${Number(product.minStock || 0).toLocaleString('id-ID')} pcs` : `${parseFloat(((product.minStock || 0) / 12).toFixed(2)).toLocaleString('id-ID')} lusin`) : undefined}
          >
            <AlertCircle size={14} style={{ color: 'var(--color-text-secondary)' }} />
            <span className="product-card__stat-value" style={{ color: 'var(--color-text-primary)' }}>
              {displayMinStock}
            </span>
            <span className="product-card__stat-label">{t('products.minStock')}</span>
          </div>
        </div>

        {canViewPrice && (
          <div className="product-card__price">
            {formattedPrice}
          </div>
        )}
      </div>
    </Link>
  );
}
