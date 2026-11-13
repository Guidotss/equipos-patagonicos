-- Actualiza un documento y sus vínculos en una transacción.
create or replace function public.actualizar_documento(
    p_id uuid,
    p_datos jsonb,
    p_presupuestos uuid [] default null,
    p_remitos uuid [] default null,
    p_aplicaciones jsonb default null
  ) returns void language plpgsql security definer
set search_path = '' as $$
declare o public.documentos %rowtype;
v public.documentos %rowtype;
v_cobrado numeric;
v_presupuestos_nuevos uuid [];
input_data jsonb;
previous_financial jsonb;
begin perform private.exigir_usuario_activo();
select * into o
from public.documentos
where id = p_id
  and deleted_at is null;
if o.id is not null then perform private.lock_financial_client(o.cliente_id);
perform private.lock_financial_rows(o.cliente_id);
end if;
select * into o
from public.documentos
where id = p_id
  and deleted_at is null;
if o.id is null then raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
end if;
-- Se conserva la validación vigente de fechas, montos y textos; el equipo del remito no es editable.
input_data := case
  when coalesce(p_datos->>'tipo', o.tipo) = 'remito'
  and jsonb_typeof(p_datos) = 'object' then p_datos - 'equipo_id'
  else p_datos
end;
perform private.validar_datos_documento(
  coalesce(input_data->>'tipo', o.tipo),
  input_data
);
v := private.leer_datos_documento(input_data);
v.tipo := coalesce(v.tipo, o.tipo);
v.fecha := case
  when p_datos ? 'fecha' then v.fecha
  else o.fecha
end;
previous_financial := private.financial_snapshot(p_id);
if o.tipo = 'orden_pago'
and not (input_data ? 'finance')
and p_aplicaciones = '[]'::jsonb
and exists(
  select 1
  from public.payment_allocations a
    join public.payment_instruments i on i.id = a.instrument_id
  where i.op_id = p_id
) then raise exception 'Para cambiar las aplicaciones existentes, enviá finance.paymentAllocations con la versión financiera leída' using errcode = 'P0001';
end if;
if input_data ? 'finance'
or (v.tipo, v.monto, v.tipo_comprobante) is distinct
from (o.tipo, o.monto, o.tipo_comprobante)
  or (
    v.tipo = 'factura'
    and (v.fecha, v.fecha_vencimiento) is distinct
    from (o.fecha, o.fecha_vencimiento)
  )
  or (
    input_data ? 'payment_condition'
    and input_data->>'payment_condition' is distinct
    from o.payment_condition
  ) then if o.tipo in ('factura', 'orden_pago')
  or v.tipo in ('factura', 'orden_pago') then perform private.require_financial_version(
    o.financial_version,
    input_data->'finance'->'expectedVersion'
  );
