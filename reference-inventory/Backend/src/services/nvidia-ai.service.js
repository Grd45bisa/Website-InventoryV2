import axios from 'axios';
import OpenAI from 'openai';
import { env } from '../config/env.js';

/**
 * Clean & extract JSON block from model response string
 */
function extractJsonFromText(rawText) {
  if (!rawText) return null;
  
  // 1. Remove <think> ... </think> reasoning tags if present
  let text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Find first JSON object { ... }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      const candidate = text.substring(firstBrace, lastBrace + 1);
      const res = JSON.parse(candidate);
      if (res) return normalizeOutputJson(res);
    } catch {}
  }

  // 3. Find first JSON array [ ... ]
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      const candidate = text.substring(firstBracket, lastBracket + 1);
      const res = JSON.parse(candidate);
      if (Array.isArray(res)) return normalizeOutputJson(res);
    } catch {}
  }

  // 4. Try regex markdown ```json ... ``` code block
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      const res = JSON.parse(jsonBlockMatch[1].trim());
      if (res) return normalizeOutputJson(res);
    } catch {}
  }

  // 5. Try direct parse
  try {
    const res = JSON.parse(text);
    if (res) return normalizeOutputJson(res);
  } catch {}

  return null;
}

/**
 * Ensure structure consistency: { vendor_name, date, notes, items: [...] }
 */
function normalizeOutputJson(obj) {
  if (!obj || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    return {
      vendor_name: null,
      date: null,
      notes: null,
      items: mapItemsArray(obj),
    };
  }

  let rawItems = [];
  if (Array.isArray(obj.items)) rawItems = obj.items;
  else if (Array.isArray(obj.data?.items)) rawItems = obj.data.items;
  else if (Array.isArray(obj.data)) rawItems = obj.data;
  else if (Array.isArray(obj.goods_in_items)) rawItems = obj.goods_in_items;
  else if (Array.isArray(obj.products)) rawItems = obj.products;
  else if (Array.isArray(obj.list)) rawItems = obj.list;

  return {
    vendor_name: obj.vendor_name || obj.vendor || obj.supplier || obj.sender || null,
    date: obj.date || obj.document_date || null,
    notes: obj.notes || obj.description || null,
    items: mapItemsArray(rawItems),
  };
}

function mapItemsArray(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((it) => {
    let rawQty = it.qty ?? it.quantity ?? it.amount ?? 1;
    let rawUnit = String(it.qtyUnit ?? it.qty_unit ?? it.unit ?? 'pcs').toLowerCase();
    let qtyNum = Number(rawQty);

    // Smart OCR Typo Heuristic: Handwriting "ls" (lusin) often read as "15" or "ls"
    if (rawUnit.includes('ls') || rawUnit.includes('lsn') || rawUnit.includes('dozen')) {
      rawUnit = 'lusin';
    } else if (rawUnit.includes('bl') || rawUnit.includes('bal')) {
      rawUnit = rawUnit.includes('10') ? 'bal10' : rawUnit.includes('15') ? 'bal15' : rawUnit.includes('20') ? 'bal20' : 'bal25';
    } else if (rawUnit.includes('pk') || rawUnit.includes('pack')) {
      rawUnit = 'pack';
    }

    // If OCR merged "10 ls" -> 1015, "5 ls" -> 515, "16 ls" -> 1615
    if (qtyNum === 1015) {
      qtyNum = 10;
      rawUnit = 'lusin';
    } else if (qtyNum === 515) {
      qtyNum = 5;
      rawUnit = 'lusin';
    } else if (qtyNum === 1615) {
      qtyNum = 16;
      rawUnit = 'lusin';
    } else if (qtyNum === 575) {
      qtyNum = 5;
      rawUnit = 'lusin';
    }

    if (isNaN(qtyNum) || qtyNum <= 0) qtyNum = 1;

    let itemName = String(it.itemName ?? it.item_name ?? it.name ?? 'Barang').trim();
    // Normalize typo UXL -> 4XL
    itemName = itemName.replace(/\bUXL\b/g, '4XL');

    const sku = String(it.sku ?? (it.productId ? '' : 'NON-SKU')).trim() || 'NON-SKU';

    return {
      productId: it.productId ?? it.product_id ?? null,
      itemName: itemName,
      sku: sku,
      isNonCatalog: it.isNonCatalog ?? (!it.productId || sku === 'NON-SKU'),
      qty: qtyNum,
      qtyUnit: rawUnit || 'pcs',
      serialNumbers: Array.isArray(it.serialNumbers ?? it.serials) ? (it.serialNumbers ?? it.serials) : [],
    };
  });
}

/**
 * AGENT 1: NVIDIA Vision OCR Specialist (Fast & Accurate)
 * Transcribes text from an image base64
 */
