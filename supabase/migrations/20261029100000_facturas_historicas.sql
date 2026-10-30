-- Las facturas históricas conservan su evidencia y un cobro confirmado, sin inventar OP ni fecha de pago.
create table public.facturas_historicas (
  factura_id uuid primary key references public.documentos (id),
  cotizacion_id uuid not null unique references public.cotizaciones (id),
  clave_origen text generated always as (
    (entrada ->> 'emisor_cuit') || ':FA:' || (entrada ->> 'numero')
  ) stored not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  lote text not null check (btrim(lote) <> ''),
  cobrado numeric(14, 2) not null check (cobrado > 0),
  confirmacion_cobro text not null check (btrim(confirmacion_cobro) <> ''),
  entrada jsonb not null check (jsonb_typeof(entrada) = 'object'),
  registrado_at timestamptz not null default now()
);

comment on column public.facturas_historicas.registrado_at is
  'Fecha de registro de la importación; no es una fecha de cobro.';
comment on column public.facturas_historicas.cobrado is
  'Cobro histórico confirmado por el usuario, sin comprobante OP ni fecha de pago acreditados.';
comment on column public.facturas_historicas.entrada is
  'Payload íntegro de importación, incluida la evidencia original; un reintento debe ser idéntico.';

alter table public.facturas_historicas enable row level security;
revoke all on public.facturas_historicas from public, anon, authenticated;
grant select on public.facturas_historicas to authenticated;
grant all on public.facturas_historicas to service_role;
create policy "usuarios activos ven facturas históricas" on public.facturas_historicas
  for select to authenticated using ((select private.es_usuario_activo()));

-- Conserva las columnas y sus tipos para los consumidores de ambas vistas y las colas de cobranza.
create or replace view public.v_facturas with (security_invoker = true) as
select
  f.id,
  f.cliente_id,
  f.numero,
  f.fecha,
  f.fecha_vencimiento,
  f.tipo_comprobante,
  f.monto,
  coalesce(a.aplicado, 0) + coalesce(h.cobrado, 0) as cobrado,
  case when f.tipo_comprobante = 'NC' then 0
    else f.monto - coalesce(a.aplicado, 0) - coalesce(h.cobrado, 0) end as saldo,
  case
    when f.tipo_comprobante = 'NC' then 'no_aplica'
    when f.monto - coalesce(a.aplicado, 0) - coalesce(h.cobrado, 0) <= 0 then 'cobrada'
    when coalesce(a.aplicado, 0) + coalesce(h.cobrado, 0) > 0 then 'parcial'
    when f.fecha_vencimiento < (now() at time zone 'America/Argentina/Buenos_Aires')::date then 'vencida'
    else 'pendiente'
  end as estado_cobro
from public.documentos f
left join public.facturas_historicas h on h.factura_id = f.id
left join lateral (
  select sum(ofa.monto_aplicado) as aplicado
  from public.op_facturas ofa
  join public.documentos op on op.id = ofa.op_id and op.deleted_at is null
  where ofa.factura_id = f.id
) a on true
where f.tipo = 'factura' and f.deleted_at is null;

create or replace function private.proteger_factura_historica()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_cobrado numeric;
begin
  select cobrado into v_cobrado from public.facturas_historicas where factura_id = old.id;
  if not found then return new; end if;
  if (new.id, new.cliente_id, new.tipo, new.numero, new.fecha, new.monto,
      new.tipo_comprobante, new.fecha_vencimiento, new.numero_oc_ref)
     is distinct from
     (old.id, old.cliente_id, old.tipo, old.numero, old.fecha, old.monto,
      old.tipo_comprobante, old.fecha_vencimiento, old.numero_oc_ref) then
    raise exception 'Los datos de la factura histórica están protegidos; conservá el comprobante original'
      using errcode = 'P0001';
  end if;
  if old.deleted_at is not null and new.deleted_at is null and new.monto < v_cobrado + (
    select coalesce(sum(ofa.monto_aplicado), 0)
    from public.op_facturas ofa
    join public.documentos op on op.id = ofa.op_id and op.deleted_at is null
    where ofa.factura_id = old.id
  ) then
    raise exception 'No se puede restaurar: el cobro histórico y las órdenes de pago superan el monto de la factura'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger documentos_proteger_historica before update on public.documentos
  for each row execute function private.proteger_factura_historica();

