update public.workspace_settings
set
  value = jsonb_set(
    value,
    '{documents,invoicePrefix}',
    to_jsonb('NOTA No: '::text),
    true
  ),
  updated_at = now()
where
  key = 'app'
  and coalesce(value->'documents'->>'invoicePrefix', '') like 'INV-%';
