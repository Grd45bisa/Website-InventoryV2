import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings, canExportProducts } from '../../utils/api.js';
import { 
  Download, Upload, Database, AlertTriangle, FileText, 
  CheckCircle2, Trash2, ArrowRight, RefreshCw, HelpCircle,
  UploadCloud, Plus, Pencil, Barcode, Layers, Package, X,
  Warehouse
} from 'lucide-react';
import './ExportImportSetting.css';

// Simple robust CSV parser
const parseCSV = (text) => {
  const lines = [];
  let row = [''];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
};

// Escape CSV field if it contains commas, quotes, or newlines
const escapeCSV = (val) => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// Trigger browser download
const downloadFile = (content, filename, contentType) => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function ExportImportSetting() {
  const { t, warehouses = [], activeWarehouse, user } = useApp();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const { data: wsSettings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  const canExport = useMemo(() => {
    return canExportProducts(wsSettings, user);
  }, [wsSettings, user]);

  // States
  const [exportFormat, setExportFormat] = useState('json'); // 'json' | 'csv'
  const [exportWarehouseId, setExportWarehouseId] = useState('');
  const [importWarehouseId, setImportWarehouseId] = useState('');
  const [exporting, setExporting] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [importStep, setImportStep] = useState('upload'); // 'upload' | 'preview' | 'importing' | 'success'
  const [parsedItems, setParsedItems] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  
  // Stat counters for preview
  const [previewStats, setPreviewStats] = useState({
    totalRows: 0,
    newProducts: 0,
    existingProducts: 0,
    newSerials: 0,
    errors: 0
  });

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResult, setImportResult] = useState({
    addedProducts: 0,
    updatedProducts: 0,
    addedSerials: 0,
    warehouseName: ''
  });

  // Sync warehouse selection with active warehouse on load
  useEffect(() => {
    if (activeWarehouse?.id) {
      if (!exportWarehouseId) setExportWarehouseId(activeWarehouse.id);
      if (!importWarehouseId) setImportWarehouseId(activeWarehouse.id);
    } else if (warehouses.length > 0) {
      if (!exportWarehouseId) setExportWarehouseId(warehouses[0].id);
      if (!importWarehouseId) setImportWarehouseId(warehouses[0].id);
    }
  }, [activeWarehouse, warehouses, exportWarehouseId, importWarehouseId]);

  // Fetch products and serial numbers for active warehouse
  const { data: rawProducts = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/products?limit=1000');
      if (!res.ok) throw new Error('Failed to load products');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: rawSerials = [], isLoading: loadingSerials } = useQuery({
    queryKey: ['product-serials'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/product-serials?limit=10000');
      if (!res.ok) throw new Error('Failed to load serials');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  // Target warehouse objects for labels
  const targetExportWarehouse = useMemo(() => {
    return warehouses.find(w => w.id === exportWarehouseId) || activeWarehouse || warehouses[0] || null;
  }, [warehouses, exportWarehouseId, activeWarehouse]);

  const targetImportWarehouse = useMemo(() => {
    return warehouses.find(w => w.id === importWarehouseId) || activeWarehouse || warehouses[0] || null;
  }, [warehouses, importWarehouseId, activeWarehouse]);

  // 1. Template Strings
  const getBlankCsv = () => {
    return 'sku,name,category,unitCost,sellingPrice,discountType,discountValue,status,description,minStock,serialNumber,serialStatus,serialUnit\n';
  };

  const getSampleCsv = () => {
    return 'sku,name,category,unitCost,sellingPrice,discountType,discountValue,status,description,minStock,serialNumber,serialStatus,serialUnit\n' +
      'BHG-PSA110,Hoga Baby - Bedong Hoga Gulung Pastel Type A 110x90,Perlengkapan Bayi,0,0,none,0,active,Bedong Hoga gulung warna Pastel Type A ukuran 110x90cm,5,,,\n' +
      'BHG-PSB110,Hoga Baby - Bedong Hoga Gulung Pastel Type B 110x90,Perlengkapan Bayi,0,0,none,0,active,Bedong Hoga gulung warna Pastel Type B ukuran 110x90cm,5,,,\n' +
      'BHG-PS110,Hoga Baby - Bedong Hoga Gulung Pastel 110x90,Perlengkapan Bayi,0,0,none,0,active,Bedong Hoga gulung warna Pastel (Campur Type A & B) ukuran 110x90cm,5,,,\n' +
      'BHG-ETA110,Hoga Baby - Bedong Hoga Gulung Earthone Type A 110x90,Perlengkapan Bayi,0,0,none,0,active,Bedong Hoga gulung warna Earthone Type A ukuran 110x90cm,5,,,\n' +
      'BHG-ETB110,Hoga Baby - Bedong Hoga Gulung Earthone Type B 110x90,Perlengkapan Bayi,0,0,none,0,active,Bedong Hoga gulung warna Earthone Type B ukuran 110x90cm,5,,,\n' +
      'BHG-ET110,Hoga Baby - Bedong Hoga Gulung Earthone 110x90,Perlengkapan Bayi,0,0,none,0,active,Bedong Hoga gulung warna Earthone (Campur Type A & B) ukuran 110x90cm,5,,,\n' +
      'CSM-PSA-REG,Hoga Baby - Celana Segiempat Reguler Pastel Type A,Pakaian Bayi,0,0,none,0,active,Celana segiempat reguler bayi warna Pastel Type A,5,,,\n' +
      'CSM-PSB-REG,Hoga Baby - Celana Segiempat Reguler Pastel Type B,Pakaian Bayi,0,0,none,0,active,Celana segiempat reguler bayi warna Pastel Type B,5,,,\n' +
      'CSM-PS-REG,Hoga Baby - Celana Segiempat Reguler Pastel,Pakaian Bayi,0,0,none,0,active,Celana segiempat reguler bayi warna Pastel (Campur Type A & B),5,,,\n' +
      'CSM-ETA-REG,Hoga Baby - Celana Segiempat Reguler Earthone Type A,Pakaian Bayi,0,0,none,0,active,Celana segiempat reguler bayi warna Earthone Type A,5,,,\n' +
      'CSM-ETB-REG,Hoga Baby - Celana Segiempat Reguler Earthone Type B,Pakaian Bayi,0,0,none,0,active,Celana segiempat reguler bayi warna Earthone Type B,5,,,\n' +
      'CSM-ET-REG,Hoga Baby - Celana Segiempat Reguler Earthone,Pakaian Bayi,0,0,none,0,active,Celana segiempat reguler bayi warna Earthone (Campur Type A & B),5,,,\n';
  };

  const getBlankJson = () => {
    return JSON.stringify([
      {
        sku: '',
        name: '',
        category: '',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: '',
        minStock: 5,
        serials: []
      }
    ], null, 2);
  };

  const getSampleJson = () => {
    return JSON.stringify([
      {
        sku: 'BHG-PSA110',
        name: 'Hoga Baby - Bedong Hoga Gulung Pastel Type A 110x90',
        category: 'Perlengkapan Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Bedong Hoga gulung warna Pastel Type A ukuran 110x90cm',
        minStock: 5,
        serials: []
      },
      {
        sku: 'BHG-PSB110',
        name: 'Hoga Baby - Bedong Hoga Gulung Pastel Type B 110x90',
        category: 'Perlengkapan Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Bedong Hoga gulung warna Pastel Type B ukuran 110x90cm',
        minStock: 5,
        serials: []
      },
      {
        sku: 'BHG-PS110',
        name: 'Hoga Baby - Bedong Hoga Gulung Pastel 110x90',
        category: 'Perlengkapan Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Bedong Hoga gulung warna Pastel (Campur Type A & B) ukuran 110x90cm',
        minStock: 5,
        serials: []
      },
      {
        sku: 'BHG-ETA110',
        name: 'Hoga Baby - Bedong Hoga Gulung Earthone Type A 110x90',
        category: 'Perlengkapan Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Bedong Hoga gulung warna Earthone Type A ukuran 110x90cm',
        minStock: 5,
        serials: []
      },
      {
        sku: 'BHG-ETB110',
        name: 'Hoga Baby - Bedong Hoga Gulung Earthone Type B 110x90',
        category: 'Perlengkapan Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Bedong Hoga gulung warna Earthone Type B ukuran 110x90cm',
        minStock: 5,
        serials: []
      },
      {
        sku: 'BHG-ET110',
        name: 'Hoga Baby - Bedong Hoga Gulung Earthone 110x90',
        category: 'Perlengkapan Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Bedong Hoga gulung warna Earthone (Campur Type A & B) ukuran 110x90cm',
        minStock: 5,
        serials: []
      },
      {
        sku: 'CSM-PSA-REG',
        name: 'Hoga Baby - Celana Segiempat Reguler Pastel Type A',
        category: 'Pakaian Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Celana segiempat reguler bayi warna Pastel Type A',
        minStock: 5,
        serials: []
      },
      {
        sku: 'CSM-PSB-REG',
        name: 'Hoga Baby - Celana Segiempat Reguler Pastel Type B',
        category: 'Pakaian Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Celana segiempat reguler bayi warna Pastel Type B',
        minStock: 5,
        serials: []
      },
      {
        sku: 'CSM-PS-REG',
        name: 'Hoga Baby - Celana Segiempat Reguler Pastel',
        category: 'Pakaian Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Celana segiempat reguler bayi warna Pastel (Campur Type A & B)',
        minStock: 5,
        serials: []
      },
      {
        sku: 'CSM-ETA-REG',
        name: 'Hoga Baby - Celana Segiempat Reguler Earthone Type A',
        category: 'Pakaian Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Celana segiempat reguler bayi warna Earthone Type A',
        minStock: 5,
        serials: []
      },
      {
        sku: 'CSM-ETB-REG',
        name: 'Hoga Baby - Celana Segiempat Reguler Earthone Type B',
        category: 'Pakaian Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Celana segiempat reguler bayi warna Earthone Type B',
        minStock: 5,
        serials: []
      },
      {
        sku: 'CSM-ET-REG',
        name: 'Hoga Baby - Celana Segiempat Reguler Earthone',
        category: 'Pakaian Bayi',
        unitCost: 0,
        sellingPrice: 0,
        discountType: 'none',
        discountValue: 0,
        status: 'active',
        description: 'Celana segiempat reguler bayi warna Earthone (Campur Type A & B)',
        minStock: 5,
        serials: []
      }
    ], null, 2);
  };

  // 2. Export Handler with Specific Warehouse Header
  const handleExport = async () => {
    if (!canExport) {
      alert('Izin ekspor data katalog dibatasi. Pada mode build/produksi memerlukan izin Owner.');
      return;
    }
    try {
      setExporting(true);
      const whHeaders = exportWarehouseId ? { 'X-Warehouse-Id': exportWarehouseId } : {};

      // Fetch live products and serials specifically for the chosen warehouse
      const [prodRes, serialRes] = await Promise.all([
        api.get('/api/workspace/products?limit=5000', { headers: whHeaders }),
        api.get('/api/workspace/product-serials?limit=10000', { headers: whHeaders })
      ]);

      const prodsData = prodRes.ok ? ((await prodRes.json()).data ?? []) : rawProducts;
      const serialsData = serialRes.ok ? ((await serialRes.json()).data ?? []) : rawSerials;

      const whSlug = targetExportWarehouse?.code 
        ? targetExportWarehouse.code.toLowerCase().replace(/[^a-z0-9]/g, '_') 
        : 'catalog';
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');

      if (exportFormat === 'json') {
        const exportData = prodsData.map((p) => {
          const meta = p.metadata ?? {};
          const pSerials = serialsData
            .filter((s) => (s.product_id ?? s.productId) === p.id)
            .map((s) => ({
              serialNumber: s.serialNumber ?? s.serial_number,
              status: s.status ?? 'available',
              unit: s.metadata?.serialUnit ?? s.serialUnit ?? s.unit ?? 'piece',
            }));

          return {
            sku: p.sku,
            name: p.name,
            category: p.category ?? '',
            unitCost: Number(p.unit_cost ?? p.unitCost ?? 0),
            sellingPrice: Number(p.selling_price ?? p.sellingPrice ?? 0),
            discountType: p.discount_type ?? p.discountType ?? 'none',
            discountValue: Number(p.discount_value ?? p.discountValue ?? 0),
            status: p.status ?? 'active',
            description: meta.description ?? '',
            minStock: Number(meta.minStock ?? 10),
            serials: pSerials,
          };
        });

        const jsonStr = JSON.stringify(exportData, null, 2);
        downloadFile(jsonStr, `docuflow_products_${whSlug}_${dateStr}.json`, 'application/json');
      } else {
        // CSV Format
        const headers = [
          'sku', 'name', 'category', 'unitCost', 'sellingPrice', 
          'discountType', 'discountValue', 'status', 'description', 'minStock',
          'serialNumber', 'serialStatus', 'serialUnit'
        ];
        
        const rows = [headers.join(',')];

        prodsData.forEach((p) => {
          const meta = p.metadata ?? {};
          const pSerials = serialsData.filter((s) => (s.product_id ?? s.productId) === p.id);

          const baseFields = [
            escapeCSV(p.sku),
            escapeCSV(p.name),
            escapeCSV(p.category ?? ''),
            Number(p.unit_cost ?? p.unitCost ?? 0),
            Number(p.selling_price ?? p.sellingPrice ?? 0),
            escapeCSV(p.discount_type ?? p.discountType ?? 'none'),
            Number(p.discount_value ?? p.discountValue ?? 0),
            escapeCSV(p.status ?? 'active'),
            escapeCSV(meta.description ?? ''),
            Number(meta.minStock ?? 10)
          ];

          if (pSerials.length > 0) {
            pSerials.forEach((s) => {
              const serialFields = [
                escapeCSV(s.serialNumber ?? s.serial_number),
                escapeCSV(s.status ?? 'available'),
                escapeCSV(s.metadata?.serialUnit ?? s.serialUnit ?? s.unit ?? 'piece')
              ];
              rows.push([...baseFields, ...serialFields].join(','));
            });
          } else {
            rows.push([...baseFields, '', '', ''].join(','));
          }
        });

        const csvContent = rows.join('\n');
        downloadFile(csvContent, `docuflow_products_${whSlug}_${dateStr}.csv`, 'text/csv');
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Helper to re-evaluate statistics for a target warehouse
  const recalculatePreviewStats = async (items, warnings, targetWhId) => {
    let existingWhProducts = rawProducts;
    let existingWhSerials = rawSerials;

    if (targetWhId && targetWhId !== activeWarehouse?.id) {
      try {
        const [pRes, sRes] = await Promise.all([
          api.get('/api/workspace/products?limit=5000', { headers: { 'X-Warehouse-Id': targetWhId } }),
          api.get('/api/workspace/product-serials?limit=10000', { headers: { 'X-Warehouse-Id': targetWhId } })
        ]);
        if (pRes.ok) existingWhProducts = (await pRes.json()).data ?? [];
        if (sRes.ok) existingWhSerials = (await sRes.json()).data ?? [];
      } catch (_) {}
    }

    let newProds = 0;
    let existProds = 0;
    let totalNewSerials = 0;

    items.forEach(item => {
      const match = existingWhProducts.find(p => p.sku?.toLowerCase() === item.sku.toLowerCase());
      if (match) {
        existProds++;
      } else {
        newProds++;
      }

      item.serials.forEach(s => {
        const sExists = existingWhSerials.some(rs => 
          (rs.serialNumber ?? rs.serial_number)?.toLowerCase() === s.serialNumber.toLowerCase()
        );
        if (!sExists) {
          totalNewSerials++;
        }
      });
    });

    setPreviewStats({
      totalRows: items.length,
      newProducts: newProds,
      existingProducts: existProds,
      newSerials: totalNewSerials,
      errors: warnings.length
    });
  };

  // Handle warehouse change in preview modal
  const handleImportWarehouseChange = async (newWhId) => {
    setImportWarehouseId(newWhId);
    if (parsedItems.length > 0) {
      await recalculatePreviewStats(parsedItems, validationWarnings, newWhId);
    }
  };

  // 3. Import File Parser & Validator
  const processUploadFile = (file) => {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target.result;
      const warnings = [];
      const productsMap = {};

      try {
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            throw new Error('Root JSON element must be an Array.');
          }

          parsed.forEach((item, idx) => {
            const rowNum = idx + 1;
            const sku = item.sku?.trim();
            const name = item.name?.trim();

            if (!sku) {
              warnings.push(`Item ${rowNum}: SKU is missing.`);
              return;
            }
            if (!name) {
              warnings.push(`Item ${rowNum} (${sku}): Name is missing.`);
              return;
            }

            const serials = Array.isArray(item.serials) 
              ? item.serials.map((s) => ({
                  serialNumber: s.serialNumber?.trim() || '',
                  status: s.status || 'available',
                  unit: s.unit || 'piece'
                })).filter(s => s.serialNumber)
              : [];

            productsMap[sku] = {
              sku,
              name,
              category: item.category || null,
              unitCost: Number(item.unitCost) || 0,
              sellingPrice: Number(item.sellingPrice) || 0,
              discountType: item.discountType || 'none',
              discountValue: Number(item.discountValue) || 0,
              status: item.status === 'disabled' ? 'disabled' : 'active',
              description: item.description || '',
              minStock: Number(item.minStock) || 10,
              serials
            };
          });
        } else if (file.name.endsWith('.csv')) {
          const csvLines = parseCSV(text);
          if (csvLines.length <= 1) {
            throw new Error('CSV is empty or missing headers.');
          }

          const headers = csvLines[0].map(h => h.trim().toLowerCase());
          
          const idxSKU = headers.indexOf('sku');
          const idxName = headers.indexOf('name');
          const idxCategory = headers.indexOf('category');
          const idxUnitCost = headers.indexOf('unitcost');
          const idxSellingPrice = headers.indexOf('sellingprice');
          const idxDiscountType = headers.indexOf('discounttype');
          const idxDiscountValue = headers.indexOf('discountvalue');
          const idxStatus = headers.indexOf('status');
          const idxDescription = headers.indexOf('description');
          const idxMinStock = headers.indexOf('minstock');
          const idxSN = headers.indexOf('serialnumber');
          const idxSNStatus = headers.indexOf('serialstatus');
          const idxSNUnit = headers.indexOf('serialunit');

          if (idxSKU === -1 || idxName === -1) {
            throw new Error('CSV is missing required headers: "sku" or "name".');
          }

          for (let i = 1; i < csvLines.length; i++) {
            const row = csvLines[i];
            if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;

            const sku = row[idxSKU]?.trim();
            const name = row[idxName]?.trim();

            if (!sku && !name) continue;

            if (!sku) {
              warnings.push(`Row ${i + 1}: SKU is missing.`);
              continue;
            }

            if (!productsMap[sku] && !name) {
              warnings.push(`Row ${i + 1}: Name is required for new SKU "${sku}".`);
              continue;
            }

            const category = idxCategory !== -1 ? row[idxCategory]?.trim() || null : null;
            const unitCost = idxUnitCost !== -1 ? Number(row[idxUnitCost]) || 0 : 0;
            const sellingPrice = idxSellingPrice !== -1 ? Number(row[idxSellingPrice]) || 0 : 0;
            const discountType = idxDiscountType !== -1 ? row[idxDiscountType]?.trim() || 'none' : 'none';
            const discountValue = idxDiscountValue !== -1 ? Number(row[idxDiscountValue]) || 0 : 0;
            const status = idxStatus !== -1 ? row[idxStatus]?.trim() || 'active' : 'active';
            const description = idxDescription !== -1 ? row[idxDescription]?.trim() || '' : '';
            const minStock = idxMinStock !== -1 ? Number(row[idxMinStock]) || 10 : 10;
            
            const serialNumber = idxSN !== -1 ? row[idxSN]?.trim() || '' : '';
            const serialStatus = idxSNStatus !== -1 ? row[idxSNStatus]?.trim() || 'available' : 'available';
            const serialUnit = idxSNUnit !== -1 ? row[idxSNUnit]?.trim() || 'piece' : 'piece';

            if (!productsMap[sku]) {
              productsMap[sku] = {
                sku,
                name,
                category,
                unitCost,
                sellingPrice,
                discountType,
                discountValue,
                status: status === 'disabled' ? 'disabled' : 'active',
                description,
                minStock,
                serials: []
              };
            }

            if (serialNumber) {
              productsMap[sku].serials.push({
                serialNumber,
                status: ['available', 'reserved', 'out', 'damaged'].includes(serialStatus) ? serialStatus : 'available',
                unit: serialUnit
              });
            }
          }
        } else {
          throw new Error('Unsupported file extension. Only CSV and JSON are allowed.');
        }

        const productList = Object.values(productsMap);
        setParsedItems(productList);
        setValidationWarnings(warnings);
        await recalculatePreviewStats(productList, warnings, importWarehouseId);
        setImportStep('preview');
      } catch (err) {
        alert('Failed to parse file: ' + err.message);
        setSelectedFile(null);
      }
    };

    reader.readAsText(file);
  };

  // 4. File Drag & Drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      processUploadFile(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      processUploadFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setParsedItems([]);
    setValidationWarnings([]);
    setImportStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 5. Bulk Execute Import with Target Warehouse Header
  const handleConfirmImport = async () => {
    if (parsedItems.length === 0) return;

    setImporting(true);
    setImportStep('importing');
    setImportProgress({ current: 0, total: parsedItems.length });

    const whHeaders = importWarehouseId ? { 'X-Warehouse-Id': importWarehouseId } : {};

    let addedCount = 0;
    let updatedCount = 0;
    let serialsRegistered = 0;

    try {
      // Fetch latest list of products and serials specifically for target warehouse
      const [pRes, sRes] = await Promise.all([
        api.get('/api/workspace/products?limit=5000', { headers: whHeaders }),
        api.get('/api/workspace/product-serials?limit=10000', { headers: whHeaders })
      ]);

      const targetWhProducts = pRes.ok ? ((await pRes.json()).data ?? []) : rawProducts;
      const targetWhSerials = sRes.ok ? ((await sRes.json()).data ?? []) : rawSerials;

      for (let i = 0; i < parsedItems.length; i++) {
        const prod = parsedItems[i];
        setImportProgress({ current: i + 1, total: parsedItems.length });

        const existing = targetWhProducts.find(p => p.sku?.toLowerCase() === prod.sku.toLowerCase());
        let productId = null;

        if (existing) {
          // Update product via PATCH with warehouse header
          const payload = {
            name: prod.name,
            category: prod.category,
            sellingPrice: prod.sellingPrice,
            unitCost: prod.unitCost,
            discountType: prod.discountType,
            discountValue: prod.discountValue,
            status: prod.status,
            metadata: {
              ...(existing.metadata ?? {}),
              description: prod.description,
              minStock: prod.minStock,
            }
          };

          const res = await api.patch(`/api/workspace/products/${existing.id}`, payload, { headers: whHeaders });
          if (res.ok) {
            updatedCount++;
            productId = existing.id;
          } else {
            console.error(`Failed to update ${prod.sku}`, await res.text());
          }
        } else {
          // Create product via POST with warehouse header
          const payload = {
            sku: prod.sku,
            name: prod.name,
            category: prod.category,
            stock: 0,
            unitCost: prod.unitCost,
            sellingPrice: prod.sellingPrice,
            discountType: prod.discountType,
            discountValue: prod.discountValue,
            status: prod.status,
            metadata: {
              description: prod.description,
              hasDozenPrice: false,
              stockNonSerial: 0,
              minStock: prod.minStock,
            }
          };

          const res = await api.post('/api/workspace/products', payload, { headers: whHeaders });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            productId = data.data?.id || data.id || null;
            addedCount++;
          } else {
            console.error(`Failed to create ${prod.sku}`, await res.text());
          }
        }

        // Process serial numbers for this product into target warehouse
        if (productId && prod.serials.length > 0) {
          const matchedProd = existing ?? { metadata: {} };
          if (matchedProd.metadata?.trackingMode !== 'serial') {
            await api.patch(`/api/workspace/products/${productId}`, {
              metadata: {
                ...(matchedProd.metadata ?? {}),
                trackingMode: 'serial',
                stockNonSerial: 0
              }
            }, { headers: whHeaders }).catch(err => console.error(`Failed updating trackingMode for ${prod.sku}`, err));
          }

          for (const s of prod.serials) {
            const sExists = targetWhSerials.some(rs => 
              (rs.serialNumber ?? rs.serial_number)?.toLowerCase() === s.serialNumber.toLowerCase()
            );

            if (!sExists) {
              const sRes = await api.post('/api/workspace/product-serials', {
                productId,
                serialNumber: s.serialNumber,
                status: s.status,
                metadata: {
                  serialUnit: s.unit
                }
              }, { headers: whHeaders });

              if (sRes.ok) {
                serialsRegistered++;
              } else {
                console.error(`Failed registering serial ${s.serialNumber}`, await sRes.text());
              }
            }
          }
        }
      }

      setImportResult({
        addedProducts: addedCount,
        updatedProducts: updatedCount,
        addedSerials: serialsRegistered,
        warehouseName: targetImportWarehouse?.name || 'Gudang'
      });

      // Synchronous Cache Invalidation (React Query)
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-serials'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-warehouses'] });

      setImportStep('success');
    } catch (err) {
      console.error(err);
      alert('Error importing data: ' + err.message);
      setImportStep('preview');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="export-import-setting">
      {/* Title block */}
      <div className="export-import-header">
        <div className="export-import-header__icon">
          <Database size={24} />
        </div>
        <div className="export-import-header__text">
          <h2 className="export-import-header__title">{t('settings.exportImport.title')}</h2>
          <p className="export-import-header__subtitle">{t('settings.exportImport.subtitle')}</p>
        </div>
      </div>

      {(loadingProducts || loadingSerials) && importStep !== 'importing' ? (
        <div className="export-import-loading">
          <RefreshCw className="export-import-loading__spinner spin" size={32} />
          <p className="export-import-loading__text">Loading catalog data...</p>
        </div>
      ) : (
        <>
          <div className="export-import-grid">
            {/* Card 1: Export */}
            <div className="export-import-card export-import-card--export">
              <div className="export-import-card__header">
                <div className="export-import-card__icon-wrap">
                  <Download size={18} />
                </div>
                <div className="export-import-card__title-area">
                  <h3 className="export-import-card__title">{t('settings.exportImport.exportCardTitle')}</h3>
                  <p className="export-import-card__desc">{t('settings.exportImport.exportCardDesc')}</p>
                </div>
              </div>

              <div className="export-form">
                {/* Warehouse Selector for Export */}
                <div className="export-form__group">
                  <span className="export-form__label">
                    <Warehouse size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    {t('settings.exportImport.exportWarehouseLabel')}
                  </span>
                  <div className="warehouse-select-container">
                    <select
                      className="warehouse-select-input"
                      value={exportWarehouseId}
                      onChange={(e) => setExportWarehouseId(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code}){w.is_default ? ' • Default' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="export-form__group">
                  <span className="export-form__label">{t('settings.exportImport.exportDataType')}</span>
                  <div className="custom-type-selector">
                    <div className="custom-type-option custom-type-option--active">
                      <Package size={16} className="custom-type-option__icon" />
                      <span className="custom-type-option__text">{t('settings.exportImport.exportProductsSerials')}</span>
                      <div className="custom-type-option__badge-wrap">
                        <span className="custom-type-badge-active">Selected</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="export-form__group">
                  <span className="export-form__label">{t('settings.exportImport.exportFormat')}</span>
                  <div className="format-selector">
                    <button 
                      type="button" 
                      className={`format-selector__btn ${exportFormat === 'json' ? 'format-selector__btn--active' : ''}`}
                      onClick={() => setExportFormat('json')}
                    >
                      JSON
                    </button>
                    <button 
                      type="button" 
                      className={`format-selector__btn ${exportFormat === 'csv' ? 'format-selector__btn--active' : ''}`}
                      onClick={() => setExportFormat('csv')}
                    >
                      CSV
                    </button>
                  </div>
                </div>
              </div>

              <button 
                type="button" 
                className="btn btn-primary interactive"
                onClick={handleExport}
                disabled={exporting || !canExport}
                title={!canExport ? "Memerlukan izin Owner pada versi produksi" : undefined}
              >
                {exporting ? (
                  <RefreshCw size={16} className="spin" style={{ marginRight: '8px' }} />
                ) : (
                  <Download size={16} style={{ marginRight: '8px' }} />
                )}
                <span>{exporting ? 'Mengekspor...' : t('settings.exportImport.btnExport')}</span>
              </button>
              {!canExport && (
                <p style={{ fontSize: '12px', color: 'var(--color-warning)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={14} />
                  <span>Hanya Owner atau staf dengan izin khusus yang dapat mengekspor katalog di versi produksi.</span>
                </p>
              )}
            </div>

            {/* Card 2: Import */}
            <div className="export-import-card export-import-card--import">
              <div className="export-import-card__header">
                <div className="export-import-card__icon-wrap">
                  <Upload size={18} />
                </div>
                <div className="export-import-card__title-area">
                  <h3 className="export-import-card__title">{t('settings.exportImport.importCardTitle')}</h3>
                  <p className="export-import-card__desc">{t('settings.exportImport.importCardDesc')}</p>
                </div>
              </div>

              {/* Warehouse Selector for Import */}
              <div className="export-form__group">
                <span className="export-form__label">
                  <Warehouse size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  {t('settings.exportImport.importWarehouseLabel')}
                </span>
                <div className="warehouse-select-container">
                  <select
                    className="warehouse-select-input"
                    value={importWarehouseId}
                    onChange={(e) => handleImportWarehouseChange(e.target.value)}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code}){w.is_default ? ' • Default' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div 
                className={`dropzone ${dragActive ? 'dropzone--drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={40} className="dropzone__icon" />
                <p className="dropzone__title">{t('settings.exportImport.dropZoneTitle')}</p>
                <p className="dropzone__helper">{t('settings.exportImport.dropZoneHelper')}</p>
                
                <input 
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  accept=".json,.csv"
                  onChange={handleFileChange}
                />
              </div>

              <div className="template-download-section">
                <h4 className="template-download-title">{t('settings.exportImport.templateDownloadTitle')}</h4>
                <p className="template-download-desc">{t('settings.exportImport.templateDownloadDesc')}</p>
                <div className="template-download-grid">
                  <div className="template-download-card">
                    <span className="template-type-badge csv">CSV</span>
                    <div className="template-actions">
                      <button type="button" className="template-action-btn" onClick={() => downloadFile(getBlankCsv(), 'template_blank.csv', 'text/csv')}>
                        <Download size={12} />
                        <span>Blank</span>
                      </button>
                      <button type="button" className="template-action-btn" onClick={() => downloadFile(getSampleCsv(), 'template_sample.csv', 'text/csv')}>
                        <Download size={12} />
                        <span>Sample</span>
                      </button>
                    </div>
                  </div>
                  <div className="template-download-card">
                    <span className="template-type-badge json">JSON</span>
                    <div className="template-actions">
                      <button type="button" className="template-action-btn" onClick={() => downloadFile(getBlankJson(), 'template_blank.json', 'application/json')}>
                        <Download size={12} />
                        <span>Blank</span>
                      </button>
                      <button type="button" className="template-action-btn" onClick={() => downloadFile(getSampleJson(), 'template_sample.json', 'application/json')}>
                        <Download size={12} />
                        <span>Sample</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Import Flow Overlay Modal */}
          {importStep !== 'upload' && (
            <div className="export-import-modal-overlay">
              <div className="export-import-modal">
                {importStep === 'preview' && (
                  <div className="export-import-modal__content">
                    <div className="export-import-modal__header">
                      <div className="export-import-modal__title-wrap">
                        <FileText size={18} className="export-import-modal__title-icon" />
                        <h3 className="export-import-modal__title">{t('settings.exportImport.previewTitle')}</h3>
                      </div>
                      <button type="button" className="export-import-modal__close" onClick={handleRemoveFile}>
                        <X size={18} />
                      </button>
                    </div>
                    
                    <div className="export-import-modal__body">
                      {/* Destination Warehouse Banner */}
                      <div className="preview-target-warehouse-banner">
                        <div className="preview-target-warehouse-banner__left">
                          <Warehouse size={18} className="preview-target-warehouse-banner__icon" />
                          <div>
                            <span className="preview-target-warehouse-banner__label">{t('settings.exportImport.targetWarehouse')}</span>
                            <h4 className="preview-target-warehouse-banner__name">
                              {targetImportWarehouse?.name || 'Gudang'} <span className="warehouse-code-badge">{targetImportWarehouse?.code}</span>
                            </h4>
                          </div>
                        </div>
                        <div className="preview-target-warehouse-banner__right">
                          <select
                            className="warehouse-select-input warehouse-select-input--sm"
                            value={importWarehouseId}
                            onChange={(e) => handleImportWarehouseChange(e.target.value)}
                          >
                            {warehouses.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name} ({w.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {selectedFile && (
                        <div className="selected-file-card">
                          <div className="selected-file-card__left">
                            <FileText size={16} style={{ color: 'var(--color-interactive)' }} />
                            <span className="selected-file-card__name">{selectedFile.name}</span>
                            <span className="selected-file-card__size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <button type="button" className="selected-file-card__remove" onClick={handleRemoveFile}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}

                      <div className="preview-stats-grid">
                        <div className="preview-stat-card preview-stat-card--total">
                          <div className="preview-stat-card__icon-wrap">
                            <Layers size={18} />
                          </div>
                          <div className="preview-stat-card__content">
                            <span className="preview-stat-card__label">Rows Parsed</span>
                            <span className="preview-stat-card__value">{previewStats.totalRows}</span>
                          </div>
                        </div>
                        <div className="preview-stat-card preview-stat-card--new">
                          <div className="preview-stat-card__icon-wrap">
                            <Plus size={18} />
                          </div>
                          <div className="preview-stat-card__content">
                            <span className="preview-stat-card__label">New Products</span>
                            <span className="preview-stat-card__value">{previewStats.newProducts}</span>
                          </div>
                        </div>
                        <div className="preview-stat-card preview-stat-card--updates">
                          <div className="preview-stat-card__icon-wrap">
                            <Pencil size={16} />
                          </div>
                          <div className="preview-stat-card__content">
                            <span className="preview-stat-card__label">Updates</span>
                            <span className="preview-stat-card__value">{previewStats.existingProducts}</span>
                          </div>
                        </div>
                        <div className="preview-stat-card preview-stat-card--serials">
                          <div className="preview-stat-card__icon-wrap">
                            <Barcode size={18} />
                          </div>
                          <div className="preview-stat-card__content">
                            <span className="preview-stat-card__label">New Serials</span>
                            <span className="preview-stat-card__value">{previewStats.newSerials}</span>
                          </div>
                        </div>
                        {previewStats.errors > 0 && (
                          <div className="preview-stat-card preview-stat-card--errors">
                            <div className="preview-stat-card__icon-wrap">
                              <AlertTriangle size={18} />
                            </div>
                            <div className="preview-stat-card__content">
                              <span className="preview-stat-card__label">Warnings</span>
                              <span className="preview-stat-card__value">{previewStats.errors}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Data Preview Table */}
                      <div className="import-preview-data">
                        <h4 className="import-preview-data__title">Pratinjau Data Katalog</h4>
                        <p className="import-preview-data__subtitle">Berikut adalah data yang dibaca dari file Anda. Data ini akan ditambahkan/diperbarui pada <strong>{targetImportWarehouse?.name}</strong>.</p>
                        <div className="import-preview-table-wrapper">
                          <table className="import-preview-table">
                            <thead>
                              <tr>
                                <th>SKU</th>
                                <th>Nama Produk</th>
                                <th>Kategori</th>
                                <th>Harga Beli / Jual</th>
                                <th>Nomor Seri</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parsedItems.map((item, index) => (
                                <tr key={index}>
                                  <td className="preview-td-sku">{item.sku}</td>
                                  <td className="preview-td-name" title={item.name}>{item.name}</td>
                                  <td className="preview-td-tracking">
                                    <span className="preview-category-badge">
                                      {item.category || '—'}
                                    </span>
                                  </td>
                                  <td className="preview-td-prices">
                                    <div className="preview-price-row">
                                      <span className="price-label">Beli:</span>
                                      <span className="price-val">Rp {Number(item.unitCost || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="preview-price-row">
                                      <span className="price-label">Jual:</span>
                                      <span className="price-val">Rp {Number(item.sellingPrice || 0).toLocaleString()}</span>
                                    </div>
                                  </td>
                                  <td className="preview-td-serials">
                                    {item.serials && item.serials.length > 0 ? (
                                      <div className="preview-serials-list">
                                        {item.serials.map((s, sIdx) => (
                                          <span className="preview-serial-pill" key={sIdx}>
                                            {s.serialNumber}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="preview-no-serials">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {validationWarnings.length > 0 && (
                        <div className="validation-errors-section">
                          <h4 className="validation-errors-title">
                            <AlertTriangle size={16} />
                            <span>{t('settings.exportImport.validationErrorList')}</span>
                          </h4>
                          <ul className="validation-errors-list">
                            {validationWarnings.map((warn, wIdx) => (
                              <li key={wIdx} className="validation-errors-item">
                                <span>•</span>
                                <span>{warn}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="export-import-modal__footer">
                      <button type="button" className="btn btn-secondary interactive" onClick={handleRemoveFile}>
                        {t('settings.exportImport.btnCancel')}
                      </button>
                      <button type="button" className="btn btn-primary interactive" onClick={handleConfirmImport}>
                        <span>{t('settings.exportImport.btnConfirmImport')}</span>
                        <ArrowRight size={16} style={{ marginLeft: '8px' }} />
                      </button>
                    </div>
                  </div>
                )}

                {importStep === 'importing' && (
                  <div className="export-import-modal__content export-import-modal__content--status">
                    <div className="export-import-modal__body">
                      <div className="import-progress-card">
                        <div className="import-progress-card__spinner" />
                        <h3 className="import-progress-card__title">{t('settings.exportImport.importingTitle')}</h3>
                        <p className="import-progress-card__desc">
                          {t('settings.exportImport.importingProgress', { 
                            current: importProgress.current, 
                            total: importProgress.total 
                          })}
                        </p>
                        
                        <div className="progress-bar-container">
                          <div 
                            className="progress-bar-fill" 
                            style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {importStep === 'success' && (
                  <div className="export-import-modal__content export-import-modal__content--status">
                    <div className="export-import-modal__body">
                      <div className="import-success-card">
                        <div className="import-success-card__icon-box">
                          <CheckCircle2 size={36} />
                        </div>
                        <h3 className="import-success-card__title">{t('settings.exportImport.successTitle')}</h3>
                        
                        <div className="import-success-stats">
                          <div className="import-success-target-badge">
                            <Warehouse size={16} />
                            <span>{importResult.warehouseName}</span>
                          </div>
                          <p>{t('settings.exportImport.successAddedProducts', { count: importResult.addedProducts })}</p>
                          <p>{t('settings.exportImport.successUpdatedProducts', { count: importResult.updatedProducts })}</p>
                          <p>{t('settings.exportImport.successAddedSerials', { count: importResult.addedSerials })}</p>
                        </div>

                        <button type="button" className="btn btn-primary interactive" onClick={handleRemoveFile}>
                          {t('settings.exportImport.btnDone')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
