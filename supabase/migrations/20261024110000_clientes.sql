-- supabase/migrations/20261024110000_clientes.sql
-- Clientes con contactos y búsqueda sin acentos (razón social, CUIT y nombre de contacto).

create or replace function private.cuit_valido(cuit text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  pesos constant integer[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  suma integer := 0;
  resto integer;
begin
  if cuit is null then
    return true;
  end if;
  if cuit !~ '^\d{11}$' or left(cuit, 2) not in ('20', '23', '24', '25', '26', '27', '30', '33', '34') then
    return false;
  end if;
  for i in 1..10 loop
    suma := suma + pesos[i] * substr(cuit, i, 1)::integer;
  end loop;
  resto := suma % 11;
  if resto = 1 then
    return false;
  end if;
  return (case when resto = 0 then 0 else 11 - resto end) = substr(cuit, 11, 1)::integer;
end;
$$;

-- La usa el CHECK de clientes, que se evalúa con los permisos de quien inserta o modifica
-- (también con CUIT nulo): la app (authenticated) y los scripts con la secret key (service_role).
grant execute on function private.cuit_valido(text) to authenticated, service_role;

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null check (btrim(razon_social) <> ''),
  cuit text check (private.cuit_valido(cuit)),
  condicion_iva text check (condicion_iva in ('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final')),
  direccion text not null default '',
  localidad text not null default '',
  provincia text not null default '',
  telefono text not null default '',
  email text not null default '',
  condicion_pago text not null default '',
  notas text not null default '',
  activo boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.clientes.cuit is 'Solo dígitos (11). Opcional para cotizar a prospectos; único cuando está cargado.';

create unique index clientes_cuit_unico on public.clientes (cuit) where cuit is not null;

create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  cargo text not null default '',
  email text not null default '',
  telefono text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contactos_cliente_id on public.contactos (cliente_id);

create trigger clientes_set_updated_at before update on public.clientes
  for each row execute function private.set_updated_at();
create trigger contactos_set_updated_at before update on public.contactos
  for each row execute function private.set_updated_at();

alter table public.clientes enable row level security;
alter table public.contactos enable row level security;

grant select, insert, update on public.clientes to authenticated;
grant select, insert, update, delete on public.contactos to authenticated;

create policy "usuarios activos ven clientes" on public.clientes
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean clientes" on public.clientes
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican clientes" on public.clientes
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));

create policy "usuarios activos ven contactos" on public.contactos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean contactos" on public.contactos
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican contactos" on public.contactos
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));
create policy "usuarios activos borran contactos" on public.contactos
  for delete to authenticated using ((select private.es_usuario_activo()));

-- SECURITY INVOKER: corre con los permisos (y la RLS) de quien la llama.
create or replace function public.buscar_clientes(texto text default '', limite integer default 50)
returns setof public.clientes
language sql
stable
security invoker
set search_path = ''
as $$
  with consulta as (
    select
      extensions.unaccent(lower(btrim(coalesce(texto, '')))) as normalizado,
      regexp_replace(coalesce(texto, ''), '\D', '', 'g') as digitos
  ),
  patron as (
    select
      normalizado,
      digitos,
      '%' || replace(replace(replace(normalizado, '\', '\\'), '%', '\%'), '_', '\_') || '%' as como
    from consulta
  )
  select c.*
  from public.clientes c, patron p
  where p.normalizado = ''
     or extensions.unaccent(lower(c.razon_social)) like p.como
     or (length(p.digitos) >= 3 and c.cuit like '%' || p.digitos || '%')
     or exists (
       select 1 from public.contactos k
       where k.cliente_id = c.id and extensions.unaccent(lower(k.nombre)) like p.como
     )
  order by c.activo desc, c.razon_social
  limit least(greatest(coalesce(limite, 50), 1), 200);
$$;

grant execute on function public.buscar_clientes(text, integer) to authenticated;
