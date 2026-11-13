-- Adjunta archivos mediante el contrato anterior.
create or replace function public.agregar_archivos(p_documento_id uuid, p_archivos jsonb) returns void language plpgsql security definer
set search_path = '' as $$ begin perform private.exigir_usuario_activo();
-- Bloquea el documento antes de calcular el orden de las páginas nuevas: dos llamadas a la vez se esperan.
perform 1
from public.documentos
where id = p_documento_id
  and deleted_at is null for
update;
if not found then raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
end if;
perform private.adjuntar_archivos(p_documento_id, p_archivos);
end;
$$;