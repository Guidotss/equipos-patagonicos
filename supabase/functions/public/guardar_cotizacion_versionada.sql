-- Guarda una cotización con control de versión.
create or replace function public.guardar_cotizacion_versionada(
    p_datos jsonb,
    p_items jsonb,
    p_id uuid default null,
    p_updated_at timestamptz default null
  ) returns table (id uuid, numero bigint, version timestamptz) language plpgsql security definer
set search_path = '' as $$
declare v_id uuid;
begin perform private.exigir_usuario_activo();
v_id := public.guardar_cotizacion(p_datos, p_items, p_id, p_updated_at);
return query
select c.id,
  c.numero,
  c.updated_at
from public.cotizaciones c
where c.id = v_id;
end;
$$;