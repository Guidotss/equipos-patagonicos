create or replace function private.validar_datos_documento(p_tipo text, p_datos jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_monto text := p_datos ->> 'monto';
  v_equipo text := nullif(p_datos ->> 'equipo_id', '');
  v_fecha text;
begin
  -- "is distinct from" para que un p_datos nulo también se rechace: al actualizar, vaciaría el documento.
  if jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'Los datos del documento tienen que ser un objeto' using errcode = 'P0001';
  end if;

  if p_tipo is null or p_tipo not in ('orden_compra', 'remito', 'factura', 'orden_pago') then
    raise exception 'Tipo de documento inválido' using errcode = 'P0001';
  end if;

  -- Los mismos máximos que esquemas.ts, sobre lo que se guarda (número y OC de referencia sin los espacios de los
  -- extremos), sea o no del tipo. Un número muy largo, además, no entra en el índice documentos_numero_normalizado.
  if char_length(btrim(p_datos ->> 'numero')) > (case when p_tipo = 'remito' then 100 else 50 end) then
    raise exception 'El número puede tener hasta % caracteres', case when p_tipo = 'remito' then 100 else 50 end
      using errcode = 'P0001';
  end if;
  if char_length(btrim(p_datos ->> 'numero_oc_ref')) > 50 then
    raise exception 'La OC de referencia puede tener hasta 50 caracteres' using errcode = 'P0001';
  end if;
  if char_length(p_datos ->> 'notas') > (case when p_tipo = 'remito' then 6200 else 2000 end) then
    raise exception 'Las notas pueden tener hasta % caracteres', case when p_tipo = 'remito' then 6200 else 2000 end
      using errcode = 'P0001';
  end if;

  if p_datos ->> 'cliente_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Cliente inválido' using errcode = 'P0001';
  end if;
  if v_equipo !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Equipo inválido' using errcode = 'P0001';
  end if;

  foreach v_fecha in array array[
    p_datos ->> 'fecha', p_datos ->> 'fecha_vencimiento', p_datos ->> 'periodo_desde', p_datos ->> 'periodo_hasta'
  ] loop
    if v_fecha <> '' and (v_fecha !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not pg_input_is_valid(v_fecha, 'date')) then
      raise exception 'Fecha inválida' using errcode = 'P0001';
    end if;
  end loop;

  if v_monto is not null then
    if v_monto !~ '^[0-9]+(\.[0-9]{1,2})?$' then
      raise exception 'El monto tiene que ser un número positivo con hasta 2 decimales' using errcode = 'P0001';
    end if;
    -- numeric(14, 2): hasta 12 dígitos enteros (sin contar ceros a la izquierda).
    if v_monto !~ '^0*[0-9]{1,12}(\.|$)' then
      raise exception 'El monto supera el máximo permitido' using errcode = 'P0001';
    end if;
    if v_monto::numeric(14, 2) <= 0 then
      raise exception 'El monto tiene que ser un número positivo con hasta 2 decimales' using errcode = 'P0001';
    end if;
  elsif p_tipo = 'factura' then
    raise exception 'Indicá el monto de la factura' using errcode = 'P0001';
  elsif p_tipo = 'orden_pago' then
    raise exception 'Indicá el monto de la orden de pago' using errcode = 'P0001';
  end if;

  if p_tipo = 'factura' and coalesce(p_datos ->> 'tipo_comprobante', '') not in ('FA', 'FCE_A', 'FB', 'ND', 'NC') then
    raise exception 'Elegí un comprobante válido' using errcode = 'P0001';
  end if;

  if p_tipo = 'remito' then
    if nullif(p_datos ->> 'periodo_desde', '')::date > nullif(p_datos ->> 'periodo_hasta', '')::date then
      raise exception 'El período termina antes de empezar' using errcode = 'P0001';
    end if;
    if v_equipo is not null and not exists (select 1 from public.equipos e where e.id = v_equipo::uuid) then
      raise exception 'El equipo no existe' using errcode = 'P0001';
    end if;
  end if;
end;
$$;
