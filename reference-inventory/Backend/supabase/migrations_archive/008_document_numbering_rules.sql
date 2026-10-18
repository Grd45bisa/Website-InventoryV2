-- Insert default numbering settings for system owner
insert into public.workspace_settings (owner_id, key, value)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'numbering',
  '{"rules": [
    {"type": "invoice", "prefix": "NOTA", "format": "{PREFIX}/{YYYY}{MM}/{SEQ}", "seqLength": 4, "seqReset": "monthly", "separator": "/", "leadingZero": true},
    {"type": "receipt", "prefix": "KWI", "format": "{PREFIX}/{YYYY}{MM}/{SEQ}", "seqLength": 4, "seqReset": "monthly", "separator": "/", "leadingZero": true},
    {"type": "goods_in", "prefix": "WH/IN", "format": "{PREFIX}/{YYYY}{MM}{DD}/{SEQ}", "seqLength": 4, "seqReset": "monthly", "separator": "/", "leadingZero": true},
    {"type": "goods_out", "prefix": "WH/OUT", "format": "{PREFIX}/{YYYY}{MM}{DD}/{SEQ}", "seqLength": 4, "seqReset": "monthly", "separator": "/", "leadingZero": true},
    {"type": "delivery_note", "prefix": "SJ", "format": "{PREFIX}/{YYYY}{MM}/{SEQ}", "seqLength": 4, "seqReset": "monthly", "separator": "/", "leadingZero": true}
  ]}'::jsonb
)
on conflict (owner_id, key) do update
set value = excluded.value;

-- Duplicate default numbering settings for existing Owners
insert into public.workspace_settings (owner_id, key, value)
select p.id, 'numbering', ws.value
from public.profiles p
cross join (
  select value from public.workspace_settings 
  where owner_id = '00000000-0000-0000-0000-000000000000'::uuid and key = 'numbering'
) ws
where p.role = 'owner'
on conflict (owner_id, key) do nothing;
