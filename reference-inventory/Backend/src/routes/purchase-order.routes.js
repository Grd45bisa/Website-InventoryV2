import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadTenant } from '../middleware/loadTenant.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { httpError } from '../utils/httpError.js';
import { writeActivityLog } from '../utils/activityLog.js';
import { generatePOPdf } from '../services/pdf.service.js';
import { sendPOEmail, resolveFinanceEmail } from '../services/email.service.js';
import { getWorkspaceUnits } from './workspace.routes.js';

const router = Router();
const PO_SELECT = 'id, po_number, po_date, vendor_name, sales_person_id, status, notes, created_at, updated_at';
const PO_DETAIL_SELECT = `${PO_SELECT}, items:purchase_order_items(id, item_name, sku, qty)`;

router.use(requireAuth, loadTenant);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const createPOSchema = z.object({
  vendor_name: z.string().trim().min(1).max(255),
  notes: z.string().trim().max(2000).optional().nullable(),
  items: z
    .array(
      z.object({
        item_name: z.string().trim().min(1).max(255),
        sku: z.string().trim().max(100).optional().default('NON-SKU'),
        qty: z.coerce.number().int().min(1),
      })
    )
    .min(1),
});

const updatePOSchema = z.object({
  vendor_name: z.string().trim().min(1).max(255).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['draft', 'pending', 'submitted', 'approved', 'fulfilled', 'cancelled']).optional(),
  items: z
    .array(
      z.object({
        item_name: z.string().trim().min(1).max(255),
        sku: z.string().trim().max(100).optional().default('NON-SKU'),
        qty: z.coerce.number().int().min(1),
      })
    )
    .min(1)
    .optional(),
});

const idSchema = z.string().uuid();
const listQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  status: z.string().trim().max(50).optional(),
  vendor: z.string().trim().max(255).optional(),
  include_items: z.union([z.string(), z.boolean()]).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const itemsQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isPrivileged(role) {
  return role === 'owner' || role === 'staff' || role === 'super_admin';
}

