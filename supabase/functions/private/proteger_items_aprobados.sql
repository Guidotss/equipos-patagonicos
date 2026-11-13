create or replace function private.proteger_items_aprobados()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.cotizaciones
    where id in (new.cotizacion_id, old.cotizacion_id) and estado = 'aprobada'
  ) then
    raise exception 'La cotización está aprobada y sus ítems no se pueden modificar' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
