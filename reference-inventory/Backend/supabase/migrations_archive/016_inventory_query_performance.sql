-- Query paths used by Goods In / Goods Out list and barcode workflows.

create index if not exists documents_inventory_list_idx
  on public.documents(owner_id, warehouse_id, document_type, created_at desc);

create index if not exists documents_inventory_status_list_idx
  on public.documents(owner_id, warehouse_id, document_type, status, created_at desc);

create index if not exists product_serials_exact_lookup_idx
  on public.product_serials(owner_id, warehouse_id, lower(serial_number));

create index if not exists product_serials_goods_in_idx
  on public.product_serials(owner_id, warehouse_id, goods_in_document_id)
  where goods_in_document_id is not null;

create index if not exists product_serials_goods_out_idx
  on public.product_serials(owner_id, warehouse_id, goods_out_document_id)
  where goods_out_document_id is not null;

create or replace function public.goods_in_serial_counts(
  p_owner_id uuid,
  p_warehouse_id uuid
) returns table(document_id uuid, serial_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select goods_in_document_id, count(*)
  from public.product_serials
  where owner_id = p_owner_id
    and (p_warehouse_id is null or warehouse_id = p_warehouse_id)
    and goods_in_document_id is not null
  group by goods_in_document_id;
$$;

create or replace function public.lookup_product_serial(
  p_owner_id uuid,
  p_warehouse_id uuid,
  p_serial_number text
) returns setof public.product_serials
language sql
stable
security definer
set search_path = public
as $$
  select serial.*
  from public.product_serials serial
  where serial.owner_id = p_owner_id
    and (p_warehouse_id is null or serial.warehouse_id = p_warehouse_id)
    and lower(serial.serial_number) = lower(trim(p_serial_number))
  limit 1;
$$;

revoke all on function public.goods_in_serial_counts(uuid, uuid) from public;
grant execute on function public.goods_in_serial_counts(uuid, uuid) to service_role;
revoke all on function public.lookup_product_serial(uuid, uuid, text) from public;
grant execute on function public.lookup_product_serial(uuid, uuid, text) to service_role;
