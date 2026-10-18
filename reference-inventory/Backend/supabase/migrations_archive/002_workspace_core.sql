create extension if not exists pgcrypto with schema extensions;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text,
  stock integer not null default 0,
  unit_cost numeric(14, 2) not null default 0,
  selling_price numeric(14, 2) not null default 0,
  discount_type text not null default 'none' check (discount_type in ('none', 'percentage', 'fixed')),
  discount_value numeric(14, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'disabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'customer' check (type = 'customer'),
  name text not null,
  email text,
  phone text,
  address text,
  city text,
  province text,
  status text not null default 'active' check (status in ('active', 'pending', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts drop constraint if exists contacts_type_check;

update public.contacts
set type = 'customer'
where type <> 'customer';

alter table public.contacts
  alter column type set default 'customer',
  add constraint contacts_type_check check (type = 'customer');

alter table public.contacts drop constraint if exists contacts_status_check;

update public.contacts
set status = 'active'
where status not in ('active', 'pending', 'archived');

alter table public.contacts
  add constraint contacts_status_check check (status in ('active', 'pending', 'archived'));

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('invoice', 'goods_in', 'goods_out', 'delivery_note', 'receipt')),
  document_number text not null unique,
  contact_id uuid references public.contacts(id) on delete set null,
  contact_name text,
  status text not null default 'draft' check (status in ('draft', 'processing', 'ready', 'completed', 'exported', 'cancelled')),
  issue_date date not null default current_date,
  due_date date,
  payment_terms text,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  item_name text not null,
  sku text,
  quantity numeric(14, 2) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  discount_type text not null default 'none' check (discount_type in ('none', 'percentage', 'fixed')),
  discount_value numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('invoice', 'goods_in', 'goods_out', 'delivery_note', 'receipt', 'custom')),
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  is_default boolean not null default false,
  is_custom boolean not null default false,
  orientation text not null default 'portrait' check (orientation in ('portrait', 'landscape')),
  paper_size text not null default 'a4',
  layout jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_name text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists products_status_idx on public.products(status);
create index if not exists contacts_type_status_idx on public.contacts(type, status);
create index if not exists documents_type_status_idx on public.documents(document_type, status);
create index if not exists documents_contact_id_idx on public.documents(contact_id);
create index if not exists document_items_document_id_idx on public.document_items(document_id);
create index if not exists templates_category_status_idx on public.templates(category, status);
create index if not exists activity_logs_entity_idx on public.activity_logs(entity_type, entity_id);
create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at desc);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

drop trigger if exists document_items_set_updated_at on public.document_items;
create trigger document_items_set_updated_at
  before update on public.document_items
  for each row execute function public.set_updated_at();

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

create or replace function public.set_workspace_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_settings_set_updated_at on public.workspace_settings;
create trigger workspace_settings_set_updated_at
  before update on public.workspace_settings
  for each row execute function public.set_workspace_settings_updated_at();

alter table public.products enable row level security;
alter table public.contacts enable row level security;
alter table public.documents enable row level security;
alter table public.document_items enable row level security;
alter table public.templates enable row level security;
alter table public.activity_logs enable row level security;
alter table public.workspace_settings enable row level security;

drop policy if exists "Authenticated users can read products" on public.products;
create policy "Authenticated users can read products"
  on public.products for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read contacts" on public.contacts;
create policy "Authenticated users can read contacts"
  on public.contacts for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read documents" on public.documents;
create policy "Authenticated users can read documents"
  on public.documents for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read document items" on public.document_items;
create policy "Authenticated users can read document items"
  on public.document_items for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read templates" on public.templates;
create policy "Authenticated users can read templates"
  on public.templates for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read activity logs" on public.activity_logs;
create policy "Authenticated users can read activity logs"
  on public.activity_logs for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read workspace settings" on public.workspace_settings;
create policy "Authenticated users can read workspace settings"
  on public.workspace_settings for select
  using (auth.role() = 'authenticated');

insert into public.templates (
  id,
  name,
  category,
  status,
  is_default,
  is_custom,
  orientation,
  paper_size,
  layout
)
values
  (
    '10000000-0000-0000-0000-000000000001',
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
    }'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000002',
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
    }'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000003',
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
    }'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000004',
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
    }'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000005',
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
    }'::jsonb
  )
on conflict (id) do update
set
  name = excluded.name,
  category = excluded.category,
  status = 'active',
  is_default = true,
  is_custom = false,
  orientation = excluded.orientation,
  paper_size = excluded.paper_size,
  layout = excluded.layout,
  updated_at = now();

update public.templates
set
  status = 'archived',
  is_default = false,
  updated_at = now()
where category in ('invoice', 'goods_in', 'goods_out', 'delivery_note', 'receipt')
  and id not in (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005'
  );
