-- supabase/migrations/20261026100000_documentos.sql
-- Documentos del circuito de venta: orden de compra (del cliente), remito, factura y orden de pago (del cliente).
-- Cada documento es de un cliente, tiene uno o más archivos y se vincula a uno o más presupuestos (N:M).
-- La app solo LEE estas tablas: las escrituras pasan por funciones SECURITY DEFINER (archivo *_rpc.sql).

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  tipo text not null check (tipo in ('orden_compra', 'remito', 'factura', 'orden_pago')),
  numero text not null default '',
  -- Para buscar: sin mayúsculas, sin separadores y sin ceros a la izquierda ("0001-00012345" → "100012345").
  numero_normalizado text generated always as (ltrim(regexp_replace(lower(numero), '[^a-z0-9]', '', 'g'), '0')) stored,
  fecha date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  monto numeric(14, 2) check (monto > 0),
  -- factura
  tipo_comprobante text check (tipo_comprobante in ('FA', 'FCE_A', 'FB', 'ND', 'NC')),
  fecha_vencimiento date,
  numero_oc_ref text not null default '',
  -- remito
  periodo_desde date,
  periodo_hasta date,
  equipo_id uuid references public.equipos (id),
  factura_id uuid references public.documentos (id),
  notas text not null default '',
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documentos_monto_requerido check (tipo not in ('factura', 'orden_pago') or monto is not null),
  constraint documentos_comprobante_requerido check (tipo <> 'factura' or tipo_comprobante is not null),
  constraint documentos_campos_de_factura check (
    tipo = 'factura' or (tipo_comprobante is null and fecha_vencimiento is null and numero_oc_ref = '')
  ),
  constraint documentos_campos_de_remito check (
    tipo = 'remito' or (periodo_desde is null and periodo_hasta is null and equipo_id is null and factura_id is null)
  ),
  constraint documentos_periodo check (periodo_desde is null or periodo_hasta is null or periodo_desde <= periodo_hasta)
);

comment on column public.documentos.monto is 'Factura: total con IVA. Orden de pago: importe cancelado (bruto, incluye retenciones).';
comment on column public.documentos.factura_id is 'Solo remitos: la factura que lo cubre.';
comment on column public.documentos.deleted_at is 'Borrado lógico ("anulado"): los archivos nunca se borran.';

create index documentos_cliente_tipo on public.documentos (cliente_id, tipo);
create index documentos_numero_normalizado on public.documentos (numero_normalizado);
create index documentos_factura_id on public.documentos (factura_id);

create table public.documento_archivos (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos (id) on delete cascade,
  path text not null unique check (left(path, 11) = 'documentos/'),
  nombre_original text not null check (btrim(nombre_original) <> ''),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  tamano bigint not null check (tamano > 0 and tamano <= 10485760),
  orden integer not null check (orden > 0),
  created_at timestamptz not null default now(),
  -- También sirve de índice para listar los archivos de un documento en orden.
  constraint documento_archivos_orden_unico unique (documento_id, orden)
);

-- Un documento cubre uno o más presupuestos (una OC abierta, una OP que paga facturas de varios).
-- Si se borra una cotización (solo posible sin documentos activos), sus vínculos se van con ella.
create table public.documento_presupuestos (
  documento_id uuid not null references public.documentos (id) on delete cascade,
  cotizacion_id uuid not null references public.cotizaciones (id) on delete cascade,
  primary key (documento_id, cotizacion_id)
);

create index documento_presupuestos_cotizacion on public.documento_presupuestos (cotizacion_id);

-- Qué facturas cancela cada orden de pago y por cuánto.
create table public.op_facturas (
  op_id uuid not null references public.documentos (id) on delete cascade,
  factura_id uuid not null references public.documentos (id),
  monto_aplicado numeric(14, 2) not null check (monto_aplicado > 0),
  primary key (op_id, factura_id)
);

create index op_facturas_factura on public.op_facturas (factura_id);

create trigger documentos_set_updated_at before update on public.documentos
  for each row execute function private.set_updated_at();

-- Integridad que no pueden expresar los CHECK (miran otras filas).

create or replace function private.validar_vinculo_presupuesto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.cotizaciones c
    join public.documentos d on d.id = new.documento_id
    where c.id = new.cotizacion_id and c.estado = 'aprobada' and c.cliente_id = d.cliente_id
  ) then
    raise exception 'Un documento solo se vincula a presupuestos aprobados de su mismo cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger documento_presupuestos_validar
  before insert or update on public.documento_presupuestos
  for each row execute function private.validar_vinculo_presupuesto();

