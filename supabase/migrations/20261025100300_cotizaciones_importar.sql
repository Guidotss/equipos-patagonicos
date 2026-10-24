-- supabase/migrations/20261025100300_cotizaciones_importar.sql
-- Cotizaciones existentes (con su número original) y presupuestos sin cotización formal.

-- Si un número cargado a mano alcanza la secuencia, la corre para que el próximo número nuevo no choque.
create or replace function private.avanzar_numeracion(p_numero bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secuencia text := pg_get_serial_sequence('public.cotizaciones', 'numero');
  v_ultimo bigint;
  v_llamada boolean;
  v_proximo bigint;
begin
  execute format('select last_value, is_called from %s', v_secuencia) into v_ultimo, v_llamada;
  v_proximo := case when v_llamada then v_ultimo + 1 else v_ultimo end;
  if p_numero >= v_proximo then
    perform setval(v_secuencia, p_numero, true);
  end if;
end;
$$;

create or replace function public.importar_cotizacion(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cotizaciones%rowtype;
  v_id uuid;
  v_hoy date := private.hoy_argentina();
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.cotizaciones, p_datos);

  if v.numero is null or v.numero <= 0 then
    raise exception 'Ingresá el número de la cotización' using errcode = 'P0001';
  end if;
  if v.estado is null or v.estado not in ('enviada', 'aprobada') then
    raise exception 'Una cotización existente se carga como enviada o aprobada' using errcode = 'P0001';
  end if;
  if v.archivo_original_path is null or left(v.archivo_original_path, 11) <> 'importadas/' then
    raise exception 'Falta el PDF de la cotización' using errcode = 'P0001';
  end if;
  perform private.validar_contacto(v.cliente_id, v.contacto_id);

  if exists (select 1 from public.cotizaciones where numero = v.numero) then
    raise exception 'Ya existe una cotización con el número %', v.numero using errcode = 'P0001';
  end if;

  insert into public.cotizaciones (
    numero, origen, fecha, cliente_id, contacto_id, formato, asunto, estado,
    fecha_aprobacion, presupuesto_estado, archivo_original_path, notas
  ) values (
    v.numero, 'importada', coalesce(v.fecha, v_hoy), v.cliente_id, v.contacto_id,
    coalesce(v.formato, 'jornada'), coalesce(v.asunto, ''), v.estado,
    case when v.estado = 'aprobada' then coalesce(v.fecha_aprobacion, v.fecha, v_hoy) end,
    case when v.estado = 'aprobada' then 'en_curso' end,
    v.archivo_original_path, coalesce(v.notas, '')
  )
  returning id into v_id;

  perform private.avanzar_numeracion(v.numero);
  return v_id;
end;
$$;

-- Trabajo sin cotización formal (urgencia, acuerdo telefónico): se crea ya aprobado.
-- Los ítems se cargan antes de aprobar porque una aprobada no admite cambios en sus ítems.
create or replace function public.presupuesto_directo(p_datos jsonb, p_items jsonb default '[]')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cotizaciones%rowtype;
  v_id uuid;
  v_hoy date := private.hoy_argentina();
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.cotizaciones, p_datos);

  if coalesce(btrim(v.asunto), '') = '' then
    raise exception 'Describí el trabajo' using errcode = 'P0001';
  end if;
  perform private.validar_contacto(v.cliente_id, v.contacto_id);

  insert into public.cotizaciones (origen, fecha, cliente_id, contacto_id, formato, equipo_id, asunto, notas)
  values ('directa', coalesce(v.fecha, v_hoy), v.cliente_id, v.contacto_id, coalesce(v.formato, 'jornada'),
          v.equipo_id, v.asunto, coalesce(v.notas, ''))
  returning id into v_id;

  perform private.reemplazar_items(v_id, coalesce(p_items, '[]'));

  update public.cotizaciones set
    estado = 'aprobada',
    fecha_aprobacion = coalesce(v.fecha_aprobacion, v.fecha, v_hoy),
    presupuesto_estado = 'en_curso'
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.importar_cotizacion(jsonb) to authenticated;
grant execute on function public.presupuesto_directo(jsonb, jsonb) to authenticated;
