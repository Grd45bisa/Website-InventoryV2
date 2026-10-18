create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'admin' check (role in ('super_admin', 'owner', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists phone text;

alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles
set role = case
  when role = 'owner' then 'owner'
  when role = 'super_admin' then 'super_admin'
  else 'admin'
end;

alter table public.profiles
  add constraint profiles_role_check check (role in ('super_admin', 'owner', 'admin'));

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;

create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'admin')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Create the first Super Admin from Supabase Dashboard/Auth API, not by inserting
-- directly into auth.users. After creating the auth user, run:
--
-- update public.profiles
-- set role = 'super_admin', full_name = 'Super Admin'
-- where id = (
--   select id from auth.users where email = 'fahmin@kitapunya.web.id'
-- );
