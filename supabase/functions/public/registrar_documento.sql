-- Crea un documento y sus vínculos en una transacción.
create or replace function public.registrar_documento(
    p_datos jsonb,
    p_presupuestos uuid [],
    p_archivos jsonb,
    p_remitos uuid [] default '{}',
    p_aplicaciones jsonb default '[]'
  ) returns uuid language plpgsql security definer
set search_path = '' as $$
declare v public.documentos %rowtype;
v_id uuid;
input_data jsonb;
previous_financial jsonb;
begin perform private.exigir_usuario_activo();
-- El equipo del remito se obtiene del presupuesto; ningún valor enviado por el navegador lo reemplaza.
input_data := case
  when p_datos->>'tipo' = 'remito'
  and jsonb_typeof(p_datos) = 'object' then p_datos - 'equipo_id'
  else p_datos
end;
perform private.validar_datos_documento(input_data->>'tipo', input_data);
v := private.leer_datos_documento(input_data);
if v.cliente_id is null then raise exception 'Falta el cliente' using errcode = 'P0001';
end if;
perform private.lock_financial_client(v.cliente_id);
perform private.lock_financial_rows(v.cliente_id);
if v.tipo not in ('factura', 'orden_pago')
or cardinality(p_presupuestos) > 0 then perform private.validar_presupuestos(v.cliente_id, p_presupuestos);
end if;
if v.tipo = 'remito' then v.equipo_id := private.derive_document_equipment(p_presupuestos);
end if;
perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);
-- Los campos que no son del tipo se descartan (los CHECK documentos_campos_de_* no los aceptan).
insert into public.documentos (
    cliente_id,
    tipo,
    numero,
    fecha,
    monto,
    tipo_comprobante,
    fecha_vencimiento,
    numero_oc_ref,
    periodo_desde,
    periodo_hasta,
    equipo_id,
    notas
  )
values (
    v.cliente_id,
    v.tipo,
    coalesce(btrim(v.numero), ''),
    v.fecha,
    v.monto,
    case
      when v.tipo = 'factura' then v.tipo_comprobante
    end,
    case
      when v.tipo = 'factura' then v.fecha_vencimiento
    end,
    case
      when v.tipo = 'factura' then coalesce(btrim(v.numero_oc_ref), '')
      else ''
    end,
    case
      when v.tipo = 'remito' then v.periodo_desde
    end,
    case
      when v.tipo = 'remito' then v.periodo_hasta
    end,
    case
      when v.tipo = 'remito' then v.equipo_id
    end,
    coalesce(v.notas, '')
  )
returning id into v_id;
perform private.reemplazar_presupuestos(v_id, p_presupuestos);
perform private.adjuntar_archivos(v_id, p_archivos);
if v.tipo = 'factura' then perform private.vincular_remitos(v_id, v.cliente_id, p_remitos);
elsif v.tipo = 'orden_pago' then perform private.aplicar_orden_pago(
  v_id,
  v.cliente_id,
  v.monto,
  coalesce(p_aplicaciones, '[]')
);
end if;
if input_data ? 'payment_condition' then if v.tipo <> 'orden_pago'
or jsonb_typeof(input_data->'payment_condition') is distinct
from 'string'
  or char_length(input_data->>'payment_condition') > 2000 then raise exception 'La condición de pago debe ser texto de hasta 2000 caracteres de la orden de pago' using errcode = 'P0001';
end if;
update public.documentos
set payment_condition = input_data->>'payment_condition'
where id = v_id;
end if;
if v.tipo in ('factura', 'orden_pago')
or input_data ? 'finance' then perform private.write_document_finance(
  v_id,
  input_data->'finance',
  true,
  p_presupuestos
);
perform private.append_financial_event(
  v_id,
  null,
  'created',
  input_data->'finance'->>'correctionReason',
  true
);
end if;
return v_id;
end;
$$;