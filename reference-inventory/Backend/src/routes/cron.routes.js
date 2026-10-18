import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { resendPOEmail } from './purchase-order.routes.js';
import { resendDocumentEmail } from './workspace.routes.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET|POST /api/cron/retry-emails — retry worker untuk email_logs yang gagal.
//
// Dirancang khusus untuk Vercel Serverless Free Tier:
// - TIDAK ada proses background/daemon (setInterval dsb). Endpoint ini dipicu
//   dari luar (Vercel Cron, atau cron eksternal seperti cron-job.org) dan
//   menyelesaikan SELURUH pekerjaannya dalam satu request/response.
// - Batch kecil (maks 3 baris per run) + penjaga waktu (TIME_BUDGET_MS) agar
//   selesai jauh di bawah limit 10 detik Vercel Free — begitu mendekati
//   budget waktu, loop dihentikan lebih awal dan progress yang sudah
//   diproses tetap dikembalikan (bukan all-or-nothing).
// - Proteksi: wajib header `Authorization: Bearer <CRON_SECRET>`. Tanpa
//   CRON_SECRET ter-konfigurasi di environment, endpoint menolak SEMUA
//   request (fail closed, bukan fail open).
// ---------------------------------------------------------------------------

const BATCH_LIMIT = 3; // maksimal email gagal yang diproses per run
const MAX_RETRY_COUNT = 3; // jangan retry lagi setelah retry_count mencapai ini
const EXPIRY_HOURS = 24; // abaikan email gagal yang sudah lebih tua dari ini
const TIME_BUDGET_MS = 7000; // hard stop internal (Vercel Free hard-kill di 10s)

