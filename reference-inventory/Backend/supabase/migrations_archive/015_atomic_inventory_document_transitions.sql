-- Atomic Goods In / Goods Out inventory transitions.
-- Legacy unit `bal` intentionally remains 300 pcs.

create table if not exists public.warehouse_units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  warehouse_id uuid not null,
  unit_key text not null,
  display_name text not null,
  multiplier numeric not null check (multiplier > 0),
  base_unit text not null default 'pcs',
  is_active boolean not null default true,
  is_locked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, warehouse_id, unit_key)
);

create index if not exists warehouse_units_lookup_idx
  on public.warehouse_units(owner_id, warehouse_id, is_active, unit_key);

alter table public.warehouse_units enable row level security;

-- Migrate the existing per-warehouse JSON settings without deleting them.
insert into public.warehouse_units (
  owner_id, warehouse_id, unit_key, display_name, multiplier, base_unit, is_active, is_locked, metadata
)
select ws.owner_id,
  replace(ws.key, 'custom_units_', '')::uuid,
  lower(unit->>'key'),
  coalesce(nullif(unit->>'name', ''), unit->>'key'),
  coalesce(nullif(unit->>'multiplier', '')::numeric,
    case when unit->>'baseType' = 'lusin' then nullif(unit->>'baseValue', '')::numeric * 12
         else nullif(unit->>'baseValue', '')::numeric end, 1),
  coalesce(nullif(unit->>'baseType', ''), 'pcs'),
  true,
  coalesce((unit->>'isLocked')::boolean, false),
  unit
from public.workspace_settings ws
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(ws.value) = 'array' then ws.value else '[]'::jsonb end
) unit
where ws.key ~ '^custom_units_[0-9a-fA-F-]{36}$'
  and jsonb_typeof(ws.value) = 'array'
  and coalesce(unit->>'key', '') <> ''
on conflict (owner_id, warehouse_id, unit_key) do update set
  display_name = excluded.display_name,
  multiplier = excluded.multiplier,
  base_unit = excluded.base_unit,
  is_locked = excluded.is_locked,
  metadata = excluded.metadata,
  updated_at = now();

-- Hidden compatibility alias for historical document_items / serial numbers.
insert into public.warehouse_units (owner_id, warehouse_id, unit_key, display_name, multiplier, is_active, is_locked)
select distinct owner_id, warehouse_id, 'bal', 'Bal (Legacy)', 300, false, true
from public.warehouse_units
on conflict (owner_id, warehouse_id, unit_key) do update set multiplier = 300, is_locked = true;

create or replace function public.inventory_unit_multiplier(
  p_owner_id uuid,
  p_warehouse_id uuid,
  p_unit_key text
) returns numeric
language plpgsql
stable
as $$
declare
  v_units jsonb;
  v_multiplier numeric;
  v_key text := lower(coalesce(nullif(trim(p_unit_key), ''), 'pcs'));
begin
  select multiplier into v_multiplier
  from public.warehouse_units
  where owner_id = p_owner_id and warehouse_id = p_warehouse_id and unit_key = v_key
  limit 1;
  if v_multiplier is not null then return v_multiplier; end if;

  if p_warehouse_id is not null then
    select value into v_units
    from public.workspace_settings
    where owner_id = p_owner_id and key = 'custom_units_' || p_warehouse_id::text;
  end if;

  if v_units is null then
    select value into v_units
    from public.workspace_settings
    where owner_id = p_owner_id and key = 'custom_units';
  end if;

  select coalesce(
    nullif(unit->>'multiplier', '')::numeric,
    case when unit->>'baseType' = 'lusin'
      then nullif(unit->>'baseValue', '')::numeric * 12
      else nullif(unit->>'baseValue', '')::numeric
    end
  ) into v_multiplier
  from jsonb_array_elements(coalesce(v_units, '[]'::jsonb)) unit
  where lower(unit->>'key') = v_key
  limit 1;

  return coalesce(v_multiplier, case v_key
    when 'pcs' then 1 when 'piece' then 1
    when 'pack3' then 3 when 'pack6' then 6
    when 'lusin' then 12 when 'dozen' then 12
    when 'pack' then 60 when 'bal5' then 60
    when 'bal10' then 120 when 'bal15' then 180
    when 'bal20' then 240 when 'bal25' then 300
    when 'bal' then 300
    else 1 end);
end;
$$;

