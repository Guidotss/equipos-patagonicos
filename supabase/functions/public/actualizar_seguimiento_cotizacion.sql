-- Actualiza el seguimiento de una cotización.
create or replace function public.actualizar_seguimiento_cotizacion(
    p_id uuid,
    p_updated_at timestamptz,
    p_notas text,
    p_fecha date default null
  ) returns void language plpgsql security definer
set search_path = '' as $$
declare c public.cotizaciones %rowtype;
begin perform private.exigir_usuario_activo();
select * into c
from public.cotizaciones
where id = p_id for
update;
if not found then raise exception 'La cotización no existe' using errcode = 'P0001';
end if;
perform private.exigir_version(c.updated_at, p_updated_at);
if p_notas is null
or length(p_notas) > 2000 then raise exception 'Las notas admiten hasta 2000 caracteres' using errcode = 'P0001';
end if;
update public.cotizaciones
set notas = btrim(p_notas),
  fecha_proxima_actualizacion = p_fecha
where id = p_id;
end;
$$;