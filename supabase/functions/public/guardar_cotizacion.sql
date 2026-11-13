-- Guarda una cotización mediante el contrato anterior.
create function public.guardar_cotizacion(
  p_datos jsonb,
  p_items jsonb,
  p_id uuid default null,
  p_updated_at timestamptz default null
) returns uuid language plpgsql security definer
set search_path = '' as $$
declare v public.cotizaciones %rowtype;
c public.cotizaciones %rowtype;
v_id uuid;
begin perform private.exigir_usuario_activo();
v := jsonb_populate_record(null::public.cotizaciones, p_datos);
perform private.validar_contacto(v.cliente_id, v.contacto_id);
if p_id is null then
insert into public.cotizaciones (
    fecha,
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
    notas,
    reemplaza_a
  )
values (
    coalesce(v.fecha, private.hoy_argentina()),
    v.cliente_id,
    v.contacto_id,
    v.formato,
    v.plantilla_id,
    v.equipo_id,
    v.firmante_id,
    coalesce(v.asunto, ''),
    coalesce(v.intro, ''),
    coalesce(v.datos, '{}'),
    coalesce(v.bloques, '[]'),
    coalesce(v.validez_dias, 30),
    coalesce(v.mostrar_total, false),
    v.fecha_proxima_actualizacion,
    coalesce(v.notas, ''),
    v.reemplaza_a
  )
returning id into v_id;
else
select * into c
from public.cotizaciones
where id = p_id for
update;
if not found
or c.estado not in ('borrador', 'enviada')
or c.origen <> 'app' then raise exception 'La cotización no existe o ya no se puede editar' using errcode = 'P0001';
end if;
perform private.exigir_version(c.updated_at, p_updated_at);
update public.cotizaciones
set fecha = coalesce(v.fecha, fecha),
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
  notas = coalesce(v.notas, c.notas)
where id = p_id;
v_id := p_id;
end if;
perform private.reemplazar_items(v_id, p_items);
return v_id;
end;
$$;