import { supabaseAdmin } from '../lib/supabase.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function writeActivityLog(req, entry) {
  const actorName = req.auth?.user?.user_metadata?.full_name ?? req.auth?.user?.email ?? null;
  const safeEntityId = (entry.entityId && UUID_REGEX.test(String(entry.entityId))) ? entry.entityId : null;

  const { error } = await supabaseAdmin
    .from('activity_logs')
    .insert({
      actor_id: req.auth?.user?.id,
      actor_name: actorName,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: safeEntityId,
      entity_name: entry.entityName ?? null,
      before_data: entry.beforeData ?? null,
      after_data: entry.afterData ?? null,
      metadata: entry.metadata ?? {},
      owner_id: req.auth?.ownerId,
      warehouse_id: req.auth?.warehouseId ?? null,
    });
  if (error) {
    console.error('[activityLog] failed to insert:', error.message);
  }
}
