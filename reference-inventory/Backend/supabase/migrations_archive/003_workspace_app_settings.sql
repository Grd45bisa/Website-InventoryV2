insert into public.workspace_settings (key, value)
values (
  'app',
  jsonb_build_object(
    'documents',
    jsonb_build_object(
      'brandLogos',
      jsonb_build_array('', '', '', '', '', '', '', '')
    )
  )
)
on conflict (key) do update
set value = public.workspace_settings.value || jsonb_build_object(
  'documents',
  coalesce(public.workspace_settings.value->'documents', '{}'::jsonb) || jsonb_build_object(
    'brandLogos',
    coalesce(
      public.workspace_settings.value->'documents'->'brandLogos',
      jsonb_build_array('', '', '', '', '', '', '', '')
    )
  )
);