end if;
end if;
if v.tipo <> o.tipo
and exists(
  select 1
  from public.payment_instruments
  where op_id = p_id
    and status <> 'voided'
) then raise exception 'La orden tiene medios de pago. Corregí o anulá sus fondos conservando la orden original' using errcode = 'P0001';
end if;
if v.tipo <> o.tipo
and o.tipo = 'factura' then if exists(
  select 1
  from public.payment_allocations
  where invoice_id = p_id
) then raise exception 'La factura tiene pagos vinculados. Corregí sus destinos antes de cambiar el tipo' using errcode = 'P0001';
end if;
if coalesce(
  btrim(input_data->'finance'->>'correctionReason'),
  ''
) = '' then raise exception 'Indicá el motivo para quitar la distribución de la factura' using errcode = 'P0001';
end if;
delete from public.invoice_allocations
where invoice_id = p_id;
end if;
-- Un remito cubierto por una factura anulada cuenta como libre (igual que en vincular_remitos).
if v.tipo <> o.tipo
and (
  exists (
    select 1
    from public.documentos f
    where f.id = o.factura_id
      and f.deleted_at is null
  )
  or exists (
    select 1
    from public.documentos r
    where r.factura_id = p_id
  )
  or exists (
    select 1
    from public.op_facturas
    where op_id = p_id
      or factura_id = p_id
  )
) then raise exception 'Para cambiar el tipo, primero quitá los remitos o facturas vinculados' using errcode = 'P0001';
end if;
if p_presupuestos is not null then if cardinality(p_presupuestos) = 0
and v.tipo not in ('factura', 'orden_pago') then raise exception 'Elegí al menos un presupuesto' using errcode = 'P0001';
end if;
v_presupuestos_nuevos := array(
  select p.id
  from unnest(p_presupuestos) as p(id)
  where not exists (
      select 1
      from public.documento_presupuestos dp
      where dp.documento_id = p_id
        and dp.cotizacion_id = p.id
    )
);
if cardinality(v_presupuestos_nuevos) > 0 then perform private.validar_presupuestos(o.cliente_id, v_presupuestos_nuevos);
end if;
end if;
perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);
if v.tipo = 'remito' then if o.tipo = 'remito' then -- Preserva la grúa real del remito, incluida la recibida desde obra, y los nulos históricos.
v.equipo_id := o.equipo_id;
else v.equipo_id := private.derive_document_equipment(
  coalesce(
    p_presupuestos,
    array(
      select dp.cotizacion_id
      from public.documento_presupuestos dp
      where dp.documento_id = p_id
    )
  )
);
end if;
end if;
-- Los campos que no son del tipo se descartan (los CHECK documentos_campos_de_* no los aceptan).
update public.documentos
set tipo = v.tipo,
  payment_condition = case
    when v.tipo = 'orden_pago' then o.payment_condition
    else ''
  end,
  numero = coalesce(btrim(v.numero), ''),
  fecha = v.fecha,
  monto = v.monto,
  tipo_comprobante = case
    when v.tipo = 'factura' then v.tipo_comprobante
  end,
  fecha_vencimiento = case
    when v.tipo = 'factura' then v.fecha_vencimiento
  end,
  numero_oc_ref = case
    when v.tipo = 'factura' then coalesce(btrim(v.numero_oc_ref), '')
    else ''
  end,
  periodo_desde = case
    when v.tipo = 'remito' then v.periodo_desde
  end,
  periodo_hasta = case
    when v.tipo = 'remito' then v.periodo_hasta
  end,
  equipo_id = case
    when v.tipo = 'remito' then v.equipo_id
  end,
  factura_id = case
    when v.tipo = 'remito' then o.factura_id
  end,
  notas = coalesce(v.notas, '')
where id = p_id;
if p_presupuestos is not null then perform private.reemplazar_presupuestos(p_id, p_presupuestos);
end if;
if v.tipo = 'factura'
and p_remitos is not null then perform private.vincular_remitos(p_id, o.cliente_id, p_remitos);
elsif v.tipo = 'orden_pago'
and p_aplicaciones is not null then perform private.aplicar_orden_pago(p_id, o.cliente_id, v.monto, p_aplicaciones);
end if;
if input_data ? 'payment_condition' then if v.tipo <> 'orden_pago'
or jsonb_typeof(input_data->'payment_condition') is distinct
from 'string'
  or char_length(input_data->>'payment_condition') > 2000 then raise exception 'La condición de pago debe ser texto de hasta 2000 caracteres de la orden de pago' using errcode = 'P0001';
end if;
update public.documentos
set payment_condition = input_data->>'payment_condition'
where id = p_id;
end if;
if v.tipo in ('factura', 'orden_pago')
or o.tipo in ('factura', 'orden_pago')
or input_data ? 'finance' then perform private.write_document_finance(
  p_id,
  input_data->'finance',
  v.tipo <> o.tipo,
  coalesce(
    p_presupuestos,
    array(
      select cotizacion_id
      from public.documento_presupuestos
      where documento_id = p_id
    )
  )
);
perform private.require_correction_reason(
  previous_financial,
  private.financial_snapshot(p_id),
  input_data->'finance'->>'correctionReason'
);
perform private.append_financial_event(
  p_id,
  previous_financial,
  'updated',
  input_data->'finance'->>'correctionReason'
);
end if;
end;
$$;