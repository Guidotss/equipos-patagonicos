-- supabase/migrations/20261023120000_base.sql
-- Base de seguridad: extensiones, privilegios por defecto, schema privado y perfiles de usuario.

-- Búsqueda sin acentos y por similitud (se usan desde el plan 2)
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Nada nuevo en public queda expuesto a anon/authenticated sin un GRANT explícito.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Schema privado: no lo expone la API; aloja helpers de seguridad y triggers.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  rol text not null default 'operador' check (rol in ('admin', 'operador')),
  activo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Usuarios de la app. Los crea un trigger al dar de alta el usuario en Auth y nacen inactivos.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.crear_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.crear_profile();

create or replace function private.es_usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and activo
  );
$$;

create or replace function private.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and activo and rol = 'admin'
  );
$$;

grant execute on function private.es_usuario_activo() to authenticated;
grant execute on function private.es_admin() to authenticated;

alter table public.profiles enable row level security;

grant select, update on public.profiles to authenticated;

create policy "usuarios activos ven los perfiles"
  on public.profiles for select to authenticated
  using ((select private.es_usuario_activo()));

create policy "solo un admin modifica perfiles"
  on public.profiles for update to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));
