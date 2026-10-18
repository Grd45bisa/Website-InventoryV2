import { useState, useEffect, useMemo } from 'react';

export function formatStockByUnit(stockInPcs, unit = 'lusin') {
  const num = Number(stockInPcs || 0);
  if (unit === 'pcs') {
    return num.toLocaleString('id-ID');
  }
  // Lusin
  if (num === 0) return '0';
  const lusin = num / 12;
  if (num % 12 === 0) {
    return lusin.toLocaleString('id-ID');
  }
  return parseFloat(lusin.toFixed(2)).toLocaleString('id-ID');
}

export function useProductFilters(products = []) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [stockStatus, setStockStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  // Handle search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset to page 1 on search changes
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [search]);

  // Reset page when category or stock status changes
  const handleCategoryChange = (val) => {
    setCategory(val);
    setCurrentPage(1);
  };

  const handleStockStatusChange = (val) => {
    setStockStatus(val);
    setCurrentPage(1);
  };

  // Extract distinct categories
  const categories = useMemo(() => {
    const cats = products
      .map((p) => p.category)
      .filter((cat) => cat !== null && cat !== undefined && cat !== '');
    return Array.from(new Set(cats)).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Filter items
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // 1. Search filter
      const name = product.name || '';
      const sku = product.sku || '';
      const matchesSearch =
        !debouncedSearch.trim() ||
        name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        sku.toLowerCase().includes(debouncedSearch.toLowerCase());

      // 2. Category filter
      const matchesCategory =
        category === 'all' ||
        product.category === category;

      // 3. Stock / Status filter
      const stock = product.stock ?? 0;
      const minStock = product.minStock ?? 10;
      const isDraft = !product.active || product.status === 'disabled' || product.status === 'draft';

      let matchesStock = true;
      if (stockStatus === 'draft') {
        matchesStock = isDraft;
      } else if (stockStatus === 'in_stock') {
        matchesStock = !isDraft && stock > minStock;
      } else if (stockStatus === 'low_stock') {
        matchesStock = !isDraft && stock > 0 && stock <= minStock;
      } else if (stockStatus === 'out_of_stock') {
        matchesStock = !isDraft && stock === 0;
      }

      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, debouncedSearch, category, stockStatus]);

  // Paginated items
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredProducts.slice(startIndex, startIndex + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

  // Safe check if page gets out of bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  return {
    search,
    setSearch,
    category,
    setCategory: handleCategoryChange,
    stockStatus,
    setStockStatus: handleStockStatusChange,
    currentPage,
    setCurrentPage,
    pageSize,
    categories,
    filteredProducts,
    paginatedProducts,
    totalItems: filteredProducts.length,
    totalPages,
  };
}