create or replace function private.validar_factura_de_remito()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.factura_id is not null and not exists (
    select 1 from public.documentos f
    where f.id = new.factura_id and f.tipo = 'factura' and f.cliente_id = new.cliente_id
  ) then
    raise exception 'Un remito solo se vincula a una factura del mismo cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger documentos_validar_factura_de_remito
  before insert or update of factura_id, cliente_id on public.documentos
  for each row execute function private.validar_factura_de_remito();

create or replace function private.validar_aplicacion_op()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.documentos op
    join public.documentos f on f.id = new.factura_id
    where op.id = new.op_id and op.tipo = 'orden_pago' and f.tipo = 'factura'
      and f.tipo_comprobante <> 'NC' and f.cliente_id = op.cliente_id
  ) then
    raise exception 'Una orden de pago solo cancela facturas (no notas de crédito) del mismo cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger op_facturas_validar
  before insert or update on public.op_facturas
  for each row execute function private.validar_aplicacion_op();

-- Lo mismo visto desde el documento referenciado: si cambia de tipo, de comprobante o de cliente, lo que
-- depende de él (OP aplicadas, remitos cubiertos, vínculos a presupuestos) tiene que seguir siendo válido.
-- Y un anulado solo vuelve si sigue colgando de presupuestos aprobados de su cliente: mientras estuvo
-- anulado, la aprobación se pudo revertir (y la cotización borrarse, con sus vínculos).
create or replace function private.validar_cambio_de_documento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.tipo, new.tipo_comprobante, new.cliente_id) is distinct from (old.tipo, old.tipo_comprobante, old.cliente_id) then
    if exists (
      select 1
      from public.op_facturas ofa
      join public.documentos op on op.id = ofa.op_id
      where ofa.factura_id = new.id
        and (new.tipo = 'factura' and new.tipo_comprobante <> 'NC' and new.cliente_id = op.cliente_id) is not true
    ) then
      raise exception 'La factura tiene órdenes de pago aplicadas: tiene que seguir siendo una factura (no nota de crédito) del mismo cliente'
        using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.op_facturas ofa
      join public.documentos f on f.id = ofa.factura_id
      where ofa.op_id = new.id and (new.tipo = 'orden_pago' and new.cliente_id = f.cliente_id) is not true
    ) then
      raise exception 'La orden de pago cancela facturas: tiene que seguir siendo una orden de pago del mismo cliente'
        using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.documentos r
      where r.factura_id = new.id and (new.tipo = 'factura' and new.cliente_id = r.cliente_id) is not true
    ) then
      raise exception 'La factura cubre remitos: tiene que seguir siendo una factura del mismo cliente' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.documento_presupuestos dp
      join public.cotizaciones c on c.id = dp.cotizacion_id
      where dp.documento_id = new.id and c.cliente_id <> new.cliente_id
    ) then
      raise exception 'El documento está vinculado a presupuestos de otro cliente' using errcode = 'P0001';
    end if;
  end if;

  if old.deleted_at is not null and new.deleted_at is null and (
    not exists (select 1 from public.documento_presupuestos dp where dp.documento_id = new.id)
    or exists (
      select 1
      from public.documento_presupuestos dp
      join public.cotizaciones c on c.id = dp.cotizacion_id
      where dp.documento_id = new.id and (c.estado = 'aprobada' and c.cliente_id = new.cliente_id) is not true
    )
  ) then
    raise exception 'No se puede restaurar: el documento tiene que seguir vinculado a presupuestos aprobados de su mismo cliente'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger documentos_validar_cambio
  before update of tipo, tipo_comprobante, cliente_id, deleted_at on public.documentos
  for each row execute function private.validar_cambio_de_documento();

alter table public.documentos enable row level security;
alter table public.documento_archivos enable row level security;
alter table public.documento_presupuestos enable row level security;
alter table public.op_facturas enable row level security;

grant select on public.documentos, public.documento_archivos, public.documento_presupuestos, public.op_facturas to authenticated;

create policy "usuarios activos ven documentos" on public.documentos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos ven archivos de documentos" on public.documento_archivos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos ven vínculos de documentos" on public.documento_presupuestos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos ven aplicaciones de órdenes de pago" on public.op_facturas
  for select to authenticated using ((select private.es_usuario_activo()));
