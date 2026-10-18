create table if not exists public.product_serials (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  serial_number text not null,
  status text not null default 'available' check (status in ('available', 'reserved', 'out', 'damaged')),
  goods_in_document_id uuid references public.documents(id) on delete set null,
  goods_in_item_id uuid references public.document_items(id) on delete set null,
  goods_out_document_id uuid references public.documents(id) on delete set null,
  goods_out_item_id uuid references public.document_items(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_serials_owner_serial_number_key
  on public.product_serials(owner_id, serial_number);

create index if not exists product_serials_owner_id_idx
  on public.product_serials(owner_id);

create index if not exists product_serials_product_id_idx
  on public.product_serials(product_id);

create index if not exists product_serials_status_idx
  on public.product_serials(status);

drop trigger if exists product_serials_set_updated_at on public.product_serials;
create trigger product_serials_set_updated_at
  before update on public.product_serials
  for each row execute function public.set_updated_at();

alter table public.product_serials enable row level security;

drop policy if exists "Authenticated users can read product serials" on public.product_serials;
create policy "Authenticated users can read product serials"
  on public.product_serials for select
  using (auth.role() = 'authenticated');
