-- Read-only reconciliation tools for rollout and ongoing monitoring.

create or replace function public.inventory_reconciliation(
  p_owner_id uuid,
  p_warehouse_id uuid
) returns table(
  product_id uuid,
  sku text,
  product_name text,
  stored_non_serial numeric,
  expected_non_serial numeric,
  difference numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with movements as (
    select di.product_id,
      sum(
        case d.document_type when 'goods_in' then 1 when 'goods_out' then -1 else 0 end
        * coalesce(nullif(di.metadata->>'baseQuantity', '')::numeric,
            coalesce(nullif(di.metadata->>'qtyInput', '')::numeric, di.quantity)
            * coalesce(nullif(di.metadata->>'unitMultiplier', '')::numeric,
                public.inventory_unit_multiplier(d.owner_id, d.warehouse_id, di.metadata->>'qtyUnit')))
      ) expected
    from public.documents d
    join public.document_items di on di.document_id = d.id
    where d.owner_id = p_owner_id
      and (p_warehouse_id is null or d.warehouse_id = p_warehouse_id)
      and d.status = 'completed'
      and d.document_type in ('goods_in', 'goods_out')
      and di.product_id is not null
      and coalesce((di.metadata->>'isSerial')::boolean, false) = false
    group by di.product_id
  )
  select p.id, p.sku, p.name,
    coalesce(nullif(p.metadata->>'stockNonSerial', '')::numeric, p.stock, 0),
    coalesce(m.expected, 0),
    coalesce(nullif(p.metadata->>'stockNonSerial', '')::numeric, p.stock, 0) - coalesce(m.expected, 0)
  from public.products p
  left join movements m on m.product_id = p.id
  where p.owner_id = p_owner_id
    and (p_warehouse_id is null or p.warehouse_id = p_warehouse_id)
  order by abs(coalesce(nullif(p.metadata->>'stockNonSerial', '')::numeric, p.stock, 0) - coalesce(m.expected, 0)) desc,
    p.name;
$$;

revoke all on function public.inventory_reconciliation(uuid, uuid) from public;
grant execute on function public.inventory_reconciliation(uuid, uuid) to service_role;

