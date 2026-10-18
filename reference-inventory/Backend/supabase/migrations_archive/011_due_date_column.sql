-- Add due_date column if not exists, then change to timestamptz for datetime support
alter table if exists public.documents
  add column if not exists due_date timestamptz;

-- If column already exists as date type, alter it to timestamptz
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'due_date'
      and data_type = 'date'
  ) then
    alter table public.documents alter column due_date type timestamptz using due_date::timestamptz;
  end if;
end $$;
