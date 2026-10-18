import nodemailer from 'nodemailer';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';

const SUPER_ADMIN_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Transporter reusable untuk semua email, dengan auto-reconnect.
 * Jika SMTP env tidak ter-set, return null
 * sehingga pengirim email di-skip (status: failed, error tercatat).
 *
 * Catatan stabilitas koneksi:
 * - Pool tetap dipakai untuk efisiensi, namun `resetTransporter()` disediakan
 *   untuk membuang transporter yang socket-nya sudah basi/mati (mis. setelah
 *   idle lama dan diputus paksa oleh server SMTP), sehingga percobaan kirim
 *   berikutnya membuat koneksi baru alih-alih memakai socket yang sudah mati.
 * - Timeout diatur secara eksplisit agar kegagalan koneksi terdeteksi cepat
 *   (bukan menggantung tanpa batas) sehingga retry bisa segera dilakukan.
 */
let _transporter = null;

function buildTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // TLS: pastikan sertifikat divalidasi (default aman), tapi izinkan
    // override via env untuk host SMTP internal/self-signed bila memang perlu.
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
      minVersion: 'TLSv1.2',
    },
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    rateDelta: 1000,
    rateLimit: 2,
    // Timeout eksplisit agar socket yang basi/hang tidak menggantung lama
    // dan gagal cepat sehingga sendMailWithRetry bisa segera mencoba ulang.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = buildTransporter();
  return _transporter;
}

/**
 * Buang transporter yang sedang aktif (mis. karena error socket seperti
 * ECONNRESET/ETIMEDOUT/socket hang up). Panggilan getTransporter() berikutnya
 * akan membuat koneksi baru dari awal, sehingga tidak ada percobaan memakai
 * socket TCP yang sudah diputus oleh server SMTP.
 */
function resetTransporter() {
  if (_transporter) {
    try {
      _transporter.close();
    } catch (_) {}
    _transporter = null;
  }
}

export function closeTransporter() {
  resetTransporter();
}

/**
 * Error yang bersifat sementara (jaringan/socket) dan layak di-retry.
 * Bukan error permanen seperti auth gagal atau alamat email invalid.
 */
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENOTFOUND',
]);

