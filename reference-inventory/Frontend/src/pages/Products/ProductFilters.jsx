import React from 'react';
import { Search, LayoutGrid, List, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import './ProductFilters.css';

export default function ProductFilters({
  search,
  setSearch,
  category,
  setCategory,
  categories,
  stockStatus,
  setStockStatus,
  stockUnit = 'lusin',
  setStockUnit,
  viewMode,
  setViewMode,
}) {
  const { t } = useApp();

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');

  return (
    <div className="product-filters">
      <div className="product-filters__search-wrapper">
        <Search className="product-filters__search-icon" size={16} />
        <input
          type="text"
          className="product-filters__search-input"
          placeholder={t('products.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="product-filters__search-shortcut">
          {isMac ? '⌘K' : 'Ctrl+K'}
        </span>
      </div>

      <div className="product-filters__dropdowns">
        <div className="product-filters__select-wrap">
          <select
            className="product-filters__select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">{t('products.allCategories')}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <ChevronDown className="product-filters__select-chevron" size={16} />
        </div>

        <div className="product-filters__select-wrap">
          <select
            className="product-filters__select"
            value={stockStatus}
            onChange={(e) => setStockStatus(e.target.value)}
          >
            <option value="all">{t('products.allStock')}</option>
            <option value="in_stock">{t('products.inStock')}</option>
            <option value="low_stock">{t('products.lowStock')}</option>
            <option value="out_of_stock">{t('products.outOfStock')}</option>
            <option value="draft">{t('products.draft')}</option>
          </select>
          <ChevronDown className="product-filters__select-chevron" size={16} />
        </div>

        {setStockUnit && (
          <div className="product-filters__select-wrap product-filters__select-wrap--unit">
            <select
              className="product-filters__select product-filters__select--unit"
              value={stockUnit}
              onChange={(e) => setStockUnit(e.target.value)}
              title={t('products.stockUnit') || 'Satuan Stok'}
            >
              <option value="lusin">{t('products.unitLusin') || 'Lusin'}</option>
              <option value="pcs">{t('products.unitPcs') || 'Pcs'}</option>
            </select>
            <ChevronDown className="product-filters__select-chevron" size={16} />
          </div>
        )}
      </div>

      <div className="product-filters__toggle-group">
        <button
          type="button"
          className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'} product-filters__toggle-btn`}
          onClick={() => setViewMode('table')}
          aria-label={t('products.viewTable')}
        >
          <List size={14} />
          <span>{t('products.viewTable')}</span>
        </button>
        <button
          type="button"
          className={`btn btn-sm ${viewMode === 'card' ? 'btn-primary' : 'btn-secondary'} product-filters__toggle-btn`}
          onClick={() => setViewMode('card')}
          aria-label={t('products.viewCard')}
        >
          <LayoutGrid size={14} />
          <span>{t('products.viewCard')}</span>
        </button>
      </div>
    </div>
  );
}
