-- Seed Manajemen Modul settings for Super Admin tenant
insert into public.workspace_settings (owner_id, key, value)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'modules',
  jsonb_build_object(
    'inventory', jsonb_build_object(
      'name', 'Inventory',
      'label', 'Inventory',
      'description', 'Kelola stok, produk, dan pergerakan barang',
      'enabled', true,
      'required', true,
      'category', 'Core',
      'roles', jsonb_build_array('owner', 'admin')
    ),
    'products', jsonb_build_object(
      'label', 'Products',
      'enabled', true,
      'roles', jsonb_build_array('owner', 'admin')
    ),
    'contacts', jsonb_build_object(
      'label', 'Customers',
      'enabled', true,
      'roles', jsonb_build_array('owner', 'admin')
    ),
    'documents', jsonb_build_object(
      'name', 'Documents',
      'label', 'Documents',
      'description', 'Kelola invoice dan dokumen bisnis',
      'enabled', true,
      'required', true,
      'category', 'Core',
      'roles', jsonb_build_array('owner', 'admin'),
      'documentTypes', jsonb_build_object(
        'invoice', jsonb_build_object('label', 'Invoice', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
        'goods_in', jsonb_build_object('label', 'Goods In', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
        'goods_out', jsonb_build_object('label', 'Goods Out', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
        'delivery_note', jsonb_build_object('label', 'Delivery Note', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin')),
        'receipt', jsonb_build_object('label', 'Receipt', 'enabled', true, 'roles', jsonb_build_array('owner', 'admin'))
      )
    ),
    'purchase', jsonb_build_object(
      'name', 'Purchase Order',
      'label', 'Purchase Order',
      'description', 'Kelola pembelian',
      'enabled', true,
      'required', false,
      'category', 'Business',
      'roles', jsonb_build_array('owner', 'admin')
    ),
    'delivery', jsonb_build_object(
      'name', 'Surat Jalan',
      'label', 'Surat Jalan',
      'description', 'Kelola pengiriman barang',
      'enabled', false,
      'required', false,
      'category', 'Business',
      'roles', jsonb_build_array('owner', 'admin')
    ),
    'templates', jsonb_build_object('label', 'Templates', 'enabled', true, 'roles', jsonb_build_array('owner')),
    'history', jsonb_build_object('label', 'History', 'enabled', true, 'roles', jsonb_build_array('owner')),
    'settings', jsonb_build_object('label', 'Settings', 'enabled', true, 'roles', jsonb_build_array('owner'))
  )
)
on conflict (owner_id, key) do update
set value = excluded.value;
