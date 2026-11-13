-- Duplica una cotización para otro trabajo o cliente.
create or replace function public.duplicar_cotizacion(p_id uuid, p_cliente_id uuid default null) returns uuid language plpgsql security definer
set search_path = '' as $$
declare o public.cotizaciones %rowtype;
v_id uuid;
v_mismo_cliente boolean;
v_subject text;
begin perform private.exigir_usuario_activo();
select * into o
from public.cotizaciones
where id = p_id;
if not found then raise exception 'La cotización no existe' using errcode = 'P0001';
end if;
v_mismo_cliente := p_cliente_id is null
or p_cliente_id = o.cliente_id;
-- La copia reserva el sufijo dentro del límite de 500 caracteres, sin modificar el asunto original.
v_subject := case
  when o.asunto ~* '(^|[[:space:]])bis[[:space:]]*$' then o.asunto
  when btrim(o.asunto) = '' then 'bis'
  else rtrim(left(rtrim(o.asunto), 496)) || ' bis'
end;
insert into public.cotizaciones (
    cliente_id,
    contacto_id,
    formato,
    plantilla_id,
    equipo_id,
    firmante_id,
    asunto,
    intro,
    datos,
    bloques,
    validez_dias,
    mostrar_total,
    fecha_proxima_actualizacion,
    reemplaza_a
  )
values (
    coalesce(p_cliente_id, o.cliente_id),
    case
      when v_mismo_cliente then o.contacto_id
    end,
    o.formato,
    o.plantilla_id,
    o.equipo_id,
    o.firmante_id,
    v_subject,
    o.intro,
    o.datos,
    o.bloques,
    o.validez_dias,
    o.mostrar_total,
    o.fecha_proxima_actualizacion,
    case
      when v_mismo_cliente then o.id
    end
  )
returning id into v_id;
insert into public.cotizacion_items (
    cotizacion_id,
    orden,
    seccion,
    descripcion,
    cantidad,
    precio_unitario,
    is_complimentary,
    unidad
  )
select v_id,
  orden,
  seccion,
  descripcion,
  cantidad,
  precio_unitario,
  is_complimentary,
  unidad
from public.cotizacion_items
where cotizacion_id = p_id;
return v_id;
end;
$$;