import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import { formatStockByUnit } from './useProductFilters.js';
import './ProductTable.css';

export default function ProductTable({ products, canViewPrice = true, stockUnit = 'lusin' }) {
  const { t } = useApp();
  const queryClient = useQueryClient();
  const [failedImages, setFailedImages] = useState({});

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

  const handleImageError = (productId) => {
    setFailedImages((prev) => ({ ...prev, [productId]: true }));
  };


  return (
    <div className="product-table-wrapper">
      <table className="table product-table">
        <thead>
          <tr>
            <th className="product-table__thumbnail-cell"></th>
            <th>{t('products.title')}</th>
            <th style={{ width: '120px' }}>{t('products.sku')}</th>
            <th style={{ width: '140px' }}>{t('products.category')}</th>
            {canViewPrice && <th style={{ width: '120px' }}>{t('products.price')}</th>}
            <th style={{ width: '105px' }}>{t('products.stock')} ({stockUnit === 'lusin' ? 'Lsn' : 'Pcs'})</th>
            <th style={{ width: '100px' }}>{t('products.status')}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            // Status mapping
            let statusTextKey = 'products.healthy';
            let chipClass = 'chip-success';

            if (!product.active || product.status === 'disabled' || product.status === 'draft') {
              statusTextKey = 'products.modal.statusDraft';
              chipClass = '';
            } else if (product.stock === 0) {
              statusTextKey = 'products.outOfStock';
              chipClass = 'chip-danger';
            } else if (product.stock <= product.minStock) {
              statusTextKey = 'products.lowStock';
              chipClass = 'chip-warning';
            }

            // Stock styling
            let stockClass = 'product-table__stock-cell--healthy';
            if (product.stock === 0) {
              stockClass = 'product-table__stock-cell--danger';
            } else if (product.stock <= product.minStock) {
              stockClass = 'product-table__stock-cell--warning';
            }

            const formattedPrice = t('products.currencyFormat', { value: Number(product.price || 0).toLocaleString('id-ID') });
            const displayStock = formatStockByUnit(product.stock, stockUnit);

            return (
              <tr
                key={product.id}
                className="product-table__row"
                onMouseEnter={handlePrefetch}
              >
                <td className="product-table__thumbnail-cell">
                  <div className="product-table__thumbnail-wrapper">
                    {product.imageUrl && !failedImages[product.id] ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        className="product-table__thumbnail"
                        onError={() => handleImageError(product.id)}
                      />
                    ) : (
                      <Package size={16} />
                    )}
                  </div>
                </td>
                <td className="product-table__name-cell">
                  <Link
                    to={`/inventory/products/${encodeURIComponent(product.sku)}`}
                    className="product-table__name-link"
                  >
                    {product.name}
                  </Link>
                </td>
                <td className="product-table__sku-cell">{product.sku}</td>
                <td className="product-table__category-cell">{product.category || '-'}</td>
                {canViewPrice && <td className="product-table__price-cell">{formattedPrice}</td>}
                <td
                  className={`product-table__stock-cell ${stockClass}`}
                  title={stockUnit === 'lusin' ? `${Number(product.stock || 0).toLocaleString('id-ID')} pcs` : `${parseFloat(((product.stock || 0) / 12).toFixed(2)).toLocaleString('id-ID')} lusin`}
                >
                  {displayStock}
                </td>
                <td className="product-table__status-cell">
                  <span className={`chip ${chipClass}`}>{t(statusTextKey)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
