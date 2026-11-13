-- Actualiza un documento junto con sus archivos.
create or replace function public.actualizar_documento_con_archivos(
    p_id uuid,
    p_datos jsonb,
    p_presupuestos uuid [] default null,
    p_remitos uuid [] default null,
    p_aplicaciones jsonb default null,
    p_archivos jsonb default '[]',
    p_quitar uuid [] default '{}'
  ) returns void language plpgsql security definer
set search_path = '' as $$
declare file_id uuid;
begin perform private.exigir_usuario_activo();
perform public.actualizar_documento(
  p_id,
  p_datos,
  p_presupuestos,
  p_remitos,
  p_aplicaciones
);
if jsonb_typeof(p_archivos) is distinct
from 'array' then raise exception 'Los archivos tienen que ser una lista' using errcode = 'P0001';
end if;
if jsonb_array_length(p_archivos) > 0 then perform public.agregar_archivos(p_id, p_archivos);
end if;
foreach file_id in array coalesce(p_quitar, '{}') loop if not exists (
  select 1
  from public.documento_archivos
  where id = file_id
    and documento_id = p_id
) then raise exception 'El archivo no pertenece al documento' using errcode = 'P0001';
end if;
perform public.quitar_archivo(file_id);
end loop;
end;
$$;