-- Aprueba una cotización.
create or replace function public.aprobar_cotizacion(
    p_id uuid,
    p_updated_at timestamptz,
    p_pdf_path text default null,
    p_fecha date default null
  ) returns void language plpgsql security definer
set search_path = '' as $$
declare c public.cotizaciones %rowtype;
v_fecha date := coalesce(p_fecha, private.hoy_argentina());
begin perform private.exigir_usuario_activo();
select * into c
from public.cotizaciones
where id = p_id for
update;
if not found then raise exception 'La cotización no existe' using errcode = 'P0001';
end if;
if c.estado not in ('borrador', 'enviada') then raise exception 'Solo se puede aprobar una cotización en borrador o enviada' using errcode = 'P0001';
end if;
perform private.exigir_version(c.updated_at, p_updated_at);
if v_fecha < c.fecha then raise exception 'La fecha de aprobación no puede ser anterior a la cotización' using errcode = 'P0001';
end if;
if c.origen = 'importada' then if p_pdf_path is not null then raise exception 'Una cotización cargada se aprueba con su PDF original' using errcode = 'P0001';
end if;
else perform private.exigir_ruta_pdf(p_id, p_pdf_path);
perform private.exigir_precios(p_id);
end if;
update public.cotizaciones
set estado = 'aprobada',
  fecha_aprobacion = v_fecha,
  pdf_aprobado_path = p_pdf_path,
  presupuesto_estado = 'en_curso'
where id = p_id;
end;
$$;