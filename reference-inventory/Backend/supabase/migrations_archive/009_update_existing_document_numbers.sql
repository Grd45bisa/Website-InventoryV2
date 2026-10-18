-- Migrate existing Invoices (NOTA No: X) to new format (NOTA/YYYYMM/SEQ)
with numbered_invoices as (
  select 
    id,
    issue_date,
    row_number() over (
      partition by owner_id, date_trunc('month', issue_date) 
      order by created_at asc, id asc
    ) as seq_num
  from public.documents
  where document_type = 'invoice' 
    and (document_number like 'NOTA No:%' or document_number not like 'NOTA/%')
)
update public.documents d
set document_number = 'NOTA/' || to_char(d.issue_date, 'YYYYMM') || '/' || lpad(nd.seq_num::text, 4, '0')
from numbered_invoices nd
where d.id = nd.id;

-- Migrate existing Goods In (GIN-X) to new format (WH/IN/YYYYMMDD/SEQ)
with numbered_goods_in as (
  select 
    id,
    issue_date,
    row_number() over (
      partition by owner_id, date_trunc('month', issue_date) 
      order by created_at asc, id asc
    ) as seq_num
  from public.documents
  where document_type = 'goods_in'
    and (document_number like 'GIN-%' or document_number not like 'WH/IN/%')
)
update public.documents d
set document_number = 'WH/IN/' || to_char(d.issue_date, 'YYYYMMDD') || '/' || lpad(nd.seq_num::text, 4, '0')
from numbered_goods_in nd
where d.id = nd.id;

-- Migrate existing Goods Out (GOUT-X) to new format (WH/OUT/YYYYMMDD/SEQ)
with numbered_goods_out as (
  select 
    id,
    issue_date,
    row_number() over (
      partition by owner_id, date_trunc('month', issue_date) 
      order by created_at asc, id asc
    ) as seq_num
  from public.documents
  where document_type = 'goods_out'
    and (document_number like 'GOUT-%' or document_number not like 'WH/OUT/%')
)
update public.documents d
set document_number = 'WH/OUT/' || to_char(d.issue_date, 'YYYYMMDD') || '/' || lpad(nd.seq_num::text, 4, '0')
from numbered_goods_out nd
where d.id = nd.id;

-- Migrate existing Receipts to new format (KWI/YYYYMM/SEQ)
with numbered_receipts as (
  select 
    id,
    issue_date,
    row_number() over (
      partition by owner_id, date_trunc('month', issue_date) 
      order by created_at asc, id asc
    ) as seq_num
  from public.documents
  where document_type = 'receipt'
    and (document_number like 'RCT-%' or document_number not like 'KWI/%')
)
update public.documents d
set document_number = 'KWI/' || to_char(d.issue_date, 'YYYYMM') || '/' || lpad(nd.seq_num::text, 4, '0')
from numbered_receipts nd
where d.id = nd.id;

-- Migrate existing Delivery Notes to new format (SJ/YYYYMM/SEQ)
with numbered_delivery as (
  select 
    id,
    issue_date,
    row_number() over (
      partition by owner_id, date_trunc('month', issue_date) 
      order by created_at asc, id asc
    ) as seq_num
  from public.documents
  where document_type = 'delivery_note'
    and (document_number like 'DN-%' or document_number not like 'SJ/%')
)
update public.documents d
set document_number = 'SJ/' || to_char(d.issue_date, 'YYYYMM') || '/' || lpad(nd.seq_num::text, 4, '0')
from numbered_delivery nd
where d.id = nd.id;