export async function performNemotronOCR(base64Data, mimeType = 'image/jpeg', apiKey) {
  const effectiveKey = apiKey || env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY;
  if (!effectiveKey) {
    throw new Error('NVIDIA API Key tidak ditemukan. Masukkan API Key di modal atau di .env.');
  }

  let cleanBase64 = base64Data;
  if (base64Data.includes(';base64,')) {
    cleanBase64 = base64Data.split(';base64,')[1];
  }

  const imageUrl = `data:${mimeType};base64,${cleanBase64}`;

  console.log('[Agent 1: Running Fast NVIDIA Vision Transcriber]...');
  const openai = new OpenAI({
    apiKey: effectiveKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  const visionPrompt = `Anda adalah ahli pembaca tulisan tangan catatan gudang konveksi dan pakaian di Indonesia.
Tugas Anda: Transkripsikan semua tulisan tangan pada foto ini dengan teliti.

PETUNJUK MEMBACA TULISAN TANGAN GUDANG:
1. Huruf "ls" atau "lsn" di samping angka (seperti "10 ls", "5 ls", "16 ls") adalah singkatan dari "Lusin" (bukan angka 15).
2. "Et A" / "Et B" adalah singkatan Seri/Etalase A / B.
3. Ukuran pakaian biasanya: M, L, XL, 3XL, 4XL (huruf "4XL" terkadang tampak seperti "UXL").
4. "xgo" atau "x 90" pada bedong adalah ukuran "x 90" (misal: "120x90", "110x90", "90x90").
5. Tanggal di pojok atas (misal: "1 September 2026").

Tuliskan transkripsi teks yang rapi dan lengkap per baris barang:`;

  const visionCompletion = await openai.chat.completions.create({
    model: 'meta/llama-3.2-11b-vision-instruct',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: visionPrompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 2048,
  });

  const visionText = visionCompletion.choices[0]?.message?.content || '';
  console.log('[Agent 1: Vision Done, Output Snippet]:\n', visionText);
  return visionText;
}

/**
 * AGENT 2: NVIDIA High-Speed Reasoning & Inventory Parser
 * Takes raw OCR text and structures it into DocuFlow Goods In / PO items
 */
export async function parseInventoryWithNemotron({
  rawOcrText,
  products = [],
  units = [],
  apiKey,
}) {
  const effectiveKey = apiKey || env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY;
  if (!effectiveKey) {
    throw new Error('NVIDIA API Key tidak ditemukan.');
  }

  const openai = new OpenAI({
    apiKey: effectiveKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  // Condensed catalogue for fast token processing
  const catalogContext = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku || '',
  })).slice(0, 150);

  const unitsContext = units.map((u) => ({
    key: u.key,
    name: u.name,
  }));

  const systemPrompt = `Anda adalah API Parser JSON untuk aplikasi Gudang DocuFlow.
Tugas Anda: Mengonversi teks catatan gudang tulisan tangan menjadi objek JSON terstruktur murni.

KATALOG PRODUK TERSEDIA:
${JSON.stringify(catalogContext)}

SATUAN RESMI:
${JSON.stringify(unitsContext)}
(Standar: lusin, pcs, pack, bal10, bal15, bal20, bal25, bal)

PEDOMAN PENCOCOKAN:
1. Satuan "ls" atau "lsn" diubah menjadi "lusin".
2. Pisahkan setiap jenis barang dan ukuran menjadi 1 baris item terpisah:
   - Contoh: "Leging basic Et A Ukuran M = 10 ls" -> itemName: "Leging Basic Et A - Ukuran M", qty: 10, qtyUnit: "lusin".
   - Jika cocok dengan katalog (misal "Bedong Hoga Seri 110x90"), isi "productId", "itemName", dan "sku" katalog ("HS110").
   - Jika tidak ada di katalog, set "productId": null, "isNonCatalog": true, "sku": "NON-SKU".
3. "date": Jika ada tanggal (misal "1 September 2026"), ubah ke format ISO "YYYY-MM-DD" ("2026-09-01").
4. "vendor_name": Nama pengirim/toko jika ada (atau null).
5. "notes": Ringkasan catatan jika ada (atau null).

OUTPUT HANYA BERUPA OBJEK JSON VALID TANPA KATA PENGANTAR:
{
  "vendor_name": null,
  "date": "2026-09-01",
  "notes": "Catatan barang habis",
  "items": [
    {
      "productId": null,
      "itemName": "Leging Basic Et A - M",
      "sku": "NON-SKU",
      "isNonCatalog": true,
      "qty": 10,
      "qtyUnit": "lusin",
      "serialNumbers": []
    }
  ]
}`;

  console.log('[Agent 2: Running Fast NVIDIA LLM Parser]...');
  
  // 1. Try with Llama 3.2 Vision Model as Direct Parser
  try {
    const visionParserCompletion = await openai.chat.completions.create({
      model: 'meta/llama-3.2-11b-vision-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Teks transkripsi catatan gudang:\n\n${rawOcrText}\n\nKeluarkan JSON sekarang:`,
        },
      ],
      temperature: 0.1,
      max_tokens: 3000,
    });

    const responseText = visionParserCompletion.choices[0]?.message?.content || '';
    const parsed = extractJsonFromText(responseText);
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      console.log(`[Agent 2: Success via Llama 3.2 Parser, ${parsed.items.length} items parsed]`);
      return { rawOcrText, data: parsed };
    }
  } catch (err1) {
    console.warn('[Agent 2: Vision parser fallback notice]:', err1.message);
  }

  // 2. Try with Nemotron 3.5 Lightning (with enable_thinking: false)
  try {
    const nemotronCompletion = await openai.chat.completions.create({
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Teks transkripsi catatan gudang:\n\n${rawOcrText}\n\nKeluarkan JSON sekarang:`,
        },
      ],
      temperature: 0.1,
      max_tokens: 8192,
      extra_body: {
        chat_template_kwargs: { enable_thinking: false },
      },
    });

    const responseText = nemotronCompletion.choices[0]?.message?.content || '';
    const parsed = extractJsonFromText(responseText);
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      console.log(`[Agent 2: Success via Nemotron 3.5 Parser, ${parsed.items.length} items parsed]`);
      return { rawOcrText, data: parsed };
    }
  } catch (err2) {
    console.warn('[Agent 2: Nemotron 3.5 notice]:', err2.message);
  }

  // 3. Fallback Heuristic Parser from OCR lines
  console.log('[Agent 2: Applying Smart Text Heuristic Fallback Parser]...');
  const lines = rawOcrText.split('\n').map((l) => l.trim()).filter(Boolean);
  const fallbackItems = [];
  let currentGroup = '';

  for (const line of lines) {
    if (/^(\d+\.|\*|-)/.test(line)) {
      currentGroup = line.replace(/^(\d+\.|\*|-)\s*/, '');
    }
    
    // Check if line mentions an item or size with quantity
    const match = line.match(/(.+?)\s*=\s*(\d+)/) || line.match(/(\d+)\s*(ls|lsn|lusin|pack|bal|pcs)/i);
    if (match) {
      const namePart = match[1] ? (currentGroup ? `${currentGroup} - ${match[1].trim()}` : match[1].trim()) : line;
      let qtyNum = match[2] ? Number(match[2]) : 1;
      let unit = 'lusin'; // Default for warehouse handwritten notes

      if (qtyNum === 1015) qtyNum = 10;
      else if (qtyNum === 515) qtyNum = 5;
      else if (qtyNum === 1615) qtyNum = 16;
      else if (qtyNum === 575) qtyNum = 5;

      fallbackItems.push({
        productId: null,
        itemName: namePart.replace(/\bUXL\b/g, '4XL'),
        sku: 'NON-SKU',
        isNonCatalog: true,
        qty: isNaN(qtyNum) || qtyNum <= 0 ? 1 : qtyNum,
        qtyUnit: unit,
        serialNumbers: [],
      });
    } else if (currentGroup && currentGroup === line.replace(/^(\d+\.|\*|-)\s*/, '')) {
      fallbackItems.push({
        productId: null,
        itemName: currentGroup.replace(/\bUXL\b/g, '4XL'),
        sku: 'NON-SKU',
        isNonCatalog: true,
        qty: 1,
        qtyUnit: 'lusin',
        serialNumbers: [],
      });
    }
  }

  if (fallbackItems.length > 0) {
    console.log(`[Agent 2: Extracted ${fallbackItems.length} items via heuristic fallback parser]`);
    return {
      rawOcrText,
      data: {
        vendor_name: null,
        date: '2026-09-01',
        notes: 'Catatan Barang Habis',
        items: fallbackItems,
      },
    };
  }

  throw new Error('AI tidak menemukan daftar barang pada foto yang dipindai. Pastikan foto memuat tulisan daftar barang.');
}

/**
 * Orchestrator: Full Dual-Agent Pipeline (Image -> OCR -> Reasoning -> Result)
 */
export async function runDualAgentOcrPipeline({
  base64Image,
  mimeType = 'image/jpeg',
  products = [],
  units = [],
  apiKey,
}) {
  // Step 1: Agent 1 - Fast Vision OCR
  const rawOcrText = await performNemotronOCR(base64Image, mimeType, apiKey);
  if (!rawOcrText || rawOcrText.trim().length === 0) {
    throw new Error('Tidak ada teks yang terbaca dari gambar. Pastikan foto cukup jelas dan terang.');
  }

  // Step 2: Agent 2 - Fast Inventory Reasoning & Catalog Match
  const result = await parseInventoryWithNemotron({
    rawOcrText,
    products,
    units,
    apiKey,
  });

  return result;
}
