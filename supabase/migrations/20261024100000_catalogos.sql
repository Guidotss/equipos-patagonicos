-- supabase/migrations/20261024100000_catalogos.sql
-- Catálogos: datos de la empresa (fila única), firmantes, equipos y plantillas de cotización.

create table public.empresa_config (
  id boolean primary key default true check (id),
  razon_social text not null check (btrim(razon_social) <> ''),
  cuit text check (cuit is null or cuit ~ '^\d{11}$'),
  direccion text not null default '',
  ciudad text not null default '',
  provincia text not null default '',
  telefono text not null default '',
  email text not null default '',
  web text not null default '',
  indice_base text not null default '',
  proxima_actualizacion text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.empresa_config is
  'Fila única con los datos del membrete y los valores por defecto de las cotizaciones (índice base, próxima actualización).';

create table public.firmantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  cargo text not null default '',
  telefono text not null default '',
  email text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  capacidad_tn numeric(6, 1) check (capacidad_tn > 0),
  marca text not null default '',
  modelo text not null default '',
  identificacion text not null default '',
  descripcion text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.equipos.identificacion is 'Número interno o dominio, como figura en los partes.';
comment on column public.equipos.descripcion is 'Texto de "Equipo ofrecido" en las cotizaciones.';

create table public.plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  formato text not null check (formato in ('mensual', 'jornada')),
  asunto text not null default '',
  intro text not null default '',
  bloques jsonb not null default '[]' check (jsonb_typeof(bloques) = 'array'),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  validez_dias integer not null default 30 check (validez_dias between 1 and 365),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.plantillas.bloques is 'Lista de {titulo, contenido}. Formato mínimo y variables {{x}}: ver src/lib/plantillas.';
comment on column public.plantillas.items is 'Ítems precargados sin precio: {seccion, descripcion, unidad, cantidad}.';

create trigger empresa_config_set_updated_at before update on public.empresa_config
  for each row execute function private.set_updated_at();
create trigger firmantes_set_updated_at before update on public.firmantes
  for each row execute function private.set_updated_at();
create trigger equipos_set_updated_at before update on public.equipos
  for each row execute function private.set_updated_at();
create trigger plantillas_set_updated_at before update on public.plantillas
  for each row execute function private.set_updated_at();

alter table public.empresa_config enable row level security;
alter table public.firmantes enable row level security;
alter table public.equipos enable row level security;
alter table public.plantillas enable row level security;

grant select on public.empresa_config to authenticated;
grant update (razon_social, cuit, direccion, ciudad, provincia, telefono, email, web, indice_base, proxima_actualizacion)
  on public.empresa_config to authenticated;
grant select, insert, update on public.firmantes, public.equipos, public.plantillas to authenticated;

create policy "usuarios activos ven la empresa" on public.empresa_config
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "solo un admin modifica la empresa" on public.empresa_config
  for update to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

-- Firmantes, equipos y plantillas: los usuarios activos ven, crean y modifican.
-- No se borran: se desactivan (las cotizaciones los referencian).
create policy "usuarios activos ven firmantes" on public.firmantes
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean firmantes" on public.firmantes
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican firmantes" on public.firmantes
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));

create policy "usuarios activos ven equipos" on public.equipos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean equipos" on public.equipos
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican equipos" on public.equipos
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));

create policy "usuarios activos ven plantillas" on public.plantillas
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos crean plantillas" on public.plantillas
  for insert to authenticated with check ((select private.es_usuario_activo()));
create policy "usuarios activos modifican plantillas" on public.plantillas
  for update to authenticated
  using ((select private.es_usuario_activo()))
  with check ((select private.es_usuario_activo()));