async function generatePONumber(ownerId) {
  // 1. Fetch numbering settings from workspace_settings
  const { data: setting } = await supabaseAdmin
    .from('workspace_settings')
    .select('value')
    .eq('owner_id', ownerId)
    .eq('key', 'numbering')
    .maybeSingle();

  // 2. Resolve PO rule
  const defaultPoRule = {
    type: 'purchase_order',
    prefix: 'PO',
    format: '{PREFIX}/{YYYY}{MM}/{SEQ}',
    seqLength: 4,
    seqReset: 'monthly',
    separator: '/',
    leadingZero: true,
  };
  let rule = defaultPoRule;

  const rules = setting?.value?.rules || (Array.isArray(setting?.value) ? setting.value : null);
  if (Array.isArray(rules)) {
    const found = rules.find((r) => r.type === 'purchase_order');
    if (found) rule = found;
  }

  // 3. Query existing PO numbers to find max sequence and prevent collisions
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  let query = supabaseAdmin
    .from('purchase_orders')
    .select('po_number')
    .eq('owner_id', ownerId);

  if (rule.seqReset === 'daily') {
    const startOfDay = new Date(y, m, d).toISOString();
    query = query.gte('created_at', startOfDay);
  } else if (rule.seqReset === 'monthly') {
    const startOfMonth = new Date(y, m, 1).toISOString();
    query = query.gte('created_at', startOfMonth);
  } else if (rule.seqReset === 'yearly') {
    const startOfYear = new Date(y, 0, 1).toISOString();
    query = query.gte('created_at', startOfYear);
  }

  const { data: existingPOs, error } = await query;
  if (error) throw httpError(500, 'Failed to fetch purchase orders for numbering', error.message);

  const existingNumbers = new Set((existingPOs || []).map((p) => p.po_number));

  let maxSeq = 0;
  for (const p of existingPOs || []) {
    const match = p.po_number?.match(/(\d+)(?=[^\d]*$)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  // 4. Format PO number & increment candidateSeq until a unique PO number is found
  const yyyy = String(y);
  const yy = yyyy.slice(2);
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const seqLen = rule.seqLength || 4;

  let candidateSeq = Math.max(maxSeq + 1, (existingPOs?.length || 0) + 1);
  let formatted = '';

  while (true) {
    const seqStr =
      rule.leadingZero !== false
        ? String(candidateSeq).padStart(seqLen, '0')
        : String(candidateSeq);

    let template = rule.format || '{PREFIX}/{YYYY}{MM}/{SEQ}';
    formatted = template
      .replace(/{PREFIX}/g, rule.prefix || '')
      .replace(/{YYYY}/g, yyyy)
      .replace(/{YY}/g, yy)
      .replace(/{MM}/g, mm)
      .replace(/{DD}/g, dd)
      .replace(/{SEQ}/g, seqStr)
      .replace(/{BRANCH}/g, 'HO')
      .replace(/{WAREHOUSE}/g, 'WH1');

    if (!existingNumbers.has(formatted)) {
      break;
    }
    candidateSeq++;
  }

  return formatted;
}

function buildPOListQuery({ role, ownerId, userId, warehouseId, params }) {
  const selectCols =
    params.include_items === 'true' || params.include_items === true
      ? PO_DETAIL_SELECT
      : PO_SELECT;

  let query = supabaseAdmin
    .from('purchase_orders')
    .select(selectCols, { count: 'exact' })
    .eq('owner_id', ownerId);

  if (warehouseId) {
    query = query.eq('warehouse_id', warehouseId);
  }

  // Role sales_person hanya boleh melihat PO miliknya sendiri.
  if (!isPrivileged(role)) {
    query = query.eq('sales_person_id', userId);
  }

  if (params.status) query = query.eq('status', params.status);
  if (params.vendor) query = query.ilike('vendor_name', `%${params.vendor}%`);
  if (params.search) {
    query = query.or(
      `po_number.ilike.%${params.search}%,vendor_name.ilike.%${params.search}%`
    );
  }

  query = query
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  return query;
}

async function getPOById({ id, ownerId, role, userId }) {
  let query = supabaseAdmin
    .from('purchase_orders')
    .select(PO_DETAIL_SELECT)
    .eq('id', id)
    .eq('owner_id', ownerId);

  if (!isPrivileged(role)) {
    query = query.eq('sales_person_id', userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw httpError(500, 'Failed to load purchase order', error.message);
  if (!data) throw httpError(404, 'Purchase order not found');
  return data;
}

/**
 * Ambil PO tanpa scoping role/sales_person — hanya di-scope oleh owner_id.
 * Dipakai oleh proses server-side terpercaya (cron retry worker) yang tidak
 * berjalan atas nama satu user tertentu.
 */
async function getPOByIdForOwner(id, ownerId) {
  const { data, error } = await supabaseAdmin
    .from('purchase_orders')
    .select(PO_DETAIL_SELECT)
    .eq('id', id)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw httpError(500, 'Failed to load purchase order', error.message);
  if (!data) throw httpError(404, 'Purchase order not found');
  return data;
}

// Sales name is needed for the email subject. Ambil dari profiles (full_name) atau fallback ke email.
async function resolveSalesName(userId) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  return data?.full_name ?? null;
}

// ---------------------------------------------------------------------------
// GET /purchase-orders/items — endpoint khusus untuk form PO.
// Hanya return {id, name, sku} dari tabel products. TANPA field harga.
// Endpoint ini di-allow untuk sales_person (module purchase-orders).
// ---------------------------------------------------------------------------
router.get('/purchase-orders/items', async (req, res, next) => {
  try {
    const params = itemsQuerySchema.parse(req.query);
    let query = supabaseAdmin
      .from('products')
      .select('id, name, sku')
      .eq('owner_id', req.auth.ownerId)
      .order('name', { ascending: true });

    if (req.auth.warehouseId) {
      query = query.eq('warehouse_id', req.auth.warehouseId);
    }

    if (params.search) {
      query = query.or(`name.ilike.%${params.search}%,sku.ilike.%${params.search}%`);
    }

    query = query.range(params.offset, params.offset + params.limit - 1);
    const { data, error, count } = await query;
    if (error) throw httpError(500, 'Failed to load items', error.message);
    res.json({ data, count });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /purchase-orders — list PO
// ---------------------------------------------------------------------------
router.get('/purchase-orders', async (req, res, next) => {
  try {
    const params = listQuerySchema.parse(req.query);
    const { data, error, count } = await buildPOListQuery({
      role: req.auth.role,
      ownerId: req.auth.ownerId,
      userId: req.auth.user.id,
      warehouseId: req.auth.warehouseId,
      params,
    });
    if (error) throw httpError(500, 'Failed to load purchase orders', error.message);
    res.json({ data, count });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /purchase-orders/:id — detail PO + items
// ---------------------------------------------------------------------------
router.get('/purchase-orders/:id', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const data = await getPOById({
      id,
      ownerId: req.auth.ownerId,
      role: req.auth.role,
      userId: req.auth.user.id,
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /purchase-orders/:id/pdf — unduh/cetak PDF PO
// ---------------------------------------------------------------------------
router.get('/purchase-orders/:id/pdf', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const fullPO = await getPOById({
      id,
      ownerId: req.auth.ownerId,
      role: req.auth.role,
      userId: req.auth.user.id,
    });

    const { data: appSetting } = await supabaseAdmin
      .from('workspace_settings')
      .select('value')
      .eq('owner_id', req.auth.ownerId)
      .eq('key', 'app')
      .maybeSingle();

    let companyData = appSetting?.value?.company;

    if (!companyData) {
      const { data: compSetting } = await supabaseAdmin
        .from('workspace_settings')
        .select('value')
        .eq('owner_id', req.auth.ownerId)
        .eq('key', 'company')
        .maybeSingle();
      companyData = compSetting?.value;
    }

    const companyName = companyData?.companyName || companyData?.name || 'Docuflow Company';
    const companyAddress = companyData?.companyAddress || companyData?.address || '';
    const companyPhone = companyData?.companyPhone || companyData?.phone || '';
    const companyLogo = companyData?.companyLogo || companyData?.logoUrl || '';

    const salesName = await resolveSalesName(fullPO.sales_person_id);
    let customUnits = null;
    try {
      const wu = await getWorkspaceUnits(req.auth.ownerId, fullPO.warehouse_id);
      customUnits = wu.units;
    } catch (_) {}

    const pdfBuffer = generatePOPdf(
      { ...fullPO, sales_person_name: salesName },
      { companyName, companyAddress, companyPhone, companyLogo, custom_units: customUnits }
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="PO-${fullPO.po_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /purchase-orders/:id/email-status — status pengiriman email PO terakhir
// Super ringan: 1 query indexed (idx_email_logs_po: purchase_order_id, created_at DESC),
// select kolom minimal, limit 1. Ditujukan untuk polling ringan dari frontend.
// ---------------------------------------------------------------------------
router.get('/purchase-orders/:id/email-status', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    // Pastikan PO ada & milik tenant ini (juga menegakkan scoping sales_person).
    await getPOById({
      id,
      ownerId: req.auth.ownerId,
      role: req.auth.role,
      userId: req.auth.user.id,
    });

    const { data: log, error } = await supabaseAdmin
      .from('email_logs')
      .select('status, recipient_email, sent_at, error_message')
      .eq('purchase_order_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw httpError(500, 'Failed to load email status', error.message);

    res.json({
      data: {
        status: log?.status ?? 'not_sent',
        recipient: log?.recipient_email ?? null,
        sentAt: log?.sent_at ?? null,
        errorMessage: log?.error_message ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /purchase-orders/:id/send-email — kirim ulang email PO secara manual.
// Vercel serverless: seluruh proses (PDF + kirim email) WAJIB di-await sebelum
// res.json() dikirim — tidak ada fire-and-forget di sini, karena function bisa
// dibekukan begitu response dikirim.
// Debounce: tolak resend jika email terakhir berhasil terkirim < 30 detik lalu.
// ---------------------------------------------------------------------------
/**
 * Bangun ulang PDF + kirim email PO. Dipakai bersama oleh endpoint manual
 * resend (POST /purchase-orders/:id/send-email) dan cron retry worker
 * (GET/POST /api/cron/retry-emails), sehingga logika resolve recipient/PDF
 * tidak terduplikasi dan tetap konsisten di kedua alur.
 *
 * @param {Object} fullPO - baris PO lengkap (hasil getPOById / select PO_DETAIL_SELECT)
 * @param {Object} opts
 * @param {string} opts.ownerId - tenant/owner PO
 * @param {string} [opts.actorUserId] - id user yang memicu resend (untuk resolve sales email jika beda)
 * @param {string} [opts.actorEmail] - email user yang memicu resend (fallback sales email)
 * @returns {Promise<{status:'sent'|'failed', error?:string, messageId?:string, subject:string}>}
 */
async function resendPOEmail(fullPO, { ownerId, actorUserId = null, actorEmail = null } = {}) {
  const salesName = await resolveSalesName(fullPO.sales_person_id);
  const financeEmail = await resolveFinanceEmail(ownerId);

  const { data: appSetting } = await supabaseAdmin
    .from('workspace_settings')
    .select('value')
    .eq('owner_id', ownerId)
    .eq('key', 'app')
    .maybeSingle();

  let companyData = appSetting?.value?.company;
  if (!companyData) {
    const { data: compSetting } = await supabaseAdmin
      .from('workspace_settings')
      .select('value')
      .eq('owner_id', ownerId)
      .eq('key', 'company')
      .maybeSingle();
    companyData = compSetting?.value;
  }

  const companyName = companyData?.companyName || companyData?.name || 'Docuflow Company';
  const companyAddress = companyData?.companyAddress || companyData?.address || '';
  const companyPhone = companyData?.companyPhone || companyData?.phone || '';
  const companyLogo = companyData?.companyLogo || companyData?.logoUrl || '';
  const accentColor = appSetting?.value?.appearance?.accentColor || 'Indigo';

  // Sales email untuk header PDF & CC — actor yang memicu resend (user manual,
  // atau cron worker tanpa actor) belum tentu sales aslinya, jadi ambil dari
  // profile sales_person PO bila berbeda.
  let salesEmail = actorEmail;
  if (!actorUserId || actorUserId !== fullPO.sales_person_id) {
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(fullPO.sales_person_id);
      salesEmail = authUser?.user?.email ?? salesEmail;
    } catch (_) {
      // fallback ke actorEmail bila lookup gagal
    }
  }

  const pdfBuffer = generatePOPdf(
    { ...fullPO, sales_person_name: salesName },
    { companyName, companyAddress, companyPhone, companyLogo }
  );

  // WAJIB di-await oleh pemanggil sebelum res.json() (Vercel serverless):
  // fungsi ini sendiri sudah async/await tuntas terhadap sendPOEmail.
  return sendPOEmail({
    po: { ...fullPO, sales_person_name: salesName },
    pdfBuffer,
    salesEmail,
    salesName,
    financeEmail,
    accentColor,
  });
}

router.post('/purchase-orders/:id/send-email', async (req, res, next) => {
  try {
    if (!isPrivileged(req.auth.role)) {
      throw httpError(403, 'Hanya staff atau owner yang dapat mengirim ulang email PO.');
    }

    const id = idSchema.parse(req.params.id);
    const fullPO = await getPOById({
      id,
      ownerId: req.auth.ownerId,
      role: req.auth.role,
      userId: req.auth.user.id,
    });

    // Debounce: cek log terakhir (1 query ringan, pakai index yang sama).
    const { data: lastLog, error: lastLogError } = await supabaseAdmin
      .from('email_logs')
      .select('status, sent_at')
      .eq('purchase_order_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastLogError) throw httpError(500, 'Failed to check last email status', lastLogError.message);

    const DEBOUNCE_MS = 30_000;
    if (lastLog?.status === 'sent' && lastLog.sent_at) {
      const elapsedMs = Date.now() - new Date(lastLog.sent_at).getTime();
      if (elapsedMs >= 0 && elapsedMs < DEBOUNCE_MS) {
        const retryAfterSec = Math.ceil((DEBOUNCE_MS - elapsedMs) / 1000);
        res.setHeader('Retry-After', String(retryAfterSec));
        throw httpError(
          429,
          `Email PO ini baru saja berhasil dikirim. Coba lagi dalam ${retryAfterSec} detik.`
        );
      }
    }

    // WAJIB di-await: Vercel membekukan container segera setelah response
    // dikirim, jadi pengiriman email harus tuntas sebelum res.json().
    const result = await resendPOEmail(fullPO, {
      ownerId: req.auth.ownerId,
      actorUserId: req.auth.user.id,
      actorEmail: req.auth.user.email,
    });

    if (result.status === 'failed') {
      return res.status(502).json({
        success: false,
        error: result.error || 'Gagal mengirim email PO.',
        data: result,
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /purchase-orders — buat PO baru
// Sales_Person auto-set sales_person_id dari user yang login.
// Email dikirim di background (tidak di-await) agar response cepat.
// ---------------------------------------------------------------------------
router.post('/purchase-orders', async (req, res, next) => {
  try {
    const payload = createPOSchema.parse(req.body);

    const poNumber = await generatePONumber(req.auth.ownerId);
    const salesPersonId = req.auth.user.id;

    const insertPayload = {
      po_number: poNumber,
      po_date: new Date().toISOString().slice(0, 10),
      vendor_name: payload.vendor_name,
      sales_person_id: salesPersonId,
      status: 'pending',
      notes: payload.notes ?? null,
      owner_id: req.auth.ownerId,
      warehouse_id: req.auth.warehouseId,
      created_by: req.auth.user.id,
    };

    const { data: po, error: poError } = await supabaseAdmin
      .from('purchase_orders')
      .insert(insertPayload)
      .select(PO_DETAIL_SELECT)
      .single();
    if (poError) throw httpError(500, 'Failed to create purchase order', poError.message);

    const itemsPayload = payload.items.map((item) => ({
      purchase_order_id: po.id,
      item_name: item.item_name,
      sku: item.sku,
      qty: item.qty,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('purchase_order_items')
      .insert(itemsPayload);
    if (itemsError) {
      // Cleanup header PO agar tidak ada PO tanpa items.
      await supabaseAdmin.from('purchase_orders').delete().eq('id', po.id);
      throw httpError(500, 'Failed to create purchase order items', itemsError.message);
    }

    // Re-fetch PO + items untuk response lengkap & email.
    const { data: fullPO, error: refetchError } = await supabaseAdmin
      .from('purchase_orders')
      .select(PO_DETAIL_SELECT)
      .eq('id', po.id)
      .maybeSingle();
    if (refetchError || !fullPO) {
      throw httpError(500, 'Failed to load created purchase order', refetchError?.message);
    }

    writeActivityLog(req, {
      action: 'created',
      entityType: 'PurchaseOrders',
      entityId: fullPO.id,
      entityName: fullPO.po_number,
      afterData: fullPO,
    }).catch((err) => console.error('[PO activity log] error:', err?.message ?? err));

    // Send HTTP response fast to frontend (< 200ms)
    res.status(201).json({ data: fullPO });

    // Background processing for PO Email & Notification (non-blocking for HTTP response)
    (async () => {
      try {
        const salesEmail = req.auth.user.email;
        const salesName =
          req.auth.user.user_metadata?.full_name ??
          (await resolveSalesName(salesPersonId)) ??
          salesEmail;

        const financeEmail = await resolveFinanceEmail(req.auth.ownerId);

        const { data: appSetting } = await supabaseAdmin
          .from('workspace_settings')
          .select('value')
          .eq('owner_id', req.auth.ownerId)
          .eq('key', 'app')
          .maybeSingle();

        let companyData = appSetting?.value?.company;
        if (!companyData) {
          const { data: compSetting } = await supabaseAdmin
            .from('workspace_settings')
            .select('value')
            .eq('owner_id', req.auth.ownerId)
            .eq('key', 'company')
            .maybeSingle();
          companyData = compSetting?.value;
        }

        const companyName = companyData?.companyName || companyData?.name || 'Docuflow Company';
        const companyAddress = companyData?.companyAddress || companyData?.address || '';
        const companyPhone = companyData?.companyPhone || companyData?.phone || '';
        const companyLogo = companyData?.companyLogo || companyData?.logoUrl || '';

        const accentColor = appSetting?.value?.appearance?.accentColor || 'Indigo';

        const pdfBuffer = generatePOPdf(
          { ...fullPO, sales_person_name: salesName },
          { companyName, companyAddress, companyPhone, companyLogo }
        );

        await sendPOEmail({
          po: { ...fullPO, sales_person_name: salesName },
          pdfBuffer,
          salesEmail,
          salesName,
          financeEmail,
          accentColor,
        });

        // Notify the owner in the web app (only if the submitter is not the owner)
        if (req.auth.user.id !== req.auth.ownerId) {
          const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
            owner_id: req.auth.ownerId,
            user_id: req.auth.ownerId,
            type: 'po_submitted',
            title: 'Purchase Order Baru',
            message: `Purchase Order baru ${fullPO.po_number} telah dibuat oleh ${salesName}.`,
            reference_id: fullPO.id,
            reference_type: 'purchase_order',
            is_read: false,
          });
          if (notifErr) {
            console.error('[PO notification to owner] failed to insert:', notifErr.message);
          }
        }
      } catch (bgErr) {
        console.error('[PO background email/notif] error:', bgErr?.message ?? bgErr);
      }
    })();
  } catch (error) {
    console.error('[POST /purchase-orders] error:', error?.message ?? error, error?.details ?? '');
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /purchase-orders/:id/approve — approve PO (set status -> 'approved')
// Hanya staff/owner.
// ---------------------------------------------------------------------------
router.post('/purchase-orders/:id/approve', async (req, res, next) => {
  try {
    if (!isPrivileged(req.auth.role)) {
      throw httpError(403, 'Hanya staff atau owner yang dapat menyetujui Purchase Order.');
    }

    const id = idSchema.parse(req.params.id);
    const po = await getPOById({
      id,
      ownerId: req.auth.ownerId,
      role: req.auth.role,
      userId: req.auth.user.id,
    });

    if (po.status === 'approved' || po.status === 'fulfilled') {
      throw httpError(409, `Purchase order sudah berstatus ${po.status}.`);
    }

    // 1. Update PO status → approved
    const { error: poError } = await supabaseAdmin
      .from('purchase_orders')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', req.auth.ownerId);
    if (poError) throw httpError(500, 'Gagal menyetujui Purchase Order', poError.message);

    // 2. Notify the sales person
    if (po.sales_person_id) {
      const { error: approveNotifErr } = await supabaseAdmin.from('notifications').insert({
        owner_id: req.auth.ownerId,
        user_id: po.sales_person_id,
        type: 'po_approved',
        title: 'Purchase Order Disetujui',
        message: `Purchase Order ${po.po_number} telah disetujui dan siap untuk diproses di Gudang (Goods Out).`,
        reference_id: id,
        reference_type: 'purchase_order',
        is_read: false,
      });
      if (approveNotifErr) {
        console.error('[PO approve notification] failed:', approveNotifErr.message);
      }
    }

    // 3. Activity log (non-fatal)
    writeActivityLog(req, {
      action: 'approved',
      entityType: 'PurchaseOrders',
      entityId: id,
      entityName: po.po_number,
      afterData: { status: 'approved' },
    }).catch((e) => console.error('[PO approve] activity log failed:', e?.message ?? e));

    res.json({ data: { po_id: id, po_number: po.po_number, status: 'approved' } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /purchase-orders/:id/approve-invoice — approve PO + create invoice
// Hanya staff/owner.
// ---------------------------------------------------------------------------
router.post('/purchase-orders/:id/approve-invoice', async (req, res, next) => {
  try {
    if (!isPrivileged(req.auth.role)) {
      throw httpError(403, 'Only staff or owner can approve a purchase order.');
    }

    const id = idSchema.parse(req.params.id);
    const po = await getPOById({
      id,
      ownerId: req.auth.ownerId,
      role: req.auth.role,
      userId: req.auth.user.id,
    });

    if (po.status === 'approved') {
      throw httpError(409, 'Purchase order is already approved.');
    }

    // 1. Update PO status → approved
    const { error: poError } = await supabaseAdmin
      .from('purchase_orders')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', req.auth.ownerId);
    if (poError) throw httpError(500, 'Failed to approve purchase order', poError.message);

    // 2. Generate invoice document number
    const { data: numSetting } = await supabaseAdmin
      .from('workspace_settings')
      .select('value')
      .eq('owner_id', req.auth.ownerId)
      .eq('key', 'numbering')
      .maybeSingle();

    const defaultInvRule = { type: 'invoice', prefix: 'INV', format: '{PREFIX}/{YYYY}{MM}/{SEQ}', seqLength: 4, seqReset: 'monthly', leadingZero: true };
    let invRule = defaultInvRule;
    const numRules = numSetting?.value?.rules || (Array.isArray(numSetting?.value) ? numSetting.value : null);
    if (Array.isArray(numRules)) {
      const found = numRules.find((r) => r.type === 'invoice');
      if (found) invRule = found;
    }

    const nowDate = new Date();
    const y = nowDate.getFullYear();
    const m = nowDate.getMonth();
    const d = nowDate.getDate();
    const yyyy = String(y);
    const yy = yyyy.slice(2);
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');

    // Count existing invoices this period for sequence
    let countQuery = supabaseAdmin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', req.auth.ownerId)
      .eq('document_type', 'invoice');
    if (invRule.seqReset === 'daily') {
      countQuery = countQuery.gte('created_at', new Date(y, m, d).toISOString());
    } else if (invRule.seqReset === 'monthly') {
      countQuery = countQuery.gte('created_at', new Date(y, m, 1).toISOString());
    } else if (invRule.seqReset === 'yearly') {
      countQuery = countQuery.gte('created_at', new Date(y, 0, 1).toISOString());
    }
    const { count: invCount } = await countQuery;

    const seqLen = invRule.seqLength || 4;
    const seqNum = (invCount || 0) + 1;
    const seq = invRule.leadingZero !== false ? String(seqNum).padStart(seqLen, '0') : String(seqNum);
    let invoiceNumber = (invRule.format || '{PREFIX}/{YYYY}{MM}/{SEQ}')
      .replace(/{PREFIX}/g, invRule.prefix || '')
      .replace(/{YYYY}/g, yyyy)
      .replace(/{YY}/g, yy)
      .replace(/{MM}/g, mm)
      .replace(/{DD}/g, dd)
      .replace(/{SEQ}/g, seq)
      .replace(/{BRANCH}/g, 'HO')
      .replace(/{WAREHOUSE}/g, 'WH1');

    // 3. Create the invoice document
    let resolvedContactId = null;
    let contactPhone = null;
    let contactEmail = null;
    let contactAddress = null;
    let contactPicSales = null;

    if (po.vendor_name) {
      const matchVendor = po.vendor_name.match(/^(.*?)\s*\((.*?)\)$/);
      const storeName = matchVendor ? matchVendor[1].trim() : po.vendor_name.trim();
      const ownerName = matchVendor ? matchVendor[2].trim() : '';

      const { data: contacts } = await supabaseAdmin
        .from('contacts')
        .select('id, name, phone, email, address, metadata')
        .eq('owner_id', req.auth.ownerId);

      const sLower = storeName.toLowerCase();
      const oLower = ownerName.toLowerCase();
      const vLower = po.vendor_name.toLowerCase();

      const found = (contacts || []).find((c) => {
        const cStore = (c.name || '').toLowerCase();
        const cOwner = (c.metadata?.storeName || '').toLowerCase();
        const combo1 = cOwner && cOwner !== '-' ? `${cStore} (${cOwner})` : cStore;
        const combo2 = cStore && cStore !== '-' ? `${cOwner} (${cStore})` : cOwner;

        return (
          (sLower && cStore === sLower) ||
          (sLower && cOwner === sLower) ||
          (oLower && oLower !== '-' && cStore === oLower) ||
          (oLower && oLower !== '-' && cOwner === oLower) ||
          cStore === vLower ||
          cOwner === vLower ||
          combo1 === vLower ||
          combo2 === vLower
        );
      });

      if (found) {
        resolvedContactId = found.id;
        contactPhone = found.phone || null;
        contactEmail = found.email || null;
        contactAddress = found.address || null;
        contactPicSales = found.metadata?.picSales || null;
      }
    }

    const today = nowDate.toISOString().slice(0, 10);
    const { data: invDoc, error: invError } = await supabaseAdmin
      .from('documents')
      .insert({
        owner_id: req.auth.ownerId,
        created_by: req.auth.user.id,
        document_type: 'invoice',
        document_number: invoiceNumber,
        contact_id: resolvedContactId,
        contact_name: po.vendor_name,
        status: 'completed',
        issue_date: today,
        due_date: null,
        payment_terms: null,
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0,
        notes: po.notes || `Dibuat dari PO: ${po.po_number}`,
        metadata: {
          source_po_id: id,
          source_po_number: po.po_number,
          phone: contactPhone,
          email: contactEmail,
          address: contactAddress,
          picSales: contactPicSales,
        },
      })
      .select('id, document_number')
      .single();
    if (invError) throw httpError(500, 'Failed to create invoice document', invError.message);

    // 4. Insert invoice items from PO items (no prices — owner fills them in)
    if ((po.items ?? []).length > 0) {
      const docItems = po.items.map((item, idx) => {
        let cleanSku = String(item.sku || '');
        let unit = 'lusin';
        if (cleanSku.includes('|')) {
          const parts = cleanSku.split('|');
          cleanSku = parts[0];
          unit = parts[1];
        }
        return {
          document_id: invDoc.id,
          product_id: null,
          item_name: item.item_name,
          sku: cleanSku,
          quantity: item.qty,
          unit_price: 0,
          discount_type: 'none',
          discount_value: 0,
          amount: 0,
          sort_order: idx,
          metadata: { unit, note: '' },
        };
      });

      const { error: itemsError } = await supabaseAdmin.from('document_items').insert(docItems);
      if (itemsError) throw httpError(500, 'Failed to create invoice items', itemsError.message);
    }

    // 5. Notify the sales person
    if (po.sales_person_id) {
      const { error: approveNotifErr } = await supabaseAdmin.from('notifications').insert({
        owner_id: req.auth.ownerId,
        user_id: po.sales_person_id,
        type: 'po_approved',
        title: 'Purchase Order Disetujui',
        message: `Purchase Order ${po.po_number} telah disetujui dan Invoice ${invoiceNumber} berhasil dibuat.`,
        reference_id: id,
        reference_type: 'purchase_order',
        is_read: false,
      });
      if (approveNotifErr) {
        console.error('[PO approve notification] failed:', approveNotifErr.message);
      }
    }

    // 6. Activity log (non-fatal)
    writeActivityLog(req, {
      action: 'approved',
      entityType: 'PurchaseOrders',
      entityId: id,
      entityName: po.po_number,
      afterData: { status: 'approved', invoice_id: invDoc.id, invoice_number: invoiceNumber },
    }).catch((e) => console.error('[PO approve-invoice] activity log failed:', e?.message ?? e));

    res.json({ data: { po_id: id, po_number: po.po_number, invoice_id: invDoc.id, invoice_number: invoiceNumber } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /purchase-orders/:id — update PO (status/vendor/notes)
// Hanya staff/owner. Sales_Person tidak boleh edit (di-blokir di loadTenant via role sales_person module?
// sebenarnya sales_person boleh akses module purchase-orders, jadi kita cek role manual di sini).
// ---------------------------------------------------------------------------
router.patch('/purchase-orders/:id', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const payload = updatePOSchema.parse(req.body);
    const beforeData = await getPOById({
      id,
      ownerId: req.auth.ownerId,
      role: req.auth.role,
      userId: req.auth.user.id,
    });

    // Izin edit: owner/staff, atau sales_person pemilik PO.
    const isOwnerOrAdmin = isPrivileged(req.auth.role);
    const isOwnSalesPerson = beforeData.sales_person_id === req.auth.user.id;
    if (!isOwnerOrAdmin && !isOwnSalesPerson) {
      throw httpError(403, 'You are not allowed to edit this purchase order.');
    }

    // Hanya PO dengan status pending/draft yang boleh diubah isinya.
    const editableStatuses = ['pending', 'draft'];
    const isEditable = editableStatuses.includes(beforeData.status);
    const editingContent =
      payload.vendor_name !== undefined ||
      payload.notes !== undefined ||
      payload.items !== undefined;
    if (!isEditable && editingContent) {
      throw httpError(400, 'Purchase order already submitted and cannot be edited.');
    }

    const updatePayload = {};
    if (payload.vendor_name !== undefined) updatePayload.vendor_name = payload.vendor_name;
    if (payload.notes !== undefined) updatePayload.notes = payload.notes;
    if (payload.status !== undefined) updatePayload.status = payload.status;
    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('purchase_orders')
      .update(updatePayload)
      .eq('id', id)
      .eq('owner_id', req.auth.ownerId)
      .select(PO_DETAIL_SELECT)
      .maybeSingle();
    if (error) throw httpError(500, 'Failed to update purchase order', error.message);
    if (!data) throw httpError(404, 'Purchase order not found');

    // Replace items jika dikirim.
    if (payload.items !== undefined) {
      const { error: deleteItemsError } = await supabaseAdmin
        .from('purchase_order_items')
        .delete()
        .eq('purchase_order_id', id);
      if (deleteItemsError) throw httpError(500, 'Failed to replace purchase order items', deleteItemsError.message);

      const itemsPayload = payload.items.map((item) => ({
        purchase_order_id: id,
        item_name: item.item_name,
        sku: item.sku,
        qty: item.qty,
      }));
      const { error: insertItemsError } = await supabaseAdmin
        .from('purchase_order_items')
        .insert(itemsPayload);
      if (insertItemsError) throw httpError(500, 'Failed to insert purchase order items', insertItemsError.message);
    }

    // Re-fetch dengan items terbaru.
    let updated = data;
    if (payload.items !== undefined) {
      const refetched = await getPOById({
        id,
        ownerId: req.auth.ownerId,
        role: req.auth.role,
        userId: req.auth.user.id,
      });
      if (refetched) updated = refetched;
    }

    if (payload.status !== undefined && payload.status !== beforeData.status) {
      if (beforeData.sales_person_id) {
        const title = 'Status Purchase Order Diperbarui';
        const statusLabel = payload.status === 'approved' ? 'setujui' : payload.status === 'cancelled' ? 'batalkan' : payload.status;
        const message = `Purchase Order ${beforeData.po_number} telah di-${statusLabel} oleh Owner.`;

        const { error: statusNotifErr } = await supabaseAdmin.from('notifications').insert({
          owner_id: req.auth.ownerId,
          user_id: beforeData.sales_person_id,
          type: `po_${payload.status}`,
          title,
          message,
          reference_id: id,
          reference_type: 'purchase_order',
          is_read: false,
        });
        if (statusNotifErr) {
          console.error('[PO notification] failed to insert:', statusNotifErr.message);
        }
      }
    }

    await writeActivityLog(req, {
      action: 'updated',
      entityType: 'PurchaseOrders',
      entityId: updated.id,
      entityName: updated.po_number,
      beforeData,
      afterData: updated,
    });

    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /purchase-orders/:id — hapus PO
// Hanya staff/owner.
// ---------------------------------------------------------------------------
router.delete('/purchase-orders/:id', async (req, res, next) => {
  try {
    if (!isPrivileged(req.auth.role)) {
      throw httpError(403, 'Only staff or owner can delete a purchase order.');
    }

    const id = idSchema.parse(req.params.id);
    const beforeData = await getPOById({
      id,
      ownerId: req.auth.ownerId,
      role: req.auth.role,
      userId: req.auth.user.id,
    });

    // 1. Delete associated email logs (due to foreign key constraint)
    const { error: emailLogsErr } = await supabaseAdmin
      .from('email_logs')
      .delete()
      .eq('purchase_order_id', id);
    if (emailLogsErr) throw httpError(500, 'Failed to delete PO email logs', emailLogsErr.message);

    // 2. Delete associated notifications referencing this PO
    const { error: notifLogsErr } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('reference_id', id)
      .eq('reference_type', 'purchase_order');
    if (notifLogsErr) throw httpError(500, 'Failed to delete PO notifications', notifLogsErr.message);

    // 3. Delete PO items
    const { error: itemsErr } = await supabaseAdmin
      .from('purchase_order_items')
      .delete()
      .eq('purchase_order_id', id);
    if (itemsErr) throw httpError(500, 'Failed to delete purchase order items', itemsErr.message);

    const { error } = await supabaseAdmin
      .from('purchase_orders')
      .delete()
      .eq('id', id)
      .eq('owner_id', req.auth.ownerId);
    if (error) throw httpError(500, 'Failed to delete purchase order', error.message);

    await writeActivityLog(req, {
      action: 'deleted',
      entityType: 'PurchaseOrders',
      entityId: id,
      entityName: beforeData.po_number,
      beforeData,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
export { resendPOEmail, getPOByIdForOwner };
