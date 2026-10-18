insert into public.workspace_settings (key, value)
values (
  'modules',
  jsonb_build_object(
    'documents', jsonb_build_object(
      'label', 'Documents',
      'enabled', true,
      'roles', jsonb_build_array('owner', 'admin'),
      'documentTypes', jsonb_build_object(
        'invoice', jsonb_build_object('label', 'Invoice', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
        'goods_in', jsonb_build_object('label', 'Goods In', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
        'goods_out', jsonb_build_object('label', 'Goods Out', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
        'delivery_note', jsonb_build_object('label', 'Delivery Note', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
        'receipt', jsonb_build_object('label', 'Receipt', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin'))
      )
    ),
    'products', jsonb_build_object('label', 'Products', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
    'contacts', jsonb_build_object('label', 'Customers', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
    'templates', jsonb_build_object('label', 'Templates', 'enabled', true, 'roles', jsonb_build_array('owner')),
    'history', jsonb_build_object('label', 'History', 'enabled', true, 'roles', jsonb_build_array('owner')),
    'settings', jsonb_build_object('label', 'Settings', 'enabled', true, 'roles', jsonb_build_array('owner'))
  )
)
on conflict (key) do update
set
  value = jsonb_build_object(
    'documents',
    coalesce(excluded.value->'documents', '{}'::jsonb)
      || coalesce(public.workspace_settings.value->'documents', '{}'::jsonb)
      || jsonb_build_object(
        'documentTypes',
        coalesce(excluded.value->'documents'->'documentTypes', '{}'::jsonb)
          || coalesce(public.workspace_settings.value->'documents'->'documentTypes', '{}'::jsonb)
      ),
    'products', coalesce(excluded.value->'products', '{}'::jsonb) || coalesce(public.workspace_settings.value->'products', '{}'::jsonb),
    'contacts', coalesce(excluded.value->'contacts', '{}'::jsonb) || coalesce(public.workspace_settings.value->'contacts', '{}'::jsonb),
    'templates', coalesce(excluded.value->'templates', '{}'::jsonb) || coalesce(public.workspace_settings.value->'templates', '{}'::jsonb),
    'history', coalesce(excluded.value->'history', '{}'::jsonb) || coalesce(public.workspace_settings.value->'history', '{}'::jsonb),
    'settings', coalesce(excluded.value->'settings', '{}'::jsonb) || coalesce(public.workspace_settings.value->'settings', '{}'::jsonb)
  ),
  updated_at = now();

insert into public.workspace_settings (key, value)
values (
  'app',
  jsonb_build_object(
    'documents', jsonb_build_object(
      'invoicePrefix', 'NOTA No: ',
      'goodsInPrefix', 'GIN-2026-',
      'goodsOutPrefix', 'GOUT-2026-',
      'deliveryNotePrefix', 'DN-2026-',
      'receiptPrefix', 'RCT-2026-',
      'brandLogos', jsonb_build_array('', '', '', '', '', '', '', ''),
      'autoGenerate', true,
      'resetYearly', true,
      'showCompanyHeader', true,
      'showFooterNotes', true
    ),
    'pdf', jsonb_build_object(
      'paperSize', 'A4',
      'orientation', 'Portrait',
      'margins', 'Normal',
      'showFooter', true,
      'showPageNumbers', true,
      'showCompanyInfo', true,
      'showWatermark', false
    ),
    'currency', jsonb_build_object(
      'defaultCurrency', 'IDR',
      'format', 'Rp 100.000',
      'decimalPlaces', '0',
      'taxName', 'PPN',
      'taxPercentage', '11'
    ),
    'notifications', jsonb_build_object(
      'documentCreated', true,
      'documentExported', true,
      'importCompleted', true,
      'templateUpdated', true,
      'productUpdated', false,
      'systemAlerts', true
    ),
    'backup', jsonb_build_object(
      'lastBackupAt', null,
      'lastExportAt', null,
      'retentionDays', 30
    ),
    'appearance', jsonb_build_object(
      'theme', 'Light',
      'accentColor', 'Blue',
      'density', 'Comfortable'
    )
  )
)
on conflict (key) do update
set
  value = public.workspace_settings.value
    || jsonb_build_object(
      'documents',
      coalesce(public.workspace_settings.value->'documents', '{}'::jsonb)
        || jsonb_build_object(
          'invoicePrefix',
            case
              when coalesce(public.workspace_settings.value->'documents'->>'invoicePrefix', '') like 'INV-%'
                then excluded.value->'documents'->>'invoicePrefix'
              else coalesce(public.workspace_settings.value->'documents'->>'invoicePrefix', excluded.value->'documents'->>'invoicePrefix')
            end,
          'goodsInPrefix', coalesce(public.workspace_settings.value->'documents'->>'goodsInPrefix', excluded.value->'documents'->>'goodsInPrefix'),
          'goodsOutPrefix', coalesce(public.workspace_settings.value->'documents'->>'goodsOutPrefix', excluded.value->'documents'->>'goodsOutPrefix'),
          'deliveryNotePrefix', coalesce(public.workspace_settings.value->'documents'->>'deliveryNotePrefix', excluded.value->'documents'->>'deliveryNotePrefix'),
          'receiptPrefix', coalesce(public.workspace_settings.value->'documents'->>'receiptPrefix', excluded.value->'documents'->>'receiptPrefix'),
          'brandLogos', coalesce(public.workspace_settings.value->'documents'->'brandLogos', excluded.value->'documents'->'brandLogos'),
          'autoGenerate', coalesce(public.workspace_settings.value->'documents'->'autoGenerate', excluded.value->'documents'->'autoGenerate'),
          'resetYearly', coalesce(public.workspace_settings.value->'documents'->'resetYearly', excluded.value->'documents'->'resetYearly'),
          'showCompanyHeader', coalesce(public.workspace_settings.value->'documents'->'showCompanyHeader', excluded.value->'documents'->'showCompanyHeader'),
          'showFooterNotes', coalesce(public.workspace_settings.value->'documents'->'showFooterNotes', excluded.value->'documents'->'showFooterNotes')
        ),
      'pdf', coalesce(excluded.value->'pdf', '{}'::jsonb) || coalesce(public.workspace_settings.value->'pdf', '{}'::jsonb),
      'currency', coalesce(excluded.value->'currency', '{}'::jsonb) || coalesce(public.workspace_settings.value->'currency', '{}'::jsonb),
      'notifications', coalesce(excluded.value->'notifications', '{}'::jsonb) || coalesce(public.workspace_settings.value->'notifications', '{}'::jsonb),
      'backup', coalesce(excluded.value->'backup', '{}'::jsonb) || coalesce(public.workspace_settings.value->'backup', '{}'::jsonb),
      'appearance', coalesce(excluded.value->'appearance', '{}'::jsonb) || coalesce(public.workspace_settings.value->'appearance', '{}'::jsonb)
    ),
  updated_at = now();
