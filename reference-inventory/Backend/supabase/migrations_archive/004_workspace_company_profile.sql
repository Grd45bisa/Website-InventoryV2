insert into public.workspace_settings (key, value)
values (
  'app',
  jsonb_build_object(
    'company',
    jsonb_build_object(
      'logoName', '',
      'logoData', '',
      'stampName', '',
      'stampData', '',
      'signatureName', '',
      'signatureData', '',
      'companyName', 'DocuFlow Trading',
      'businessType', 'Trading & Distribution',
      'email', 'finance@docuflow.test',
      'phone', '021-555-0199',
      'website', 'www.docuflow.test',
      'address', 'Jl. Sudirman No. 88',
      'city', 'Jakarta',
      'province', 'DKI Jakarta',
      'postalCode', '10220',
      'taxId', '01.234.567.8-901.000',
      'paymentTransfer', 'BCA 1234567890 a/n DocuFlow Trading'
    )
  )
)
on conflict (key) do update
set value = public.workspace_settings.value || jsonb_build_object(
  'company',
  coalesce(public.workspace_settings.value->'company', '{}'::jsonb) || jsonb_build_object(
    'logoName', coalesce(public.workspace_settings.value->'company'->>'logoName', ''),
    'logoData', coalesce(public.workspace_settings.value->'company'->>'logoData', ''),
    'stampName', coalesce(public.workspace_settings.value->'company'->>'stampName', ''),
    'stampData', coalesce(public.workspace_settings.value->'company'->>'stampData', ''),
    'signatureName', coalesce(public.workspace_settings.value->'company'->>'signatureName', ''),
    'signatureData', coalesce(public.workspace_settings.value->'company'->>'signatureData', ''),
    'companyName', coalesce(public.workspace_settings.value->'company'->>'companyName', 'DocuFlow Trading'),
    'businessType', coalesce(public.workspace_settings.value->'company'->>'businessType', 'Trading & Distribution'),
    'email', coalesce(public.workspace_settings.value->'company'->>'email', 'finance@docuflow.test'),
    'phone', coalesce(public.workspace_settings.value->'company'->>'phone', '021-555-0199'),
    'website', coalesce(public.workspace_settings.value->'company'->>'website', 'www.docuflow.test'),
    'address', coalesce(public.workspace_settings.value->'company'->>'address', 'Jl. Sudirman No. 88'),
    'city', coalesce(public.workspace_settings.value->'company'->>'city', 'Jakarta'),
    'province', coalesce(public.workspace_settings.value->'company'->>'province', 'DKI Jakarta'),
    'postalCode', coalesce(public.workspace_settings.value->'company'->>'postalCode', '10220'),
    'taxId', coalesce(public.workspace_settings.value->'company'->>'taxId', '01.234.567.8-901.000'),
    'paymentTransfer', coalesce(public.workspace_settings.value->'company'->>'paymentTransfer', 'BCA 1234567890 a/n DocuFlow Trading')
  )
);
