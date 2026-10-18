-- Alter profiles table to add owner_id
alter table public.profiles add column if not exists owner_id uuid;

-- Initialize existing profiles owner_id
update public.profiles set owner_id = '00000000-0000-0000-0000-000000000000'::uuid where role = 'super_admin' and owner_id is null;
update public.profiles set owner_id = id where role = 'owner' and owner_id is null;
update public.profiles set owner_id = id where role = 'admin' and owner_id is null;

-- Alter other tables to add owner_id
alter table public.products add column if not exists owner_id uuid;
alter table public.contacts add column if not exists owner_id uuid;
alter table public.documents add column if not exists owner_id uuid;
alter table public.templates add column if not exists owner_id uuid;
alter table public.activity_logs add column if not exists owner_id uuid;

-- Update existing records using creator's profile
update public.products p
set owner_id = coalesce(pr.owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
from public.profiles pr
where p.created_by = pr.id;

update public.contacts c
set owner_id = coalesce(pr.owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
from public.profiles pr
where c.created_by = pr.id;

update public.documents d
set owner_id = coalesce(pr.owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
from public.profiles pr
where d.created_by = pr.id;

update public.templates t
set owner_id = coalesce(pr.owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
from public.profiles pr
where t.created_by = pr.id;

update public.activity_logs a
set owner_id = coalesce(pr.owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
from public.profiles pr
where a.actor_id = pr.id;

-- Fallbacks for any orphan rows
update public.products set owner_id = '00000000-0000-0000-0000-000000000000'::uuid where owner_id is null;
update public.contacts set owner_id = '00000000-0000-0000-0000-000000000000'::uuid where owner_id is null;
update public.documents set owner_id = '00000000-0000-0000-0000-000000000000'::uuid where owner_id is null;
update public.templates set owner_id = '00000000-0000-0000-0000-000000000000'::uuid where owner_id is null;
update public.activity_logs set owner_id = '00000000-0000-0000-0000-000000000000'::uuid where owner_id is null;

-- Set columns to NOT NULL
alter table public.products alter column owner_id set not null;
alter table public.contacts alter column owner_id set not null;
alter table public.documents alter column owner_id set not null;
alter table public.templates alter column owner_id set not null;
alter table public.activity_logs alter column owner_id set not null;

-- Create indexes on owner_id for better querying performance
create index if not exists products_owner_id_idx on public.products(owner_id);
create index if not exists contacts_owner_id_idx on public.contacts(owner_id);
create index if not exists documents_owner_id_idx on public.documents(owner_id);
create index if not exists templates_owner_id_idx on public.templates(owner_id);
create index if not exists activity_logs_owner_id_idx on public.activity_logs(owner_id);

-- Alter workspace_settings to add composite primary key
alter table public.workspace_settings drop constraint if exists workspace_settings_pkey;
alter table public.workspace_settings add column if not exists owner_id uuid;
update public.workspace_settings set owner_id = '00000000-0000-0000-0000-000000000000'::uuid where owner_id is null;
alter table public.workspace_settings alter column owner_id set not null;
alter table public.workspace_settings add primary key (owner_id, key);

-- Duplicate default settings for any existing Owners
insert into public.workspace_settings (owner_id, key, value)
select p.id, ws.key, ws.value
from public.profiles p
cross join public.workspace_settings ws
where p.role = 'owner'
  and ws.owner_id = '00000000-0000-0000-0000-000000000000'::uuid
on conflict (owner_id, key) do nothing;

-- Duplicate default templates for any existing Owners
insert into public.templates (name, category, status, is_default, is_custom, orientation, paper_size, layout, created_by, owner_id)
select t.name, t.category, t.status, t.is_default, t.is_custom, t.orientation, t.paper_size, t.layout, p.id, p.id
from public.profiles p
cross join public.templates t
where p.role = 'owner'
  and t.owner_id = '00000000-0000-0000-0000-000000000000'::uuid
  and not exists (
    select 1 from public.templates t2 where t2.owner_id = p.id
  );

-- Update the handle_new_user() trigger function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_owner_id uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'admin');
  
  if v_role = 'super_admin' then
    v_owner_id := '00000000-0000-0000-0000-000000000000'::uuid;
  elsif v_role = 'owner' then
    v_owner_id := new.id;
  else
    v_owner_id := coalesce((new.raw_user_meta_data->>'owner_id')::uuid, new.id);
  end if;

  insert into public.profiles (id, full_name, role, owner_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    v_owner_id
  )
  on conflict (id) do update
  set
    role = excluded.role,
    owner_id = excluded.owner_id;
  return new;
end;
$$;

-- Create function to initialize new Owner or Super Admin tenant settings/templates
create or replace function public.initialize_tenant_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role = 'owner' or new.role = 'super_admin') then
    
    -- Insert 'modules' setting
    insert into public.workspace_settings (owner_id, key, value)
    values (
      new.owner_id,
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
    on conflict (owner_id, key) do nothing;

    -- Insert 'app' setting
    insert into public.workspace_settings (owner_id, key, value)
    values (
      new.owner_id,
      'app',
      jsonb_build_object(
        'company', jsonb_build_object(
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
        ),
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
    on conflict (owner_id, key) do nothing;

    -- Insert default templates
    if not exists (select 1 from public.templates t where t.owner_id = new.owner_id) then
      insert into public.templates (name, category, status, is_default, is_custom, orientation, paper_size, layout, created_by, owner_id)
      values
        (
          'Modern Invoice',
          'invoice',
          'active',
          true,
          false,
          'landscape',
          'Continuous Form Full Landscape 11 x 9.5 in',
          '{
            "layoutStyle": "Continuous Form Landscape",
            "documentSize": "Continuous Form Full Landscape 11 x 9.5 in",
            "headerLayout": "Company left",
            "footerLayout": "Notes and signature",
            "logoPlacement": "Top left",
            "description": "Landscape full continuous form invoice template for 11 x 9.5 inch printer paper.",
            "selected": true
          }'::jsonb,
          new.id,
          new.owner_id
        ),
        (
          'Warehouse Goods In',
          'goods_in',
          'active',
          true,
          false,
          'portrait',
          'A4',
          '{
            "layoutStyle": "Detailed Layout",
            "documentSize": "A4",
            "headerLayout": "Warehouse header",
            "footerLayout": "Receiver signature",
            "logoPlacement": "Top left",
            "description": "Goods in template for supplier receiving, warehouse verification, and incoming stock records.",
            "selected": false
          }'::jsonb,
          new.id,
          new.owner_id
        ),
        (
          'Goods Out Standard',
          'goods_out',
          'active',
          true,
          false,
          'portrait',
          'A4',
          '{
            "layoutStyle": "Standard Layout",
            "documentSize": "A4",
            "headerLayout": "Company left",
            "footerLayout": "Warehouse approval",
            "logoPlacement": "Top left",
            "description": "Goods out template for outbound stock movement, destination records, and warehouse approval.",
            "selected": false
          }'::jsonb,
          new.id,
          new.owner_id
        ),
        (
          'Delivery Note Standard',
          'delivery_note',
          'active',
          true,
          false,
          'portrait',
          'A4',
          '{
            "layoutStyle": "Standard Layout",
            "documentSize": "A4",
            "headerLayout": "Company left",
            "footerLayout": "Driver and receiver signature",
            "logoPlacement": "Top left",
            "description": "Delivery note template for shipment details, recipient confirmation, and item delivery lists.",
            "selected": false
          }'::jsonb,
          new.id,
          new.owner_id
        ),
        (
          'Retail Receipt',
          'receipt',
          'active',
          true,
          false,
          'landscape',
          'Continuous Form Full Landscape 11 x 9.5 in',
          '{
            "layoutStyle": "Continuous Form Landscape",
            "documentSize": "Continuous Form Full Landscape 11 x 9.5 in",
            "headerLayout": "Store header",
            "footerLayout": "Thank-you notes and signature",
            "logoPlacement": "Top left",
            "description": "Landscape full continuous form receipt template for 11 x 9.5 inch printer paper.",
            "selected": false
          }'::jsonb,
          new.id,
          new.owner_id
        );
    end if;

  end if;
  return new;
end;
$$;

drop trigger if exists profiles_initialize_tenant_settings on public.profiles;
create trigger profiles_initialize_tenant_settings
  after insert or update of role, owner_id on public.profiles
  for each row
  execute function public.initialize_tenant_settings();

-- Drop global unique constraints and recreate as composite unique constraints scoped per tenant
alter table public.products drop constraint if exists products_sku_key;
alter table public.products add constraint products_owner_sku_key unique (owner_id, sku);

alter table public.documents drop constraint if exists documents_document_number_key;
alter table public.documents add constraint documents_owner_document_number_key unique (owner_id, document_number);

