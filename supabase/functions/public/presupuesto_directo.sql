-- Crea un presupuesto directo.
create or replace function public.presupuesto_directo(p_datos jsonb, p_items jsonb default '[]') returns uuid language plpgsql security definer
set search_path = '' as $$
declare v public.cotizaciones %rowtype;
v_id uuid;
v_hoy date := private.hoy_argentina();
v_fecha date;
v_fecha_aprobacion date;
begin perform private.exigir_usuario_activo();
v := jsonb_populate_record(null::public.cotizaciones, p_datos);
v_fecha := coalesce(v.fecha, v_hoy);
v_fecha_aprobacion := coalesce(v.fecha_aprobacion, v_fecha);
if coalesce(btrim(v.asunto), '') = '' then raise exception 'Describí el trabajo' using errcode = 'P0001';
end if;
if v_fecha_aprobacion < v_fecha then raise exception 'La fecha de aprobación no puede ser anterior a la cotización' using errcode = 'P0001';
end if;
perform private.validar_contacto(v.cliente_id, v.contacto_id);
insert into public.cotizaciones (
    origen,
    fecha,
    cliente_id,
    contacto_id,
    formato,
    equipo_id,
    asunto,
    notas
  )
values (
    'directa',
    v_fecha,
    v.cliente_id,
    v.contacto_id,
    coalesce(v.formato, 'jornada'),
    v.equipo_id,
    v.asunto,
    coalesce(v.notas, '')
  )
returning id into v_id;
perform private.reemplazar_items(v_id, coalesce(p_items, '[]'));
update public.cotizaciones
set estado = 'aprobada',
  fecha_aprobacion = v_fecha_aprobacion,
  presupuesto_estado = 'en_curso'
where id = v_id;
return v_id;
end;
$$;