function readBearerToken(header) {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

function requireCronSecret(req, res, next) {
  // Fail closed: jika CRON_SECRET belum di-set di environment, tolak semua
  // request tanpa terkecuali — jangan pernah membuat endpoint ini "terbuka".
  if (!env.CRON_SECRET) {
    return res.status(503).json({
      success: false,
      error: 'CRON_SECRET is not configured on the server. Set it in environment variables to enable this endpoint.',
    });
  }

  const token = readBearerToken(req.headers.authorization);
  if (!token || token !== env.CRON_SECRET) {
    return res.status(403).json({ success: false, error: 'Forbidden: invalid or missing cron secret.' });
  }

  next();
}

/**
 * Deteksi kolom retry (retry_count / last_retry_at) belum ada di database
 * (migrasi 007 belum dijalankan). Supabase/PostgREST mengembalikan kode
 * error '42703' (undefined_column) untuk kasus ini.
 */
function isMissingColumnError(error) {
  return error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
}

/**
 * Ambil batch baris email_logs yang gagal & layak di-retry.
 * Mencoba select dengan kolom retry_count/last_retry_at terlebih dahulu;
 * jika kolom belum ada (migrasi belum jalan), fallback ke select tanpa
 * kolom tsb dan anggap retry_count = 0 untuk semua baris (aman: hanya
 * berarti guard "retry_count < 3" tidak aktif sampai migrasi dijalankan).
 */
async function fetchRetryBatch(cutoffIso) {
  const withRetryCols = await supabaseAdmin
    .from('email_logs')
    .select('id, purchase_order_id, document_id, retry_count, created_at')
    .eq('status', 'failed')
    .lt('retry_count', MAX_RETRY_COUNT)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (!withRetryCols.error) {
    return { rows: withRetryCols.data || [], hasRetryColumns: true };
  }

  if (!isMissingColumnError(withRetryCols.error)) {
    throw withRetryCols.error;
  }

  // Fallback: kolom retry_count/last_retry_at belum ada di database.
  const fallback = await supabaseAdmin
    .from('email_logs')
    .select('id, purchase_order_id, document_id, created_at')
    .eq('status', 'failed')
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (fallback.error) throw fallback.error;
  return {
    rows: (fallback.data || []).map((row) => ({ ...row, retry_count: 0 })),
    hasRetryColumns: false,
  };
}

/**
 * Simpan hasil retry ke email_logs. Jika kolom retry_count/last_retry_at
 * belum ada (migrasi belum jalan), update hanya kolom dasar (status,
 * sent_at, error_message) agar tetap tidak crash.
 */
async function persistRetryOutcome({ logId, hasRetryColumns, currentRetryCount, sendResult }) {
  const nowIso = new Date().toISOString();
  const succeeded = sendResult?.status === 'sent';

  const basePatch = succeeded
    ? { status: 'sent', sent_at: nowIso, error_message: null }
    : { status: 'failed', error_message: sendResult?.error ?? 'Unknown error during retry.' };

  const patch = hasRetryColumns
    ? {
        ...basePatch,
        retry_count: currentRetryCount + 1,
        ...(succeeded ? {} : { last_retry_at: nowIso }),
      }
    : basePatch;

  const { error } = await supabaseAdmin.from('email_logs').update(patch).eq('id', logId);
  if (error && hasRetryColumns && isMissingColumnError(error)) {
    // Race/edge case: kolom hilang di antara fetch & update. Fallback ke basePatch saja.
    await supabaseAdmin.from('email_logs').update(basePatch).eq('id', logId);
    return;
  }
  if (error) throw error;
}

/**
 * Proses satu baris email_logs yang gagal: resolve PO/dokumen terkait,
 * generate ulang PDF, dan kirim ulang via sendPOEmail/sendGoodsInEmail/
 * sendGoodsOutEmail (yang masing-masing sudah memakai sendMailWithRetry
 * dengan exponential backoff di dalamnya).
 */
async function retryOneLog(log) {
  if (log.purchase_order_id) {
    const po = await getPOByIdForOwnerSafe(log.purchase_order_id);
    if (!po) {
      return { status: 'failed', error: 'Purchase order not found (mungkin sudah dihapus).' };
    }
    return resendPOEmail(po, { ownerId: po.owner_id });
  }

  if (log.document_id) {
    const doc = await getDocumentRowSafe(log.document_id);
    if (!doc) {
      return { status: 'failed', error: 'Document not found (mungkin sudah dihapus).' };
    }
    return resendDocumentEmail(doc, { ownerId: doc.owner_id });
  }

  return { status: 'failed', error: 'email_logs row has neither purchase_order_id nor document_id.' };
}

// Cron worker belum tahu owner_id di muka (baru diketahui dari baris email_logs
// -> PO/dokumen terkait), jadi ambil row langsung by id tanpa owner filter.
// Ini tetap aman: cron berjalan dengan supabaseAdmin (service role), dan
// resendPOEmail/resendDocumentEmail dipanggil dengan ownerId hasil row ini
// (bukan input dari luar), sehingga tidak ada jalur untuk cross-tenant leakage.
async function getPOByIdForOwnerSafe(id) {
  const { data, error } = await supabaseAdmin
    .from('purchase_orders')
    .select('id, po_number, po_date, vendor_name, sales_person_id, status, notes, owner_id, created_at, updated_at, items:purchase_order_items(id, item_name, sku, qty)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data;
}

async function getDocumentRowSafe(id) {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*, items:document_items(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data;
}

router.get('/retry-emails', requireCronSecret, handleRetryEmails);
router.post('/retry-emails', requireCronSecret, handleRetryEmails);

async function handleRetryEmails(req, res) {
  const startedAt = Date.now();
  const cutoffIso = new Date(startedAt - EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const details = [];

  try {
    const { rows, hasRetryColumns } = await fetchRetryBatch(cutoffIso);

    for (const log of rows) {
      // Safety/timeout guard: berhenti lebih awal jika mendekati budget waktu,
      // agar tidak terkena hard-kill 10 detik Vercel Free. Progress yang sudah
      // diproses sejauh ini tetap disimpan & dikembalikan di response.
      if (Date.now() - startedAt >= TIME_BUDGET_MS) {
        details.push({ logId: log.id, skipped: true, reason: 'time_budget_exceeded' });
        break;
      }

      processed += 1;
      try {
        const sendResult = await retryOneLog(log);
        await persistRetryOutcome({
          logId: log.id,
          hasRetryColumns,
          currentRetryCount: log.retry_count ?? 0,
          sendResult,
        });

        if (sendResult?.status === 'sent') {
          succeeded += 1;
          details.push({ logId: log.id, status: 'sent' });
        } else {
          failed += 1;
          details.push({ logId: log.id, status: 'failed', error: sendResult?.error ?? null });
        }
      } catch (rowErr) {
        // Kegagalan tak terduga (mis. PDF generation throw, DB error) tetap
        // dicatat ke email_logs sebagai failed agar retry_count naik dan baris
        // ini tidak diambil lagi tanpa batas oleh run berikutnya.
        failed += 1;
        const errorMessage = rowErr?.message ?? String(rowErr);
        details.push({ logId: log.id, status: 'failed', error: errorMessage });
        try {
          await persistRetryOutcome({
            logId: log.id,
            hasRetryColumns,
            currentRetryCount: log.retry_count ?? 0,
            sendResult: { status: 'failed', error: errorMessage },
          });
        } catch (persistErr) {
          console.error('[cron/retry-emails] failed to persist error outcome:', persistErr?.message ?? persistErr);
        }
      }
    }

    res.json({
      success: true,
      processed,
      succeeded,
      failed,
      durationMs: Date.now() - startedAt,
      ...(env.NODE_ENV !== 'production' ? { details } : {}),
    });
  } catch (error) {
    // Kegagalan di level batch (mis. query awal gagal) — jangan pernah crash
    // function Vercel; selalu kembalikan JSON yang jelas.
    console.error('[cron/retry-emails] fatal error:', error?.message ?? error);
    res.status(500).json({
      success: false,
      error: error?.message ?? 'Unknown error while retrying failed emails.',
      processed,
      succeeded,
      failed,
      durationMs: Date.now() - startedAt,
    });
  }
}

export default router;
