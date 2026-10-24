-- supabase/migrations/20261025100100_cotizaciones_guardar.sql
-- Escrituras de cotizaciones. Son SECURITY DEFINER (las tablas son de solo lectura para la app),
-- así que cada una exige usuario activo antes de tocar nada.

create or replace function private.exigir_usuario_activo()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.es_usuario_activo() then
    raise exception 'Tu usuario no está habilitado' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.hoy_argentina()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

create or replace function private.validar_contacto(p_cliente_id uuid, p_contacto_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_contacto_id is not null and not exists (
    select 1 from public.contactos where id = p_contacto_id and cliente_id = p_cliente_id
  ) then
    raise exception 'El contacto no pertenece al cliente' using errcode = 'P0001';
  end if;
end;
$$;

-- Reemplaza todos los ítems de una cotización por los de la lista (el orden es el de la lista).
create or replace function private.reemplazar_items(p_cotizacion_id uuid, p_items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Los ítems tienen que ser una lista' using errcode = 'P0001';
  end if;

  delete from public.cotizacion_items where cotizacion_id = p_cotizacion_id;

  insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, cantidad, precio_unitario, unidad)
  select
    p_cotizacion_id,
    e.orden::integer,
    coalesce(e.item ->> 'seccion', ''),
    e.item ->> 'descripcion',
    coalesce((e.item ->> 'cantidad')::numeric, 1),
    (e.item ->> 'precio_unitario')::numeric,
    e.item ->> 'unidad'
  from jsonb_array_elements(p_items) with ordinality as e(item, orden);
end;
$$;

-- Crea (p_id null) o actualiza una cotización en borrador o enviada, con todos sus ítems, en una transacción.
create or replace function public.guardar_cotizacion(p_datos jsonb, p_items jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cotizaciones%rowtype;
  v_id uuid;
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.cotizaciones, p_datos);
  perform private.validar_contacto(v.cliente_id, v.contacto_id);

  if p_id is null then
    insert into public.cotizaciones (
      fecha, cliente_id, contacto_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro,
      datos, bloques, validez_dias, mostrar_total, fecha_proxima_actualizacion, notas, reemplaza_a
    ) values (
      coalesce(v.fecha, private.hoy_argentina()), v.cliente_id, v.contacto_id, v.formato, v.plantilla_id,
      v.equipo_id, v.firmante_id, coalesce(v.asunto, ''), coalesce(v.intro, ''), coalesce(v.datos, '{}'),
      coalesce(v.bloques, '[]'), coalesce(v.validez_dias, 30), coalesce(v.mostrar_total, false),
      v.fecha_proxima_actualizacion, coalesce(v.notas, ''), v.reemplaza_a
    )
    returning id into v_id;
  else
    update public.cotizaciones set
      fecha = coalesce(v.fecha, fecha),
      cliente_id = v.cliente_id,
      contacto_id = v.contacto_id,
      formato = v.formato,
      plantilla_id = v.plantilla_id,
      equipo_id = v.equipo_id,
      firmante_id = v.firmante_id,
      asunto = coalesce(v.asunto, ''),
      intro = coalesce(v.intro, ''),
      datos = coalesce(v.datos, '{}'),
      bloques = coalesce(v.bloques, '[]'),
      validez_dias = coalesce(v.validez_dias, 30),
      mostrar_total = coalesce(v.mostrar_total, false),
      fecha_proxima_actualizacion = v.fecha_proxima_actualizacion,
      notas = coalesce(v.notas, '')
    where id = p_id and estado in ('borrador', 'enviada')
    returning id into v_id;

    if v_id is null then
      raise exception 'La cotización no existe o ya no se puede editar' using errcode = 'P0001';
    end if;
  end if;

  perform private.reemplazar_items(v_id, p_items);
  return v_id;
end;
$$;

-- Copia una cotización como borrador nuevo (número nuevo, fecha de hoy). Con el mismo cliente es una
-- renegociación: queda enlazada con reemplaza_a. Con otro cliente no se copia el contacto.
create or replace function public.duplicar_cotizacion(p_id uuid, p_cliente_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.cotizaciones%rowtype;
  v_id uuid;
  v_mismo_cliente boolean;
begin
  perform private.exigir_usuario_activo();
  select * into o from public.cotizaciones where id = p_id;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0001';
  end if;
  v_mismo_cliente := p_cliente_id is null or p_cliente_id = o.cliente_id;

  insert into public.cotizaciones (
    cliente_id, contacto_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro, datos, bloques,
    validez_dias, mostrar_total, fecha_proxima_actualizacion, reemplaza_a
  ) values (
    coalesce(p_cliente_id, o.cliente_id),
    case when v_mismo_cliente then o.contacto_id end,
    o.formato, o.plantilla_id, o.equipo_id, o.firmante_id, o.asunto, o.intro, o.datos, o.bloques,
    o.validez_dias, o.mostrar_total, o.fecha_proxima_actualizacion,
    case when v_mismo_cliente then o.id end
  )
  returning id into v_id;

  insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, cantidad, precio_unitario, unidad)
  select v_id, orden, seccion, descripcion, cantidad, precio_unitario, unidad
  from public.cotizacion_items where cotizacion_id = p_id;

  return v_id;
end;
$$;

-- Solo borra borradores que nunca salieron de la app: uno reabierto con envíos o una importada ya los
-- tiene el cliente (y borrarlos se llevaría el historial de envíos y dejaría huérfanos sus PDF).
create or replace function public.borrar_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  delete from public.cotizaciones c
  where c.id = p_id and c.estado = 'borrador' and c.origen = 'app'
    and not exists (select 1 from public.cotizacion_envios e where e.cotizacion_id = c.id);
  if not found then
    if exists (select 1 from public.cotizaciones where id = p_id and estado = 'borrador') then
      raise exception 'Una cotización que ya se envió no se puede borrar; rechazala' using errcode = 'P0001';
    end if;
    raise exception 'Solo se pueden borrar cotizaciones en borrador' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.guardar_cotizacion(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.duplicar_cotizacion(uuid, uuid) to authenticated;
grant execute on function public.borrar_cotizacion(uuid) to authenticated;