create or replace function public.importar_factura_historica(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_clave text;
  v_campo text;
  v_valor text;
  v_item jsonb;
  v_total_items numeric := 0;
  v_neto numeric;
  v_monto numeric;
  v_cotizacion uuid;
  v_numero_presupuesto bigint;
  v_factura uuid;
  v_notas text;
  v_existente public.facturas_historicas%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'La importación histórica requiere service_role' using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'Los datos de la factura histórica tienen que ser un objeto' using errcode = 'P0001';
  end if;
  if coalesce(p_datos ->> 'emisor_cuit', '') !~ '^[0-9]{11}$'
     or coalesce(p_datos ->> 'numero', '') !~ '^[0-9]{5}-[0-9]{8}$' then
    raise exception 'Ingresá CUIT emisor y número completo de factura (00002-00001307)' using errcode = 'P0001';
  end if;
  v_clave := (p_datos ->> 'emisor_cuit') || ':FA:' || (p_datos ->> 'numero');
  perform pg_advisory_xact_lock(hashtextextended(v_clave, 0));

  select * into v_existente from public.facturas_historicas where clave_origen = v_clave;
  if found then
    if v_existente.entrada is distinct from p_datos then
      raise exception 'Conflicto de importación: la factura ya tiene otra entrada o evidencia' using errcode = 'P0001';
    end if;
    -- No recrear documentos anulados, presupuestos modificados ni vínculos/archivos retirados.
    perform 1 from public.documentos where id = v_existente.factura_id for update;
    select c.numero into v_numero_presupuesto
    from public.cotizaciones c
    join public.documentos d on d.id = v_existente.factura_id
    where c.id = v_existente.cotizacion_id and c.origen = 'directa'
      and c.estado = 'aprobada' and c.presupuesto_estado = 'finalizado'
      and c.cliente_id = (p_datos ->> 'cliente_id')::uuid
      and c.fecha = (p_datos ->> 'fecha')::date and c.fecha_aprobacion = c.fecha
      and c.datos = jsonb_build_object('periodo_desde', p_datos -> 'periodo_desde', 'periodo_hasta', p_datos -> 'periodo_hasta')
      and d.deleted_at is null and d.tipo = 'factura' and d.tipo_comprobante = 'FA'
      and d.numero = p_datos ->> 'numero' and d.cliente_id = c.cliente_id
      and d.fecha = c.fecha and d.fecha_vencimiento is not distinct from (p_datos ->> 'fecha_vencimiento')::date
      and d.monto = (p_datos ->> 'monto')::numeric
      and (select count(*) from public.documento_presupuestos dp where dp.documento_id = d.id) = 1
      and exists (select 1 from public.documento_presupuestos dp where dp.documento_id = d.id and dp.cotizacion_id = c.id)
      and exists (select 1 from public.documento_archivos a where a.documento_id = d.id
        and a.path = p_datos -> 'archivo' ->> 'path' and a.mime = 'application/pdf')
      and (select jsonb_agg(jsonb_build_object('descripcion', i.descripcion, 'cantidad', i.cantidad,
             'precio_unitario', i.precio_unitario, 'unidad', i.unidad) order by i.orden)
           from public.cotizacion_items i where i.cotizacion_id = c.id)
          = (select jsonb_agg(jsonb_build_object('descripcion', i ->> 'descripcion', 'cantidad', (i ->> 'cantidad')::numeric,
             'precio_unitario', (i ->> 'precio_unitario')::numeric, 'unidad', i ->> 'unidad') order by orden)
             from jsonb_array_elements(p_datos -> 'items') with ordinality as t(i, orden))
    for share of c;
    if not found then
      raise exception 'Conflicto de importación: la factura o el presupuesto importados fueron alterados o anulados'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object('factura_id', v_existente.factura_id, 'presupuesto_id', v_existente.cotizacion_id,
      'numero_presupuesto', v_numero_presupuesto, 'ya_importada', true);
  end if;

  if coalesce(p_datos ->> 'cliente_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Cliente inválido' using errcode = 'P0001';
  end if;
  v_cliente := (p_datos ->> 'cliente_id')::uuid;
  if not exists (select 1 from public.clientes where id = v_cliente) then
    raise exception 'El cliente no existe' using errcode = 'P0001';
  end if;
  foreach v_campo in array array['fecha', 'fecha_vencimiento', 'periodo_desde', 'periodo_hasta'] loop
    v_valor := p_datos ->> v_campo;
    if (v_campo = 'fecha' and v_valor is null) or (v_valor is not null and
       (v_valor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not pg_input_is_valid(v_valor, 'date'))) then
      raise exception 'Fecha inválida (%)', v_campo using errcode = 'P0001';
    end if;
  end loop;
  if (p_datos ->> 'periodo_desde')::date > (p_datos ->> 'periodo_hasta')::date then
    raise exception 'El período termina antes de empezar' using errcode = 'P0001';
  end if;
  foreach v_campo in array array['neto', 'iva', 'otros_tributos', 'monto'] loop
    v_valor := p_datos ->> v_campo;
    if coalesce(v_valor, '') !~ '^0*[0-9]{1,12}(\.[0-9]{1,2})?$' then
      raise exception 'Importe inválido (%): hasta 12 enteros y 2 decimales', v_campo using errcode = 'P0001';
    end if;
  end loop;
  v_neto := (p_datos ->> 'neto')::numeric;
  v_monto := (p_datos ->> 'monto')::numeric;
  if v_neto <= 0 or v_monto <= 0
     or v_neto + (p_datos ->> 'iva')::numeric + (p_datos ->> 'otros_tributos')::numeric <> v_monto then
    raise exception 'El neto, IVA y otros tributos no coinciden con el monto positivo de la factura' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_datos -> 'items') is distinct from 'array' then
    raise exception 'Los ítems tienen que ser una lista' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_datos -> 'items') not between 1 and 200 then
    raise exception 'La factura debe tener entre 1 y 200 ítems' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(p_datos -> 'items') loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'descripcion') is distinct from 'string'
       or coalesce(btrim(v_item ->> 'descripcion'), '') = ''
       or coalesce(v_item ->> 'unidad', '') not in ('UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE')
       or coalesce(v_item ->> 'cantidad', '') !~ '^0*[0-9]{1,10}(\.[0-9]{1,2})?$'
       or coalesce(v_item ->> 'precio_unitario', '') !~ '^0*[0-9]{1,12}(\.[0-9]{1,2})?$' then
      raise exception 'Ítem inválido: revisá descripción, unidad, cantidad y precio con hasta 2 decimales' using errcode = 'P0001';
    end if;
    if (v_item ->> 'cantidad')::numeric <= 0 or (v_item ->> 'precio_unitario')::numeric <= 0 then
      raise exception 'La cantidad y el precio deben ser positivos' using errcode = 'P0001';
    end if;
    v_total_items := v_total_items + round((v_item ->> 'cantidad')::numeric * (v_item ->> 'precio_unitario')::numeric, 2);
  end loop;
  if v_total_items <> v_neto then
    raise exception 'La suma de los ítems no coincide con el neto de la factura' using errcode = 'P0001';
  end if;
  if coalesce(p_datos ->> 'sha256', '') !~* '^[0-9a-f]{64}$'
     or jsonb_typeof(p_datos -> 'lote') is distinct from 'string' or btrim(p_datos ->> 'lote') = ''
     or jsonb_typeof(p_datos -> 'confirmacion_cobro') is distinct from 'string' or btrim(p_datos ->> 'confirmacion_cobro') = ''
     or jsonb_typeof(p_datos -> 'fuente') is distinct from 'object'
     or (p_datos ? 'notas' and jsonb_typeof(p_datos -> 'notas') is distinct from 'string') then
    raise exception 'Faltan SHA-256, lote, evidencia o confirmación de cobro válidos' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_datos -> 'archivo') is distinct from 'object'
     or coalesce(p_datos -> 'archivo' ->> 'path', '') !~ '\.pdf$' then
    raise exception 'Adjuntá el PDF original de la factura' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.documentos where tipo = 'factura' and tipo_comprobante = 'FA'
    and numero_normalizado = ltrim(regexp_replace(lower(p_datos ->> 'numero'), '[^a-z0-9]', '', 'g'), '0')) then
    raise exception 'Conflicto de importación: ya existe una factura FA con ese número, incluso si está anulada'
      using errcode = 'P0001';
  end if;

  v_notas := concat_ws(E'\n', nullif(p_datos ->> 'notas', ''),
    'Presupuesto reconstruido desde factura histórica. Fecha y fecha de aprobación usan la emisión como referencia; no acreditan la aprobación original.',
    'Cobro histórico confirmado por el usuario: ' || (p_datos ->> 'confirmacion_cobro') || '. Sin OP ni fecha de pago acreditadas.');
  insert into public.cotizaciones (origen, fecha, cliente_id, formato, asunto, datos, notas)
  values ('directa', (p_datos ->> 'fecha')::date, v_cliente, 'jornada',
    'Servicio histórico — factura FA ' || (p_datos ->> 'numero'),
    jsonb_build_object('periodo_desde', p_datos -> 'periodo_desde', 'periodo_hasta', p_datos -> 'periodo_hasta'), v_notas)
  returning id, numero into v_cotizacion, v_numero_presupuesto;
  perform private.reemplazar_items(v_cotizacion, p_datos -> 'items');
  update public.cotizaciones set estado = 'aprobada', fecha_aprobacion = (p_datos ->> 'fecha')::date,
    presupuesto_estado = 'finalizado' where id = v_cotizacion;

  insert into public.documentos (cliente_id, tipo, numero, fecha, monto, tipo_comprobante, fecha_vencimiento, notas)
  values (v_cliente, 'factura', p_datos ->> 'numero', (p_datos ->> 'fecha')::date, v_monto, 'FA',
    (p_datos ->> 'fecha_vencimiento')::date, v_notas)
  returning id into v_factura;
  insert into public.documento_presupuestos (documento_id, cotizacion_id) values (v_factura, v_cotizacion);
  perform private.adjuntar_archivos(v_factura, jsonb_build_array(p_datos -> 'archivo'));
  if not exists (select 1 from public.documento_archivos where documento_id = v_factura and mime = 'application/pdf') then
    raise exception 'El archivo original debe ser un PDF válido' using errcode = 'P0001';
  end if;
  insert into public.facturas_historicas (factura_id, cotizacion_id, sha256, lote, cobrado, confirmacion_cobro, entrada)
  values (v_factura, v_cotizacion, lower(p_datos ->> 'sha256'), p_datos ->> 'lote', v_monto, p_datos ->> 'confirmacion_cobro', p_datos);
  return jsonb_build_object('factura_id', v_factura, 'presupuesto_id', v_cotizacion,
    'numero_presupuesto', v_numero_presupuesto, 'ya_importada', false);
end;
$$;

revoke all on function public.importar_factura_historica(jsonb) from public, anon, authenticated;
grant execute on function public.importar_factura_historica(jsonb) to service_role;