create or replace function public.complete_inventory_document(
  p_owner_id uuid,
  p_document_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
  v_product public.products%rowtype;
  v_item record;
  v_qty numeric;
  v_available numeric;
  v_serial public.product_serials%rowtype;
begin
  select * into v_doc from public.documents
  where id = p_document_id and owner_id = p_owner_id
  for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_doc.status = 'completed' then
    return to_jsonb(v_doc);
  end if;
  if v_doc.status = 'cancelled' then
    raise exception 'CANCELLED_DOCUMENT_CANNOT_BE_COMPLETED' using errcode = 'P0001';
  end if;

  if v_doc.document_type in ('goods_in', 'goods_out') then
    for v_item in
      select di.product_id,
        sum(
          coalesce(nullif(di.metadata->>'qtyInput', '')::numeric, di.quantity)
          * coalesce(nullif(di.metadata->>'unitMultiplier', '')::numeric,
              public.inventory_unit_multiplier(p_owner_id, v_doc.warehouse_id, di.metadata->>'qtyUnit'))
        ) as base_qty
      from public.document_items di
      where di.document_id = p_document_id
        and di.product_id is not null
        and coalesce((di.metadata->>'isSerial')::boolean, false) = false
      group by di.product_id
      order by di.product_id
    loop
      select * into v_product from public.products
      where id = v_item.product_id and owner_id = p_owner_id
      for update;
      if not found then raise exception 'PRODUCT_NOT_FOUND:%', v_item.product_id using errcode = 'P0002'; end if;

      v_qty := v_item.base_qty;
      v_available := coalesce(nullif(v_product.metadata->>'stockNonSerial', '')::numeric, v_product.stock, 0);
      if v_doc.document_type = 'goods_out' and v_available < v_qty then
        raise exception 'INSUFFICIENT_STOCK:%:%:%', v_item.product_id, v_available, v_qty using errcode = 'P0001';
      end if;

      update public.products set
        stock = stock + case when v_doc.document_type = 'goods_in' then v_qty else -v_qty end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'stockNonSerial', v_available + case when v_doc.document_type = 'goods_in' then v_qty else -v_qty end
        )
      where id = v_item.product_id and owner_id = p_owner_id;
    end loop;

    if v_doc.document_type = 'goods_out' then
      for v_item in
        select di.id, di.product_id, trim(di.metadata->>'serialNumber') serial_number
        from public.document_items di
        where di.document_id = p_document_id
          and coalesce((di.metadata->>'isSerial')::boolean, false) = true
      loop
        select * into v_serial from public.product_serials
        where owner_id = p_owner_id
          and product_id = v_item.product_id
          and lower(serial_number) = lower(v_item.serial_number)
        for update;
        if not found then raise exception 'SERIAL_NOT_FOUND:%', v_item.serial_number using errcode = 'P0002'; end if;
        if v_serial.status <> 'available' and v_serial.goods_out_document_id is distinct from p_document_id then
          raise exception 'SERIAL_NOT_AVAILABLE:%', v_item.serial_number using errcode = 'P0001';
        end if;
        update public.product_serials set status = 'out', goods_out_document_id = p_document_id,
          goods_out_item_id = v_item.id
        where id = v_serial.id;
      end loop;
    end if;
  end if;

  update public.documents set
    status = 'completed',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'inventoryPosted', true, 'inventoryPostedAt', now()
    )
  where id = p_document_id and owner_id = p_owner_id
  returning * into v_doc;
  return to_jsonb(v_doc);
end;
$$;

create or replace function public.reverse_inventory_document(
  p_owner_id uuid,
  p_document_id uuid,
  p_delete boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
  v_product public.products%rowtype;
  v_item record;
  v_qty numeric;
  v_available numeric;
begin
  select * into v_doc from public.documents
  where id = p_document_id and owner_id = p_owner_id
  for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_doc.status = 'completed' and v_doc.document_type in ('goods_in', 'goods_out') then
    if v_doc.document_type = 'goods_in' and exists (
      select 1 from public.product_serials
      where owner_id = p_owner_id and goods_in_document_id = p_document_id and status = 'out'
    ) then
      raise exception 'GOODS_IN_HAS_DISPATCHED_SERIALS' using errcode = 'P0001';
    end if;

    for v_item in
      select di.product_id,
        sum(coalesce(nullif(di.metadata->>'qtyInput', '')::numeric, di.quantity)
          * coalesce(nullif(di.metadata->>'unitMultiplier', '')::numeric,
              public.inventory_unit_multiplier(p_owner_id, v_doc.warehouse_id, di.metadata->>'qtyUnit'))) base_qty
      from public.document_items di
      where di.document_id = p_document_id and di.product_id is not null
        and coalesce((di.metadata->>'isSerial')::boolean, false) = false
      group by di.product_id order by di.product_id
    loop
      select * into v_product from public.products
      where id = v_item.product_id and owner_id = p_owner_id for update;
      if found then
        v_qty := v_item.base_qty;
        v_available := coalesce(nullif(v_product.metadata->>'stockNonSerial', '')::numeric, v_product.stock, 0);
        if v_doc.document_type = 'goods_in' and v_available < v_qty then
          raise exception 'CANNOT_REVERSE_GOODS_IN_STOCK:%', v_item.product_id using errcode = 'P0001';
        end if;
        update public.products set
          stock = stock + case when v_doc.document_type = 'goods_out' then v_qty else -v_qty end,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'stockNonSerial', v_available + case when v_doc.document_type = 'goods_out' then v_qty else -v_qty end
          )
        where id = v_item.product_id and owner_id = p_owner_id;
      end if;
    end loop;

    if v_doc.document_type = 'goods_out' then
      update public.product_serials set status = 'available', goods_out_document_id = null, goods_out_item_id = null
      where owner_id = p_owner_id and goods_out_document_id = p_document_id;
    else
      delete from public.product_serials
      where owner_id = p_owner_id and goods_in_document_id = p_document_id and status <> 'out';
    end if;
  end if;

  if p_delete then
    delete from public.documents where id = p_document_id and owner_id = p_owner_id;
  else
    update public.documents set status = 'cancelled',
      metadata = (coalesce(metadata, '{}'::jsonb) - 'inventoryPosted') || jsonb_build_object('inventoryReversedAt', now())
    where id = p_document_id and owner_id = p_owner_id returning * into v_doc;
  end if;
  return to_jsonb(v_doc);
end;
$$;

revoke all on function public.complete_inventory_document(uuid, uuid) from public;
revoke all on function public.reverse_inventory_document(uuid, uuid, boolean) from public;
grant execute on function public.complete_inventory_document(uuid, uuid) to service_role;
grant execute on function public.reverse_inventory_document(uuid, uuid, boolean) to service_role;
