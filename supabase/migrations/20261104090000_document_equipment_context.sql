-- Los remitos administrativos heredan el equipo común de los presupuestos seleccionados.
-- No modifica registros históricos ni el circuito de recepción de remitos desde obra.
create or replace function private.derive_document_equipment(p_budget_ids uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  equipment_ids uuid[];
begin
  -- Mantiene estable el equipo mientras se registra o convierte el documento.
  perform 1 from public.cotizaciones where id = any(p_budget_ids) order by id for share;
  equipment_ids := array(
    select distinct c.equipo_id from public.cotizaciones c where c.id = any(p_budget_ids)
  );
  -- DISTINCT conserva el nulo: mezclar un presupuesto sin equipo con otro asignado también es ambiguo.
  if cardinality(equipment_ids) > 1 then
    raise exception 'Los presupuestos seleccionados tienen equipos diferentes. Creá remitos separados para cada equipo y para los presupuestos sin equipo asignado.'
      using errcode = 'P0001';
  end if;
  return equipment_ids[1];
end;
$$;
revoke all on function private.derive_document_equipment(uuid[]) from public, anon, authenticated;

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
  input_data jsonb;
begin
  perform private.exigir_usuario_activo();
  -- El equipo del remito se obtiene del presupuesto; ningún valor enviado por el navegador lo reemplaza.
  input_data := case when p_datos ->> 'tipo' = 'remito' and jsonb_typeof(p_datos) = 'object'
    then p_datos - 'equipo_id' else p_datos end;
  perform private.validar_datos_documento(input_data ->> 'tipo', input_data);
  v := private.leer_datos_documento(input_data);
  if v.cliente_id is null then
    raise exception 'Falta el cliente' using errcode = 'P0001';
  end if;
  perform private.validar_presupuestos(v.cliente_id, p_presupuestos);
  if v.tipo = 'remito' then
    v.equipo_id := private.derive_document_equipment(p_presupuestos);
  end if;
  perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);

  -- Los campos que no son del tipo se descartan (los CHECK documentos_campos_de_* no los aceptan).
  insert into public.documentos (
    cliente_id, tipo, numero, fecha, monto, tipo_comprobante, fecha_vencimiento, numero_oc_ref,
    periodo_desde, periodo_hasta, equipo_id, notas
  ) values (
    v.cliente_id, v.tipo, coalesce(btrim(v.numero), ''), v.fecha, v.monto,
    case when v.tipo = 'factura' then v.tipo_comprobante end,
    case when v.tipo = 'factura' then v.fecha_vencimiento end,
    case when v.tipo = 'factura' then coalesce(btrim(v.numero_oc_ref), '') else '' end,
    case when v.tipo = 'remito' then v.periodo_desde end,
    case when v.tipo = 'remito' then v.periodo_hasta end,
    case when v.tipo = 'remito' then v.equipo_id end,
    coalesce(v.notas, '')
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
  input_data jsonb;
begin
  perform private.exigir_usuario_activo();
  select * into o from public.documentos where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
  end if;

  -- Se conserva la validación vigente de fechas, montos y textos; el equipo del remito no es editable.
  input_data := case when coalesce(p_datos ->> 'tipo', o.tipo) = 'remito' and jsonb_typeof(p_datos) = 'object'
    then p_datos - 'equipo_id' else p_datos end;
  perform private.validar_datos_documento(coalesce(input_data ->> 'tipo', o.tipo), input_data);
  v := private.leer_datos_documento(input_data);
  v.tipo := coalesce(v.tipo, o.tipo);

  -- Un remito cubierto por una factura anulada cuenta como libre (igual que en vincular_remitos).
  if v.tipo <> o.tipo and (
    exists (select 1 from public.documentos f where f.id = o.factura_id and f.deleted_at is null)
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
  if v.tipo = 'remito' then
    if o.tipo = 'remito' then
      -- Preserva la grúa real del remito, incluida la recibida desde obra, y los nulos históricos.
      v.equipo_id := o.equipo_id;
    else
      v.equipo_id := private.derive_document_equipment(coalesce(p_presupuestos, array(
        select dp.cotizacion_id from public.documento_presupuestos dp where dp.documento_id = p_id
      )));
    end if;
  end if;

  -- Los campos que no son del tipo se descartan (los CHECK documentos_campos_de_* no los aceptan).
  update public.documentos set
    tipo = v.tipo,
    numero = coalesce(btrim(v.numero), ''),
    fecha = case when p_datos ? 'fecha' then v.fecha else o.fecha end,
    monto = v.monto,
    tipo_comprobante = case when v.tipo = 'factura' then v.tipo_comprobante end,
    fecha_vencimiento = case when v.tipo = 'factura' then v.fecha_vencimiento end,
    numero_oc_ref = case when v.tipo = 'factura' then coalesce(btrim(v.numero_oc_ref), '') else '' end,
    periodo_desde = case when v.tipo = 'remito' then v.periodo_desde end,
    periodo_hasta = case when v.tipo = 'remito' then v.periodo_hasta end,
    equipo_id = case when v.tipo = 'remito' then v.equipo_id end,
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

