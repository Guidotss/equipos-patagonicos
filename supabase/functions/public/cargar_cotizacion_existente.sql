-- Carga una cotización externa existente.
create or replace function public.cargar_cotizacion_existente(p_datos jsonb) returns uuid language plpgsql security definer
set search_path = '' as $$
declare o storage.objects %rowtype;
begin perform private.exigir_usuario_activo();
select * into o
from storage.objects
where bucket_id = 'documentos'
  and name = p_datos->>'archivo_original_path';
if not found
or left(o.name, 11) <> 'importadas/'
or lower(btrim(split_part(o.metadata->>'mimetype', ';', 1))) is distinct
from 'application/pdf'
  or (o.metadata->>'size')::bigint not between 1 and 10485760 then raise exception 'Subí un PDF válido de hasta 10 MB' using errcode = 'P0001';
end if;
return public.importar_cotizacion(p_datos);
end;
$$;