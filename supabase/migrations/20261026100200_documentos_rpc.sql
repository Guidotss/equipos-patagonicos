-- supabase/migrations/20261026100200_documentos_rpc.sql
-- Escrituras de documentos: registrar, actualizar, archivos, anular y restaurar.

create or replace function private.validar_presupuestos(p_cliente_id uuid, p_presupuestos uuid[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_presupuestos is null or cardinality(p_presupuestos) = 0 then
    raise exception 'Elegí al menos un presupuesto' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(p_presupuestos) as p(id)
    where not exists (
      select 1 from public.cotizaciones c
      where c.id = p.id and c.estado = 'aprobada' and c.cliente_id = p_cliente_id
        and c.presupuesto_estado <> 'anulado'
    )
  ) then
    raise exception 'Los documentos solo se cargan en presupuestos aprobados, no anulados, del mismo cliente' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.reemplazar_presupuestos(p_documento_id uuid, p_presupuestos uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.documento_presupuestos where documento_id = p_documento_id;
  insert into public.documento_presupuestos (documento_id, cotizacion_id)
  select distinct p_documento_id, p.id from unnest(p_presupuestos) as p(id);
end;
$$;

-- Vincula archivos ya subidos a Storage. Tamaño y tipo se leen de Storage, no de lo que diga el navegador.
create or replace function private.adjuntar_archivos(p_documento_id uuid, p_archivos jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_archivo jsonb;
  v_meta jsonb;
  v_orden integer;
begin
  if p_archivos is null or jsonb_typeof(p_archivos) <> 'array' or jsonb_array_length(p_archivos) = 0 then
    raise exception 'Subí al menos un archivo' using errcode = 'P0001';
  end if;

  select coalesce(max(orden), 0) into v_orden from public.documento_archivos where documento_id = p_documento_id;

  for v_archivo in select * from jsonb_array_elements(p_archivos) loop
    if coalesce(left(v_archivo ->> 'path', 11), '') <> 'documentos/' then
      raise exception 'Ruta de archivo inválida' using errcode = 'P0001';
    end if;

    select o.metadata into v_meta
    from storage.objects o
    where o.bucket_id = 'documentos' and o.name = v_archivo ->> 'path';
    if not found then
      raise exception 'No se encontró el archivo subido (%)', coalesce(v_archivo ->> 'nombre_original', v_archivo ->> 'path')
        using errcode = 'P0001';
    end if;

    v_orden := v_orden + 1;
    insert into public.documento_archivos (documento_id, path, nombre_original, mime, tamano, orden)
    values (
      p_documento_id,
      v_archivo ->> 'path',
      coalesce(nullif(btrim(v_archivo ->> 'nombre_original'), ''), 'archivo'),
      v_meta ->> 'mimetype',
      (v_meta ->> 'size')::bigint,
      v_orden
    );
  end loop;
end;
$$;

-- La factura indica qué remitos cubre (reemplaza los anteriores). Un remito se factura una vez:
-- no se le saca a otra factura vigente (sí a una anulada).
create or replace function private.vincular_remitos(p_factura_id uuid, p_cliente_id uuid, p_remitos uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Bloquea los remitos en juego (en orden, para no trabarse con otra factura) antes de mirar a quién apuntan.
  perform 1 from public.documentos
  where factura_id = p_factura_id or id = any (coalesce(p_remitos, '{}'))
  order by id
  for update;

  update public.documentos set factura_id = null
  where factura_id = p_factura_id and not (id = any (coalesce(p_remitos, '{}')));

  if coalesce(cardinality(p_remitos), 0) = 0 then
    return;
  end if;

  if exists (
    select 1 from unnest(p_remitos) as r(id)
    where not exists (
      select 1 from public.documentos d
      where d.id = r.id and d.tipo = 'remito' and d.cliente_id = p_cliente_id and d.deleted_at is null
    )
  ) then
    raise exception 'Algún remito no es de este cliente o está anulado' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.documentos d
    join public.documentos f on f.id = d.factura_id
    where d.id = any (p_remitos) and f.id <> p_factura_id and f.deleted_at is null
  ) then
    raise exception 'Algún remito ya está cubierto por otra factura' using errcode = 'P0001';
  end if;

  update public.documentos set factura_id = p_factura_id where id = any (p_remitos);
end;
$$;

-- La orden de pago indica qué facturas cancela y por cuánto (reemplaza las anteriores).
create or replace function private.aplicar_orden_pago(p_op_id uuid, p_cliente_id uuid, p_monto_op numeric, p_aplicaciones jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_aplicacion record;
  v_saldo numeric;
  v_total numeric := 0;
begin
  if p_aplicaciones is null or jsonb_typeof(p_aplicaciones) <> 'array' then
    raise exception 'Las facturas canceladas tienen que ser una lista' using errcode = 'P0001';
  end if;
  if (select count(*) from jsonb_array_elements(p_aplicaciones)) <>
     (select count(distinct e ->> 'factura_id') from jsonb_array_elements(p_aplicaciones) e) then
    raise exception 'Una factura aparece dos veces en la orden de pago' using errcode = 'P0001';
  end if;

  -- Bloquea las facturas (en orden, para no trabarse con otra OP) antes de leer su saldo: dos órdenes
  -- de pago a la vez sobre la misma factura se esperan y la segunda ve lo que aplicó la primera.
  perform 1 from public.documentos
  where id in (select (e ->> 'factura_id')::uuid from jsonb_array_elements(p_aplicaciones) e)
  order by id
  for update;

  delete from public.op_facturas where op_id = p_op_id;

  for v_aplicacion in
    select (e ->> 'factura_id')::uuid as factura_id, (e ->> 'monto_aplicado')::numeric as monto
    from jsonb_array_elements(p_aplicaciones) e
  loop
    if v_aplicacion.monto is null or v_aplicacion.monto <= 0 then
      raise exception 'El monto aplicado a cada factura tiene que ser mayor a 0' using errcode = 'P0001';
    end if;

    select vf.saldo into v_saldo
    from public.v_facturas vf
    where vf.id = v_aplicacion.factura_id and vf.cliente_id = p_cliente_id and vf.tipo_comprobante <> 'NC';
    if not found then
      raise exception 'Alguna factura no es de este cliente, está anulada o es una nota de crédito' using errcode = 'P0001';
    end if;
    if v_aplicacion.monto > v_saldo then
      raise exception 'El monto aplicado supera el saldo de la factura' using errcode = 'P0001';
    end if;

    insert into public.op_facturas (op_id, factura_id, monto_aplicado)
    values (p_op_id, v_aplicacion.factura_id, v_aplicacion.monto);
    v_total := v_total + v_aplicacion.monto;
  end loop;

  if v_total > p_monto_op then
    raise exception 'Lo aplicado a facturas supera el monto de la orden de pago' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.exigir_vinculos_del_tipo(p_tipo text, p_remitos uuid[], p_aplicaciones jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_aplicaciones is not null and jsonb_typeof(p_aplicaciones) <> 'array' then
    raise exception 'Las facturas canceladas tienen que ser una lista' using errcode = 'P0001';
  end if;
  if p_tipo <> 'factura' and coalesce(cardinality(p_remitos), 0) > 0 then
    raise exception 'Solo una factura cubre remitos' using errcode = 'P0001';
  end if;
  if p_tipo <> 'orden_pago' and jsonb_array_length(coalesce(p_aplicaciones, '[]')) > 0 then
    raise exception 'Solo una orden de pago cancela facturas' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.registrar_documento(
  p_datos jsonb,
  p_presupuestos uuid[],
  p_archivos jsonb,
  p_remitos uuid[] default '{}',
  p_aplicaciones jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.documentos%rowtype;
  v_id uuid;
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.documentos, p_datos);
  if v.cliente_id is null then
    raise exception 'Falta el cliente' using errcode = 'P0001';
  end if;
  perform private.validar_presupuestos(v.cliente_id, p_presupuestos);
  perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);

  insert into public.documentos (
    cliente_id, tipo, numero, fecha, monto, tipo_comprobante, fecha_vencimiento, numero_oc_ref,
    periodo_desde, periodo_hasta, equipo_id, notas
  ) values (
    v.cliente_id, v.tipo, coalesce(btrim(v.numero), ''), coalesce(v.fecha, private.hoy_argentina()), v.monto,
    v.tipo_comprobante, v.fecha_vencimiento, coalesce(btrim(v.numero_oc_ref), ''),
    v.periodo_desde, v.periodo_hasta, v.equipo_id, coalesce(v.notas, '')
  )
  returning id into v_id;

  perform private.reemplazar_presupuestos(v_id, p_presupuestos);
  perform private.adjuntar_archivos(v_id, p_archivos);
  if v.tipo = 'factura' then
    perform private.vincular_remitos(v_id, v.cliente_id, p_remitos);
  elsif v.tipo = 'orden_pago' then
    perform private.aplicar_orden_pago(v_id, v.cliente_id, v.monto, coalesce(p_aplicaciones, '[]'));
  end if;
  return v_id;
end;
$$;

-- Corrige los datos de un documento (incluido el tipo, si no tiene vínculos que dependan de él).
-- El cliente no cambia: el documento sigue siendo del cliente con que se registró (cliente_id en p_datos se ignora).
-- p_datos es el documento completo: reemplaza todos los campos y lo que no venga queda vacío
-- (salvo tipo y fecha, que si faltan conservan el valor anterior).
-- p_presupuestos, p_remitos (factura) y p_aplicaciones (orden de pago) reemplazan los vínculos solo si vienen:
-- null (o no mandarlos) los deja como están.
-- Los presupuestos no pueden quedar vacíos y solo se validan los que se agregan: los que ya estaban se conservan
-- aunque el presupuesto se haya anulado o finalizado después (así se corrige el número de un documento viejo).
-- Para remitos y aplicaciones, una lista vacía los quita todos.
create or replace function public.actualizar_documento(
  p_id uuid,
  p_datos jsonb,
  p_presupuestos uuid[] default null,
  p_remitos uuid[] default null,
  p_aplicaciones jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.documentos%rowtype;
  v public.documentos%rowtype;
  v_cobrado numeric;
  v_presupuestos_nuevos uuid[];
begin
  perform private.exigir_usuario_activo();
  select * into o from public.documentos where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
  end if;

  v := jsonb_populate_record(null::public.documentos, p_datos);
  v.tipo := coalesce(v.tipo, o.tipo);

  if v.tipo <> o.tipo and (
    o.factura_id is not null
    or exists (select 1 from public.documentos r where r.factura_id = p_id)
    or exists (select 1 from public.op_facturas where op_id = p_id or factura_id = p_id)
  ) then
    raise exception 'Para cambiar el tipo, primero quitá los remitos o facturas vinculados' using errcode = 'P0001';
  end if;

  if v.tipo = 'factura' then
    select coalesce(sum(ofa.monto_aplicado), 0) into v_cobrado
    from public.op_facturas ofa
    join public.documentos op on op.id = ofa.op_id and op.deleted_at is null
    where ofa.factura_id = p_id;
    if v.monto < v_cobrado then
      raise exception 'El monto de la factura no puede ser menor a lo ya cobrado' using errcode = 'P0001';
    end if;
  end if;

  -- Si no se reemplazan las aplicaciones, las que ya tiene la OP tienen que seguir entrando en su monto.
  if v.tipo = 'orden_pago' and p_aplicaciones is null
    and v.monto < (select coalesce(sum(monto_aplicado), 0) from public.op_facturas where op_id = p_id) then
    raise exception 'Lo aplicado a facturas supera el monto de la orden de pago' using errcode = 'P0001';
  end if;

  if p_presupuestos is not null then
    if cardinality(p_presupuestos) = 0 then
      raise exception 'Elegí al menos un presupuesto' using errcode = 'P0001';
    end if;
    v_presupuestos_nuevos := array(
      select p.id from unnest(p_presupuestos) as p(id)
      where not exists (
        select 1 from public.documento_presupuestos dp where dp.documento_id = p_id and dp.cotizacion_id = p.id
      )
    );
    if cardinality(v_presupuestos_nuevos) > 0 then
      perform private.validar_presupuestos(o.cliente_id, v_presupuestos_nuevos);
    end if;
  end if;
  perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);

  update public.documentos set
    tipo = v.tipo,
    numero = coalesce(btrim(v.numero), ''),
    fecha = coalesce(v.fecha, o.fecha),
    monto = v.monto,
    tipo_comprobante = v.tipo_comprobante,
    fecha_vencimiento = v.fecha_vencimiento,
    numero_oc_ref = coalesce(btrim(v.numero_oc_ref), ''),
    periodo_desde = v.periodo_desde,
    periodo_hasta = v.periodo_hasta,
    equipo_id = v.equipo_id,
    factura_id = case when v.tipo = 'remito' then o.factura_id end,
    notas = coalesce(v.notas, '')
  where id = p_id;

  if p_presupuestos is not null then
    perform private.reemplazar_presupuestos(p_id, p_presupuestos);
  end if;
  if v.tipo = 'factura' and p_remitos is not null then
    perform private.vincular_remitos(p_id, o.cliente_id, p_remitos);
  elsif v.tipo = 'orden_pago' and p_aplicaciones is not null then
    perform private.aplicar_orden_pago(p_id, o.cliente_id, v.monto, p_aplicaciones);
  end if;
end;
$$;

create or replace function public.agregar_archivos(p_documento_id uuid, p_archivos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  -- Bloquea el documento antes de calcular el orden de las páginas nuevas: dos llamadas a la vez se esperan.
  perform 1 from public.documentos where id = p_documento_id and deleted_at is null for update;
  if not found then
    raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
  end if;
  perform private.adjuntar_archivos(p_documento_id, p_archivos);
end;
$$;

-- Quita un archivo del documento (el archivo queda en Storage). Un documento conserva al menos uno.
create or replace function public.quitar_archivo(p_archivo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_documento uuid;
begin
  perform private.exigir_usuario_activo();
  select documento_id into v_documento from public.documento_archivos where id = p_archivo_id;
  if not found then
    raise exception 'El archivo no existe' using errcode = 'P0001';
  end if;
  -- Bloquea el documento antes de contar sus archivos: dos quitas a la vez se esperan
  -- y la segunda ve lo que quitó la primera.
  perform 1 from public.documentos where id = v_documento and deleted_at is null for update;
  if not found then
    raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
  end if;
  if (select count(*) from public.documento_archivos where documento_id = v_documento) <= 1 then
    raise exception 'Un documento tiene que tener al menos un archivo' using errcode = 'P0001';
  end if;
  delete from public.documento_archivos where id = p_archivo_id;
  if not found then
    raise exception 'El archivo no existe' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.anular_documento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  update public.documentos set deleted_at = now(), deleted_by = (select auth.uid())
  where id = p_id and deleted_at is null;
  if not found then
    raise exception 'El documento no existe o ya está anulado' using errcode = 'P0001';
  end if;
end;
$$;

-- Deshace la anulación. Una orden de pago vuelve solo si lo que aplicaba todavía entra en el saldo de cada factura.
create or replace function public.restaurar_documento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.documentos%rowtype;
begin
  perform private.exigir_usuario_activo();
  select * into o from public.documentos where id = p_id and deleted_at is not null for update;
  if not found then
    raise exception 'El documento no existe o no está anulado' using errcode = 'P0001';
  end if;

  if o.tipo = 'orden_pago' then
    -- Igual que al aplicar una OP: las facturas quedan bloqueadas mientras se mira su saldo.
    perform 1 from public.documentos
    where id in (select ofa.factura_id from public.op_facturas ofa where ofa.op_id = p_id)
    order by id
    for update;

    if exists (
      select 1
      from public.op_facturas ofa
      join public.v_facturas vf on vf.id = ofa.factura_id
      where ofa.op_id = p_id and ofa.monto_aplicado > vf.saldo
    ) then
      raise exception 'No se puede restaurar: alguna factura ya no tiene saldo para esta orden de pago' using errcode = 'P0001';
    end if;
  end if;

  update public.documentos set deleted_at = null, deleted_by = null where id = p_id;
end;
$$;

grant execute on function public.registrar_documento(jsonb, uuid[], jsonb, uuid[], jsonb) to authenticated;
grant execute on function public.actualizar_documento(uuid, jsonb, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.agregar_archivos(uuid, jsonb) to authenticated;
grant execute on function public.quitar_archivo(uuid) to authenticated;
grant execute on function public.anular_documento(uuid) to authenticated;
grant execute on function public.restaurar_documento(uuid) to authenticated;
