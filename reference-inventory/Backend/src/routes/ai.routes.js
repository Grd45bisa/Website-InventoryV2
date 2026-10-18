import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadTenant } from '../middleware/loadTenant.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { runDualAgentOcrPipeline } from '../services/nvidia-ai.service.js';
import { DEFAULT_UNITS } from '../utils/default-units.js';

const router = Router();
router.use(requireAuth, loadTenant);

const ocrSchema = z.object({
  image: z.string().min(10, 'Gambar base64 wajib diisi'),
  mimeType: z.string().default('image/png'),
  apiKey: z.string().trim().optional(),
});

/**
 * POST /api/workspace/ai/ocr-inventory
 * Process image through NVIDIA Dual-Agent Pipeline
 */
router.post('/ai/ocr-inventory', async (req, res, next) => {
  try {
    const { image, mimeType, apiKey } = ocrSchema.parse(req.body);
    const ownerId = req.auth.ownerId;

    // 1. Fetch Tenant's active products catalogue
    const { data: products = [] } = await supabaseAdmin
      .from('products')
      .select('id, name, sku, metadata')
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .limit(500);

    // 2. Fetch Tenant's custom units setting
    const { data: settingsRow } = await supabaseAdmin
      .from('app_settings')
      .select('settings_value')
      .eq('owner_id', ownerId)
      .eq('settings_key', 'custom_units')
      .maybeSingle();

    let units = DEFAULT_UNITS;
    if (settingsRow?.settings_value && Array.isArray(settingsRow.settings_value)) {
      units = settingsRow.settings_value;
    }

    // 3. Run Dual-Agent Pipeline
    const pipelineResult = await runDualAgentOcrPipeline({
      base64Image: image,
      mimeType,
      products: products || [],
      units,
      apiKey: apiKey || req.headers['x-nvidia-api-key'],
    });

    return res.json({
      ok: true,
      data: pipelineResult,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
