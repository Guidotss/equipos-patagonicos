create or replace function private.adjuntar_archivos(p_documento_id uuid, p_archivos jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_archivo jsonb;
  v_meta jsonb;
  v_orden integer;
  v_patron_ruta text;
begin
  if p_archivos is null or jsonb_typeof(p_archivos) <> 'array' or jsonb_array_length(p_archivos) = 0 then
    raise exception 'Subí al menos un archivo' using errcode = 'P0001';
  end if;

  -- Un archivo se vincula una sola vez (path es único en documento_archivos): se controla antes de insertar para
  -- dar el mensaje en vez del error de la restricción. Acá, repetido en la lista; en el loop, ya cargado.
  if (select count(e ->> 'path') <> count(distinct e ->> 'path') from jsonb_array_elements(p_archivos) as e) then
    raise exception 'Un archivo aparece dos veces' using errcode = 'P0001';
  end if;

  -- La ruta tiene que ser exactamente la que arma rutaArchivo (src/lib/documentos/archivos.ts) para el cliente
  -- del documento: ni la carpeta de otro cliente, ni "..", ni carpetas de más.
  select '^documentos/' || d.cliente_id
           || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
  into v_patron_ruta
  from public.documentos d
  where d.id = p_documento_id;

  select coalesce(max(orden), 0) into v_orden from public.documento_archivos where documento_id = p_documento_id;

  for v_archivo in select * from jsonb_array_elements(p_archivos) loop
    if (coalesce(v_archivo ->> 'path', '') ~ v_patron_ruta) is not true then
      raise exception 'El archivo no corresponde a la carpeta del cliente' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.documento_archivos a where a.path = v_archivo ->> 'path') then
      raise exception 'Ese archivo ya está cargado en un documento' using errcode = 'P0001';
    end if;
    if char_length(v_archivo ->> 'nombre_original') > 255 then
      raise exception 'El nombre del archivo puede tener hasta 255 caracteres' using errcode = 'P0001';
    end if;
    if coalesce(btrim(v_archivo ->> 'nombre_original'), '') = '' then
      raise exception 'Falta el nombre del archivo' using errcode = 'P0001';
    end if;

    select o.metadata into v_meta
    from storage.objects o
    where o.bucket_id = 'documentos' and o.name = v_archivo ->> 'path';
    if not found then
      raise exception 'No se encontró el archivo subido (%)', v_archivo ->> 'nombre_original' using errcode = 'P0001';
    end if;
    -- El bucket ya limita el tipo y el tamaño máximo, pero acepta archivos vacíos.
    if coalesce((v_meta ->> 'size')::bigint, 0) <= 0 then
      raise exception 'El archivo está vacío' using errcode = 'P0001';
    end if;

    v_orden := v_orden + 1;
    insert into public.documento_archivos (documento_id, path, nombre_original, mime, tamano, orden)
    values (
      p_documento_id,
      v_archivo ->> 'path',
      btrim(v_archivo ->> 'nombre_original'),
      lower(split_part(v_meta ->> 'mimetype', ';', 1)),
      (v_meta ->> 'size')::bigint,
      v_orden
    );
  end loop;
exception when unique_violation then
  raise exception 'Ese archivo ya está cargado. Volvé a seleccionarlo para subir una copia.' using errcode = 'P0001';
end;
$$;
