-- Elimina una plantilla de cotización.
create or replace function public.eliminar_plantilla(p_id uuid) returns void language plpgsql security definer
set search_path = '' as $$ begin perform private.exigir_usuario_activo();
perform 1
from public.plantillas
where id = p_id for
update;
if not found then raise exception 'La plantilla no existe' using errcode = 'P0001';
end if;
-- Las usadas se archivan: la referencia de una cotización aprobada permanece intacta.
if exists (
  select 1
  from public.cotizaciones
  where plantilla_id = p_id
) then
update public.plantillas
set activa = false
where id = p_id;
else
delete from public.plantillas
where id = p_id;
end if;
end;
$$;