function isTransientMailError(err) {
  if (!err) return false;
  const code = err.code || err.errno;
  if (code && TRANSIENT_ERROR_CODES.has(code)) return true;
  const message = String(err.message || '').toLowerCase();
  return (
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('esockettimedout') ||
    message.includes('epipe') ||
    message.includes('eai_again') ||
    message.includes('connection closed') ||
    message.includes('connection timeout') ||
    message.includes('greeting never received')
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrapper pengiriman email dengan retry otomatis + exponential backoff.
 * - Percobaan gagal karena error sementara (socket/koneksi) akan me-reset
 *   transporter (agar tidak memakai socket basi) lalu mencoba ulang setelah
 *   jeda 1s, 2s, 4s, ... hingga maxRetries.
 * - Error non-transient (mis. auth gagal, alamat invalid secara permanen)
 *   langsung dilempar tanpa retry karena mengulang tidak akan membantu.
 *
 * @param {Object} mailOptions - opsi sendMail milik Nodemailer
 * @param {number} maxRetries - jumlah maksimum percobaan (default 3)
 * @returns {Promise<Object>} info hasil sendMail jika sukses
 * @throws akan melempar error terakhir jika seluruh percobaan gagal
 */
async function sendMailWithRetry(mailOptions, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const transporter = getTransporter();
    if (!transporter) {
      throw new Error('SMTP credentials not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing).');
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      return info;
    } catch (err) {
      lastError = err;
      const transient = isTransientMailError(err);

      // Selalu reset transporter pada error agar koneksi/pool yang mungkin
      // rusak tidak terus dipakai di percobaan berikutnya.
      resetTransporter();

      if (!transient || attempt === maxRetries) {
        break;
      }

      const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, ...
      await delay(backoffMs);
    }
  }

  throw lastError;
}

/**
 * Validasi sederhana alamat email penerima.
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed) return false;
  // Validasi format dasar, cukup untuk mencegah nilai kosong/rusak terkirim ke SMTP.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Ambil email Finance dari workspace_settings (key: 'finance_email').
 * Pertama cari workspace-specific (owner_id); fallback ke global (owner_id = SUPER_ADMIN).
 */
export async function resolveFinanceEmail(ownerId) {
  if (!ownerId) return null;

  if (ownerId && ownerId !== SUPER_ADMIN_TENANT_ID) {
    // 1. Cek dari key 'company'
    const { data: compSetting } = await supabaseAdmin
      .from('workspace_settings')
      .select('value')
      .eq('owner_id', ownerId)
      .eq('key', 'company')
      .maybeSingle();
    if (compSetting?.value) {
      const email =
        compSetting.value.companyEmail ||
        compSetting.value.email ||
        compSetting.value.company?.companyEmail ||
        compSetting.value.company?.email;
      if (email) return email;
    }

    // 2. Cek dari key 'app' (nested company)
    const { data: appSetting } = await supabaseAdmin
      .from('workspace_settings')
      .select('value')
      .eq('owner_id', ownerId)
      .eq('key', 'app')
      .maybeSingle();
    if (appSetting?.value) {
      const email =
        appSetting.value.company?.companyEmail ||
        appSetting.value.company?.email ||
        appSetting.value.companyEmail ||
        appSetting.value.email;
      if (email) return email;
    }

    // 3. Fallback ke key 'finance_email'
    const { data: finSetting } = await supabaseAdmin
      .from('workspace_settings')
      .select('value')
      .eq('owner_id', ownerId)
      .eq('key', 'finance_email')
      .maybeSingle();
    if (finSetting?.value?.email) return finSetting.value.email;
    if (typeof finSetting?.value === 'string') return finSetting.value;
  }

  // 4. Fallback global
  const { data: globalComp } = await supabaseAdmin
    .from('workspace_settings')
    .select('value')
    .eq('owner_id', SUPER_ADMIN_TENANT_ID)
    .eq('key', 'company')
    .maybeSingle();
  if (globalComp?.value) {
    const email =
      globalComp.value.companyEmail ||
      globalComp.value.email ||
      globalComp.value.company?.companyEmail ||
      globalComp.value.company?.email;
    if (email) return email;
  }

  const { data: globalFin } = await supabaseAdmin
    .from('workspace_settings')
    .select('value')
    .eq('owner_id', SUPER_ADMIN_TENANT_ID)
    .eq('key', 'finance_email')
    .maybeSingle();
  return globalFin?.value?.email ?? (typeof globalFin?.value === 'string' ? globalFin.value : null);
}

const PALETTE_COLORS = {
  indigo: { primary: '#6366F1', hover: '#4F46E5', light: 'rgba(99, 102, 241, 0.08)', shadow: 'rgba(99, 102, 241, 0.25)' },
  emerald: { primary: '#10B981', hover: '#059669', light: 'rgba(16, 185, 129, 0.08)', shadow: 'rgba(16, 185, 129, 0.25)' },
  rose: { primary: '#F43F5E', hover: '#E11D48', light: 'rgba(244, 63, 94, 0.08)', shadow: 'rgba(244, 63, 94, 0.25)' },
  amber: { primary: '#F59E0B', hover: '#D97706', light: 'rgba(245, 158, 11, 0.08)', shadow: 'rgba(245, 158, 11, 0.25)' },
  sky: { primary: '#0EA5E9', hover: '#0284C7', light: 'rgba(14, 165, 233, 0.08)', shadow: 'rgba(14, 165, 233, 0.25)' },
  violet: { primary: '#8B5CF6', hover: '#7C3AED', light: 'rgba(139, 92, 246, 0.08)', shadow: 'rgba(139, 92, 246, 0.25)' },
};

/**
 * Kirim email PO lengkap dengan attachment PDF.
 * Recipient = email sales yang submit. CC = email finance (opsional).
 *
 * @param {Object} params
 * @param {Object} params.po - PO object (po_number, po_date, vendor_name)
 * @param {Buffer} params.pdfBuffer - PDF attachment buffer
 * @param {string} params.salesEmail - email sales yang submit
 * @param {string|null} params.salesName - nama sales yang submit
 * @param {string|null} params.financeEmail - email finance untuk CC
 * @param {string|null} params.accentColor - warna aksen dari workspace setting
 * @returns {Promise<{status: 'sent'|'failed', error?: string, messageId?: string, subject: string}>}
 */
export async function sendPOEmail({ po, pdfBuffer, salesEmail, salesName, financeEmail, accentColor }) {
  const subject = `[New PO] - ${po.po_number} dari ${salesName ?? 'Sales'}`;
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  const shouldCcSales = financeEmail && salesEmail && financeEmail.toLowerCase() !== salesEmail.toLowerCase();
  const recipientEmail = financeEmail || salesEmail;

  const baseLog = {
    purchase_order_id: po.id,
    sender_email: fromAddress || 'no-reply@docuflow.app',
    recipient_email: recipientEmail,
    cc_email: shouldCcSales ? salesEmail : null,
    subject,
    status: 'pending',
  };

  if (!isValidEmail(recipientEmail)) {
    const errorMessage = 'Recipient email is empty or invalid.';
    await supabaseAdmin.from('email_logs').insert({
      ...baseLog,
      status: 'failed',
      error_message: errorMessage,
    });
    return { status: 'failed', error: errorMessage, subject };
  }

  const transporter = getTransporter();
  if (!transporter) {
    const errorMessage = 'SMTP credentials not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing).';
    await supabaseAdmin.from('email_logs').insert({
      ...baseLog,
      status: 'failed',
      error_message: errorMessage,
    });
    return { status: 'failed', error: errorMessage, subject };
  }

  // Determine frontend URL
  const rawFrontendUrl = env.FRONTEND_URL || (env.FRONTEND_ORIGIN ? env.FRONTEND_ORIGIN.split(',')[0] : 'http://localhost:5173');
  const cleanFrontendUrl = rawFrontendUrl.replace(/\/+$/, '');
  const poLink = `${cleanFrontendUrl}/purchase-orders/${po.id}`;

  // Resolve palette colors matching workspace accent color
  const cleanAccent = String(accentColor || 'indigo').toLowerCase();
  const colors = PALETTE_COLORS[cleanAccent] || PALETTE_COLORS.indigo;

  // Format items list
  const items = Array.isArray(po.items) ? po.items : [];
  
  const itemLines = items.map((item, index) => {
    const name = item.item_name ?? item.name ?? '-';
    let sku = item.sku ?? '-';
    let unit = item.unit || item.metadata?.unit || 'lusin';
    if (sku.includes('|')) {
      const parts = sku.split('|');
      sku = parts[0];
      unit = parts[1];
    }
    return `${index + 1}. ${name} (SKU: ${sku}) - ${item.qty ?? '-'} ${unit}`;
  }).join('\n');

  const plainText = [
    `Purchase Order baru telah dibuat oleh ${salesName ?? 'Sales'} (${salesEmail}).`,
    '',
    `No. PO        : ${po.po_number}`,
    `Tanggal       : ${po.po_date}`,
    `Vendor        : ${po.vendor_name}`,
    `Sales Person  : ${salesName ?? 'Sales'}`,
    po.notes ? `Catatan       : ${po.notes}` : '',
    '',
    'Daftar Barang:',
    itemLines,
    '',
    `Lihat Purchase Order selengkapnya di: ${poLink}`,
    '',
    'Terlampir dokumen PDF Purchase Order (hanya berisi Nama Item, SKU, dan Kuantitas).',
  ].filter(Boolean).join('\n');

  const htmlTableRows = items.map((item) => {
    const name = item.item_name ?? item.name ?? '-';
    let sku = item.sku ?? '-';
    let unit = item.unit || item.metadata?.unit || 'lusin';
    if (sku.includes('|')) {
      const parts = sku.split('|');
      sku = parts[0];
      unit = parts[1];
    }
    const qtyStr = `${item.qty ?? '-'} ${unit}`;
    return `
      <tr>
        <td style="padding: 10px 12px; font-size: 13px; color: #0D0D0F; border-bottom: 1px solid #EEEEEF; line-height: 1.4;">
          <div style="font-weight: 600;">${name}</div>
          <div style="font-size: 11px; color: #6C6C78; margin-top: 2px;">SKU: ${sku}</div>
        </td>
        <td align="right" style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #0D0D0F; border-bottom: 1px solid #EEEEEF; white-space: nowrap;">
          ${qtyStr}
        </td>
      </tr>
    `;
  }).join('');

  const htmlItemsTable = `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-top: 24px; margin-bottom: 32px; border: 1px solid #E4E4E9; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background-color: #F8F9FA; border-bottom: 1px solid #E4E4E9;">
          <th align="left" style="padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6C6C78;">Item</th>
          <th align="right" style="padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6C6C78;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${htmlTableRows}
      </tbody>
    </table>
  `;

  const notesRowHtml = po.notes ? `
    <tr>
      <td width="30%" valign="top" style="font-size: 13px; font-weight: 500; color: #6C6C78;">Catatan</td>
      <td width="70%" valign="top" style="font-size: 13px; color: #0D0D0F;">${po.notes}</td>
    </tr>
  ` : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order Baru</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F7F7F8; font-family: 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F7F8; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E4E4E9; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03); overflow: hidden;">
          
          <!-- Decorative Header Accent -->
          <tr>
            <td height="6" style="background-color: ${colors.primary};"></td>
          </tr>
          
          <tr>
            <td style="padding: 40px 32px;">
              <!-- Header / Logo -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #0D0D0F; letter-spacing: -0.02em;">Docuflow</span>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; background-color: ${colors.light}; color: ${colors.primary}; padding: 6px 12px; border-radius: 9999px;">Purchase Order</span>
                  </td>
                </tr>
              </table>

              <!-- Greeting & Subject -->
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 600; color: #0D0D0F; letter-spacing: -0.02em; line-height: 1.3;">
                Purchase Order Baru Dibuat
              </h1>
              
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #6C6C78;">
                Halo Team,
              </p>
              
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #0D0D0F;">
                Purchase Order baru telah dibuat oleh <strong>${salesName ?? 'Sales'}</strong> (<a href="mailto:${salesEmail}" style="color: ${colors.primary}; text-decoration: none;">${salesEmail}</a>) dengan rincian berikut:
              </p>

              <!-- PO Details Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8F9FA; border: 1px solid #E4E4E9; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 500; color: #6C6C78;">No. PO</td>
                        <td width="70%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 600; color: #0D0D0F;">${po.po_number}</td>
                      </tr>
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 500; color: #6C6C78;">Tanggal</td>
                        <td width="70%" valign="top" style="padding-bottom: 12px; font-size: 13px; color: #0D0D0F;">${po.po_date}</td>
                      </tr>
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: ${po.notes ? '12px' : '0'}; font-size: 13px; font-weight: 500; color: #6C6C78;">Vendor</td>
                        <td width="70%" valign="top" style="padding-bottom: ${po.notes ? '12px' : '0'}; font-size: 13px; color: #0D0D0F; font-weight: 500;">${po.vendor_name}</td>
                      </tr>
                      ${notesRowHtml}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- PO Items Table -->
              ${htmlItemsTable}

              <!-- Call to Action Button -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
                <tr>
                  <td align="center">
                    <a href="${poLink}" target="_blank" style="display: inline-block; background-color: ${colors.primary}; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 4px 14px ${colors.shadow}; text-align: center; border: 1px solid ${colors.hover};">
                      Lihat Purchase Order
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.5; color: #6C6C78;">
                <em>*Terlampir dokumen PDF Purchase Order (hanya berisi Nama Item, SKU, dan Kuantitas).</em>
              </p>

              <!-- Divider -->
              <hr style="border: 0; border-top: 1px solid #E4E4E9; margin: 32px 0 24px 0;">

              <!-- Footer info -->
              <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.6; color: #A1A1AA;">
                Email ini dikirim secara otomatis oleh sistem <strong>Docuflow</strong>. Harap tidak membalas email ini secara langsung. Untuk menyetujui atau menolak PO ini, silakan klik tombol di atas untuk masuk to sistem.
              </p>
              
              <p style="margin: 0; font-size: 11px; color: #A1A1AA;">
                &copy; 2026 Docuflow. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const info = await sendMailWithRetry({
      from: fromAddress,
      to: recipientEmail,
      cc: shouldCcSales ? salesEmail : undefined,
      subject,
      text: plainText,
      html: htmlContent,
      attachments: [
        {
          filename: `PO-${po.po_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    await supabaseAdmin.from('email_logs').insert({
      ...baseLog,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    return { status: 'sent', messageId: info.messageId, subject };
  } catch (err) {
    const errorMessage = err?.message ?? String(err);
    await supabaseAdmin.from('email_logs').insert({
      ...baseLog,
      status: 'failed',
      error_message: errorMessage,
    });
    return { status: 'failed', error: errorMessage, subject };
  }
}

// ── Parser & Unit Multipliers (dipakai Goods Out & Goods In) ────────────────
const MULTIPLIERS = {
  pcs: 1,
  piece: 1,
  pack3: 3,
  pack6: 6,
  lusin: 12,
  dozen: 12,
  pack: 60,
  bal5: 60,   // 5 Lusin
  bal10: 120, // 10 Lusin
  bal15: 180, // 15 Lusin
  bal20: 240, // 20 Lusin
  bal25: 300, // 25 Lusin
  bal: 300,   // Fallback & Legacy compatibility
};

const LUSIN_UNITS = new Set([
  'lusin', 'dozen', 'pack', 'bal5', 'bal10', 'bal15', 'bal20', 'bal25', 'bal',
]);

function isLusinUnit(unit) {
  if (!unit) return false;
  const u = String(unit).toLowerCase().trim();
  if (u === 'pack3' || u === 'pk3' || u === 'pack6' || u === 'pk6' || u === 'pcs' || u === 'piece') {
    return false;
  }
  if (LUSIN_UNITS.has(u)) return true;
  if (u.includes('lusin') || u.includes('doz') || u.includes('bal')) return true;
  if (u === 'pack' || u === 'pk') return true;
  return false;
}

function parseUnitFromSn(sn, fallbackUnit = 'pcs') {
  if (!sn) return fallbackUnit;
  const s = String(sn).toLowerCase();
  if (s.includes('bl25') || s.includes('25bl') || s.includes('bal25') || s.includes('25bal')) return 'bal25';
  if (s.includes('bl20') || s.includes('20bl') || s.includes('bal20') || s.includes('20bal')) return 'bal20';
  if (s.includes('bl15') || s.includes('15bl') || s.includes('bal15') || s.includes('15bal')) return 'bal15';
  if (s.includes('bl10') || s.includes('10bl') || s.includes('bal10') || s.includes('10bal')) return 'bal10';
  if (s.includes('bl5') || s.includes('5bl') || s.includes('bal5') || s.includes('5bal')) return 'bal5';
  if (s.includes('pack6') || s.includes('pk6') || s.includes('6pk')) return 'pack6';
  if (s.includes('pack3') || s.includes('pk3') || s.includes('3pk')) return 'pack3';
  if (s.includes('pack5') || s.includes('pk5') || s.includes('5pk')) return 'pack';
  if (s.includes('lusin') || s.includes('doz') || s.includes('-ls-') || s.includes('_ls_') || s.endsWith('-ls')) return 'lusin';
  if (s.includes('bal') || s.includes('bl')) return 'bal';
  if (s.includes('pack') || s.includes('pk')) return 'pack';
  return fallbackUnit;
}

function getUnitHelpers(customUnits) {
  const multipliers = { ...MULTIPLIERS };
  const lusinUnitsSet = new Set(LUSIN_UNITS);

  if (Array.isArray(customUnits) && customUnits.length > 0) {
    for (const u of customUnits) {
      if (u.key) {
        const k = String(u.key).toLowerCase().trim();
        const mult = Number(u.multiplier || (u.baseType === 'lusin' ? u.baseValue * 12 : u.baseValue) || 1);
        multipliers[k] = mult;
        if (u.baseType === 'lusin') {
          lusinUnitsSet.add(k);
        } else if (u.baseType === 'pcs') {
          lusinUnitsSet.delete(k);
        }
      }
    }
  }

  const isLusin = (unit) => {
    if (!unit) return false;
    const clean = String(unit).toLowerCase().trim();
    if (Array.isArray(customUnits)) {
      const found = customUnits.find((u) => u.key && String(u.key).toLowerCase().trim() === clean);
      if (found) return found.baseType === 'lusin';
    }
    if (clean === 'pack3' || clean === 'pk3' || clean === 'pack6' || clean === 'pk6' || clean === 'pcs' || clean === 'piece') {
      return false;
    }
    if (lusinUnitsSet.has(clean)) return true;
    if (clean.includes('lusin') || clean.includes('doz') || clean.includes('bal')) return true;
    return false;
  };

  const parseSn = (sn, fallbackUnit = 'pcs') => {
    if (!sn) return fallbackUnit;
    const clean = String(sn).toLowerCase().trim();
    if (Array.isArray(customUnits)) {
      const sorted = [...customUnits].sort((a, b) => (b.key?.length || 0) - (a.key?.length || 0));
      for (const u of sorted) {
        const k = String(u.key).toLowerCase().trim();
        if (!k || k === 'pcs') continue;
        if (clean.includes(k)) return k;
      }
    }
    return parseUnitFromSn(clean, fallbackUnit);
  };

  return { multipliers, isLusin, parseSn };
}

function getItemQtyInPcs(item, helpers = null) {
  const isSerial = item.metadata?.isSerial === true || !!item.metadata?.serialNumber;
  const serialNumber = item.metadata?.serialNumber || '';
  let unit = (item.metadata?.qtyUnit || item.qtyUnit || item.unit || 'pcs').toLowerCase();
  if (isSerial && serialNumber && (!unit || unit === 'pcs' || unit === 'piece')) {
    unit = helpers ? helpers.parseSn(serialNumber, unit) : parseUnitFromSn(serialNumber, unit);
  }
  const qty = isSerial ? 1 : Number(item.metadata?.qtyInput ?? item.quantity ?? item.qty ?? 1);
  const mult = (helpers ? helpers.multipliers[unit] : MULTIPLIERS[unit]) || ((helpers ? helpers.isLusin(unit) : isLusinUnit(unit)) ? 12 : 1);
  return {
    isSerial,
    serialNumber,
    unit,
    qty,
    pcs: qty * mult,
  };
}

function formatDocumentQty(totalLusin, totalPcs) {
  let lusin = totalLusin || 0;
  let pcs = totalPcs || 0;

  if (lusin % 1 !== 0) {
    const extraPcs = Math.round((lusin % 1) * 12);
    lusin = Math.floor(lusin);
    pcs += extraPcs;
  }

  lusin = Math.round(lusin);
  pcs = Math.round(pcs);

  if (lusin > 0 && pcs > 0) {
    return `${lusin} lusin ${pcs} pcs`;
  }
  if (lusin > 0) {
    return `${lusin} lusin`;
  }
  if (pcs > 0) {
    return `${pcs} pcs`;
  }
  return '0 pcs';
}

function formatLusinPcs(totalPcs) {
  const count = Math.max(0, Math.round(totalPcs || 0));
  const lusin = Math.floor(count / 12);
  const pcs = count % 12;

  if (lusin > 0 && pcs > 0) {
    return `${lusin} lusin ${pcs} pcs`;
  }
  if (lusin > 0) {
    return `${lusin} lusin`;
  }
  return `${pcs} pcs`;
}

function getGroupedProductItems(items, customUnits = null) {
  const helpers = getUnitHelpers(customUnits);
  const groupMap = new Map();

  (items || []).forEach((item) => {
    const productId = item.product_id ?? item.productId ?? item.sku ?? item.item_name ?? item.productName ?? 'default';
    const name = item.item_name || item.itemName || item.product_name || item.name || 'Produk';
    let sku = item.sku || '—';
    if (sku.includes('|')) {
      sku = sku.split('|')[0];
    }
    const itemInfo = getItemQtyInPcs(item, helpers);

    if (!groupMap.has(productId)) {
      groupMap.set(productId, {
        productId,
        name,
        sku,
        totalPcs: 0,
        totalLusin: 0,
        totalPcsOnly: 0,
        serials: [],
        unitCounts: {},
      });
    }

    const current = groupMap.get(productId);
    current.totalPcs += itemInfo.pcs;
    if (helpers.isLusin(itemInfo.unit)) {
      const mult = helpers.multipliers[itemInfo.unit] || 12;
      current.totalLusin += (itemInfo.qty * mult) / 12;
    } else {
      current.totalPcsOnly += itemInfo.pcs;
    }

    if (itemInfo.isSerial && itemInfo.serialNumber) {
      current.serials.push(itemInfo.serialNumber);
    }
    current.unitCounts[itemInfo.unit] = (current.unitCounts[itemInfo.unit] || 0) + itemInfo.qty;
  });

  return Array.from(groupMap.values()).map((g) => {
    const unitEntries = Object.entries(g.unitCounts);
    const breakdown = unitEntries.map(([u, q]) => `${q} ${u}`).join(', ');
    const formattedQty = formatDocumentQty(g.totalLusin, g.totalPcsOnly);
    return {
      ...g,
      breakdown,
      formattedQty,
    };
  });
}

/**
 * Kirim email Bukti Barang Keluar (Goods Out) lengkap dengan attachment PDF.
 * Recipient = email Finance/Owner. CC = Creator (Gudang/Sales) & Kontak Penerima (jika ada).
 *
 * @param {Object} params
 * @param {Object} params.doc - Document object (id, document_number, issue_date, contact_name, notes, items)
 * @param {Buffer} params.pdfBuffer - PDF attachment buffer
 * @param {string} params.creatorEmail - email user pembuat barang keluar
 * @param {string|null} params.creatorName - nama user pembuat barang keluar
 * @param {string|null} params.financeEmail - email finance / owner untuk penerima
 * @param {string|null} params.contactEmail - email kontak tujuan jika ada
 * @param {string|null} params.accentColor - warna aksen dari workspace setting
 * @param {string|null} params.warehouseName - nama gudang asal pengeluaran
 * @returns {Promise<{status: 'sent'|'failed', error?: string, messageId?: string, subject: string}>}
 */
export async function sendGoodsOutEmail({
  doc,
  pdfBuffer,
  creatorEmail,
  creatorName,
  financeEmail,
  contactEmail,
  accentColor,
  warehouseName = 'Gudang Utama',
  customUnits = null,
}) {
  const destination = doc.contact_name || 'Customer';
  const whTag = warehouseName ? ` [${warehouseName}]` : '';
  const subject = `[Goods Out] - ${doc.document_number} ke ${destination}${whTag}`;
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  const recipientEmail = financeEmail || creatorEmail || contactEmail;

  const ccSet = new Set();
  if (creatorEmail && recipientEmail && creatorEmail.toLowerCase() !== recipientEmail.toLowerCase()) {
    ccSet.add(creatorEmail);
  }
  if (contactEmail && recipientEmail && contactEmail.toLowerCase() !== recipientEmail.toLowerCase()) {
    ccSet.add(contactEmail);
  }
  const ccArray = Array.from(ccSet);

  const baseLog = {
    sender_email: fromAddress || 'no-reply@docuflow.app',
    recipient_email: recipientEmail || null,
    cc_email: ccArray.length > 0 ? ccArray.join(', ') : null,
    subject,
    status: 'pending',
  };
  if (doc.id) {
    baseLog.document_id = doc.id;
  }

  if (!isValidEmail(recipientEmail)) {
    const errorMessage = 'Recipient email is empty or invalid.';
    try {
      await supabaseAdmin.from('email_logs').insert({
        ...baseLog,
        status: 'failed',
        error_message: errorMessage,
      });
    } catch (_) {}
    return { status: 'failed', error: errorMessage, subject };
  }

  const transporter = getTransporter();
  if (!transporter) {
    const errorMessage = 'SMTP credentials not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing).';
    try {
      await supabaseAdmin.from('email_logs').insert({
        ...baseLog,
        status: 'failed',
        error_message: errorMessage,
      });
    } catch (_) {}
    return { status: 'failed', error: errorMessage, subject };
  }

  // Determine frontend URL
  const rawFrontendUrl = process.env.FRONTEND_URL || (process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',')[0] : 'http://localhost:5173');
  const cleanFrontendUrl = rawFrontendUrl.replace(/\/+$/, '');
  const docLink = `${cleanFrontendUrl}/goods-out`;

  // Resolve palette colors matching workspace accent color
  const cleanAccent = String(accentColor || 'indigo').toLowerCase();
  const colors = PALETTE_COLORS[cleanAccent] || PALETTE_COLORS.indigo;

  const rawItems = Array.isArray(doc.items) ? doc.items : (doc.metadata?.items || []);
  const groupedItems = getGroupedProductItems(rawItems, customUnits || doc.metadata?.custom_units);
  const grandTotalLusin = groupedItems.reduce((sum, g) => sum + (g.totalLusin || 0), 0);
  const grandTotalPcsOnly = groupedItems.reduce((sum, g) => sum + (g.totalPcsOnly || 0), 0);
  const totalDocumentFormatted = formatDocumentQty(grandTotalLusin, grandTotalPcsOnly);

  const itemLines = groupedItems.map((group, index) => {
    const serialInfo = group.serials.length > 0
      ? `\n   No. Seri (${group.serials.length}): ${group.serials.join(', ')}`
      : '';
    const breakdownInfo = group.breakdown ? ` (${group.breakdown})` : '';
    return `${index + 1}. ${group.name} (SKU: ${group.sku}) - ${group.formattedQty}${breakdownInfo}${serialInfo}`;
  }).join('\n');

  const issueDateFormatted = doc.issue_date || new Date().toISOString().slice(0, 10);

  const plainText = [
    `Catatan Barang Keluar baru telah dibuat oleh ${creatorName ?? 'Petugas'} (${creatorEmail || '-'}).`,
    '',
    `No. Referensi : ${doc.document_number}`,
    `Gudang Asal   : ${warehouseName}`,
    `Tanggal       : ${issueDateFormatted}`,
    `Tujuan        : ${destination}`,
    `Petugas       : ${creatorName ?? 'Petugas'}`,
    doc.notes ? `Catatan       : ${doc.notes}` : '',
    '',
    'Daftar Barang Keluar:',
    itemLines,
    '',
    `Total Keseluruhan: ${totalDocumentFormatted}`,
    '',
    `Lihat Barang Keluar selengkapnya di: ${docLink}`,
    '',
    'Terlampir dokumen PDF Surat Jalan / Bukti Barang Keluar.',
  ].filter(Boolean).join('\n');

  const htmlTableRows = groupedItems.map((group) => {
    const serialSubtitle = group.serials.length > 0
      ? `<div style="font-size: 11px; color: ${colors.primary}; font-weight: 500; margin-top: 4px; word-break: break-all;">No. Seri (${group.serials.length}): ${group.serials.join(', ')}</div>`
      : '';
    const breakdownSubtitle = group.breakdown
      ? `<span style="font-size: 11px; color: #6C6C78; font-weight: normal; display: block; margin-top: 2px;">${group.breakdown}</span>`
      : '';

    return `
      <tr>
        <td style="padding: 10px 12px; font-size: 13px; color: #0D0D0F; border-bottom: 1px solid #EEEEEF; line-height: 1.4; vertical-align: top;">
          <div style="font-weight: 600;">${group.name}</div>
          <div style="font-size: 11px; color: #6C6C78; margin-top: 2px;">SKU: ${group.sku}</div>
          ${serialSubtitle}
        </td>
        <td align="right" style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #0D0D0F; border-bottom: 1px solid #EEEEEF; white-space: nowrap; vertical-align: top;">
          <div>${group.formattedQty}</div>
          ${breakdownSubtitle}
        </td>
      </tr>
    `;
  }).join('');

  const htmlItemsTable = `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-top: 24px; margin-bottom: 32px; border: 1px solid #E4E4E9; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background-color: #F8F9FA; border-bottom: 1px solid #E4E4E9;">
          <th align="left" style="padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6C6C78;">Item</th>
          <th align="right" style="padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6C6C78;">Jumlah</th>
        </tr>
      </thead>
      <tbody>
        ${htmlTableRows}
      </tbody>
      <tfoot>
        <tr style="background-color: #F8F9FA; border-top: 2px solid #E4E4E9;">
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #0D0D0F;">Total Keseluruhan</td>
          <td align="right" style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: ${colors.primary}; white-space: nowrap;">${totalDocumentFormatted}</td>
        </tr>
      </tfoot>
    </table>
  `;

  const notesRowHtml = doc.notes ? `
    <tr>
      <td width="30%" valign="top" style="font-size: 13px; font-weight: 500; color: #6C6C78;">Catatan</td>
      <td width="70%" valign="top" style="font-size: 13px; color: #0D0D0F;">${doc.notes}</td>
    </tr>
  ` : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bukti Barang Keluar</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F7F7F8; font-family: 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F7F8; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E4E4E9; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03); overflow: hidden;">
          
          <!-- Decorative Header Accent -->
          <tr>
            <td height="6" style="background-color: ${colors.primary};"></td>
          </tr>
          
          <tr>
            <td style="padding: 40px 32px;">
              <!-- Header / Logo -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #0D0D0F; letter-spacing: -0.02em;">Docuflow</span>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; background-color: ${colors.light}; color: ${colors.primary}; padding: 6px 12px; border-radius: 9999px;">Barang Keluar</span>
                  </td>
                </tr>
              </table>

              <!-- Greeting & Subject -->
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 600; color: #0D0D0F; letter-spacing: -0.02em; line-height: 1.3;">
                Bukti Pengeluaran Barang Baru
              </h1>
              
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #6C6C78;">
                Halo Team,
              </p>
              
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #0D0D0F;">
                Catatan Barang Keluar (Goods Out) baru telah dibuat oleh <strong>${creatorName ?? 'Petugas'}</strong>${creatorEmail ? ` (<a href="mailto:${creatorEmail}" style="color: ${colors.primary}; text-decoration: none;">${creatorEmail}</a>)` : ''} dengan rincian berikut:
              </p>

              <!-- Document Details Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8F9FA; border: 1px solid #E4E4E9; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 500; color: #6C6C78;">No. Referensi</td>
                        <td width="70%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 600; color: #0D0D0F;">${doc.document_number}</td>
                      </tr>
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 500; color: #6C6C78;">Gudang Asal</td>
                        <td width="70%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 600; color: #0D0D0F;">${warehouseName}</td>
                      </tr>
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 500; color: #6C6C78;">Tanggal</td>
                        <td width="70%" valign="top" style="padding-bottom: 12px; font-size: 13px; color: #0D0D0F;">${issueDateFormatted}</td>
                      </tr>
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: ${doc.notes ? '12px' : '0'}; font-size: 13px; font-weight: 500; color: #6C6C78;">Tujuan / Penerima</td>
                        <td width="70%" valign="top" style="padding-bottom: ${doc.notes ? '12px' : '0'}; font-size: 13px; color: #0D0D0F; font-weight: 600;">${destination}</td>
                      </tr>
                      ${notesRowHtml}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Document Items Table -->
              ${htmlItemsTable}

              <!-- Call to Action Button -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
                <tr>
                  <td align="center">
                    <a href="${docLink}" target="_blank" style="display: inline-block; background-color: ${colors.primary}; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 4px 14px ${colors.shadow}; text-align: center; border: 1px solid ${colors.hover};">
                      Lihat Barang Keluar
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.5; color: #6C6C78;">
                <em>*Terlampir dokumen PDF Surat Jalan / Bukti Barang Keluar.</em>
              </p>

              <!-- Divider -->
              <hr style="border: 0; border-top: 1px solid #E4E4E9; margin: 32px 0 24px 0;">

              <!-- Footer info -->
              <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.6; color: #A1A1AA;">
                Email ini dikirim secara otomatis oleh sistem <strong>Docuflow</strong> sebagai bukti pencatatan barang keluar. Harap tidak membalas email ini secara langsung.
              </p>
              
              <p style="margin: 0; font-size: 11px; color: #A1A1AA;">
                &copy; 2026 Docuflow. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const cleanDocNumber = (doc.document_number || 'dokumen').replace(/[/\\?%*:|"<>]/g, '_');

  try {
    const info = await sendMailWithRetry({
      from: fromAddress,
      to: recipientEmail,
      cc: ccArray.length > 0 ? ccArray : undefined,
      subject,
      text: plainText,
      html: htmlContent,
      attachments: [
        {
          filename: `GoodsOut-${cleanDocNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    try {
      await supabaseAdmin.from('email_logs').insert({
        ...baseLog,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });
    } catch (_) {}

    return { status: 'sent', messageId: info.messageId, subject };
  } catch (err) {
    const errorMessage = err?.message ?? String(err);
    try {
      await supabaseAdmin.from('email_logs').insert({
        ...baseLog,
        status: 'failed',
        error_message: errorMessage,
      });
    } catch (_) {}
    return { status: 'failed', error: errorMessage, subject };
  }
}

/**
 * Kirim email Bukti Barang Masuk (Goods In) lengkap dengan attachment PDF.
 * Recipient = email Finance/Owner. CC = Creator (Petugas) & Vendor (jika ada).
 *
 * @param {Object} params
 * @param {Object} params.doc - Document object (id, document_number, issue_date, contact_name, notes, items)
 * @param {Buffer} params.pdfBuffer - PDF attachment buffer
 * @param {string} params.creatorEmail - email user pembuat barang masuk
 * @param {string} params.creatorName - nama user pembuat barang masuk
 * @param {string} params.financeEmail - email finance / owner untuk penerima
 * @param {string|null} params.vendorEmail - email vendor / supplier untuk CC (jika ada)
 * @param {string|null} params.accentColor - warna aksen dari workspace setting
 * @param {string|null} params.warehouseName - nama gudang tujuan penerimaan
 * @returns {Promise<{status: 'sent'|'failed', error?: string, messageId?: string, subject: string}>}
 */
export async function sendGoodsInEmail({
  doc,
  pdfBuffer,
  creatorEmail,
  creatorName,
  financeEmail,
  vendorEmail,
  accentColor,
  warehouseName = 'Gudang Utama',
  customUnits = null,
}) {
  const vendorName = doc.contact_name || doc.contactName || 'Vendor';
  const whTag = warehouseName ? ` [${warehouseName}]` : '';
  const subject = `[Goods In] - ${doc.document_number} dari ${vendorName}${whTag}`;
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  const recipientEmail = financeEmail || creatorEmail;

  const ccSet = new Set();
  if (creatorEmail && recipientEmail && creatorEmail.toLowerCase() !== recipientEmail.toLowerCase()) {
    ccSet.add(creatorEmail);
  }
  if (vendorEmail && recipientEmail && vendorEmail.toLowerCase() !== recipientEmail.toLowerCase()) {
    ccSet.add(vendorEmail);
  }
  const ccArray = Array.from(ccSet);

  const baseLog = {
    sender_email: fromAddress || 'no-reply@docuflow.app',
    recipient_email: recipientEmail || null,
    cc_email: ccArray.length > 0 ? ccArray.join(', ') : null,
    subject,
    status: 'pending',
  };
  if (doc.id) {
    baseLog.document_id = doc.id;
  }

  if (!isValidEmail(recipientEmail)) {
    const errorMessage = 'Recipient email is empty or invalid.';
    try {
      await supabaseAdmin.from('email_logs').insert({
        ...baseLog,
        status: 'failed',
        error_message: errorMessage,
      });
    } catch (_) {}
    return { status: 'failed', error: errorMessage, subject };
  }

  const transporter = getTransporter();
  if (!transporter) {
    const errorMessage = 'SMTP credentials not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing).';
    try {
      await supabaseAdmin.from('email_logs').insert({
        ...baseLog,
        status: 'failed',
        error_message: errorMessage,
      });
    } catch (_) {}
    return { status: 'failed', error: errorMessage, subject };
  }

  // Determine frontend URL
  const rawFrontendUrl = process.env.FRONTEND_URL || (process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',')[0] : 'http://localhost:5173');
  const cleanFrontendUrl = rawFrontendUrl.replace(/\/+$/, '');
  const docLink = `${cleanFrontendUrl}/goods-out`;

  // Resolve palette colors matching workspace accent color
  const cleanAccent = String(accentColor || 'indigo').toLowerCase();
  const colors = PALETTE_COLORS[cleanAccent] || PALETTE_COLORS.indigo;

  const rawItems = Array.isArray(doc.items) ? doc.items : (doc.metadata?.items || []);
  const groupedItems = getGroupedProductItems(rawItems, customUnits || doc.metadata?.custom_units);
  const grandTotalLusin = groupedItems.reduce((sum, g) => sum + (g.totalLusin || 0), 0);
  const grandTotalPcsOnly = groupedItems.reduce((sum, g) => sum + (g.totalPcsOnly || 0), 0);
  const totalDocumentFormatted = formatDocumentQty(grandTotalLusin, grandTotalPcsOnly);

  const itemLines = groupedItems.map((group, index) => {
    const serialInfo = group.serials.length > 0
      ? `\n   No. Seri (${group.serials.length}): ${group.serials.join(', ')}`
      : '';
    const breakdownInfo = group.breakdown ? ` (${group.breakdown})` : '';
    return `${index + 1}. ${group.name} (SKU: ${group.sku}) - ${group.formattedQty}${breakdownInfo}${serialInfo}`;
  }).join('\n');

  const issueDateFormatted = doc.issue_date
    ? new Date(doc.issue_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('id-ID');

  const cleanDocNumber = (doc.document_number || 'dokumen').replace(/[/\\?%*:|"<>]/g, '_');

  const itemRowsHtml = groupedItems.map((g, idx) => {
    const serialSubtitle = g.serials.length > 0
      ? `<div style="font-size: 11px; color: ${colors.primary}; font-weight: 500; margin-top: 4px; word-break: break-all;">No. Seri (${g.serials.length}): ${g.serials.join(', ')}</div>`
      : '';
    const breakdownSubtitle = g.breakdown
      ? `<span style="font-size: 11px; color: #6C6C78; font-weight: normal; display: block; margin-top: 2px;">${g.breakdown}</span>`
      : '';
    return `
      <tr>
        <td style="padding: 10px 12px; font-size: 13px; color: #0D0D0F; border-bottom: 1px solid #EEEEEF; line-height: 1.4; vertical-align: top;">
          <div style="font-weight: 600;">${g.name}</div>
          <div style="font-size: 11px; color: #6C6C78; margin-top: 2px;">SKU: ${g.sku}</div>
          ${serialSubtitle}
        </td>
        <td align="right" style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #0D0D0F; border-bottom: 1px solid #EEEEEF; white-space: nowrap; vertical-align: top;">
          <div>${g.formattedQty}</div>
          ${breakdownSubtitle}
        </td>
      </tr>
    `;
  }).join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bukti Barang Masuk</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F7F7F8; font-family: 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F7F8; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E4E4E9; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03); overflow: hidden;">
          <tr>
            <td height="6" style="background-color: ${colors.primary};"></td>
          </tr>
          <tr>
            <td style="padding: 40px 32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #0D0D0F;">Docuflow</span>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; background-color: ${colors.light}; color: ${colors.primary}; padding: 6px 12px; border-radius: 9999px;">Barang Masuk</span>
                  </td>
                </tr>
              </table>

              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 600; color: #0D0D0F; letter-spacing: -0.02em; line-height: 1.3;">
                Bukti Penerimaan Barang Baru
              </h1>

              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #6C6C78;">
                Halo Team,
              </p>

              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #0D0D0F;">
                Catatan Barang Masuk (Goods In) baru telah dibuat oleh <strong>${creatorName ?? 'Petugas'}</strong>${creatorEmail ? ` (<a href="mailto:${creatorEmail}" style="color: ${colors.primary}; text-decoration: none;">${creatorEmail}</a>)` : ''} dengan rincian berikut:
              </p>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8F9FA; border: 1px solid #E4E4E9; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 500; color: #6C6C78;">No. Referensi</td>
                        <td width="70%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 600; color: #0D0D0F;">${doc.document_number}</td>
                      </tr>
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 500; color: #6C6C78;">Dari / Vendor</td>
                        <td width="70%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 600; color: #0D0D0F;">${doc.contact_name || '—'}</td>
                      </tr>
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 500; color: #6C6C78;">Gudang Tujuan</td>
                        <td width="70%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 600; color: #0D0D0F;">${warehouseName || '—'}</td>
                      </tr>
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 500; color: #6C6C78;">Tanggal</td>
                        <td width="70%" valign="top" style="padding-bottom: 12px; font-size: 13px; font-weight: 600; color: #0D0D0F;">${issueDateFormatted}</td>
                      </tr>
                      ${doc.notes ? `
                      <tr>
                        <td width="30%" valign="top" style="padding-bottom: 0; font-size: 13px; font-weight: 500; color: #6C6C78;">Catatan</td>
                        <td width="70%" valign="top" style="padding-bottom: 0; font-size: 13px; font-weight: 500; color: #0D0D0F;">${doc.notes}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 2px solid #0D0D0F;">
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #0D0D0F;">Item Diterima</span>
                  </td>
                </tr>
              </table>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <thead>
                        <tr>
                          <th align="left" style="padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6C6C78; background-color: #F8F9FA;">Item</th>
                          <th align="right" style="padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6C6C78; background-color: #F8F9FA;">Jumlah</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemRowsHtml}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #0D0D0F; border-top: 2px solid #E4E4E9;">Total Keseluruhan</td>
                          <td align="right" style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: ${colors.primary}; border-top: 2px solid #E4E4E9; white-space: nowrap;">${totalDocumentFormatted}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </td>
                </tr>
              </table>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${docLink}" target="_blank" style="display: inline-block; background-color: ${colors.primary}; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px;">Lihat Barang Masuk</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.5; color: #6C6C78;">
                <em>*Terlampir dokumen PDF Bukti Penerimaan Barang.</em>
              </p>

              <hr style="border: 0; border-top: 1px solid #E4E4E9; margin: 32px 0 24px 0;">

              <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.6; color: #A1A1AA;">
                Email ini dikirim atas konfirmasi petugas sebagai bukti pencatatan barang masuk. Balasan langsung ke email ini mungkin tidak terbaca.
              </p>
              <p style="margin: 0; font-size: 11px; color: #A1A1AA;">
                &copy; 2026 Docuflow. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const plainText = [
    `Bukti Penerimaan Barang (Goods In) baru telah dibuat oleh ${creatorName ?? 'Petugas'} (${creatorEmail || '-'}).`,
    '',
    `No. Referensi : ${doc.document_number}`,
    `Dari / Vendor : ${doc.contact_name || '—'}`,
    `Gudang Tujuan : ${warehouseName || '—'}`,
    `Tanggal       : ${issueDateFormatted}`,
    doc.notes ? `Catatan       : ${doc.notes}` : '',
    '',
    'Daftar Barang Masuk:',
    itemLines,
    '',
    `Total Keseluruhan: ${totalDocumentFormatted}`,
    '',
    `Lihat Barang Masuk selengkapnya di: ${docLink}`,
    '',
    'Terlampir dokumen PDF Bukti Penerimaan Barang.',
  ].filter(Boolean).join('\n');

  try {
    const info = await sendMailWithRetry({
      from: fromAddress,
      to: recipientEmail,
      cc: ccArray.length > 0 ? ccArray : undefined,
      subject,
      text: plainText,
      html: htmlContent,
      attachments: [
        {
          filename: `GoodsIn-${cleanDocNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    try {
      await supabaseAdmin.from('email_logs').insert({
        ...baseLog,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });
    } catch (_) {}

    return { status: 'sent', messageId: info.messageId, subject };
  } catch (err) {
    const errorMessage = err?.message ?? String(err);
    try {
      await supabaseAdmin.from('email_logs').insert({
        ...baseLog,
        status: 'failed',
        error_message: errorMessage,
      });
    } catch (_) {}
    return { status: 'failed', error: errorMessage, subject };
  }
}