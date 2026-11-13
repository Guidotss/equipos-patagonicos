-- Quita un archivo mediante el contrato anterior.
create or replace function public.quitar_archivo(p_archivo_id uuid) returns void language plpgsql security definer
set search_path = '' as $$
declare v_documento uuid;
begin perform private.exigir_usuario_activo();
select documento_id into v_documento
from public.documento_archivos
where id = p_archivo_id;
if not found then raise exception 'El archivo no existe' using errcode = 'P0001';
end if;
-- Bloquea el documento antes de contar sus archivos: dos quitas a la vez se esperan
-- y la segunda ve lo que quitó la primera.
perform 1
from public.documentos
where id = v_documento
  and deleted_at is null for
update;
if not found then raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
end if;
if (
  select count(*)
  from public.documento_archivos
  where documento_id = v_documento
) <= 1 then raise exception 'Un documento tiene que tener al menos un archivo' using errcode = 'P0001';
end if;
delete from public.documento_archivos
where id = p_archivo_id;
if not found then raise exception 'El archivo no existe' using errcode = 'P0001';
end if;
end;
$$;